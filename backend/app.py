from flask import Flask, request, jsonify, send_file, url_for
from flask_cors import CORS
import os
import uuid
import torch
import tempfile
import time
import datetime
from threading import Thread
from queue import Queue
from faster_whisper import WhisperModel
from TTS.api import TTS
import logging
from pathlib import Path
from collections import defaultdict

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# ✅ Flask Configuration
app = Flask(__name__)
CORS(app, resources={
    r"/*": {
        "origins": [
            "https://purely-unbiased-ram.ngrok-free.app",
            "http://localhost:5000",
            "http://192.168.1.3:5000"
        ],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})

# Update server configuration
SERVER_HOST = '0.0.0.0'  # Listen on all interfaces
SERVER_PORT = 5000

# ✅ Set TTS Output Directory
TTS_OUTPUT_DIR = "tts_outputs"
os.makedirs(TTS_OUTPUT_DIR, exist_ok=True)

# ✅ Device Configuration
device = "cuda" if torch.cuda.is_available() else "cpu"
compute_type = "float16" if device == "cuda" else "float32"

# ✅ Load Faster-Whisper Model
whisper_model = WhisperModel("tiny.en", device=device, compute_type=compute_type)

# ✅ TTS Configuration
TTS_MODEL = "tts_models/en/ljspeech/vits"  # Use the model that worked
TTS_TEST_TEXT = "System initialization complete."
tts = None

def initialize_tts():
    """Initialize and test TTS system"""
    global tts
    try:
        logger.info("🎯 Initializing TTS model...")
        tts = TTS(TTS_MODEL, progress_bar=False)
        
        # Test the model
        test_output = os.path.join(TTS_OUTPUT_DIR, "test_output.wav")
        tts.tts_to_file(text=TTS_TEST_TEXT, file_path=test_output)
        
        if os.path.exists(test_output):
            os.remove(test_output)
            logger.info("✅ TTS test successful")
            return True
        return False
    except Exception as e:
        logger.error(f"❌ TTS initialization failed: {str(e)}")
        return False

# ✅ Queue to Process Audio Requests
processing_queue = Queue()

# ✅ Processing Status Storage
processing_status = defaultdict(dict)

# ✅ Delete File After a Delay
def delete_file_after_delay(file_path, delay=60):
    time.sleep(delay)
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            logger.info(f"✅ Deleted: {file_path}")
    except Exception as e:
        logger.error(f"❌ Error deleting {file_path}: {e}")

# ✅ Add buffer queue
audio_buffer = Queue()
processing_threads = []
MAX_PROCESSING_THREADS = 3

def process_audio_buffer():
    while True:
        audio_path, session_id = audio_buffer.get()
        try:
            process_single_audio(audio_path, session_id)
        finally:
            audio_buffer.task_done()

def start_processing_threads():
    for _ in range(MAX_PROCESSING_THREADS):
        thread = Thread(target=process_audio_buffer, daemon=True)
        thread.start()
        processing_threads.append(thread)

def process_single_audio(audio_path, session_id):
    try:
        # Update status to processing
        processing_status[session_id].update({
            'status': 'processing',
            'message': 'Processing audio file',
            'start_time': datetime.datetime.utcnow().isoformat()
        })
        
        logger.info(f"🎯 Processing session: {session_id}")
        try:
            # Step 1: Transcription
            logger.info("Step 1: Starting transcription")
            segments, _ = whisper_model.transcribe(audio_path)
            transcription = " ".join([seg.text.strip() for seg in segments])
            
            # Update transcription status
            processing_status[session_id].update({
                'transcription_complete': True,
                'transcription': transcription
            })
            
            logger.info(f"✅ Transcription complete: {transcription}")

            try:
                logger.info("Step 2: Generating TTS audio")
                output_file = f"tts_{session_id}.wav"
                output_path = os.path.join(TTS_OUTPUT_DIR, output_file)
                
                if tts is None and not initialize_tts():
                    raise Exception("TTS system is not available")

                tts.tts_to_file(text=transcription, file_path=output_path)
                logger.info(f"✅ TTS file generated: {output_path}")
                
                # Use ngrok URL for TTS audio
                ngrok_url = "https://purely-unbiased-ram.ngrok-free.app"
                tts_audio_url = f"{ngrok_url}/api/tts_audio/{output_file}"
                
                logger.info(f"Generated TTS URL: {tts_audio_url}")

                # Update complete status
                processing_status[session_id].update({
                    'status': 'completed',
                    'message': 'Processing complete',
                    'transcription': transcription,
                    'tts_audio_url': tts_audio_url,
                    'completed_at': datetime.datetime.utcnow().isoformat()
                })
                
            except Exception as tts_error:
                logger.error(f"❌ TTS generation failed: {str(tts_error)}")
                processing_status[session_id].update({
                    'status': 'partial_success',
                    'message': 'Transcription successful but TTS failed',
                    'error': str(tts_error)
                })
                
        except Exception as e:
            logger.error(f"❌ Processing failed: {str(e)}")
            processing_status[session_id].update({
                'status': 'failed',
                'message': 'Processing failed',
                'error': str(e)
            })
            
    finally:
        if os.path.exists(audio_path):
            os.remove(audio_path)

# ✅ Process Audio from Queue
def process_audio_queue():
    while True:
        audio_path, session_id = processing_queue.get()
        try:
            process_single_audio(audio_path, session_id)
        finally:
            processing_queue.task_done()

# ✅ Home Route
@app.route('/', methods=['GET'])
def home():
    return "Hello, World! 🚀"

# ✅ Health Check Route
@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'ok',
        'timestamp': str(datetime.datetime.utcnow()),
        'tts_output_dir': os.path.exists(TTS_OUTPUT_DIR)
    })

# ✅ Predict Route (Audio Processing)
@app.route('/predict', methods=['POST'])
def predict():
    logger.info("🎯 Step 1: Received predict request")

    if 'audio' not in request.files:
        logger.error("❌ Step 1a: No audio file in request")
        return jsonify({"error": "❌ No audio file received"}), 400

    audio_file = request.files['audio']
    logger.info(f"✅ Step 2: File received: {audio_file.filename}")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_audio:
        audio_path = temp_audio.name
        audio_file.save(audio_path)
        logger.info(f"✅ Step 3: File saved temporarily: {audio_path}")

    try:
        session_id = str(uuid.uuid4())
        logger.info(f"✅ Step 4: Generated session ID: {session_id}")

        # Add Audio to Queue
        processing_queue.put((audio_path, session_id))
        logger.info("✅ Step 5: Added to processing queue")

        # Start Queue Processor Thread If Not Running
        if not processing_queue.empty():
            Thread(target=process_audio_queue, daemon=True).start()
            logger.info("✅ Step 6: Started processing thread")

        return jsonify({
            "status": "queued",
            "message": "✅ File received and queued for processing",
            "session_id": session_id
        })
    except Exception as e:
        logger.error(f"❌ Processing error: {str(e)}")
        return jsonify({"error": f"❌ Processing failed: {str(e)}"}), 500

# ✅ Upload Audio Route
@app.route('/api/upload', methods=['POST'])
def upload_audio():
    logger.info("🎯 Step 1: Received upload request")

    if 'file' not in request.files:
        logger.error("❌ Step 1a: No file in request")
        return jsonify({"error": "❌ No audio file received"}), 400

    audio_file = request.files['file']
    logger.info(f"✅ Step 2: File received: {audio_file.filename}")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_audio:
        audio_path = temp_audio.name
        audio_file.save(audio_path)
        logger.info(f"✅ Step 3: File saved temporarily: {audio_path}")

    try:
        session_id = str(uuid.uuid4())
        logger.info(f"✅ Step 4: Generated session ID: {session_id}")

        # Add Audio to Queue
        processing_queue.put((audio_path, session_id))
        logger.info("✅ Step 5: Added to processing queue")

        # Start Queue Processor Thread
        if not processing_queue.empty():
            Thread(target=process_audio_queue, daemon=True).start()
            logger.info("✅ Step 6: Started processing thread")

        return jsonify({
            "status": "success",
            "message": "✅ File received and queued for processing",
            "session_id": session_id
        })

    except Exception as e:
        logger.error(f"❌ Processing error: {str(e)}")
        if os.path.exists(audio_path):
            os.remove(audio_path)
            logger.info(f"✅ Temporary file deleted: {audio_path}")
        return jsonify({"error": f"❌ Processing failed: {str(e)}"}), 500

# ✅ Buffer Upload Route
@app.route('/api/buffer/upload', methods=['POST'])
def buffer_upload():
    logger.info("🎯 Step 1: Received buffer upload request")

    if 'file' not in request.files:
        return jsonify({"error": "No audio file received"}), 400

    audio_file = request.files['file']
    
    try:
        session_id = str(uuid.uuid4())
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_audio:
            audio_path = temp_audio.name
            audio_file.save(audio_path)
            
            # Initialize status before adding to queue
            processing_status[session_id] = {
                'status': 'queued',
                'message': 'Audio queued for processing',
                'queue_position': audio_buffer.qsize() + 1,
                'total_queue': audio_buffer.qsize() + 1,
                'created_at': datetime.datetime.utcnow().isoformat(),
                'session_id': session_id
            }
            
            audio_buffer.put((audio_path, session_id))
            
            return jsonify(processing_status[session_id])

    except Exception as e:
        logger.error(f"❌ Buffer upload error: {str(e)}")
        return jsonify({"error": str(e)}), 500

# ✅ Serve TTS Audio
@app.route('/api/tts_audio/<filename>', methods=['GET'])
def serve_audio(filename):
    file_path = os.path.join(TTS_OUTPUT_DIR, filename)
    logger.info(f"Request for audio file: {filename}")
    logger.info(f"Full path: {file_path}")

    if not os.path.exists(file_path):
        logger.error(f"❌ File not found: {file_path}")
        return jsonify({"error": "File not found"}), 404

    try:
        logger.info(f"✅ Serving audio file: {filename}")
        response = send_file(
            file_path,
            mimetype='audio/wav',
            as_attachment=False,
            download_name=filename
        )
        response.headers['Access-Control-Allow-Origin'] = '*'
        return response
    except Exception as e:
        logger.error(f"❌ Error serving file: {str(e)}")
        return jsonify({"error": str(e)}), 500

# ✅ Status Check Route
@app.route('/status/<session_id>', methods=['GET'])
def check_status(session_id):
    status = processing_status.get(session_id, {
        'status': 'not_found',
        'message': 'Session not found'
    })
    
    # Add queue information if status is queued
    if status.get('status') == 'queued':
        queue_position = list(processing_status.keys()).index(session_id)
        status.update({
            'queue_position': queue_position,
            'total_queue': len(processing_status),
            'estimated_wait': queue_position * 2  # Rough estimate in seconds
        })
    
    return jsonify(status)

# ✅ Run Flask Application
if __name__ == "__main__":
    logger.info("🚀 Starting Flask application")
    if not initialize_tts():
        logger.error("❌ Failed to initialize TTS system")
        exit(1)
    start_processing_threads()
    app.run(host=SERVER_HOST, port=SERVER_PORT, debug=False, threaded=True)
