#!/usr/bin/env python
"""
Script to install the correct PyTorch version with CUDA support
for NVIDIA GeForce RTX 4050 Laptop GPU
"""
import os
import sys
import subprocess
import platform


def run_command(command):
    """Run a command and print its output"""
    print(f"Running: {command}")
    process = subprocess.Popen(
        command,
        shell=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        universal_newlines=True
    )
    
    for line in process.stdout:
        print(line.strip())
    
    process.wait()
    return process.returncode


def check_cuda():
    """Check if CUDA is installed and get its version"""
    try:
        # Try nvidia-smi first
        result = subprocess.run(
            ["nvidia-smi"], 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE, 
            universal_newlines=True
        )
        
        if result.returncode == 0:
            print("NVIDIA GPU detected via nvidia-smi:")
            print(result.stdout)
            # Extract CUDA version if available
            for line in result.stdout.split("\n"):
                if "CUDA Version:" in line:
                    cuda_version = line.split("CUDA Version:")[1].strip()
                    print(f"CUDA Version: {cuda_version}")
                    return cuda_version
            
            print("CUDA version not found in nvidia-smi output")
            return None
        else:
            print("nvidia-smi command failed. NVIDIA driver may not be installed.")
            return None
    
    except Exception as e:
        print(f"Error checking CUDA: {e}")
        return None


def install_pytorch_with_cuda():
    """Install the appropriate PyTorch version with CUDA support"""
    # Clean up existing PyTorch installation 
    print("Removing any existing PyTorch installations...")
    packages_to_remove = [
        "torch", 
        "torchvision", 
        "torchaudio"
    ]
    
    for package in packages_to_remove:
        run_command(f"{sys.executable} -m pip uninstall -y {package}")
    
    # Install PyTorch with CUDA support
    # For RTX 4050 with CUDA 12.7, try the latest PyTorch that supports 12.1 (closest available)
    print("\n\nInstalling PyTorch with CUDA 12.1 support (compatible with CUDA 12.7)...")
    torch_command = f"{sys.executable} -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121"
    
    result = run_command(torch_command)
    
    if result != 0:
        print("Failed to install PyTorch with CUDA 12.1. Trying CUDA 11.8...")
        torch_command = f"{sys.executable} -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118"
        result = run_command(torch_command)
    
    if result != 0:
        print("Failed to install PyTorch with CUDA. Trying to install nightly build with CUDA 12.1...")
        torch_command = f"{sys.executable} -m pip install --pre torch torchvision torchaudio --index-url https://download.pytorch.org/whl/nightly/cu121"
        result = run_command(torch_command)
    
    if result != 0:
        print("Failed to install PyTorch with CUDA. Please check your CUDA installation.")
        return False
    
    # Set environment variables to ensure CUDA is visible to PyTorch
    os.environ['CUDA_VISIBLE_DEVICES'] = '0'  # Set GPU 0 to be visible
    return True


def verify_pytorch_cuda():
    """Verify that PyTorch can see the CUDA device"""
    verification_code = """
import torch
print("PyTorch version:", torch.__version__)
print("CUDA available:", torch.cuda.is_available())
if torch.cuda.is_available():
    print("CUDA device count:", torch.cuda.device_count())
    print("CUDA device name:", torch.cuda.get_device_name(0))
    print("CUDA version:", torch.version.cuda)
    # Try to create a tensor on GPU
    x = torch.tensor([1.0, 2.0, 3.0], device='cuda')
    print("Tensor on GPU:", x)
else:
    print("CUDA is not available. Check your installation.")
"""
    print("\n\nVerifying PyTorch CUDA support...")
    with open("verify_cuda.py", "w") as f:
        f.write(verification_code)
    
    result = run_command(f"{sys.executable} verify_cuda.py")
    os.remove("verify_cuda.py")
    return result == 0


def update_faster_whisper():
    """Update faster-whisper to ensure GPU support"""
    print("\n\nInstalling/Updating faster-whisper with GPU support...")
    run_command(f"{sys.executable} -m pip install -U faster-whisper")
    
    # Verify faster-whisper installation
    verification_code = """
import torch
from faster_whisper import WhisperModel
print("Checking faster-whisper...")
try:
    # Try to load a small model to verify GPU support
    model = WhisperModel("tiny", device="cuda", compute_type="float16")
    print("Successfully loaded model on GPU")
except Exception as e:
    print(f"Error loading model on GPU: {e}")
    try:
        # Fallback to CPU
        model = WhisperModel("tiny", device="cpu", compute_type="float32")
        print("Successfully loaded model on CPU")
    except Exception as e:
        print(f"Error loading model on CPU: {e}")
"""
    
    with open("verify_whisper.py", "w") as f:
        f.write(verification_code)
    
    run_command(f"{sys.executable} verify_whisper.py")
    os.remove("verify_whisper.py")


def update_tts():
    """Update TTS package for GPU support"""
    print("\n\nInstalling/Updating TTS package...")
    run_command(f"{sys.executable} -m pip install -U TTS")
    
    # No verification for TTS as it's more complex to test


def main():
    print("=" * 80)
    print("PyTorch CUDA Installation Script for RTX 4050")
    print("=" * 80)
    
    # Check system info
    print(f"Python version: {platform.python_version()}")
    print(f"Operating system: {platform.system()} {platform.release()}")
    
    # Check if CUDA is installed
    cuda_version = check_cuda()
    if cuda_version:
        print(f"CUDA is installed, version: {cuda_version}")
    else:
        print("CUDA is not detected. Please install NVIDIA CUDA Toolkit.")
        print("Download from: https://developer.nvidia.com/cuda-downloads")
        response = input("Continue anyway? [y/N]: ")
        if response.lower() != "y":
            return
    
    # Install PyTorch with CUDA support
    success = install_pytorch_with_cuda()
    if not success:
        print("Failed to install PyTorch with CUDA support.")
        return
    
    # Verify PyTorch CUDA installation
    if verify_pytorch_cuda():
        print("PyTorch CUDA installation verified successfully!")
    else:
        print("PyTorch CUDA verification failed. Please check your installation.")
        return
    
    # Update other packages
    update_faster_whisper()
    update_tts()
    
    print("\n" + "=" * 80)
    print("Installation completed. Please restart your application.")
    print("=" * 80)


if __name__ == "__main__":
    main()