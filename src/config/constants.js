export const AUDIO_CONFIG = {
  SILENCE_THRESHOLD: -45,  // Adjusted for better silence detection
  SILENCE_DURATION: 2000,  // Reduced to 2 seconds
  CHUNK_INTERVAL: 500,    // Reduced for more frequent chunks
  BACKEND_URL: 'http://localhost:5000',
  API_ENDPOINTS: {
    UPLOAD: '/upload-audio',
    TRANSCRIPTION: '/transcription',
    TTS: '/tts-audio'
  },
  MIN_DECIBELS: -90,
  MAX_DECIBELS: -10,
  SMOOTHING_TIME_CONSTANT: 0.85,
  SAMPLE_RATE: 44100,
  BIT_DEPTH: 16,
  CHANNELS: 1,
  WAV_FORMAT: {
    AUDIO_FORMAT: 1,
    SAMPLE_RATE: 44100,
    BIT_DEPTH: 16,
    CHANNELS: 1,
    BYTES_PER_SAMPLE: 2
  },
  BUFFER_SIZE: 4096
};
