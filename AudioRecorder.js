import React, { useState, useRef, useEffect } from 'react';
import { FaMicrophone, FaMicrophoneSlash, FaPlay, FaSpinner } from 'react-icons/fa';
import { AUDIO_CONFIG } from './config/constants';
import './AudioRecorder.css';
import { convertToWav } from './utils/audioConverter';

const AudioRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioChunks, setAudioChunks] = useState([]);
  const [silenceDetected, setSilenceDetected] = useState(false);
  const [silenceStartTime, setSilenceStartTime] = useState(null);
  const [transcription, setTranscription] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [progress, setProgress] = useState('');
  
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const analyserRef = useRef(null);
  const audioContextRef = useRef(null);
  const silenceTimeoutRef = useRef(null);
  const audioPlayerRef = useRef(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      const analyser = audioContext.createAnalyser();
      analyserRef.current = analyser;
      analyser.smoothingTimeConstant = AUDIO_CONFIG.SMOOTHING_TIME_CONSTANT;
      analyser.fftSize = 2048;
      
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      
      // Get supported MIME type
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg'
      ].find(type => MediaRecorder.isTypeSupported(type));
      
      if (!mimeType) {
        throw new Error('No supported media recording MIME type found');
      }
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 128000
      });
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          setAudioChunks((prevChunks) => [...prevChunks, event.data]);
        }
      };
      
      mediaRecorder.start(AUDIO_CONFIG.CHUNK_INTERVAL);
      setIsRecording(true);
      monitorAudioLevel();
      
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert('Error accessing microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && streamRef.current) {
      mediaRecorderRef.current.stop();
      streamRef.current.getTracks().forEach(track => track.stop());
      
      if (audioChunks.length > 0) {
        saveAndSendAudio(audioChunks);
      }
      
      clearTimeout(silenceTimeoutRef.current);
      setIsRecording(false);
      setSilenceDetected(false);
      setSilenceStartTime(null);
      setAudioChunks([]);
      
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const monitorAudioLevel = () => {
    if (!analyserRef.current || !isRecording) return;
    
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    
    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    const dB = 20 * Math.log10(average / 255);
    
    if (dB < AUDIO_CONFIG.SILENCE_THRESHOLD) {
      if (!silenceDetected) {
        setSilenceDetected(true);
        setSilenceStartTime(Date.now());
      } else if (Date.now() - silenceStartTime > AUDIO_CONFIG.SILENCE_DURATION) {
        saveAndSendAudio(audioChunks);
        setSilenceStartTime(Date.now());
      }
    } else {
      setSilenceDetected(false);
      setSilenceStartTime(null);
    }
    
    requestAnimationFrame(monitorAudioLevel);
  };

  const saveAndSendAudio = async (chunks) => {
    if (!chunks || chunks.length === 0) return;
    
    try {
      setIsLoading(true);
      setProgress('Converting audio to WAV format...');
      const wavBlob = await convertToWav(chunks, audioContextRef.current?.sampleRate || AUDIO_CONFIG.SAMPLE_RATE);
      
      setProgress('Sending audio to server...');
      const formData = new FormData();
      formData.append('audio', wavBlob, `recording_${Date.now()}.wav`);
      
      const response = await fetch(`${AUDIO_CONFIG.BACKEND_URL}${AUDIO_CONFIG.API_ENDPOINTS.UPLOAD}`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      const result = await response.json();
      if (!result.session_id) {
        throw new Error('No session ID received');
      }

      setSessionId(result.session_id);
      await pollTranscription(result.session_id);
      
    } catch (error) {
      console.error('Error:', error);
      setProgress(`Error: ${error.message}`);
      setTimeout(() => setProgress(''), 5000);
    } finally {
      setIsLoading(false);
      setAudioChunks([]);
    }
  };

  const pollTranscription = async (sid) => {
    const maxAttempts = 60;
    let attempts = 0;

    const playAudioFromUrl = async (url) => {
      try {
        const audio = new Audio(url);
        await audio.play();
        console.log('Playing TTS audio');
      } catch (err) {
        console.error('Error playing TTS:', err);
      }
    };
    
    while (attempts < maxAttempts) {
      try {
        const response = await fetch(`${AUDIO_CONFIG.BACKEND_URL}${AUDIO_CONFIG.API_ENDPOINTS.TRANSCRIPTION}/${sid}`);
        console.log('Poll response:', response.status);
        
        if (response.ok) {
          const data = await response.json();
          console.log('Transcription received:', data);
          
          if (data.text && data.tts_audio) {
            setTranscription(data);
            setProgress(`Transcription complete: "${data.text}"`);
            
            const audioUrl = `${AUDIO_CONFIG.BACKEND_URL}${AUDIO_CONFIG.API_ENDPOINTS.TTS}/${data.tts_audio}`;
            await playAudioFromUrl(audioUrl);
            return;
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
      
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 1000));
      setProgress(`Processing audio... ${attempts}/${maxAttempts}`);
    }
    setProgress('Processing timed out. Please try again.');
  };

  const playTTSAudio = async (ttsAudioFile) => {
    try {
      const audioUrl = `${AUDIO_CONFIG.BACKEND_URL}${AUDIO_CONFIG.API_ENDPOINTS.TTS}/${ttsAudioFile}`;
      audioPlayerRef.current = new Audio(audioUrl);
      
      audioPlayerRef.current.onended = () => {
        setIsPlaying(false);
        audioPlayerRef.current = null;
      };

      audioPlayerRef.current.onerror = (e) => {
        console.error('Error playing TTS audio:', e);
        setIsPlaying(false);
        audioPlayerRef.current = null;
      };

      setIsPlaying(true);
      await audioPlayerRef.current.play();
    } catch (error) {
      console.error('Error playing TTS:', error);
      setIsPlaying(false);
    }
  };

  useEffect(() => {
    return () => {
      if (isRecording) {
        stopRecording();
      }
    };
  }, []);

  return (
    <div className="audio-recorder">
      <button 
        className={`record-button ${isRecording ? 'recording' : ''}`}
        onClick={toggleRecording}
      >
        {isRecording ? <FaMicrophoneSlash /> : <FaMicrophone />}
      </button>
      <div className="status">
        {isRecording ? (
          <span className="recording-indicator">
            Recording {silenceDetected ? '(Silence detected)' : ''}
          </span>
        ) : (
          <span>Click to start recording</span>
        )}
      </div>
      
      {progress && (
        <div className="progress-info">
          {progress}
        </div>
      )}
      
      {transcription && (
        <div className="transcription-section">
          <div className="processing-info">
            <h3>Processing Details</h3>
            <p>Audio Duration: {transcription.duration?.toFixed(2)}s</p>
            <p>Processing Time: {transcription.processing_time?.toFixed(2)}s</p>
            <p>TTS Generation Time: {transcription.tts_time?.toFixed(2)}s</p>
          </div>
          
          <div className="transcript-container">
            <h3>Transcription</h3>
            <p className="transcription-text">{transcription.text}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AudioRecorder;
