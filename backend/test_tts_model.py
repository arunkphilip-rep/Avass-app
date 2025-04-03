#!/usr/bin/env python
"""
Test script for evaluating TTS model performance and GPU utilization
"""
import os
import sys
import time
import torch
import argparse
import numpy as np
from pathlib import Path

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

def load_tts_model(model_name="tts_models/en/ljspeech/vits"):
    """Load the TTS model"""
    try:
        from TTS.api import TTS
        
        print(f"🔄 Loading TTS model: {model_name}")
        start_time = time.time()
        
        # Check if GPU is available for TTS
        use_gpu = torch.cuda.is_available()
        device = "cuda" if use_gpu else "cpu"
        
        tts = TTS(model_name, progress_bar=False)
        
        # Print model device
        if hasattr(tts, "model"):
            if hasattr(tts.model, "device"):
                print(f"✅ TTS model device: {tts.model.device}")
        
        load_time = time.time() - start_time
        print(f"✅ TTS model loaded in {load_time:.2f} seconds")
        
        return tts, load_time
    except Exception as e:
        print(f"❌ Failed to load TTS model: {e}")
        return None, 0

def generate_speech(tts, text, output_file="test_output.wav"):
    """Generate speech from text using the TTS model and measure performance"""
    try:
        print(f"🔄 Generating speech for: '{text}'")
        start_time = time.time()
        
        # Generate speech
        tts.tts_to_file(text=text, file_path=output_file)
        
        generation_time = time.time() - start_time
        file_size = os.path.getsize(output_file) / 1024  # Size in KB
        
        print(f"✅ Speech generated in {generation_time:.2f} seconds")
        print(f"📊 Output file: {output_file} ({file_size:.1f} KB)")
        
        return {
            "output_file": output_file,
            "processing_time": generation_time,
            "file_size_kb": file_size,
        }
    except Exception as e:
        print(f"❌ Failed to generate speech: {e}")
        return None

def run_benchmark(tts, texts, output_dir="./tts_benchmark", iterations=3):
    """Run a benchmark on multiple text samples"""
    results = {}
    total_time = 0
    
    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)
    
    print(f"\n📊 Running benchmark on {len(texts)} texts (iterations: {iterations})")
    
    for i, text in enumerate(texts):
        text_results = []
        text_id = f"text_{i+1}"
        
        for j in range(iterations):
            print(f"\n🔄 Benchmark run {j+1}/{iterations} for '{text[:50]}...'")
            
            # Clean up GPU memory before each run
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            
            output_file = os.path.join(output_dir, f"{text_id}_run_{j+1}.wav")
            result = generate_speech(tts, text, output_file)
            
            if result:
                text_results.append(result["processing_time"])
                total_time += result["processing_time"]
        
        if text_results:
            avg_time = np.mean(text_results)
            std_dev = np.std(text_results)
            results[text_id] = {
                "avg_time": avg_time,
                "std_dev": std_dev,
                "times": text_results,
                "text": text[:50] + "..." if len(text) > 50 else text
            }
            print(f"📊 '{text_id}': Avg {avg_time:.2f}s (±{std_dev:.2f}s)")
    
    return results, total_time

def get_sample_texts(sample_size=25):
    """Generate sample texts for testing with varying complexity and length"""
    # Basic samples
    basic_samples = [
        "Hello, this is a test of the text to speech system running on GPU acceleration.",
        "The quick brown fox jumps over the lazy dog. This sentence contains all the letters in the English alphabet.",
        "Artificial intelligence models like this one can convert text to natural-sounding speech in real time.",
        "Testing the performance of GPU acceleration helps us understand if the hardware is being utilized correctly.",
        "Longer sentences with more complex structures and punctuation help us evaluate the model's quality and speed better."
    ]
    
    # Extended samples with varied lengths and complexity
    extended_samples = [
        # Short phrases (fast processing)
        "Hello world.",
        "Testing, testing, 1, 2, 3.",
        "The weather is nice today.",
        "Can you hear me?",
        "What time is it?",
        
        # Medium sentences
        "I would like to book a flight for tomorrow morning at 10 AM.",
        "Please remember to turn off the lights before leaving the house.",
        "The concert was amazing, and the crowd loved every minute of it.",
        "We should consider all options before making a final decision.",
        "The recipe calls for two cups of flour and one teaspoon of salt.",
        
        # Complex sentences
        "Despite the challenges faced during development, the team successfully delivered the project ahead of schedule, which impressed the stakeholders.",
        "The intricate details in the painting, created using a combination of oil and acrylic, showcased the artist's mastery of light and shadow.",
        "Researchers have discovered that regular exercise, combined with a balanced diet, can significantly reduce the risk of cardiovascular diseases.",
        "While quantum computing promises to revolutionize information processing, experts agree that practical applications remain several years away.",
        "The committee, after extensive deliberation and careful consideration of all relevant factors, unanimously approved the proposed amendments to the bylaws.",
        
        # Technical content
        "The NVIDIA RTX 4050 GPU features tensor cores optimized for machine learning workloads, with support for CUDA 12.7.",
        "Text-to-speech synthesis models convert written text into natural-sounding human speech using deep neural networks.",
        "In PyTorch, tensors can be moved between CPU and GPU memory using the .to(device) method, which is essential for deep learning workflows.",
        "The transformer architecture employs multi-head attention mechanisms to capture long-range dependencies in sequential data.",
        "Batch processing improves computational efficiency by processing multiple data samples simultaneously on the GPU."
    ]
    
    # Combine and limit to requested sample size
    all_samples = basic_samples + extended_samples
    return all_samples[:sample_size]

def run_benchmark_with_matrix(tts, texts, output_dir="./tts_benchmark", iterations=3):
    """Run a benchmark with detailed performance matrix"""
    results = {}
    total_time = 0
    
    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)
    
    print(f"\n📊 Running benchmark on {len(texts)} texts (iterations: {iterations})")
    
    # Prepare data collection for performance matrix
    char_counts = []
    word_counts = []
    processing_times = []
    chars_per_second = []
    words_per_second = []
    
    for i, text in enumerate(texts):
        text_results = []
        text_id = f"text_{i+1}"
        
        # Count statistics
        char_count = len(text)
        word_count = len(text.split())
        
        for j in range(iterations):
            print(f"\n🔄 Benchmark run {j+1}/{iterations} for '{text[:50]}...' ({char_count} chars, {word_count} words)")
            
            # Clean up GPU memory before each run
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            
            output_file = os.path.join(output_dir, f"{text_id}_run_{j+1}.wav")
            result = generate_speech(tts, text, output_file)
            
            if result:
                process_time = result["processing_time"]
                text_results.append(process_time)
                total_time += process_time
                
                # Calculate efficiency metrics
                char_per_sec = char_count / process_time
                word_per_sec = word_count / process_time
                
                # Append to performance data
                char_counts.append(char_count)
                word_counts.append(word_count)
                processing_times.append(process_time)
                chars_per_second.append(char_per_sec)
                words_per_second.append(word_per_sec)
                
                print(f"⏱️ Efficiency: {char_per_sec:.2f} chars/sec | {word_per_sec:.2f} words/sec")
        
        if text_results:
            avg_time = np.mean(text_results)
            std_dev = np.std(text_results)
            avg_char_per_sec = char_count / avg_time
            avg_word_per_sec = word_count / avg_time
            
            results[text_id] = {
                "char_count": char_count,
                "word_count": word_count,
                "avg_time": avg_time,
                "std_dev": std_dev,
                "times": text_results,
                "chars_per_second": avg_char_per_sec,
                "words_per_second": avg_word_per_sec,
                "text": text[:50] + "..." if len(text) > 50 else text
            }
            print(f"📊 '{text_id}': Avg {avg_time:.2f}s (±{std_dev:.2f}s) | {avg_char_per_sec:.2f} chars/sec | {avg_word_per_sec:.2f} words/sec")
    
    # Calculate aggregate statistics
    performance_matrix = {
        "sample_count": len(texts) * iterations,
        "total_chars": sum(char_counts),
        "total_words": sum(word_counts),
        "total_time": total_time,
        "avg_chars_per_second": np.mean(chars_per_second),
        "median_chars_per_second": np.median(chars_per_second),
        "min_chars_per_second": min(chars_per_second),
        "max_chars_per_second": max(chars_per_second),
        "avg_words_per_second": np.mean(words_per_second),
        "median_words_per_second": np.median(words_per_second),
        "min_words_per_second": min(words_per_second),
        "max_words_per_second": max(words_per_second),
        "std_dev_processing_time": np.std(processing_times),
        "correlation_chars_time": np.corrcoef(char_counts, processing_times)[0, 1]  # Correlation between char count and processing time
    }
    
    return results, total_time, performance_matrix

def print_performance_matrix(matrix, gpu_info):
    """Print a detailed performance matrix for the TTS model"""
    print("\n" + "=" * 80)
    print(f"📊 TTS PERFORMANCE MATRIX on {gpu_info['name'] if gpu_info['available'] else 'CPU'}")
    print("=" * 80)
    print(f"Total samples processed: {matrix['sample_count']}")
    print(f"Total characters processed: {matrix['total_chars']}")
    print(f"Total words processed: {matrix['total_words']}")
    print(f"Total processing time: {matrix['total_time']:.2f} seconds")
    print("-" * 80)
    print("THROUGHPUT METRICS:")
    print(f"Average processing speed: {matrix['avg_chars_per_second']:.2f} chars/sec | {matrix['avg_words_per_second']:.2f} words/sec")
    print(f"Median processing speed: {matrix['median_chars_per_second']:.2f} chars/sec | {matrix['median_words_per_second']:.2f} words/sec")
    print(f"Speed range: {matrix['min_chars_per_second']:.2f} - {matrix['max_chars_per_second']:.2f} chars/sec")
    print(f"Speed range: {matrix['min_words_per_second']:.2f} - {matrix['max_words_per_second']:.2f} words/sec")
    print("-" * 80)
    print("CONSISTENCY METRICS:")
    print(f"Processing time standard deviation: {matrix['std_dev_processing_time']:.2f} seconds")
    print(f"Correlation (text length vs. processing time): {matrix['correlation_chars_time']:.4f}")
    print("=" * 80)
    
    # Add comparison to expected performance
    if gpu_info['available']:
        print("\nGPU UTILIZATION:")
        # RTX 4050 is a mid-range GPU, so we can set some reference values
        expected_chars_per_sec = 100.0
        if matrix['avg_chars_per_second'] > expected_chars_per_sec:
            efficiency = min(100.0, (matrix['avg_chars_per_second'] / expected_chars_per_sec) * 100)
            print(f"GPU Performance: Good ({efficiency:.1f}% of expected performance)")
        else:
            efficiency = (matrix['avg_chars_per_second'] / expected_chars_per_sec) * 100
            print(f"GPU Performance: Below expected ({efficiency:.1f}% of expected performance)")
            print("Consider checking for GPU throttling or other running processes")
    print("=" * 80)

def main():
    parser = argparse.ArgumentParser(description="Test TTS model")
    parser.add_argument("--model", type=str, default="tts_models/en/ljspeech/vits", 
                       help="TTS model name")
    parser.add_argument("--text", type=str, default=None, 
                       help="Text to synthesize (if not provided, sample texts will be used)")
    parser.add_argument("--output", type=str, default="./tts_benchmark", 
                       help="Output directory for generated audio files")
    parser.add_argument("--iterations", type=int, default=1, 
                       help="Number of benchmark iterations per text")
    parser.add_argument("--sample-size", type=int, default=25,
                       help="Number of text samples to use (max 25)")
    parser.add_argument("--device", type=str, choices=["cuda", "cpu"], default=None,
                       help="Device to run on (auto-detected if not specified)")
    
    args = parser.parse_args()
    
    print("=" * 80)
    print("🎯 TTS Model Test with Performance Matrix")
    print("=" * 80)
    
    # Check GPU status
    gpu_info = get_gpu_info()
    
    # Override device if specified
    if args.device:
        if args.device == "cpu" and gpu_info["available"]:
            print("⚠️ Forcing CPU usage despite GPU being available")
            os.environ['CUDA_VISIBLE_DEVICES'] = '-1'
            # Re-check GPU status after forcing CPU
            gpu_info = get_gpu_info()
    
    # Load the model
    tts, load_time = load_tts_model(args.model)
    if tts is None:
        return
    
    # Get texts to synthesize
    texts = []
    if args.text:
        texts = [args.text]
    else:
        sample_size = min(25, max(1, args.sample_size))
        texts = get_sample_texts(sample_size)
        print(f"🔍 Using {len(texts)} sample texts for testing")
    
    # Run the benchmark with performance matrix
    results, total_time, performance_matrix = run_benchmark_with_matrix(tts, texts, args.output, args.iterations)
    
    # Print performance matrix
    print_performance_matrix(performance_matrix, gpu_info)
    
    # Print summary
    print("\n" + "=" * 80)
    print(f"📊 Summary for TTS on {gpu_info['device']}:")
    print(f"   - Texts processed: {len(texts)}")
    print(f"   - Total processing time: {total_time:.2f} seconds")
    print(f"   - Average time per text: {total_time / (len(texts) * args.iterations):.2f} seconds")
    print("=" * 80)
    
    cpu_device = "cpu" if gpu_info["available"] else "(already using CPU)"
    if gpu_info["available"]:
        print(f"\n💡 Tip: To compare with CPU performance, run: python test_tts_model.py --device cpu")
    
    print(f"💡 Audio files saved to: {os.path.abspath(args.output)}")

if __name__ == "__main__":
    main()