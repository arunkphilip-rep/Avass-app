#!/usr/bin/env python
"""
Test script for evaluating Whisper ASR model performance and GPU utilization
"""
import os
import sys
import time
import torch
import argparse
import numpy as np
from pathlib import Path
from faster_whisper import WhisperModel

# Set environment variables for CUDA
os.environ['CUDA_VISIBLE_DEVICES'] = '0'
os.environ['CUDA_MODULE_LOADING'] = 'LAZY'

def get_gpu_info():
    """Get GPU information if available"""
    gpu_info = {
        "available": False,
        "device": "cpu",
        "name": None,
        "cuda_version": None,
        "memory_total": None,
        "memory_allocated": None
    }
    
    try:
        if torch.cuda.is_available():
            gpu_info["available"] = True
            gpu_info["device"] = "cuda"
            gpu_info["name"] = torch.cuda.get_device_name(0)
            
            # Get CUDA version
            gpu_info["cuda_version"] = torch.version.cuda
            
            # Get memory info
            total_mem = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
            allocated_mem = torch.cuda.memory_allocated(0) / (1024 ** 3)
            
            gpu_info["memory_total"] = f"{total_mem:.2f} GB"
            gpu_info["memory_allocated"] = f"{allocated_mem:.2f} GB"
            
            print(f"✅ GPU detected: {gpu_info['name']} with CUDA {gpu_info['cuda_version']}")
            print(f"✅ GPU memory: {gpu_info['memory_allocated']} used of {gpu_info['memory_total']}")
        else:
            print("⚠️ No GPU detected. Using CPU for inference (will be slower)")
    except Exception as e:
        print(f"❌ Error detecting GPU: {str(e)}")
    
    return gpu_info

def load_model(model_size="large-v3", device=None, compute_type=None):
    """Load the Whisper model with specified parameters"""
    if device is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
    
    if compute_type is None:
        compute_type = "float16" if device == "cuda" else "float32"
    
    print(f"🔄 Loading model: {model_size} on {device} with {compute_type}")
    start_time = time.time()
    
    try:
        model = WhisperModel(model_size, device=device, compute_type=compute_type)
        load_time = time.time() - start_time
        print(f"✅ Model loaded in {load_time:.2f} seconds")
        return model, load_time
    except Exception as e:
        print(f"❌ Failed to load model: {e}")
        return None, 0

def transcribe_audio(model, audio_path):
    """Transcribe audio using the loaded model and measure performance"""
    if not os.path.exists(audio_path):
        print(f"❌ Audio file not found: {audio_path}")
        return None
    
    print(f"🔄 Transcribing audio: {audio_path}")
    start_time = time.time()
    segments, info = model.transcribe(audio_path, beam_size=5)
    
    # Collect all segments
    segments_list = list(segments)
    transcription = " ".join([seg.text.strip() for seg in segments_list])
    
    transcribe_time = time.time() - start_time
    
    print(f"✅ Transcription completed in {transcribe_time:.2f} seconds")
    print(f"📝 Detected language: {info.language} (probability: {info.language_probability:.4f})")
    print(f"📝 Transcription: {transcription}")
    
    return {
        "transcription": transcription,
        "processing_time": transcribe_time,
        "language": info.language,
        "language_probability": info.language_probability,
    }

def run_benchmark(model, audio_files, iterations=3):
    """Run a benchmark on multiple audio files"""
    results = {}
    total_time = 0
    
    print(f"\n📊 Running benchmark on {len(audio_files)} files (iterations: {iterations})")
    
    for audio_file in audio_files:
        file_results = []
        for i in range(iterations):
            print(f"\n🔄 Benchmark run {i+1}/{iterations} for {audio_file}")
            
            # Clean up GPU memory before each run
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            
            result = transcribe_audio(model, audio_file)
            if result:
                file_results.append(result["processing_time"])
                total_time += result["processing_time"]
        
        if file_results:
            avg_time = np.mean(file_results)
            std_dev = np.std(file_results)
            results[audio_file] = {
                "avg_time": avg_time,
                "std_dev": std_dev,
                "times": file_results
            }
            print(f"📊 {os.path.basename(audio_file)}: Avg {avg_time:.2f}s (±{std_dev:.2f}s)")
    
    return results, total_time

def find_audio_files(directory="./uploads", fallback_dirs=None, extensions=None):
    """Find audio files in the specified directory or fallbacks"""
    if extensions is None:
        extensions = ['.wav', '.mp3', '.m4a', '.ogg', '.flac']
    
    if fallback_dirs is None:
        fallback_dirs = ['./backend/uploads', './backend/tts_outputs', './uploads', '.']
    
    # Normalize directory path
    directory = Path(directory)
    all_audio_files = []
    
    # Try specified directory first
    if directory.exists() and directory.is_dir():
        for ext in extensions:
            all_audio_files.extend(list(directory.glob(f"*{ext}")))
    
    # If no files found, try fallback directories
    if not all_audio_files:
        for fallback in fallback_dirs:
            fallback_dir = Path(fallback)
            if fallback_dir.exists() and fallback_dir.is_dir():
                for ext in extensions:
                    all_audio_files.extend(list(fallback_dir.glob(f"*{ext}")))
                if all_audio_files:
                    break
    
    # Convert to strings
    all_audio_files = [str(file) for file in all_audio_files]
    
    if not all_audio_files:
        print("⚠️ No audio files found! Using test audio...")
        
        # Create a small test audio file with silence
        sample_rate = 16000
        duration = 3  # seconds
        try:
            import scipy.io.wavfile as wavfile
            
            # Create silent audio (small amount of noise)
            audio_data = np.random.normal(0, 0.01, int(sample_rate * duration)).astype(np.float32)
            
            # Save test audio file
            test_file = "test_audio.wav"
            wavfile.write(test_file, sample_rate, audio_data)
            
            all_audio_files = [test_file]
            print(f"✅ Created test audio file: {test_file}")
        except Exception as e:
            print(f"❌ Failed to create test audio: {e}")
    
    return all_audio_files[:3]  # Limit to first 3 audio files

def main():
    parser = argparse.ArgumentParser(description="Test Whisper ASR model")
    parser.add_argument("--model", type=str, default="large-v3", 
                       help="Whisper model size (tiny, base, small, medium, large-v3)")
    parser.add_argument("--device", type=str, choices=["cpu", "cuda"], 
                       default=None, help="Device to run on (auto-detected if not specified)")
    parser.add_argument("--compute-type", type=str, choices=["float32", "float16", "int8"], 
                       default=None, help="Compute type (auto-selected if not specified)")
    parser.add_argument("--audio", type=str, default=None, 
                       help="Path to audio file(s) or directory")
    parser.add_argument("--iterations", type=int, default=1, 
                       help="Number of benchmark iterations per file")
    
    args = parser.parse_args()
    
    print("=" * 80)
    print("🎯 Whisper ASR Model Test")
    print("=" * 80)
    
    # Check GPU status
    gpu_info = get_gpu_info()
    
    # Load the model
    model, load_time = load_model(args.model, args.device, args.compute_type)
    if model is None:
        return
    
    # Find audio files to test
    if args.audio and os.path.exists(args.audio):
        if os.path.isdir(args.audio):
            audio_files = find_audio_files(args.audio)
        else:
            audio_files = [args.audio]
    else:
        audio_files = find_audio_files()
    
    if not audio_files:
        print("❌ No audio files found to test.")
        return
    
    print(f"🔍 Found {len(audio_files)} audio file(s) for testing")
    
    # Run the benchmark
    results, total_time = run_benchmark(model, audio_files, args.iterations)
    
    # Print summary
    print("\n" + "=" * 80)
    print(f"📊 Summary for {args.model} on {gpu_info['device']}:")
    print(f"   - Files processed: {len(audio_files)}")
    print(f"   - Total processing time: {total_time:.2f} seconds")
    print(f"   - Average time per file: {total_time / (len(audio_files) * args.iterations):.2f} seconds")
    print("=" * 80)
    
    # Cleanup any test files
    if os.path.exists("test_audio.wav"):
        os.remove("test_audio.wav")

if __name__ == "__main__":
    main()