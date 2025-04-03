#!/usr/bin/env python
# Fix CUDA environment variables for RTX GPUs with CUDA 12.7
import os
os.environ['CUDA_VISIBLE_DEVICES'] = '0'  # Make sure GPU 0 is visible
os.environ['CUDA_MODULE_LOADING'] = 'LAZY'  # Use lazy loading for CUDA modules
os.environ['PYTORCH_CUDA_ALLOC_CONF'] = 'max_split_size_mb:128'  # Optimize CUDA memory allocation
os.environ['TF_FORCE_GPU_ALLOW_GROWTH'] = 'true'  # For TensorFlow if used

# Import standard modules first
import time
import uuid
import json
import asyncio
import tempfile
import logging
from datetime import datetime
from pathlib import Path
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename

# Import fsspec patch to fix typing issue before torch import
try:
    from fsspec_patch import apply_patch
    apply_patch()
except ImportError:
    print("Warning: fsspec_patch not available. This may cause issues with PyTorch and fsspec.")

# Configure logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import PyTorch - but avoiding circular imports
try:
    # Import torch base package first
    import torch.cuda
    import torch.version
    # Now import torch itself
    import torch
    torch_available = True
except ImportError as e:
    logger.error(f"Error importing PyTorch: {e}")
    torch_available = False
    print(f"Warning: PyTorch not available. Error: {e}")

# Import voice cloning module after torch
try:
    from voice_cloning import voice_cloner, GPU_STATUS
    voice_cloning_available = True
except ImportError as e:
    voice_cloning_available = False
    logger.error(f"Error importing voice_cloning: {e}")
    print(f"Warning: voice_cloning not available. Error: {e}")

# Import the Whisper model
try:
    from faster_whisper import WhisperModel
    whisper_available = True
except ImportError:
    whisper_available = False
    print("Warning: faster-whisper not available. Speech recognition will not work.")

# Import TTS module
try:
    from TTS.api import TTS
    tts_available = True
except ImportError:
    tts_available = False
    print("Warning: TTS not available. Text-to-speech will not work.")

app = Flask(__name__)
CORS(app)

# Set up upload folder
UPLOAD_FOLDER = Path('uploads')
UPLOAD_FOLDER.mkdir(exist_ok=True)
RESPONSES_FOLDER = Path('responses')
RESPONSES_FOLDER.mkdir(exist_ok=True)
TTS_OUTPUT_FOLDER = Path('tts_outputs')
TTS_OUTPUT_FOLDER.mkdir(exist_ok=True)
TRANSCRIPTIONS_FOLDER = Path('transcriptions')
TRANSCRIPTIONS_FOLDER.mkdir(exist_ok=True)
CLONED_VOICES_FOLDER = Path('cloned_voices')
CLONED_VOICES_FOLDER.mkdir(exist_ok=True)

app.config['UPLOAD_FOLDER'] = str(UPLOAD_FOLDER)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max upload size

# Initialize models
whisper_model = None
tts_model = None
in_memory_history = []

# GPU Status for diagnostics
gpu_status = {
    "available": False,
    "name": "None",
    "memory_total": "0",
    "memory_allocated": "0",
    "cuda_version": "Not available"
}

def check_gpu_status():
    """Check GPU status and update global variable"""
    global gpu_status
    try:
        import torch
        if torch.cuda.is_available():
            gpu_status["available"] = True
            gpu_status["name"] = torch.cuda.get_device_name(0)
            gpu_status["cuda_version"] = torch.version.cuda
            gpu_status["memory_total"] = f"{torch.cuda.get_device_properties(0).total_memory / (1024**3):.2f} GB"
            gpu_status["memory_allocated"] = f"{torch.cuda.memory_allocated(0) / (1024**3):.2f} GB"
            gpu_status["memory_reserved"] = f"{torch.cuda.memory_reserved(0) / (1024**3):.2f} GB"
            logger.info(f"GPU detected: {gpu_status['name']} with CUDA {gpu_status['cuda_version']}")
            
            # Log detailed GPU information
            for i in range(torch.cuda.device_count()):
                device_props = torch.cuda.get_device_properties(i)
                logger.info(f"GPU {i}: {device_props.name}")
                logger.info(f"  - Total memory: {device_props.total_memory / (1024**3):.2f} GB")
                logger.info(f"  - CUDA Capability: {device_props.major}.{device_props.minor}")
                logger.info(f"  - Multi Processor Count: {device_props.multi_processor_count}")
        else:
            logger.warning("No GPU detected. Using CPU for inference (will be slower)")
    except Exception as e:
        logger.error(f"Error checking GPU status: {e}")
        gpu_status["available"] = False

# Initialize Whisper model
def initialize_whisper():
    global whisper_model
    if not whisper_available:
        logger.error("Cannot initialize Whisper: module not available")
        return False
    
    try:
        device = "cuda" if gpu_status["available"] else "cpu"
        compute_type = "float16" if device == "cuda" else "int8"
        
        # Large-v3 model for best quality
        whisper_model = WhisperModel("large-v3", device=device, compute_type=compute_type)
        logger.info(f"Initialized Whisper model on {device}")
        return True
    except Exception as e:
        logger.error(f"Error initializing Whisper model: {e}")
        return False

# Initialize TTS model
def initialize_tts():
    global tts_model
    if not tts_available:
        logger.error("Cannot initialize TTS: module not available")
        return False
    
    try:
        # Choose model based on GPU availability
        device = "cuda" if gpu_status["available"] else "cpu"
        model_name = "tts_models/en/ljspeech/vits"
        
        # Initialize TTS
        tts_model = TTS(model_name, progress_bar=False)
        logger.info(f"Initialized TTS model {model_name} on {device}")
        return True
    except Exception as e:
        logger.error(f"Error initializing TTS model: {e}")
        return False

# Routes for voice cloning
@app.route('/api/voice-cloning/upload', methods=['POST'])
def upload_voice_sample():
    """Upload a voice sample for cloning"""
    if 'audio' not in request.files:
        return jsonify({"error": "No audio file provided"}), 400
    
    file = request.files['audio']
    speaker_id = request.form.get('speaker_id', str(uuid.uuid4()))
    
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
    
    # Save the uploaded file
    filename = secure_filename(file.filename)
    save_path = UPLOAD_FOLDER / f"{speaker_id}_{filename}"
    file.save(save_path)
    
    return jsonify({
        "status": "success",
        "file_path": str(save_path),
        "speaker_id": speaker_id
    })

@app.route('/api/voice-cloning/prepare-training', methods=['POST'])
def prepare_voice_training():
    """Prepare training data for voice cloning"""
    data = request.json
    speaker_id = data.get('speaker_id')
    audio_files = data.get('audio_files', [])
    
    if not speaker_id:
        return jsonify({"error": "No speaker ID provided"}), 400
    
    if not audio_files:
        return jsonify({"error": "No audio files provided"}), 400
    
    # Convert relative paths to absolute
    abs_audio_files = []
    for file in audio_files:
        # Check if the file is just a filename or a full path
        if not os.path.isabs(file):
            # Fix: Handle paths properly to avoid duplicate 'uploads' directory
            if file.startswith('uploads/') or file.startswith('uploads\\'):
                # Path already includes uploads directory
                abs_audio_files.append(str(Path(file)))
            else:
                # It's just a filename, so we need to construct the full path
                abs_audio_files.append(str(UPLOAD_FOLDER / file))
        else:
            abs_audio_files.append(file)
    
    logger.info(f"Processing audio files: {abs_audio_files}")
    
    try:
        # Log GPU status before preparation
        if torch.cuda.is_available():
            logger.info(f"GPU memory before prepare_training: {torch.cuda.memory_allocated(0) / (1024**3):.2f} GB")
        
        # Prepare training data
        result = voice_cloner.prepare_training_data(speaker_id, abs_audio_files)
        
        # Add GPU status to response
        result["gpu_status"] = {
            "available": torch.cuda.is_available(),
            "device": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU",
            "memory_allocated": f"{torch.cuda.memory_allocated(0) / (1024**3):.2f} GB" if torch.cuda.is_available() else "N/A"
        }
        
        return jsonify(result)
    except FileNotFoundError as e:
        logger.error(f"File not found error: {e}")
        return jsonify({"error": str(e), "paths_tried": abs_audio_files}), 404
    except Exception as e:
        logger.error(f"Error preparing training data: {str(e)}")
        return jsonify({"error": f"Failed to prepare training data: {str(e)}"}), 500

@app.route('/api/voice-cloning/start-training', methods=['POST'])
def start_voice_training():
    """Start voice cloning training process"""
    data = request.json
    speaker_id = data.get('speaker_id')
    training_steps = int(data.get('training_steps', 50000))
    
    if not speaker_id:
        return jsonify({"error": "No speaker ID provided"}), 400
    
    # Log GPU status before training
    if torch.cuda.is_available():
        logger.info(f"GPU memory before start_training: {torch.cuda.memory_allocated(0) / (1024**3):.2f} GB")
    
    # Start training
    result = voice_cloner.train_voice_model(speaker_id, training_steps)
    
    # Add GPU status to the response
    result["gpu_status"] = {
        "available": torch.cuda.is_available(),
        "device": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
    }
    
    return jsonify(result)

@app.route('/api/voice-cloning/training-status', methods=['GET'])
def check_training_status():
    """Check voice cloning training status"""
    speaker_id = request.args.get('speaker_id')
    
    status = voice_cloner.get_training_status(speaker_id)
    
    # Add GPU info to status response
    if torch.cuda.is_available():
        status["gpu_info"] = {
            "name": torch.cuda.get_device_name(0),
            "memory_allocated": f"{torch.cuda.memory_allocated(0) / (1024**3):.2f} GB",
            "memory_reserved": f"{torch.cuda.memory_reserved(0) / (1024**3):.2f} GB",
        }
    else:
        status["gpu_info"] = {"available": False}
    
    return jsonify(status)

@app.route('/api/voice-cloning/voices', methods=['GET'])
def list_cloned_voices():
    """List all cloned voices"""
    voices = voice_cloner.list_cloned_voices()
    
    return jsonify(voices)

@app.route('/api/voice-cloning/generate', methods=['POST'])
def generate_cloned_speech():
    """Generate speech using a cloned voice"""
    data = request.json
    text = data.get('text')
    speaker_id = data.get('speaker_id')
    
    if not text or not speaker_id:
        return jsonify({"error": "Missing required parameters"}), 400
    
    # Generate output filename
    output_file = str(TTS_OUTPUT_FOLDER / f"cloned_{speaker_id}_{uuid.uuid4()}.wav")
    
    # Generate speech
    result = voice_cloner.generate_speech(text, speaker_id, output_file)
    
    if "error" in result:
        return jsonify(result), 400
    
    return jsonify(result)

@app.route('/api/voice-cloning/check-user-status', methods=['GET'])
def check_user_voice_status():
    """Check if a user has a cloned voice"""
    user_id = request.args.get('user_id')
    
    if not user_id:
        return jsonify({"error": "No user ID provided"}), 400
    
    # Check if user has a cloned voice
    voices = voice_cloner.list_cloned_voices()
    user_voice = next((voice for voice in voices if voice.get('speaker_id') == user_id), None)
    
    return jsonify({
        "has_cloned_voice": user_voice is not None,
        "voice_data": user_voice
    })

# Routes for ASR (Automatic Speech Recognition)
@app.route('/api/transcribe', methods=['POST'])
def transcribe_audio():
    """Transcribe an audio file to text"""
    if 'audio' not in request.files:
        return jsonify({"error": "No audio file provided"}), 400
    
    file = request.files['audio']
    
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
    
    # Save the uploaded file
    filename = secure_filename(file.filename)
    temp_path = str(UPLOAD_FOLDER / filename)
    file.save(temp_path)
    
    try:
        if not whisper_model:
            initialize_whisper()
            if not whisper_model:
                return jsonify({"error": "Whisper model not available"}), 500
        
        # Transcribe the audio file
        segments, info = whisper_model.transcribe(temp_path, beam_size=5)
        
        # Process the segments
        transcript = ""
        segments_data = []
        
        for segment in segments:
            transcript += segment.text + " "
            segments_data.append({
                "id": len(segments_data),
                "start": segment.start,
                "end": segment.end,
                "text": segment.text
            })
        
        # Save the transcript to a file
        transcription_id = uuid.uuid4()
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        transcription_filename = f"transcription_{timestamp}_{str(transcription_id)[:8]}.json"
        
        transcription_path = TRANSCRIPTIONS_FOLDER / transcription_filename
        
        with open(transcription_path, 'w') as f:
            json.dump({
                "transcript": transcript.strip(),
                "segments": segments_data,
                "language": info.language,
                "language_probability": info.language_probability
            }, f, indent=4)
        
        # Add to in-memory history
        in_memory_history.append({
            "id": str(transcription_id),
            "type": "transcription",
            "text": transcript.strip(),
            "timestamp": timestamp,
            "file_path": str(transcription_path)
        })
        
        return jsonify({
            "id": str(transcription_id),
            "transcript": transcript.strip(),
            "segments": segments_data,
            "language": info.language,
            "language_probability": info.language_probability
        })
    
    except Exception as e:
        logger.error(f"Error in transcription: {str(e)}")
        return jsonify({"error": f"Transcription error: {str(e)}"}), 500
    
    finally:
        # Clean up the temporary file
        try:
            os.remove(temp_path)
        except:
            pass

# Routes for TTS (Text-to-Speech)
@app.route('/api/tts', methods=['POST'])
def text_to_speech():
    """Convert text to speech"""
    data = request.json
    
    if not data or 'text' not in data:
        return jsonify({"error": "No text provided"}), 400
    
    text = data.get('text')
    speaker_id = data.get('speaker_id')
    
    try:
        output_filename = f"tts_{uuid.uuid4()}.wav"
        output_path = str(TTS_OUTPUT_FOLDER / output_filename)
        
        # If speaker_id is provided, use the cloned voice
        if speaker_id:
            result = voice_cloner.generate_speech(text, speaker_id, output_path)
            if "error" in result:
                return jsonify(result), 400
        else:
            # Use the standard TTS model
            if not tts_model:
                initialize_tts()
                if not tts_model:
                    return jsonify({"error": "TTS model not available"}), 500
            
            # Generate speech using the standard TTS model
            tts_model.tts_to_file(text=text, file_path=output_path)
        
        # Return the audio file path
        return jsonify({
            "status": "success",
            "audio_path": output_path,
            "text": text
        })
    
    except Exception as e:
        logger.error(f"Error in TTS: {str(e)}")
        return jsonify({"error": f"TTS error: {str(e)}"}), 500

# GPU status route with enhanced information
@app.route('/api/gpu-status', methods=['GET'])
def get_gpu_status():
    """Get detailed GPU status information"""
    # Update GPU status before returning
    check_gpu_status()
    
    # Add TTS and voice cloning specific GPU usage
    if gpu_status["available"]:
        gpu_status["voice_cloning_device"] = voice_cloner.device
        gpu_status["detailed_gpu_info"] = GPU_STATUS
    
    return jsonify(gpu_status)

# Version information route
@app.route('/api/version', methods=['GET'])
def get_version_info():
    """Get version information for the backend"""
    versions = {
        "app_version": "1.0.0",
        "whisper_available": whisper_available,
        "tts_available": tts_available,
        "voice_cloning_available": True,
        "gpu_available": gpu_status["available"]
    }
    return jsonify(versions)

# Health check endpoint with GPU status
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint for frontend to verify server is running"""
    # Update GPU status
    check_gpu_status()
    
    # Add network interface info to help with debugging connection issues
    network_info = {}
    try:
        import socket
        # Get hostname
        hostname = socket.gethostname()
        network_info["hostname"] = hostname
        
        # Get all IP addresses
        ip_addresses = []
        try:
            for interface in socket.getaddrinfo(hostname, None):
                ip = interface[4][0]
                if ip not in ip_addresses and not ip.startswith('127.') and ':' not in ip:
                    ip_addresses.append(ip)
        except Exception as e:
            ip_addresses = ["Error getting IPs: " + str(e)]
        
        network_info["ip_addresses"] = ip_addresses
    except Exception as e:
        network_info["error"] = str(e)
    
    return jsonify({
        "status": "ok",
        "whisper": whisper_model is not None,
        "tts": tts_model is not None,
        "gpu": gpu_status,
        "timestamp": datetime.now().isoformat(),
        "network": network_info
    })

# Initialize models on startup
if __name__ == '__main__':
    # Check GPU status
    check_gpu_status()
    
    # Try to initialize CUDA for improved performance
    if gpu_status["available"]:
        try:
            # Initialize CUDA context explicitly
            device = torch.device('cuda:0')
            dummy_tensor = torch.zeros(1, device=device)
            del dummy_tensor
            logger.info("CUDA context initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize CUDA context: {e}")
    
    # Initialize models
    whisper_initialized = initialize_whisper()
    tts_initialized = initialize_tts()
    
    # Create a dummy voice_cloner if it's not defined
    if 'voice_cloner' not in globals():
        logger.warning("Voice cloner not available, creating a dummy placeholder")
        # Create a dummy class to prevent errors
        class DummyVoiceCloner:
            def __init__(self):
                self.device = "cpu"
                self.tts_model = None
            
            def __getattr__(self, name):
                # Return a function that returns an error for any method call
                def method(*args, **kwargs):
                    return {
                        "status": "error", 
                        "error": "Voice cloning not available. PyTorch import error occurred."
                    }
                return method
        
        voice_cloner = DummyVoiceCloner()
    
    # Log initialization status
    logger.info(f"Whisper initialized: {whisper_initialized}")
    logger.info(f"TTS initialized: {tts_initialized}")
    logger.info(f"Voice cloning using device: {voice_cloner.device}")
    
    # Start Flask app
    app.run(debug=True, host='0.0.0.0', port=5000)

@app.route('/api/gpu-test', methods=['GET'])
def run_gpu_test():
    """Run a GPU performance test to verify CUDA is working correctly"""
    from voice_cloning import test_gpu_performance
    
    # Force clear CUDA cache before test
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    
    # Run the test
    result = test_gpu_performance()
    
    # Get current GPU status
    if torch.cuda.is_available():
        result["current_stats"] = {
            "device": torch.cuda.get_device_name(0),
            "memory_allocated": f"{torch.cuda.memory_allocated(0) / (1024**3):.2f} GB",
            "memory_reserved": f"{torch.cuda.memory_reserved(0) / (1024**3):.2f} GB"
        }
        
        # Run a temporary heavy GPU operation to show utilization
        try:
            start_time = time.time()
            # Create large tensors and multiply them
            a = torch.randn(4000, 4000, device='cuda')
            b = torch.randn(4000, 4000, device='cuda')
            c = torch.matmul(a, b)
            torch.cuda.synchronize()
            operation_time = time.time() - start_time
            
            # Add information about heavy operation
            result["heavy_operation"] = {
                "operation": "4000x4000 matrix multiplication",
                "time": f"{operation_time:.4f} seconds",
                "memory_after": f"{torch.cuda.memory_allocated(0) / (1024**3):.2f} GB"
            }
            
            # Delete tensors to free memory
            del a, b, c
            torch.cuda.empty_cache()
        except Exception as e:
            logger.error(f"Error during heavy GPU operation: {e}")
            result["heavy_operation"] = {"error": str(e)}
    
    return jsonify(result)

@app.route('/api/connection-test', methods=['GET'])
def connection_test():
    """Test endpoint to verify connection from mobile app with detailed diagnostics"""
    # Get request details
    client_ip = request.remote_addr
    headers = dict(request.headers)
    
    # Network info
    network_info = {}
    try:
        import socket
        import netifaces
        
        # Get hostname
        hostname = socket.gethostname()
        network_info["hostname"] = hostname
        
        # Get all interfaces and IPs
        interfaces = {}
        try:
            # Get all network interfaces
            for interface in netifaces.interfaces():
                addrs = netifaces.ifaddresses(interface)
                if netifaces.AF_INET in addrs:
                    addresses = []
                    for addr in addrs[netifaces.AF_INET]:
                        addresses.append(addr['addr'])
                    interfaces[interface] = addresses
            network_info["interfaces"] = interfaces
        except Exception as e:
            network_info["interface_error"] = str(e)
        
        # Alternative method to get IP addresses
        ip_addresses = []
        try:
            for interface in socket.getaddrinfo(hostname, None):
                ip = interface[4][0]
                if ip not in ip_addresses and not ip.startswith('127.') and ':' not in ip:
                    ip_addresses.append(ip)
            network_info["ip_addresses"] = ip_addresses
        except Exception as e:
            network_info["ip_error"] = str(e)
            
    except ImportError:
        network_info["error"] = "Could not import required networking modules"
    except Exception as e:
        network_info["error"] = str(e)
    
    return jsonify({
        "status": "connected",
        "timestamp": datetime.now().isoformat(),
        "client_ip": client_ip,
        "headers": headers,
        "server_network": network_info
    })

# Routes for voice cloning fine-tuning
@app.route('/api/voice-cloning/finetune/prepare', methods=['POST'])
def prepare_finetune_dataset():
    """Prepare a dataset for fine-tuning an existing voice model"""
    data = request.json
    speaker_id = data.get('speaker_id')
    audio_files = data.get('audio_files', [])
    transcriptions = data.get('transcriptions', None)
    
    if not speaker_id:
        return jsonify({"error": "No speaker ID provided"}), 400
    
    if not audio_files:
        return jsonify({"error": "No audio files provided"}), 400
    
    # Check if the speaker has a trained voice
    voice_status = voice_cloner.check_user_voice_status(speaker_id)
    if not voice_status.get('has_cloned_voice', False):
        return jsonify({
            "error": "No trained voice model found for this speaker. Please create a voice model first before fine-tuning."
        }), 400
    
    # Prepare the dataset for fine-tuning
    try:
        result = voice_cloner.prepare_finetune_dataset(speaker_id, audio_files, transcriptions)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error preparing fine-tuning dataset: {str(e)}")
        return jsonify({"error": f"Failed to prepare fine-tuning dataset: {str(e)}"}), 500

@app.route('/api/voice-cloning/finetune/start', methods=['POST'])
def start_voice_finetuning():
    """Start fine-tuning an existing voice model"""
    data = request.json
    speaker_id = data.get('speaker_id')
    dataset_path = data.get('dataset_path')
    training_steps = int(data.get('training_steps', 5000))
    
    if not speaker_id:
        return jsonify({"error": "No speaker ID provided"}), 400
    
    if not dataset_path:
        return jsonify({"error": "No dataset path provided"}), 400
    
    # Log GPU status before fine-tuning
    if torch.cuda.is_available():
        logger.info(f"GPU memory before fine-tuning: {torch.cuda.memory_allocated(0) / (1024**3):.2f} GB")
    
    # Start fine-tuning
    result = voice_cloner.finetune_voice_model(speaker_id, dataset_path, training_steps)
    
    # Add GPU status to the response
    result["gpu_status"] = {
        "available": torch.cuda.is_available(),
        "device": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU",
        "memory": f"{torch.cuda.memory_allocated(0) / (1024**3):.2f} GB" if torch.cuda.is_available() else "N/A"
    }
    
    return jsonify(result)

@app.route('/api/voice-cloning/collect-samples', methods=['POST'])
def collect_audio_samples():
    """Collect audio samples from a directory for fine-tuning"""
    data = request.json
    directory_path = data.get('directory_path')
    extension = data.get('extension', '.wav')
    
    if not directory_path:
        return jsonify({"error": "No directory path provided"}), 400
    
    try:
        files = voice_cloner.collect_dataset_from_directory(directory_path, extension)
        return jsonify({
            "status": "success",
            "files": files,
            "count": len(files)
        })
    except Exception as e:
        logger.error(f"Error collecting audio samples: {str(e)}")
        return jsonify({"error": f"Failed to collect audio samples: {str(e)}"}), 500

@app.route('/api/voice-cloning/process-audio', methods=['POST'])
def process_audio_file():
    """Process an audio file for use in voice training"""
    if 'audio' not in request.files:
        return jsonify({"error": "No audio file provided"}), 400
    
    file = request.files['audio']
    
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
    
    try:
        # Save the uploaded file
        filename = secure_filename(file.filename)
        temp_path = str(UPLOAD_FOLDER / filename)
        file.save(temp_path)
        
        # Process the audio file to convert to 16kHz mono WAV
        processed_path = voice_cloner.preprocess_audio_file(temp_path)
        
        # Get transcription if Whisper is available
        transcription = None
        if whisper_model:
            segments, _ = whisper_model.transcribe(processed_path, beam_size=5)
            transcription = " ".join([segment.text for segment in segments])
        
        return jsonify({
            "status": "success",
            "original_path": temp_path,
            "processed_path": processed_path,
            "transcription": transcription
        })
    except Exception as e:
        logger.error(f"Error processing audio file: {str(e)}")
        return jsonify({"error": f"Failed to process audio file: {str(e)}"}), 500
