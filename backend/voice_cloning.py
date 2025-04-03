#!/usr/bin/env python
import os
import time
import json
import uuid
import shutil
import datetime
import subprocess
import logging
import traceback
from pathlib import Path

# Configure logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Define global variables
tts_available = False
torch_available = False
GPU_STATUS = {
    "available": False,
    "name": "None",
    "memory_total": "0 GB",
    "memory_allocated": "0 GB"
}

# Try importing non-PyTorch dependencies first
try:
    import numpy as np
    import soundfile as sf
    numpy_available = True
except ImportError as e:
    numpy_available = False
    logger.error(f"Error importing NumPy: {e}")

# Conditionally import librosa (doesn't depend on PyTorch)
try:
    import librosa
    librosa_available = True
except ImportError as e:
    librosa_available = False
    logger.error(f"Error importing librosa: {e}")

# Fix PyTorch imports to avoid circular dependencies
try:
    # Set environment variables to help with PyTorch imports
    os.environ['PYTORCH_JIT'] = '1'  # Enable JIT compilation for faster execution
    os.environ['PYTORCH_CUDA_ALLOC_CONF'] = 'max_split_size_mb:1024'  # Increase memory allocation to 1GB
    
    # Import basic torch functionality first
    import torch.cuda
    import torch.backends.cudnn
    
    # Now try to import the main torch module
    import torch
    
    # Enable cuDNN benchmark mode for faster training
    if torch.cuda.is_available():
        torch.backends.cudnn.benchmark = True
        torch.backends.cudnn.deterministic = False
        
        # Enable TF32 precision on Ampere GPUs (RTX 3000+)
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True
        
        # Use CUDA Graphs for repeated operations
        os.environ['TORCH_CUDNN_V8_API_ENABLED'] = '1'
        
        # Set optimal thread settings for data loading
        os.environ['OMP_NUM_THREADS'] = str(min(8, os.cpu_count()))
        os.environ['MKL_NUM_THREADS'] = str(min(8, os.cpu_count()))
    
    torch_available = True
    
    # Set device (CUDA if available, otherwise CPU)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    
    # Update GPU status if torch is available
    if device == "cuda":
        GPU_STATUS["available"] = True
        GPU_STATUS["name"] = torch.cuda.get_device_name(0)
        GPU_STATUS["memory_total"] = f"{torch.cuda.get_device_properties(0).total_memory / (1024**3):.2f} GB"
        GPU_STATUS["memory_allocated"] = f"{torch.cuda.memory_allocated(0) / (1024**3):.2f} GB"
except ImportError as e:
    torch_available = False
    device = "cpu"
    logger.error(f"Error importing PyTorch: {e}")
    print(f"Warning: PyTorch not available. Voice cloning will have limited functionality. Error: {e}")

# Try importing only the essential TTS components
if torch_available:
    try:
        # Only import the TTS API which is stable across versions
        from TTS.api import TTS
        
        # Skip importing problematic modules
        # We'll only use the TTS.api module which is sufficient for inference
        
        # If we got here, TTS is available for inference
        tts_available = True
        logger.info("TTS module imported successfully for inference")
    except ImportError as e:
        tts_available = False
        logger.error(f"Error importing TTS module: {e}")
        print(f"Warning: TTS not available. Voice cloning will not work. Error: {e}")
else:
    print("Warning: PyTorch not available, skipping TTS import")

# Global variables for voice cloning
VOICE_CLONE_MODELS_DIR = Path('voice_clone_models')
VOICE_CLONE_TRAINING_DATA_DIR = Path('voice_clone_training_data')
CLONED_VOICES_DIR = Path('cloned_voices')

# Create directories if they don't exist
VOICE_CLONE_MODELS_DIR.mkdir(exist_ok=True)
VOICE_CLONE_TRAINING_DATA_DIR.mkdir(exist_ok=True)
CLONED_VOICES_DIR.mkdir(exist_ok=True)

# The main voice cloner class to handle all voice cloning operations
class VoiceCloner:
    def __init__(self):
        self.device = device if torch_available else "cpu"
        self.tts_model = None
        self.training_processes = {}
        self.training_status = {}
        
        # Try to initialize TTS model
        try:
            if tts_available and torch_available:
                # Initialize TTS model with the correct path - ljspeech is known to work
                logger.info("Loading TTS model for voice cloning...")
                model_name = "tts_models/en/ljspeech/vits"
                logger.info(f"Using model: {model_name}")
                self.tts_model = TTS(model_name=model_name, progress_bar=False).to(self.device)
                logger.info(f"Voice cloning TTS model loaded on {self.device}")
                
                # Log GPU information if available
                if torch.cuda.is_available():
                    logger.info(f"GPU: {torch.cuda.get_device_name(0)}")
                    logger.info(f"Memory: {torch.cuda.get_device_properties(0).total_memory / (1024**3):.2f} GB")
            else:
                logger.warning("TTS or PyTorch not available. Voice cloning will not work. Please check installation.")
        except Exception as e:
            logger.error(f"Error initializing TTS model: {e}")
            traceback.print_exc()
            
            # Try fallback model only if TTS is available
            try:
                if tts_available and torch_available:
                    logger.info("Trying fallback to a simpler TTS model...")
                    # Try a different model
                    self.tts_model = TTS(model_name="tts_models/en/vctk/vits", progress_bar=False).to(self.device)
                    logger.info(f"Fallback TTS model loaded on {self.device}")
            except Exception as fallback_error:
                logger.error(f"Fallback TTS model failed too: {fallback_error}")
                traceback.print_exc()
    
    def prepare_training_data(self, speaker_id, audio_files):
        """Prepare training data for voice cloning"""
        try:
            # Create speaker directories
            speaker_data_dir = VOICE_CLONE_TRAINING_DATA_DIR / speaker_id
            speaker_data_dir.mkdir(exist_ok=True)
            
            # Process each audio file
            processed_files = []
            for audio_file in audio_files:
                if not os.path.exists(audio_file):
                    raise FileNotFoundError(f"Audio file not found: {audio_file}")
                
                # Process and convert audio to the required format (22050 Hz, mono)
                processed_file = self.preprocess_audio_file(audio_file, speaker_data_dir)
                processed_files.append(processed_file)
            
            # Create metadata.csv file for training
            metadata_file = speaker_data_dir / "metadata.csv"
            self._create_metadata_file(processed_files, metadata_file)
            
            logger.info(f"Prepared training data for speaker {speaker_id} with {len(processed_files)} audio files")
            
            return {
                "status": "success",
                "speaker_id": speaker_id,
                "data_dir": str(speaker_data_dir),
                "file_count": len(processed_files),
                "metadata_file": str(metadata_file)
            }
            
        except Exception as e:
            logger.error(f"Error preparing training data: {e}")
            traceback.print_exc()
            return {
                "status": "error",
                "error": str(e)
            }
    
    def preprocess_audio_file(self, audio_file, output_dir=None):
        """Process audio file to ensure it meets the requirements for voice cloning"""
        try:
            # If output_dir is not provided, use a temporary directory
            if output_dir is None:
                output_dir = Path("temp_audio")
                output_dir.mkdir(exist_ok=True)
            
            # Generate output filename
            filename = os.path.basename(audio_file)
            output_file = output_dir / f"{uuid.uuid4()}_{filename}"
            
            # Check if file exists and fix path if needed
            if not os.path.exists(audio_file):
                # Try to fix common path issues
                if 'uploads\\uploads\\' in audio_file:
                    # Remove duplicate uploads directory
                    fixed_path = audio_file.replace('uploads\\uploads\\', 'uploads\\')
                    logger.info(f"Fixing path: {audio_file} -> {fixed_path}")
                    audio_file = fixed_path
                elif 'uploads/uploads/' in audio_file:
                    # Remove duplicate uploads directory
                    fixed_path = audio_file.replace('uploads/uploads/', 'uploads/')
                    logger.info(f"Fixing path: {audio_file} -> {fixed_path}")
                    audio_file = fixed_path
            
            # Check if file exists after path corrections
            if not os.path.exists(audio_file):
                error_msg = f"Audio file not found: {audio_file}"
                logger.error(error_msg)
                raise FileNotFoundError(error_msg)
            
            # Load audio and resample to 22050 Hz
            logger.info(f"Loading audio file: {audio_file}")
            y, sr = librosa.load(audio_file, sr=None)
            if sr != 22050:
                y = librosa.resample(y, orig_sr=sr, target_sr=22050)
            
            # Convert to mono if stereo
            if len(y.shape) > 1:
                y = librosa.to_mono(y)
            
            # Normalize audio
            y = librosa.util.normalize(y)
            
            # Save processed audio
            sf.write(output_file, y, 22050, 'PCM_16')
            logger.info(f"Processed audio saved to: {output_file}")
            
            return str(output_file)
            
        except Exception as e:
            logger.error(f"Error preprocessing audio file: {e}")
            traceback.print_exc()
            raise
    
    def _create_metadata_file(self, audio_files, metadata_file):
        """Create metadata.csv file for training"""
        try:
            with open(metadata_file, 'w', encoding='utf-8') as f:
                for audio_file in audio_files:
                    # Each line should have format: file_path|transcription
                    # Since we don't have transcriptions, we'll use empty strings
                    relative_path = os.path.basename(audio_file)
                    f.write(f"{relative_path}|\n")
            
            return True
        except Exception as e:
            logger.error(f"Error creating metadata file: {e}")
            raise
    
    def train_voice_model(self, speaker_id, training_steps=50000):
        """Start training a voice model using GPU acceleration"""
        try:
            # Check if training is already in progress for this speaker
            if speaker_id in self.training_processes and self.training_processes[speaker_id].poll() is None:
                return {
                    "status": "error",
                    "error": "Training is already in progress for this speaker"
                }
            
            # Set up training directories
            training_data_dir = VOICE_CLONE_TRAINING_DATA_DIR / speaker_id
            model_dir = VOICE_CLONE_MODELS_DIR / speaker_id
            
            # Check if training data exists
            if not training_data_dir.exists():
                return {
                    "status": "error",
                    "error": f"Training data directory not found: {training_data_dir}"
                }
            
            # Create model directory if it doesn't exist
            model_dir.mkdir(exist_ok=True)
            
            # Generate a config file for training
            config_file = self._create_training_config(speaker_id, training_data_dir, model_dir, training_steps)
            
            # Initialize training status
            self.training_status[speaker_id] = {
                "start_time": time.time(),
                "progress": 0,
                "current_step": 0,
                "total_steps": training_steps,
                "status": "initializing",
                "message": "Initializing training..."
            }
            
            # Set up enhanced CUDA environment variables for maximum GPU performance
            train_env = os.environ.copy()
            train_env["CUDA_VISIBLE_DEVICES"] = "0"  # Use the first GPU
            train_env["OMP_NUM_THREADS"] = str(min(8, os.cpu_count()))  # Optimal thread setting
            train_env["MKL_NUM_THREADS"] = str(min(8, os.cpu_count()))  # Optimal MKL threads
            
            # Enhanced GPU optimization environment variables
            train_env["CUDA_LAUNCH_BLOCKING"] = "0"         # Async CUDA operations
            train_env["PYTORCH_CUDA_ALLOC_CONF"] = "max_split_size_mb:1024"  # Larger memory blocks
            train_env["TORCH_CUDNN_V8_API_ENABLED"] = "1"   # Enable cuDNN v8 API
            train_env["TF_CPP_MIN_LOG_LEVEL"] = "2"         # Reduce TensorFlow logging
            
            # Command to run the TTS training with GPU acceleration and specific GPU optimization flags
            cmd = [
                "python", "-m", "TTS.bin.train_tts", 
                "--config_path", str(config_file),
                "--use_cuda", "true",
                "--rank", "0",  # Main process rank
                "--group_id", "tts",  # Process group
            ]
            
            # Create a log file for tracking progress
            log_file_path = model_dir / "training.log"
            log_file = open(log_file_path, "w")
            
            # Start the training process as a subprocess with higher priority
            if os.name == 'nt':  # Windows
                # Use CREATE_NO_WINDOW to prevent console window and HIGH_PRIORITY_CLASS
                process = subprocess.Popen(
                    cmd,
                    env=train_env,
                    stdout=log_file,
                    stderr=subprocess.STDOUT,
                    cwd=os.getcwd(),
                    creationflags=subprocess.CREATE_NO_WINDOW | subprocess.HIGH_PRIORITY_CLASS
                )
            else:  # Linux/Mac
                # Set niceness to -10 (higher priority) for Linux/Mac
                process = subprocess.Popen(
                    cmd,
                    env=train_env,
                    stdout=log_file,
                    stderr=subprocess.STDOUT,
                    cwd=os.getcwd(),
                    preexec_fn=lambda: os.nice(-10) if hasattr(os, 'nice') else None
                )
            
            # Store the process to track it
            self.training_processes[speaker_id] = process
            
            # Calculate expected training time based on GPU model
            expected_hours = 1.0  # Default
            if torch.cuda.is_available():
                gpu_name = torch.cuda.get_device_name(0).lower()
                # Estimate based on common GPU models
                if any(x in gpu_name for x in ['3090', '4090', 'a100', 'h100']):
                    expected_hours = 0.5  # High-end GPUs
                elif any(x in gpu_name for x in ['2080', '3080', 'v100']):
                    expected_hours = 0.75  # Mid-high range
                # Note: default 1 hour for other GPUs
            
            # Update training status with expected completion time
            self.training_status[speaker_id]["status"] = "training_started"
            self.training_status[speaker_id]["message"] = f"Training started with optimized GPU acceleration on {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'}"
            self.training_status[speaker_id]["pid"] = process.pid
            self.training_status[speaker_id]["log_file"] = str(log_file_path)
            self.training_status[speaker_id]["estimated_completion"] = (
                datetime.datetime.now() + datetime.timedelta(hours=expected_hours)
            ).isoformat()
            self.training_status[speaker_id]["gpu_info"] = {
                "name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU",
                "memory_total": f"{torch.cuda.get_device_properties(0).total_memory / (1024**3):.2f} GB" if torch.cuda.is_available() else "N/A",
                "memory_allocated": f"{torch.cuda.memory_allocated(0) / (1024**3):.2f} GB" if torch.cuda.is_available() else "N/A"
            }
            
            logger.info(f"Started optimized GPU-accelerated voice model training for speaker {speaker_id} (PID: {process.pid})")
            
            return {
                "status": "training_started",
                "speaker_id": speaker_id,
                "config_file": str(config_file),
                "model_dir": str(model_dir),
                "message": f"Voice model training started with optimized GPU acceleration on {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'}",
                "pid": process.pid,
                "log_file": str(log_file_path),
                "gpu_info": self.training_status[speaker_id]["gpu_info"]
            }
            
        except Exception as e:
            logger.error(f"Error starting voice model training: {e}")
            traceback.print_exc()
            return {
                "status": "error",
                "error": str(e)
            }
    
    def _create_training_config(self, speaker_id, data_dir, output_dir, training_steps):
        """Create a configuration file for voice model training"""
        try:
            # Path to the configuration file
            config_file = output_dir / "config.json"
            
            # Generate random test sentences for evaluation
            test_sentences = [
                "It took me quite a long time to develop a voice, and now that I have it I'm not going to be silent.",
                "Be a voice, not an echo.",
                "I'm sorry Dave. I'm afraid I can't do that.",
                "This cake is great. It's so delicious and moist.",
                "Prior to November 22, 1963."
            ]
            
            # Convert sentences to character level for the model
            formatted_sentences = []
            for sentence in test_sentences:
                chars = list(sentence)
                formatted_sentences.append(chars)
            
            # Calculate optimal batch size based on available GPU memory
            batch_size = 32  # Default
            if torch.cuda.is_available():
                gpu_mem = torch.cuda.get_device_properties(0).total_memory
                # Scale batch size based on available GPU memory
                if gpu_mem > 8 * (1024**3):    # > 8 GB
                    batch_size = 64
                if gpu_mem > 12 * (1024**3):   # > 12 GB
                    batch_size = 96
                if gpu_mem > 16 * (1024**3):   # > 16 GB
                    batch_size = 128
                logger.info(f"Automatically set batch size to {batch_size} based on GPU memory: {gpu_mem/(1024**3):.2f} GB")
            
            # Calculate optimal number of workers based on CPU cores
            num_workers = min(8, max(4, os.cpu_count() // 2))
            
            # Basic configuration with enhanced GPU optimization
            config = {
                "model": "vits",
                "run_name": f"voice_clone_{speaker_id}",
                "run_description": f"Voice cloning for {speaker_id}",
                
                # Dataset configuration
                "datasets": [
                    {
                        "formatter": "vctk",
                        "dataset_name": "",
                        "path": str(data_dir),
                        "meta_file_train": "metadata.csv",
                        "ignored_speakers": None,
                        "language": "",
                        "phonemizer": "",
                        "meta_file_val": "",
                        "meta_file_attn_mask": ""
                    }
                ],
                "test_sentences": formatted_sentences,
                
                # Audio configuration
                "audio": {
                    "sample_rate": 22050,
                    "win_length": 1024,
                    "hop_length": 256,
                    "num_mels": 80,
                    "mel_fmin": 0,
                    "mel_fmax": None
                },
                
                # Training parameters optimized for GPU performance
                "batch_size": batch_size,  # Dynamically set based on GPU memory
                "eval_batch_size": batch_size,
                "num_loader_workers": num_workers,  # Optimized for CPU cores
                "num_eval_loader_workers": num_workers,
                "run_eval": True,
                "test_delay_epochs": 5,
                "epochs": training_steps // 1000,  # Convert steps to epochs
                "output_path": str(output_dir),
                
                # GPU optimization settings
                "mixed_precision": True,       # Enable mixed precision training for faster processing
                "cudnn_benchmark": True,       # Ensure cuDNN benchmark is enabled
                "grad_clip": 5.0,              # Prevent gradient explosion
                "lr": 0.001,                   # Increased learning rate for faster convergence
                "scheduler_after_epoch": True, # Update scheduler after each epoch
                "optimizer": "AdamW",          # Use more efficient AdamW optimizer
                "optimizer_params": {
                    "weight_decay": 0.01,      # Weight decay helps generalization
                    "betas": [0.9, 0.98],      # Momentum parameters for AdamW
                    "eps": 1e-6                # Small epsilon for numerical stability
                },
                # AMP optimization for faster training
                "amp": True,                   # Automatic mixed precision
                "amp_opt_level": "O1",         # Balance accuracy and speed
                
                # Enable data prefetching for faster throughput
                "data_prefetch": True,
                "prefetch_factor": 2,
                
                # Gradient accumulation for effective larger batch size
                "grad_accum": 2 if batch_size < 64 else 1,
                
                # Early stopping to prevent overtraining
                "early_stopping": True,
                "early_stopping_steps": 10,
                
                # Enhanced data processing
                "use_cache": True,             # Cache processed data
                "cache_path": str(output_dir / "dataset_cache"),
                
                # Additional optimizations for faster convergence
                "use_weighted_sampler": True,  # Balance training data
                "r": 1,                        # Helps with faster convergence for VITS
                "add_blank": True,             # Improves alignment learning
                
                # Weight initialization settings
                "reinit_layers": [],           # Don't reinitialize layers
                "torch_init_gain": 0.1,        # Lower gain for stable training
                
                # Speed up validation during training
                "validation_split_size": 0.05  # Reduce validation set size
            }
            
            # Save configuration to file
            with open(config_file, 'w') as f:
                json.dump(config, f, indent=4)
            
            return config_file
            
        except Exception as e:
            logger.error(f"Error creating training config: {e}")
            raise
    
    def get_training_status(self, speaker_id):
        """Get the current status of voice model training from log file"""
        if speaker_id not in self.training_status:
            return {
                "status": "not_started",
                "message": "Training has not been started for this speaker"
            }
        
        # Get current status
        status = self.training_status[speaker_id].copy()
        
        # Check if the process is still running
        process_running = False
        if speaker_id in self.training_processes:
            process = self.training_processes[speaker_id]
            # None means process is still running
            process_running = process.poll() is None
        
        # If process is not running, update status appropriately
        if not process_running and status["status"] in ["training_started", "fine-tuning_started"]:
            # Process completed or failed
            if status["progress"] >= 95:  # Assume success if progress was high
                status["status"] = "completed"
                status["progress"] = 100
                status["message"] = "Training completed successfully"
            else:
                status["status"] = "failed"
                status["message"] = "Training process terminated unexpectedly"
        
        # If training is in progress and we have a log file, parse it for progress
        if status["status"] in ["training_started", "fine-tuning_started"] and "log_file" in status and process_running:
            log_file_path = status.get("log_file")
            
            if log_file_path and os.path.exists(log_file_path):
                try:
                    # Parse the log file to extract current step and progress
                    with open(log_file_path, 'r') as f:
                        log_content = f.read()
                    
                    # Extract GPU memory usage first - important for monitoring
                    import re
                    
                    # Look for CUDA memory allocations
                    cuda_mem_matches = re.findall(r'CUDA\s+memory\s+allocated:\s*([\d\.]+)\s*GB', log_content)
                    if cuda_mem_matches:
                        status["gpu_memory_allocated"] = f"{cuda_mem_matches[-1]} GB"
                    
                    # Look for CUDA memory reserved
                    cuda_reserved_matches = re.findall(r'CUDA\s+memory\s+reserved:\s*([\d\.]+)\s*GB', log_content)
                    if cuda_reserved_matches:
                        status["gpu_memory_reserved"] = f"{cuda_reserved_matches[-1]} GB"
                    
                    # Look for progress indicators like "Step: 1234/50000"
                    step_matches = re.findall(r'Step:?\s*(\d+)(?:/(\d+))?', log_content)
                    
                    if step_matches:
                        # Get the most recent step match
                        current_step = int(step_matches[-1][0])
                        total_steps = int(step_matches[-1][1]) if step_matches[-1][1] else status["total_steps"]
                        
                        # Calculate progress percentage
                        progress = min(100, int((current_step / total_steps) * 100))
                        
                        # Look for loss values
                        loss_matches = re.findall(r'Loss:?\s*([\d\.]+)', log_content)
                        current_loss = float(loss_matches[-1]) if loss_matches else None
                        
                        # Look for iteration speed
                        speed_matches = re.findall(r'([\d\.]+)\s*it/s', log_content)
                        iteration_speed = float(speed_matches[-1]) if speed_matches else None
                        
                        # Look for GPU memory usage
                        gpu_matches = re.findall(r'GPU memory:?\s*([\d\.]+)\s*GB', log_content)
                        gpu_memory = f"{gpu_matches[-1]} GB" if gpu_matches else None
                        
                        # Update status with actual progress
                        status["progress"] = progress
                        status["current_step"] = current_step
                        status["total_steps"] = total_steps
                        status["message"] = f"Training in progress... Step {current_step}/{total_steps}"
                        
                        if iteration_speed:
                            status["iterations_per_second"] = iteration_speed
                            status["message"] += f", Speed: {iteration_speed:.2f} it/s"
                        
                        if current_loss:
                            status["current_loss"] = current_loss
                            status["message"] += f", Loss: {current_loss:.4f}"
                        
                        if gpu_memory:
                            status["gpu_memory"] = gpu_memory
                            status["message"] += f", GPU: {gpu_memory}"
                        
                        # Calculate estimated remaining time based on progress rate
                        elapsed_time = time.time() - status["start_time"]
                        if progress > 0:
                            total_estimated_time = (elapsed_time / progress) * 100
                            remaining_time = total_estimated_time - elapsed_time
                            
                            # Format remaining time
                            remaining_hours = int(remaining_time // 3600)
                            remaining_minutes = int((remaining_time % 3600) // 60)
                            remaining_seconds = int(remaining_time % 60)
                            
                            status["estimated_remaining"] = f"{remaining_hours}h {remaining_minutes}m {remaining_seconds}s"
                            status["estimated_completion"] = (
                                datetime.datetime.now() + 
                                datetime.timedelta(seconds=remaining_time)
                            ).isoformat()
                            
                            # Calculate training speed metrics
                            steps_per_second = current_step / elapsed_time if elapsed_time > 0 else 0
                            status["steps_per_second"] = steps_per_second
                            status["message"] += f", {steps_per_second:.2f} steps/sec"
                    else:
                        # If no steps found yet, assume initialization phase
                        status["message"] = "Initializing training on GPU..."
                        
                except Exception as e:
                    logger.error(f"Error parsing training log: {e}")
                    traceback.print_exc()
                    # If we can't parse the log, use the existing status information
                    pass
        
        # If progress reaches 100%, mark as complete
        if status["progress"] >= 100 and status["status"] in ["training_started", "fine-tuning_started"]:
            status["status"] = "completed"
            status["progress"] = 100
            status["message"] = "Training completed successfully"
        
        return status
    
    def list_cloned_voices(self):
        """List all cloned voices"""
        voices = []
        
        try:
            # Check each subdirectory in the models directory
            for model_dir in VOICE_CLONE_MODELS_DIR.iterdir():
                if model_dir.is_dir():
                    speaker_id = model_dir.name
                    
                    # Check if there's a config file (indicating a trained model)
                    config_file = model_dir / "config.json"
                    if config_file.exists():
                        # Get creation time
                        created_time = datetime.datetime.fromtimestamp(
                            config_file.stat().st_mtime
                        ).isoformat()
                        
                        voices.append({
                            "speaker_id": speaker_id,
                            "model_path": str(model_dir),
                            "created": created_time
                        })
            
            return voices
            
        except Exception as e:
            logger.error(f"Error listing cloned voices: {e}")
            return []
    
    def generate_speech(self, text, speaker_id, output_file):
        """Generate speech using a cloned voice"""
        try:
            if not torch_available:
                return {
                    "status": "error",
                    "error": "PyTorch not available. Voice cloning requires PyTorch."
                }
                
            if not tts_available:
                return {
                    "status": "error",
                    "error": "TTS module not available. Please install TTS properly."
                }
                
            if not self.tts_model:
                if tts_available:
                    # Try to initialize the model if it wasn't done before
                    logger.info("TTS model not initialized, attempting to initialize now...")
                    self.tts_model = TTS(model_name="tts_models/multilingual/multi-dataset/vits", progress_bar=False).to(self.device)
                    logger.info(f"TTS model loaded on {self.device}")
                else:
                    return {
                        "status": "error",
                        "error": "TTS module not available. Please install TTS properly."
                    }
            
            # Find speaker audio samples
            speaker_data_dir = VOICE_CLONE_TRAINING_DATA_DIR / speaker_id
            if not speaker_data_dir.exists():
                return {
                    "status": "error",
                    "error": f"Speaker data directory not found: {speaker_data_dir}"
                }
            
            # Find an audio sample from the speaker
            audio_samples = list(speaker_data_dir.glob("*.wav"))
            if not audio_samples:
                return {
                    "status": "error",
                    "error": f"No audio samples found for speaker: {speaker_id}"
                }
            
            speaker_wav = str(audio_samples[0])
            logger.info(f"Using speaker sample: {speaker_wav}")
            
            # Generate speech using the multilingual VITS model with device specification
            logger.info(f"Generating speech with text: '{text[:30]}...' for speaker: {speaker_id}")
            
            # Make sure the model is on the correct device
            self.tts_model.to(self.device)
            
            self.tts_model.tts_to_file(
                text=text,
                speaker_wav=speaker_wav,
                language="en",
                file_path=output_file
            )
            logger.info(f"Speech generated successfully: {output_file}")
            
            return {
                "status": "success",
                "output_file": output_file,
                "text": text,
                "speaker_id": speaker_id
            }
            
        except Exception as e:
            logger.error(f"Error generating speech: {e}")
            traceback.print_exc()
            return {
                "status": "error",
                "error": str(e)
            }
    
    def check_user_voice_status(self, user_id):
        """Check if a user has a cloned voice"""
        # Check if there's a model directory for this user
        model_dir = VOICE_CLONE_MODELS_DIR / user_id
        
        # Check if the model directory exists and has a config file
        has_cloned_voice = model_dir.exists() and (model_dir / "config.json").exists()
        
        return {
            "has_cloned_voice": has_cloned_voice,
            "user_id": user_id,
            "model_path": str(model_dir) if has_cloned_voice else None
        }
    
    def prepare_finetune_dataset(self, speaker_id, audio_files, transcriptions=None):
        """Prepare a dataset for fine-tuning an existing voice model"""
        try:
            # Check if the speaker has a trained voice
            voice_status = self.check_user_voice_status(speaker_id)
            if not voice_status.get("has_cloned_voice", False):
                return {
                    "status": "error",
                    "error": "No trained voice model found for this speaker"
                }
            
            # Create a fine-tuning directory
            finetune_dir = VOICE_CLONE_TRAINING_DATA_DIR / f"{speaker_id}_finetune"
            finetune_dir.mkdir(exist_ok=True)
            
            # Process audio files
            processed_files = []
            for audio_file in audio_files:
                processed_file = self.preprocess_audio_file(audio_file, finetune_dir)
                processed_files.append(processed_file)
            
            # Create metadata file with transcriptions if provided
            metadata_file = finetune_dir / "metadata.csv"
            if transcriptions and len(transcriptions) == len(processed_files):
                with open(metadata_file, 'w', encoding='utf-8') as f:
                    for i, audio_file in enumerate(processed_files):
                        relative_path = os.path.basename(audio_file)
                        f.write(f"{relative_path}|{transcriptions[i]}\n")
            else:
                # Create metadata without transcriptions
                self._create_metadata_file(processed_files, metadata_file)
            
            return {
                "status": "success",
                "speaker_id": speaker_id,
                "finetune_dir": str(finetune_dir),
                "file_count": len(processed_files),
                "metadata_file": str(metadata_file)
            }
            
        except Exception as e:
            logger.error(f"Error preparing fine-tuning dataset: {e}")
            traceback.print_exc()
            return {
                "status": "error",
                "error": str(e)
            }
    
    def finetune_voice_model(self, speaker_id, dataset_path, training_steps=5000):
        """Fine-tune an existing voice model using GPU acceleration"""
        try:
            # Check if the speaker has a trained voice
            voice_status = self.check_user_voice_status(speaker_id)
            if not voice_status.get("has_cloned_voice", False):
                return {
                    "status": "error",
                    "error": "No trained voice model found for this speaker"
                }
            
            # Set up directories
            finetune_dir = Path(dataset_path)
            model_dir = VOICE_CLONE_MODELS_DIR / speaker_id
            
            if not finetune_dir.exists():
                return {
                    "status": "error",
                    "error": f"Fine-tuning data directory not found: {finetune_dir}"
                }
            
            # Find the best checkpoint to fine-tune from
            checkpoint_path = None
            for file_path in model_dir.glob("*.pth"):
                if checkpoint_path is None or file_path.stat().st_mtime > checkpoint_path.stat().st_mtime:
                    checkpoint_path = file_path
            
            if checkpoint_path is None:
                return {
                    "status": "error",
                    "error": "No checkpoint found for fine-tuning"
                }
            
            # Create or update config for fine-tuning
            config_file = model_dir / "finetune_config.json"
            with open(model_dir / "config.json", 'r') as f:
                config = json.load(f)
            
            # Update config for fine-tuning
            config["batch_size"] = 32  # Larger batch size for GPU
            config["epochs"] = training_steps // 1000
            config["datasets"][0]["path"] = str(finetune_dir)
            config["restore_path"] = str(checkpoint_path)
            config["mixed_precision"] = True
            config["cudnn_benchmark"] = True
            
            # Save updated config
            with open(config_file, 'w') as f:
                json.dump(config, f, indent=4)
            
            # Initialize fine-tuning status
            self.training_status[speaker_id] = {
                "start_time": time.time(),
                "progress": 0,
                "current_step": 0,
                "total_steps": training_steps,
                "status": "fine-tuning",
                "message": "Fine-tuning voice model with GPU acceleration..."
            }
            
            # Set up CUDA environment variables for optimal performance
            train_env = os.environ.copy()
            train_env["CUDA_VISIBLE_DEVICES"] = "0"  # Use the first GPU
            train_env["OMP_NUM_THREADS"] = str(os.cpu_count())  # Optimize CPU threads
            train_env["MKL_NUM_THREADS"] = str(os.cpu_count())  # Optimize Intel Math Kernel Library
            
            # Command to run fine-tuning with GPU acceleration
            cmd = [
                "python", "-m", "TTS.bin.train_tts", 
                "--config_path", str(config_file),
                "--restore_path", str(checkpoint_path)
            ]
            
            # Create log file for tracking progress
            log_file_path = model_dir / "finetune.log"
            log_file = open(log_file_path, "w")
            
            # Start fine-tuning process
            process = subprocess.Popen(
                cmd,
                env=train_env,
                stdout=log_file,
                stderr=subprocess.STDOUT,
                cwd=os.getcwd()
            )
            
            # Store the process
            self.training_processes[speaker_id] = process
            
            # Update status
            self.training_status[speaker_id]["status"] = "fine-tuning_started"
            self.training_status[speaker_id]["message"] = "Voice model fine-tuning started with GPU acceleration"
            self.training_status[speaker_id]["pid"] = process.pid
            self.training_status[speaker_id]["log_file"] = str(log_file_path)
            self.training_status[speaker_id]["estimated_completion"] = (
                datetime.datetime.now() + datetime.timedelta(minutes=15)  # Faster with GPU
            ).isoformat()
            
            logger.info(f"Started GPU-accelerated fine-tuning for speaker {speaker_id} (PID: {process.pid})")
            
            return {
                "status": "fine-tuning_started",
                "speaker_id": speaker_id,
                "dataset_path": dataset_path,
                "training_steps": training_steps,
                "message": "Voice model fine-tuning started with GPU acceleration",
                "pid": process.pid,
                "log_file": str(log_file_path)
            }
            
        except Exception as e:
            logger.error(f"Error fine-tuning voice model: {e}")
            traceback.print_exc()
            return {
                "status": "error",
                "error": str(e)
            }
    
    def collect_dataset_from_directory(self, directory_path, extension='.wav'):
        """Collect audio samples from a directory"""
        try:
            directory = Path(directory_path)
            if not directory.exists():
                return {
                    "status": "error",
                    "error": f"Directory not found: {directory_path}"
                }
            
            # Find all audio files with the specified extension
            audio_files = list(directory.glob(f"*{extension}"))
            
            return {
                "status": "success",
                "directory": str(directory),
                "files": [str(f) for f in audio_files],
                "count": len(audio_files)
            }
            
        except Exception as e:
            logger.error(f"Error collecting dataset: {e}")
            return {
                "status": "error",
                "error": str(e)
            }

# Initialize the voice cloner
voice_cloner = VoiceCloner()

def test_gpu_performance():
    """Test GPU performance for voice cloning"""
    if not torch.cuda.is_available():
        return {
            "status": "error",
            "error": "CUDA not available. Please check your GPU setup.",
            "device": "cpu"
        }
    
    try:
        # Run some basic GPU tests
        start_time = time.time()
        
        # Create a large tensor and run some operations
        a = torch.randn(2000, 2000, device='cuda')
        b = torch.randn(2000, 2000, device='cuda')
        
        # Matrix multiplication
        torch.cuda.synchronize()
        mult_start = time.time()
        c = torch.matmul(a, b)
        torch.cuda.synchronize()
        mult_time = time.time() - mult_start
        
        # FFT (common in audio processing)
        fft_start = time.time()
        d = torch.fft.rfft2(a)
        torch.cuda.synchronize()
        fft_time = time.time() - fft_start
        
        # Simple convolution
        conv_start = time.time()
        kernel = torch.randn(3, 3, device='cuda')
        # Simulate convolution with unfold
        e = torch.nn.functional.unfold(a.unsqueeze(0).unsqueeze(0), kernel_size=3, padding=1)
        torch.cuda.synchronize()
        conv_time = time.time() - conv_start
        
        # Free memory
        del a, b, c, d, e, kernel
        torch.cuda.empty_cache()
        
        total_time = time.time() - start_time
        
        # Return performance metrics
        return {
            "status": "success",
            "device": torch.cuda.get_device_name(0),
            "total_test_time": f"{total_time:.4f} seconds",
            "matrix_mult_time": f"{mult_time:.4f} seconds",
            "fft_time": f"{fft_time:.4f} seconds",
            "conv_time": f"{conv_time:.4f} seconds",
            "cuda_version": torch.version.cuda,
            "memory_allocated": f"{torch.cuda.memory_allocated(0) / (1024**3):.2f} GB",
            "memory_reserved": f"{torch.cuda.memory_reserved(0) / (1024**3):.2f} GB"
        }
    except Exception as e:
        logger.error(f"Error testing GPU performance: {e}")
        traceback.print_exc()
        return {
            "status": "error",
            "error": str(e),
            "device": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "cpu"
        }