import axios from 'axios';
import { Platform, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';

// Change API_URL to point to your local Flask server
const API_URL = 'http://192.168.1.38:5000';
const TIMEOUT = 30000; // 30 seconds timeout

const checkProcessingStatus = async (sessionId) => {
  const response = await fetch(`${API_URL}/status/${sessionId}`);
  return await response.json();
};

const playGeneratedAudio = async (audioUrl) => {
  try {
    console.log('🎵 Playing audio from:', audioUrl);
    const { sound } = await Audio.Sound.createAsync({ uri: audioUrl });
    await sound.playAsync();
    return sound;
  } catch (error) {
    console.error('❌ Audio playback failed:', error);
    throw error;
  }
};

export const uploadAudio = async (fileUri, onProgress) => {
  try {
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
    const response = await fetch(`${API_URL}/api/upload`, {  // Changed from /upload to /api/upload
      method: 'POST',
      body: formData,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'multipart/form-data',
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // Check server response
    const data = await response.json();
    console.log('📥 Step 6: Server response received:', data);

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    if (!data) {
      throw new Error('Empty response from server');
    }
    
    // Handle different response types
    if (data.status === 'success' || data.status === 'partial_success') {
      console.log(`✅ Step 7: Processing ${data.status}, session:`, data.session_id);
      
      // Check processing status
      const maxAttempts = 10;
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
        
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
        attempts++;
      }

      if (processingResult?.tts_audio_url) {
        console.log('🎵 Audio generated, attempting playback');
        const sound = await playGeneratedAudio(processingResult.tts_audio_url);
        return {
          ...processingResult,
          sound
        };
      }
      
      return processingResult || data;
    } else {
      throw new Error(data.error || 'Unknown error occurred');
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    if (error.message.includes('Network request failed')) {
      throw new Error('Network connection failed. Please check your internet connection.');
    }
    console.error('Upload error details:', error);
    throw new Error(`Upload failed: ${error.message}`);
  }
};
