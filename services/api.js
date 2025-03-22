import axios from 'axios';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';

const API_URL = 'https://c022-34-41-106-30.ngrok-free.app';
const TIMEOUT = 30000; // 30 seconds timeout

export const uploadAudio = async (fileUri, onProgress) => {
  try {
    // Verify file exists
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (!fileInfo.exists) {
      throw new Error('Audio file not found');
    }

    const formData = new FormData();
    formData.append('audio', {
      uri: Platform.OS === 'ios' ? fileUri.replace('file://', '') : fileUri,
      type: 'audio/m4a',
      name: 'recording.m4a'
    });

    // Add timeout and error handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

    const response = await fetch(`${API_URL}/upload`, {
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
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Server Error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      throw new Error(`Server error: ${response.status}`);
    }

    const data = await response.json();
    if (!data) {
      throw new Error('Empty response from server');
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    console.error('Upload error details:', error);
    throw new Error(`Upload failed: ${error.message}`);
  }
};
