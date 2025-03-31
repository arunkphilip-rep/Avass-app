import axios from 'axios';
import { Platform, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';
import * as Network from 'expo-network';

// Dynamic API URL configuration
const getApiUrl = async () => {
  try {
    if (__DEV__) {
      const serverIP = '192.168.1.3'; // Match Flask server IP
      const serverPort = 5000;
      const serverUrl = `http://${serverIP}:${serverPort}`;
      
      try {
        const response = await fetch(`${serverUrl}/health`, {
          method: 'GET',
          timeout: 5000
        });
        if (response.ok) {
          console.log('✅ Connected to server:', serverUrl);
          return serverUrl;
        }
      } catch (e) {
        console.error('❌ Failed to connect to server:', e.message);
        throw new Error('Server connection failed');
      }
    }
    return 'https://your-production-server.com';
  } catch (error) {
    console.error('Network configuration failed:', error);
    throw error;
  }
};

// Initialize API URL
let API_URL = null;
let isInitialized = false;

const initializeApi = async () => {
  if (!isInitialized) {
    try {
      API_URL = await getApiUrl();
      isInitialized = true;
      console.log('🌐 API URL configured:', API_URL);
    } catch (error) {
      console.error('❌ API initialization failed:', error);
      throw error;
    }
  }
  return API_URL;
};

const TIMEOUT = 30000; // 30 seconds timeout

const checkProcessingStatus = async (sessionId) => {
  try {
    const response = await fetch(`${API_URL}/status/${sessionId}`);
    if (!response.ok) {
      throw new Error('Failed to check processing status');
    }
    return await response.json();
  } catch (error) {
    console.error('Status check error:', error);
    throw error;
  }
};

const playGeneratedAudio = async (audioUrl, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: false }
      );
      return sound;
    } catch (error) {
      console.warn(`Attempt ${i + 1} failed:`, error);
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
};

// Add request queue management
const requestQueue = [];
let isProcessing = false;

const processQueue = async () => {
  if (isProcessing || requestQueue.length === 0) return;
  
  isProcessing = true;
  const { fileUri, onProgress, resolve, reject } = requestQueue[0];

  try {
    const result = await performUpload(fileUri, onProgress);
    resolve(result);
  } catch (error) {
    reject(error);
  } finally {
    requestQueue.shift();
    isProcessing = false;
    if (requestQueue.length > 0) {
      processQueue();
    }
  }
};

const performUpload = async (fileUri, onProgress) => {
  try {
    const apiUrl = await initializeApi();
    if (!apiUrl) {
      throw new Error('API not initialized');
    }

    console.log('🎯 Step 1: Starting audio upload process');
    
    // Verify file exists
    console.log('🔍 Step 2: Verifying file exists:', fileUri);
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (!fileInfo.exists) {
      throw new Error('Audio file not found');
    }
    console.log('✅ File verification successful');

    const formData = new FormData();
    formData.append('file', {  // Changed from 'audio' to 'file'
      uri: Platform.OS === 'ios' ? fileUri.replace('file://', '') : fileUri,
      type: 'audio/m4a',
      name: 'recording.m4a'
    });
    console.log('📦 Step 3: FormData created');

    // Add timeout and error handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

    // Add connection test before upload
    console.log('🏥 Step 4: Performing health check');
    try {
      await fetch(`${API_URL}/health`, {
        method: 'GET',
        timeout: 5000
      });
      console.log('✅ Health check passed');
    } catch (error) {
      console.error('❌ Health check failed:', error);
      throw new Error('Cannot connect to server. Please check if server is running.');
    }

    console.log('📤 Step 5: Uploading audio file');
    const response = await fetch(`${API_URL}/api/buffer/upload`, {  // Changed endpoint
      method: 'POST',
      body: formData,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'multipart/form-data',
      },
      signal: controller.signal
    });

    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      throw new Error(`Invalid response type: ${contentType}. Response: ${text}`);
    }

    console.log('📥 Step 6: Server response received:', data);

    if (!response.ok) {
      throw new Error(data.message || `Server error: ${response.status}`);
    }

    // Handle queued status
    if (data.status === 'queued') {
      console.log('✅ Audio queued, session ID:', data.session_id);
      const sessionId = data.session_id;
      
      // Check processing status with timeout
      const maxAttempts = 60; // Increased timeout
      let attempts = 0;

      while (attempts < maxAttempts) {
        try {
          const status = await checkProcessingStatus(sessionId);
          console.log('📊 Processing status:', status);
          
          if (status.status === 'completed') {
            return {
              transcription: status.transcription,
              tts_audio_url: status.tts_audio_url,
              status: 'completed'
            };
          } else if (status.status === 'failed') {
            throw new Error(status.error || 'Processing failed');
          } else if (status.status === 'processing' || status.status === 'queued') {
            if (onProgress) {
              const progressValue = status.queue_position ? 
                Math.round((1 - status.queue_position / status.total_queue) * 50) :
                Math.round(50 + (attempts / maxAttempts) * 50);
              onProgress(progressValue);
            }
          } else if (status.status === 'not_found') {
            throw new Error('Session not found');
          }
          
          await new Promise(resolve => setTimeout(resolve, 2000)); // Poll every 2 seconds
          attempts++;
        } catch (error) {
          console.error('Status check error:', error);
          if (attempts >= maxAttempts - 1) throw error;
        }
      }

      throw new Error('Processing timed out');
    }

    if (!data) {
      throw new Error('Empty response from server');
    }
    
    // Handle different response types
    if (data.status === 'success' || data.status === 'partial_success') {
      console.log(`✅ Step 7: Processing ${data.status}, session:`, data.session_id);
      
      // Check processing status
      const maxAttempts = 30; // Increased attempts
      let attempts = 0;
      let processingResult = null;

      while (attempts < maxAttempts) {
        const status = await checkProcessingStatus(data.session_id);
        console.log('📊 Processing status:', status);
        
        if (status.status === 'completed') {
          processingResult = status;
          break;
        } else if (status.status === 'failed') {
          throw new Error(status.error || 'Processing failed');
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000)); // Reduced to 1s
        attempts++;
        if (onProgress) {
          onProgress(Math.round((attempts / maxAttempts) * 100));
        }
      }

      if (!processingResult) {
        throw new Error('Processing timed out');
      }

      if (processingResult?.transcription) {
        console.log('🎯 Transcription received:', processingResult.transcription);
        return {
          ...processingResult,
          sound: null // Let component handle audio playback
        };
      }
      
      return processingResult || data;
    } else {
      throw new Error(data.error || 'Unknown error occurred');
    }
  } catch (error) {
    console.error('Upload error details:', error);
    if (error.message.includes('Invalid response type')) {
      throw new Error('Server returned invalid response format. Please check server logs.');
    }
    if (error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    if (error.message.includes('Network request failed')) {
      throw new Error('Network connection failed. Please check your internet connection.');
    }
    throw new Error(`Upload failed: ${error.message}`);
  }
};

export const uploadAudio = async (fileUri, onProgress) => {
  return new Promise((resolve, reject) => {
    requestQueue.push({ fileUri, onProgress, resolve, reject });
    if (!isProcessing) {
      processQueue();
    }
  });
};
