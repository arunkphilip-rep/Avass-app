import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { Audio } from 'expo-av';
import { uploadAudio } from '../services/api';
import { saveTranscriptionNote } from '../firebase/storage';
import { colors, shadows } from '../styles/theme';

const AudioRecorder = ({ onSave, onNavigateToHistory }) => {
  const [recording, setRecording] = useState(null);
  const [sound, setSound] = useState(null);
  const [message, setMessage] = useState("Press button to start recording");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [colabResult, setColabResult] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [ttsAudio, setTtsAudio] = useState(null);
  const [recordings, setRecordings] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingQueue, setProcessingQueue] = useState([]);
  const [isProcessingEnabled, setIsProcessingEnabled] = useState(true);
  const [currentlyPlaying, setCurrentlyPlaying] = useState(null);
  const [transcriptions, setTranscriptions] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [currentSound, setCurrentSound] = useState(null);
  const [playedAudios, setPlayedAudios] = useState(new Set());

  useEffect(() => {
    return () => {
      if (recording) {
        stopRecording().catch(console.error);
      }
      if (sound) {
        sound.unloadAsync().catch(console.error);
      }
      if (currentSound) {
        currentSound.unloadAsync();
      }
    };
  }, []);

  // Background processing queue
  useEffect(() => {
    if (processingQueue.length > 0 && isProcessingEnabled) {
      processNextInQueue();
    }
  }, [processingQueue, isProcessingEnabled]);

  const cleanupRecording = async () => {
    try {
      if (recording) {
        await recording.stopAndUnloadAsync();
        setRecording(null);
      }
    } catch (err) {
      console.error('Cleanup error:', err);
    }
  };

  const handleUploadError = (error) => {
    const errorMessage = error.includes('AI server') ? 
      'AI server is not available right now. Please try again later.' :
      'Upload failed. Please try again.';
    setMessage(errorMessage);
  };

  async function startRecording() {
    try {
      await cleanupRecording(); // Cleanup any existing recording
      
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        setMessage('Permission denied');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      const newRecording = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(newRecording.recording);
      setIsRecording(true); // Set recording state to true
      setMessage("Recording...");
    } catch (err) {
      console.error('Start recording error:', err);
      setMessage("Failed to start recording");
      setIsRecording(false); // Ensure recording state is false on error
    }
  }

  async function stopRecording() {
    try {
      if (!recording) return;

      const uri = recording.getURI();
      await cleanupRecording();
      setIsRecording(false); // Set recording state to false
      
      // Add to processing queue and continue
      addToProcessingQueue(uri);
      setMessage("Ready to record");

    } catch (err) {
      console.error('Stop recording error:', err);
      setMessage("Failed to stop recording");
      setIsRecording(false); // Ensure recording state is false on error
    }
  }

  const cancelRecording = async () => {
    try {
      if (recording) {
        await recording.stopAndUnloadAsync();
        setRecording(null);
      }
      setIsRecording(false);
      setMessage("Recording cancelled");
    } catch (error) {
      console.error('Cancel recording error:', error);
      setMessage("Failed to cancel recording");
    }
  };

  const processNextInQueue = async () => {
    if (processingQueue.length === 0) return;
    
    setIsProcessingEnabled(false);
    setIsProcessing(true);
    const nextItem = processingQueue[0];

    try {
      setMessage("Processing audio...");
      const response = await uploadAudio(nextItem.uri, (progress) => {
        setUploadProgress(progress);
      });
      
      // Remove the colab_response check since server sends response directly
      if (!response) {
        throw new Error('Empty response from server');
      }
      
      handleNewRecording(response);
      setMessage("Processing complete");
    } catch (error) {
      console.error('Processing error:', error);
      setMessage(`Error: ${error.message}`);
      Alert.alert('Processing Error', error.message);
    } finally {
      setProcessingQueue(queue => queue.slice(1));
      setIsProcessingEnabled(true);
      setIsProcessing(false);
      setUploadProgress(0);
    }
  };

  const addToProcessingQueue = (uri) => {
    setProcessingQueue(queue => [...queue, { uri, timestamp: Date.now() }]);
  };

  const playTTSAudio = async (audioUrl, transcriptionId) => {
    try {
      if (currentSound) {
        await currentSound.stopAsync();
        await currentSound.unloadAsync();
        setCurrentSound(null);
      }

      if (!audioUrl) {
        throw new Error('No TTS audio URL provided');
      }

      console.log('Playing TTS audio:', audioUrl);
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: true }
      );

      setCurrentSound(newSound);
      await newSound.playAsync();

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          newSound.unloadAsync();
          setCurrentSound(null);
          // Mark this audio as played
          setPlayedAudios(prev => new Set([...prev, transcriptionId]));
        }
      });

    } catch (error) {
      console.error('TTS playback error:', error);
      Alert.alert('Audio Error', 'Failed to play TTS audio');
    }
  };

  const handleNewRecording = (result) => {
    const transcriptionData = result.transcription;
    const ttsAudioUrl = result.tts_audio_url;
    console.log('Processing response:', result);

    if (transcriptionData) {
      const newTranscription = {
        id: Date.now(),
        text: transcriptionData,
        timestamp: new Date().toLocaleTimeString(),
        audioUrl: ttsAudioUrl
      };
      
      setTranscriptions(prev => [...prev, newTranscription]);
      console.log('Added new transcription:', newTranscription);

      // Auto-play TTS audio if available
      if (ttsAudioUrl) {
        playTTSAudio(ttsAudioUrl, newTranscription.id);
      }
    }
  };

  const handleSaveTranscriptions = async () => {
    if (transcriptions.length === 0) return;
    
    setIsProcessing(true);
    try {
      const processedItems = transcriptions.map(item => ({
        id: item.id,
        text: item.text,
        timestamp: item.timestamp,
        audioUrl: item.audioUrl || null
      }));

      const noteData = {
        savedAt: new Date().toISOString(),
        items: processedItems,
        type: 'transcription-note'
      };

      const savedId = await saveTranscriptionNote(noteData);
      if (savedId) {
        onSave({ ...noteData, id: savedId });
        Alert.alert('Success', 'Transcriptions saved successfully', [
          { text: 'OK', onPress: () => setTranscriptions([]) }
        ]);
      }
    } catch (error) {
      console.error('Save error:', error);
      Alert.alert(
        'Error',
        error.message === 'User not authenticated' 
          ? 'Please log in to save transcriptions'
          : 'Failed to save transcriptions. Please try again.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const renderProcessingOverlay = () => {
    if (!isProcessing) return null;
    
    return (
      <View style={styles.processingOverlay}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.processingText}>Processing... {uploadProgress}%</Text>
      </View>
    );
  };

  const renderTranscriptionItem = (item) => (
    <View key={item.id} style={styles.transcriptionItem}>
      <View style={styles.transcriptionContent}>
        <Text style={styles.transcriptionText}>{item.text}</Text>
        {item.audioUrl && !playedAudios.has(item.id) && (
          <TouchableOpacity 
            onPress={() => playTTSAudio(item.audioUrl, item.id)}
            style={styles.audioButton}
          >
            <Text style={styles.audioButtonText}>🔊</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.timestamp}>{item.timestamp}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Voice Recorder</Text>
        <TouchableOpacity onPress={onNavigateToHistory}>
          <Text style={styles.historyButton}>History</Text>
        </TouchableOpacity>
      </View>

      {renderProcessingOverlay()}

      <View style={styles.transcriptionContainer}>
        <Text style={styles.containerTitle}>Transcriptions</Text>
        <ScrollView style={styles.scrollView}>
          {transcriptions.length === 0 ? (
            <Text style={styles.emptyText}>No transcriptions yet</Text>
          ) : (
            transcriptions.map(renderTranscriptionItem)
          )}
        </ScrollView>
        {transcriptions.length > 0 && (
          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={[styles.actionButton, styles.saveButton]}
              onPress={handleSaveTranscriptions}
            >
              <Text style={styles.buttonText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.actionButton, styles.clearButton]}
              onPress={() => setTranscriptions([])}
            >
              <Text style={styles.buttonText}>Clear</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.controlsContainer}>
        <Text style={styles.message}>{message}</Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity 
            style={[styles.recordButton, isRecording && styles.recordingActive]}
            onPress={() => isRecording ? stopRecording() : startRecording()}
            disabled={isUploading || isProcessing}
          >
            <Text style={styles.buttonText}>
              {isRecording ? 'Stop Recording' : 'Start Recording'}
            </Text>
          </TouchableOpacity>
          
          {isRecording && (
            <TouchableOpacity 
              style={styles.cancelButton}
              onPress={cancelRecording}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  historyButton: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  transcriptionContainer: {
    flex: 1,
    backgroundColor: colors.inputBg,
    borderRadius: 15,
    padding: 15,
    marginBottom: 20,
    ...shadows.main,
  },
  containerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 15,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  transcriptionItem: {
    backgroundColor: colors.background,
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    ...shadows.main,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  transcriptionContent: {
    marginBottom: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  transcriptionText: {
    fontSize: 16,
    color: colors.text,
  },
  timestamp: {
    fontSize: 12,
    color: colors.secondary,
    textAlign: 'right',
  },
  emptyText: {
    textAlign: 'center',
    color: colors.secondary,
    fontStyle: 'italic',
    marginTop: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
  },
  saveButton: {
    backgroundColor: colors.primary,
  },
  clearButton: {
    backgroundColor: colors.error,
  },
  controlsContainer: {
    padding: 20,
    backgroundColor: colors.inputBg,
    borderRadius: 15,
    ...shadows.main,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },
  recordButton: {
    flex: 2,
    backgroundColor: colors.primary,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: colors.error,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  recordingActive: {
    backgroundColor: colors.error,
  },
  buttonText: {
    color: colors.textLight,
    fontSize: 16,
    fontWeight: '600',
  },
  message: {
    color: colors.text,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 10,
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  processingText: {
    marginTop: 10,
    color: colors.text,
    fontSize: 16,
  },
  audioButton: {
    padding: 8,
    marginLeft: 10,
    backgroundColor: colors.primary,
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioButtonText: {
    fontSize: 20,
    color: colors.textLight,
  },
});

export default AudioRecorder;
