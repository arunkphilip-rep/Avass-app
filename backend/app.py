import os
import json
import uuid
import logging
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Configuration
UPLOAD_FOLDER = "uploads"
RESPONSES_FOLDER = "responses"
COLAB_URL = "https://c022-34-41-106-30.ngrok-free.app"

# Update CORS configuration
CORS(app)

# Ensure necessary folders exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(RESPONSES_FOLDER, exist_ok=True)

def verify_colab_connection():
    """Verify Colab server is accessible"""
    try:
        logger.info(f"Verifying Colab connection at: {COLAB_URL}")
        response = requests.get(COLAB_URL, 
            timeout=10,
            headers={'ngrok-skip-browser-warning': 'true'}
        )
        logger.info(f"Colab base response: {response.status_code}")
        return response.status_code == 200
    except Exception as e:
        logger.error(f"Colab verification failed: {e}")
        return False

def send_to_colab(file_path):
    """Send audio file to Colab for processing"""
    try:
        if not os.path.exists(file_path):
            raise FileNotFoundError("Audio file not found")

        if not verify_colab_connection():
            logger.error("Colab server not accessible")
            return {"error": "AI server is currently unavailable"}

        with open(file_path, 'rb') as f:
            files = {'audio': (os.path.basename(file_path), f, 'audio/m4a')}
            headers = {
                'ngrok-skip-browser-warning': 'true',
                'Accept': 'application/json'
            }
            
            # Increased timeout for Colab processing
            response = requests.post(
                f"{COLAB_URL}/predict",
                files=files,
                headers=headers,
                timeout=240  # 4 minutes timeout
            )
            
            logger.info(f"Colab response status: {response.status_code}")
            
            if response.status_code == 200:
                return response.json()
            else:
                return {"error": "AI server processing failed"}

    except requests.Timeout:
        return {"error": "AI processing is taking too long"}
    except Exception as e:
        logger.error(f"Colab error: {str(e)}")
        return {"error": "Failed to process audio"}

@app.route('/api/upload', methods=['POST'])
def upload_audio():
    try:
        logger.info("Received upload request")
        
        if 'file' not in request.files:
            return jsonify({'error': 'Audio file is missing'}), 400

        audio_file = request.files['file']
        if not audio_file.filename:
            return jsonify({'error': 'No selected file'}), 400

        # Save uploaded file
        file_ext = os.path.splitext(audio_file.filename)[1].lower()
        filename = f"{uuid.uuid4()}{file_ext}"
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        
        audio_file.save(filepath)
        logger.info(f"File saved: {filepath}")

        try:
            colab_result = send_to_colab(filepath)
            
            if "error" in colab_result:
                logger.error(f"Colab error: {colab_result['error']}")
                return jsonify({"error": colab_result["error"]}), 500

            return jsonify({
                "status": "success",
                "colab_response": colab_result
            })

        finally:
            if os.path.exists(filepath):
                os.remove(filepath)

    except Exception as e:
        logger.exception("Upload error")
        return jsonify({"error": str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """Simple server status check"""
    return jsonify({
        'status': 'ok',
        'timestamp': datetime.datetime.utcnow().isoformat(),
        'upload_folder': os.path.exists(UPLOAD_FOLDER)
    })

if __name__ == '__main__':
    logger.info("Starting Flask server...")
    app.run(host='0.0.0.0', port=5000, debug=True)
