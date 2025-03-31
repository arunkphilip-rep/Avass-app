import { uploadAudio } from './api';

class BufferManager {
  constructor() {
    this.recordingBuffer = [];
    this.isProcessing = false;
    this.onProgressCallback = null;
    this.onCompleteCallback = null;
    this.maxRetries = 3;
    this.retryDelay = 2000; // 2 seconds between retries
    this.processedCount = 0;
    this.failedCount = 0;
  }

  async addRecording(uri) {
    const recordingId = Date.now().toString();
    const recording = {
      uri,
      id: recordingId,
      status: 'pending',
      retryCount: 0,
      addedAt: new Date(),
      error: null
    };

    this.recordingBuffer.push(recording);
    console.log(`📦 Added recording ${recordingId} to buffer (${this.recordingBuffer.length} total)`);
    
    this.processNextRecording();
    return recordingId;
  }

  setCallbacks(onProgress, onComplete) {
    this.onProgressCallback = onProgress;
    this.onCompleteCallback = onComplete;
  }

  async processNextRecording() {
    if (this.isProcessing || this.recordingBuffer.length === 0) return;

    this.isProcessing = true;
    const recording = this.recordingBuffer[0];

    try {
      console.log(`🎯 Processing recording ${recording.id}`);
      recording.status = 'processing';
      
      const result = await uploadAudio(recording.uri, (progress) => {
        if (this.onProgressCallback) {
          this.onProgressCallback(progress, recording.id);
        }
      });

      console.log(`✅ Successfully processed recording ${recording.id}`);
      this.processedCount++;
      
      if (this.onCompleteCallback) {
        this.onCompleteCallback(result, recording.id);
      }

      this.recordingBuffer.shift();

    } catch (error) {
      console.error(`❌ Error processing recording ${recording.id}:`, error);
      
      if (recording.retryCount < this.maxRetries) {
        recording.retryCount++;
        recording.status = 'retrying';
        recording.error = error.message;
        
        console.log(`🔄 Retrying recording ${recording.id} (attempt ${recording.retryCount}/${this.maxRetries})`);
        
        // Move to end of queue for retry
        this.recordingBuffer.shift();
        this.recordingBuffer.push(recording);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        
      } else {
        console.error(`❌ Recording ${recording.id} failed after ${this.maxRetries} attempts`);
        recording.status = 'failed';
        recording.error = error.message;
        this.failedCount++;
        this.recordingBuffer.shift();
        
        // Notify of permanent failure
        if (this.onCompleteCallback) {
          this.onCompleteCallback({ error: error.message, status: 'failed' }, recording.id);
        }
      }
    } finally {
      this.isProcessing = false;
      if (this.recordingBuffer.length > 0) {
        this.processNextRecording();
      }
    }
  }

  getBufferStatus() {
    return {
      pending: this.recordingBuffer.length,
      isProcessing: this.isProcessing,
      processed: this.processedCount,
      failed: this.failedCount,
      items: this.recordingBuffer.map(rec => ({
        id: rec.id,
        status: rec.status,
        retryCount: rec.retryCount,
        error: rec.error,
        addedAt: rec.addedAt
      }))
    };
  }

  clearBuffer() {
    this.recordingBuffer = [];
    this.isProcessing = false;
    this.processedCount = 0;
    this.failedCount = 0;
  }
}

export const bufferManager = new BufferManager();
