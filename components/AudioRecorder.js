import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  ActivityIndicator, 
  ScrollView, 
  Alert,
  Animated,
  Vibration,
  Dimensions,
  Platform
} from 'react-native';
import { Audio } from 'expo-av';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { uploadAudio, API_URL, initializeApi } from '../services/api'; 
import { saveTranscriptionNote } from '../firebase/storage';
import { colors, shadows, typography, borderRadius, spacing } from '../styles/theme';
import GPUStatus from './GPUStatus';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const AudioRecorder = ({ navigation }) => {
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
  const [serverUrl, setServerUrl] = useState(null);
  const [isOfflineMode, setIsOfflineMode] = useState(false); // Add a new state variable to track offline mode
  const [noiseLevel, setNoiseLevel] = useState(0);
  const [isNoisyEnvironment, setIsNoisyEnvironment] = useState(false);
  const noiseLevelRef = useRef(null);
  const audioAnalyzerIntervalRef = useRef(null);

  useEffect(() => {
    const checkServerStatus = async () => {
      try {
        await initializeApi();
        // Check if we're in mock/offline mode
        setIsOfflineMode(API_URL === 'mock-api');
      } catch (error) {
        console.error('Server check failed:', error);
        setIsOfflineMode(true);
      }
    };
    
    checkServerStatus();
    
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

      // Enhanced recording options with advanced noise cancellation
      const recordingOptions = {
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        android: {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.DEFAULT,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
          // Enable advanced noise suppression and automatic gain control
          enableNoiseSuppression: true,
          enableAGC: true,
          // Set noise suppression level to maximum
          noiseSuppressorQuality: 'high',
        },
        ios: {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
          extension: '.m4a',
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.MAX,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY.web,
          mimeType: 'audio/webm',
          bitsPerSecond: 128000,
        },
      };

      const newRecording = await Audio.Recording.createAsync(recordingOptions);
      setRecording(newRecording.recording);
      setMessage("Recording...");
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording', err);
      handleUploadError(err);
    }
  }

  async function stopRecording() {
    setIsRecording(false);
    setMessage("Press button to start recording");
    if (recording) {
      await cleanupRecording();
      const uri = recording.getURI(); 
      if (uri) {
        setRecordings([...recordings, uri]);
      }
    }
  }

  const processNextInQueue = useCallback(async () => {
    if (processingQueue.length === 0) {
      setIsProcessing(false);
      return;
    }

    setIsProcessing(true);
    const [nextItem, ...rest] = processingQueue;
    setProcessingQueue(rest);

    try {
      const result = await nextItem();
      setColabResult(result);
    } catch (error) {
      console.error('Processing error:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [processingQueue]);

  const handleUpload = async () => {
    if (isUploading) {
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const uri = recordings[recordings.length - 1];
      if (!uri) {
        throw new Error('No recording found');
      }

      const response = await uploadAudio(uri, setUploadProgress);
      if (response) {
        setMessage('Upload successful');
        onSave(response);
      }
    } catch (error) {
      console.error('Upload error:', error);
      handleUploadError(error);
    } finally {
      setIsUploading(false);
    }
  };

  // Add new animation variables
  const insets = useSafeAreaInsets();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const recordingDuration = useRef(0);
  const recordingTimer = useRef(null);
  const [recordingTime, setRecordingTime] = useState(0);
  
  // Add visual pulse animation when recording
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
      
      // Start recording timer
      recordingTimer.current = setInterval(() => {
        recordingDuration.current += 1;
        setRecordingTime(recordingDuration.current);
      }, 1000);
      
      // Provide haptic feedback when recording starts
      if (Platform.OS !== 'web') {
        Vibration.vibrate(150);
      }
    } else {
      // Stop animations and timer when not recording
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
      
      if (recordingTimer.current) {
        clearInterval(recordingTimer.current);
        recordingTimer.current = null;
      }
      
      recordingDuration.current = 0;
      setRecordingTime(0);
    }
    
    return () => {
      if (recordingTimer.current) {
        clearInterval(recordingTimer.current);
      }
    };
  }, [isRecording, pulseAnim]);

  // Format recording time in mm:ss format
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const renderNoiseLevelIndicator = () => {
    if (!isRecording) return null;
    
    return (
      <View style={styles.noiseLevelContainer}>
        <Text style={styles.noiseLevelLabel}>
          Noise Level {isNoisyEnvironment ? '(High)' : '(Good)'}
        </Text>
        <View style={styles.noiseLevelBar}>
          <View 
            style={[
              styles.noiseLevelFill, 
              { 
                width: `${noiseLevel}%`,
                backgroundColor: isNoisyEnvironment ? colors.error : 
                  noiseLevel > 50 ? colors.warning : colors.success 
              }
            ]} 
          />
        </View>
      </View>
    );
  };

  // Render processing overlay with animated indicator
  const renderProcessingOverlay = () => {
    if (!isProcessing) return null;
    
    return (
      <View style={styles.processingOverlay}>
        <View style={styles.processingCard}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.processingText}>
            Processing audio...{"\n"}
            <Text style={styles.processingSubtext}>
              {uploadProgress > 0 ? `${Math.round(uploadProgress)}%` : ''}
            </Text>
          </Text>
        </View>
      </View>
    );
  };

  const renderTranscriptionItem = (item) => (
    <Animated.View 
      key={item.id} 
      style={styles.transcriptionItem}
      entering={Animated.FadeInUp.duration(300).delay(100)}
    >
      <View style={styles.transcriptionContent}>
        <Text style={styles.transcriptionText}>{item.text}</Text>
        {item.audioUrl && !playedAudios.has(item.id) && (
          <TouchableOpacity 
            onPress={() => playTTSAudio(item.audioUrl, item.id)}
            style={styles.audioButton}
            activeOpacity={0.7}
          >
            <FontAwesome5 name="volume-up" size={16} color={colors.textLight} />
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.timestamp}>{item.timestamp}</Text>
    </Animated.View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {renderProcessingOverlay()}
      
      {isOfflineMode && (
        <View style={styles.offlineBanner}>
          <FontAwesome5 name="exclamation-triangle" size={14} color={colors.textLight} style={styles.offlineIcon} />
          <Text style={styles.offlineBannerText}>
            Offline Mode: Demo functions only
          </Text>
        </View>
      )}
      
      <View style={styles.header}>
        <Text style={styles.title}>Voice Assistant</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity 
            style={styles.iconButton} 
            onPress={() => navigation.navigate('VoiceFinetuning', { userId: auth.currentUser?.uid })}
            activeOpacity={0.7}
          >
            <FontAwesome5 name="sliders-h" size={18} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.historyButton} 
            onPress={() => navigation.navigate('History')}
            activeOpacity={0.7}
          >
            <FontAwesome5 name="history" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.transcriptionContainer}>
          <Text style={styles.containerTitle}>Transcriptions</Text>
          
          {transcriptions.length === 0 ? (
            <View style={styles.emptyStateContainer}>
              <FontAwesome5 name="comment-alt" size={40} color={colors.inactive} />
              <Text style={styles.emptyText}>No transcriptions yet</Text>
              <Text style={styles.emptySubtext}>Tap the button below to start recording</Text>
            </View>
          ) : (
            <>
              {transcriptions.map(renderTranscriptionItem)}
              
              <View style={styles.buttonContainer}>
                <TouchableOpacity 
                  style={styles.actionButton}
                  onPress={handleSaveTranscriptions}
                  activeOpacity={0.7}
                  disabled={isProcessing}
                >
                  <LinearGradient
                    colors={[colors.primary, colors.primaryDark]}
                    style={styles.gradientButton}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <FontAwesome5 name="save" size={14} color={colors.textLight} style={styles.buttonIcon} />
                    <Text style={styles.buttonText}>Save</Text>
                  </LinearGradient>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.actionButton, styles.clearButton]}
                  onPress={() => {
                    Alert.alert(
                      "Clear Transcriptions", 
                      "Are you sure you want to clear all transcriptions?",
                      [
                        { text: "Cancel", style: "cancel" },
                        { text: "Clear", style: "destructive", onPress: () => setTranscriptions([]) }
                      ]
                    );
                  }}
                  activeOpacity={0.7}
                  disabled={isProcessing}
                >
                  <FontAwesome5 name="trash-alt" size={14} color={colors.textLight} style={styles.buttonIcon} />
                  <Text style={styles.buttonText}>Clear</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </ScrollView>

      <View style={styles.recorderContainer}>
        {renderNoiseLevelIndicator()}
        
        <View style={styles.statusContainer}>
          <Text style={[
            styles.statusText,
            isRecording && styles.recordingStatusText
          ]}>
            {isRecording ? `Recording ${formatTime(recordingTime)}` : message}
          </Text>
        </View>
        
        <View style={styles.controlsRow}>
          <Animated.View style={{
            transform: [{ scale: pulseAnim }]
          }}>
            <TouchableOpacity
              style={[
                styles.recordButton,
                isRecording && styles.recordingActive
              ]}
              onPress={isRecording ? stopRecording : startRecording}
              disabled={isProcessing}
              activeOpacity={0.8}
            >
              <View style={styles.recordButtonInner}>
                {isRecording ? (
                  <FontAwesome5 name="stop" size={24} color={colors.textLight} />
                ) : (
                  <FontAwesome5 name="microphone" size={24} color={colors.textLight} />
                )}
              </View>
            </TouchableOpacity>
          </Animated.View>
          
          {isRecording && (
            <TouchableOpacity 
              style={styles.cancelButton}
              onPress={cancelRecording}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
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
    paddingHorizontal: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  title: {
    ...typography.heading2,
    color: colors.text,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.round,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.small,
    marginRight: spacing.md,
  },
  historyButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.round,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.small,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingBottom: spacing.xl,
  },
  transcriptionContainer: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.main,
  },
  containerTitle: {
    ...typography.heading3,
    color: colors.text,
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  emptySubtext: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  transcriptionItem: {
    backgroundColor: colors.inputBg,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.small,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  transcriptionContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transcriptionText: {
    flex: 1,
    ...typography.body,
    color: colors.text,
  },
  timestamp: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'right',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.md,
    gap: spacing.md,
  },
  actionButton: {
    flex: 1,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    ...shadows.small,
  },
  clearButton: {
    backgroundColor: colors.error,
  },
  gradientButton: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  buttonText: {
    ...typography.button,
    color: colors.textLight,
  },
  buttonIcon: {
    marginRight: spacing.xs,
  },
  recorderContainer: {
    backgroundColor: colors.card,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.large,
  },
  statusContainer: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  statusText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  recordingStatusText: {
    color: colors.secondary,
    fontWeight: '600',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.main,
  },
  recordButtonInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingActive: {
    backgroundColor: colors.secondary,
  },
  cancelButton: {
    position: 'absolute',
    right: 0,
    backgroundColor: colors.error,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    ...shadows.small,
  },
  cancelButtonText: {
    ...typography.button,
    color: colors.textLight,
    fontSize: 14,
  },
  noiseLevelContainer: {
    marginBottom: spacing.md,
  },
  noiseLevelLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  noiseLevelBar: {
    height: 4,
    backgroundColor: colors.border,
    borderRadius: borderRadius.round,
    overflow: 'hidden',
  },
  noiseLevelFill: {
    height: '100%',
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  processingCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: '80%',
    maxWidth: 300,
    alignItems: 'center',
    ...shadows.large,
  },
  processingText: {
    ...typography.body,
    color: colors.text,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  processingSubtext: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.warning,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  offlineIcon: {
    marginRight: spacing.xs,
  },
  offlineBannerText: {
    ...typography.caption,
    color: colors.text,
    fontWeight: '500',
  },
  audioButton: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.round,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.sm,
    ...shadows.small,
  }
});

export default AudioRecorder;
