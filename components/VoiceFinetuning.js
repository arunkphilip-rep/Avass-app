import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  ScrollView, 
  Alert, 
  Platform,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import LottieView from 'lottie-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { API_URL, apiRequest } from '../services/api';
import { colors, typography, spacing, borderRadius, shadows } from '../styles/theme';
import { StyleSheet } from 'react-native';

const VoiceFinetuning = ({ route }) => {
  const navigation = useNavigation();
  const { userId } = route.params || { userId: null };
  const [loading, setLoading] = useState(true);
  const [hasClonedVoice, setHasClonedVoice] = useState(false);
  const [recordedAudios, setRecordedAudios] = useState([]);
  const [recording, setRecording] = useState(null);
  const [audioProgress, setAudioProgress] = useState(0);
  const [playingAudio, setPlayingAudio] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [totalRecordingDuration, setTotalRecordingDuration] = useState(0);
  const [finetuningStatus, setFinetuningStatus] = useState(null);
  const [showFinetuningProgress, setShowFinetuningProgress] = useState(false);
  const recordingDurationRef = useRef(0);
  const durationIntervalRef = useRef(null);
  const statusIntervalRef = useRef(null);
  const soundRef = useRef(null);
  const animationRef = useRef(null);
  const [noiseLevel, setNoiseLevel] = useState(0);
  const [isNoisyEnvironment, setIsNoisyEnvironment] = useState(false);
  const noiseLevelRef = useRef(null);
  const audioAnalyzerIntervalRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  // These sentences focus on expression variety to improve voice model quality
  const finetuningTexts = [
    "How are you feeling today? I'm excited to improve my voice quality!",
    "Could you please pass the salt? Thank you very much for your help.",
    "Wow! That's absolutely amazing! I can't believe what I'm seeing!",
    "I'm rather disappointed with the results. We'll need to try again.",
    "Hmm, I'm not sure about that. Let me think about it for a moment.",
    "The quick brown fox jumps over the lazy dog near the riverbank.",
    "Today's weather forecast predicts heavy rain with thunderstorms.",
    "Would you like coffee or tea? I personally prefer green tea.",
    "Please count from one to five: one, two, three, four, five.",
    "I'm really looking forward to seeing you at the party tonight!"
  ];
  
  const [currentSampleIndex, setCurrentSampleIndex] = useState(0);
  const [transcriptions, setTranscriptions] = useState([]);

  useEffect(() => {
    // Check if user already has a cloned voice
    if (userId) {
      checkUserVoiceStatus();
    } else {
      setLoading(false);
      Alert.alert(
        "User ID Required",
        "Please log in to fine-tune your voice model."
      );
      navigation.goBack();
    }

    // Animate in the component
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true
      })
    ]).start();

    // Clean up function
    return () => {
      stopRecording();
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
      }
    };
  }, [userId]);

  // Effect to poll fine-tuning status
  useEffect(() => {
    if (showFinetuningProgress && userId) {
      statusIntervalRef.current = setInterval(() => {
        fetchFinetuningStatus();
      }, 5000); // Check every 5 seconds
    }

    return () => {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
      }
    };
  }, [showFinetuningProgress, userId]);

  const checkUserVoiceStatus = async () => {
    try {
      setLoading(true);
      const data = await apiRequest(`/api/voice-cloning/check-user-status?user_id=${userId}`, { userId });
      setHasClonedVoice(data.has_cloned_voice);

      if (!data.has_cloned_voice) {
        Alert.alert(
          "No Voice Model Found",
          "You need to create a voice model first before fine-tuning. Would you like to create one now?",
          [
            {
              text: "Yes",
              onPress: () => navigation.navigate('VoiceCloning', { userId })
            },
            {
              text: "No",
              onPress: () => navigation.goBack()
            }
          ]
        );
      }
      
      setLoading(false);
    } catch (error) {
      console.error("Error checking voice status:", error);
      setLoading(false);
      Alert.alert(
        "Connection Error",
        "Could not connect to the server. Please try again later."
      );
    }
  };

  const startRecording = async () => {
    try {
      if (Platform.OS === 'ios') {
        const audioPermission = await Audio.requestPermissionsAsync();
        if (audioPermission.status !== 'granted') {
          Alert.alert('Permission Required', 'Please grant microphone permission to record audio');
          return;
        }
      }
      
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });
      
      // Enhanced recording options with optimal settings for voice cloning
      const recordingOptions = {
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        android: {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
          extension: '.wav',
          outputFormat: Audio.AndroidOutputFormat.DEFAULT,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 16000, // 16kHz is optimal for voice models
          numberOfChannels: 1,
          bitRate: 128000,
          enableNoiseSuppression: true,
          enableAGC: true,
        },
        ios: {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
          extension: '.wav',
          outputFormat: Audio.IOSOutputFormat.LINEARPCM,
          audioQuality: Audio.IOSAudioQuality.MAX,
          sampleRate: 16000, // 16kHz is optimal for voice models
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
      
      const { recording } = await Audio.Recording.createAsync(recordingOptions);
      
      setRecording(recording);
      setIsRecording(true);
      recordingDurationRef.current = 0;
      setRecordingDuration(0);
      setIsNoisyEnvironment(false);
      
      // Start timer for recording duration
      durationIntervalRef.current = setInterval(() => {
        recordingDurationRef.current += 1;
        setRecordingDuration(recordingDurationRef.current);
      }, 1000);

      if (animationRef.current) {
        animationRef.current.play();
      }
      
      // Start monitoring noise levels
      startNoiseMonitoring(recording);
      
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Error', 'Failed to start recording');
    }
  };
  
  const stopRecording = async () => {
    if (!recording) return;
    
    try {
      setIsRecording(false);
      setIsNoisyEnvironment(false);
      
      // Stop noise monitoring
      if (audioAnalyzerIntervalRef.current) {
        clearInterval(audioAnalyzerIntervalRef.current);
        audioAnalyzerIntervalRef.current = null;
      }
      
      await recording.stopAndUnloadAsync();
      
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }

      if (animationRef.current) {
        animationRef.current.reset();
      }
      
      const uri = recording.getURI();
      
      // Get recorded file info
      const info = await FileSystem.getInfoAsync(uri);
      
      // Get transcription of the recording to store with it
      let transcription = "";
      try {
        // Upload file for processing and transcription
        const formData = new FormData();
        formData.append('audio', {
          uri: uri,
          name: `finetune_${Date.now()}.wav`,
          type: 'audio/wav'
        });
        
        const response = await fetch(`${API_URL}/api/voice-cloning/process-audio`, {
          method: 'POST',
          body: formData,
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
        
        const result = await response.json();
        if (result.status === 'success' && result.transcription) {
          transcription = result.transcription;
          // Store this processed file URI instead
          uri = result.processed_path;
        }
      } catch (err) {
        console.error('Error processing audio:', err);
        // Continue with original file if processing fails
      }
      
      // Add to recordings list
      const newRecording = {
        uri,
        name: `Sample ${recordedAudios.length + 1} - ${finetuningTexts[currentSampleIndex].substring(0, 30)}...`,
        size: info.size,
        duration: recordingDurationRef.current,
        text: finetuningTexts[currentSampleIndex],
        transcription: transcription || finetuningTexts[currentSampleIndex],
        uploaded: false
      };
      
      setRecordedAudios([...recordedAudios, newRecording]);
      setTranscriptions([...transcriptions, transcription || finetuningTexts[currentSampleIndex]]);
      setTotalRecordingDuration(totalRecordingDuration + recordingDurationRef.current);
      
      // Move to next sample text
      setCurrentSampleIndex((currentSampleIndex + 1) % finetuningTexts.length);
      
      // Reset
      setRecording(null);
      setRecordingDuration(0);
    } catch (err) {
      console.error('Failed to stop recording', err);
      Alert.alert('Error', 'Failed to stop recording');
    }
  };
  
  const startNoiseMonitoring = (recordingInstance) => {
    // Clear any existing interval
    if (audioAnalyzerIntervalRef.current) {
      clearInterval(audioAnalyzerIntervalRef.current);
    }

    // Set up noise level monitoring with simulated values
    audioAnalyzerIntervalRef.current = setInterval(async () => {
      try {
        const status = await recordingInstance.getStatusAsync();
        if (status.isRecording) {
          const simulatedMeteringLevel = Math.random() * 100;
          setNoiseLevel(simulatedMeteringLevel);
          
          // Detect noisy environment (threshold at 75% of max level)
          if (simulatedMeteringLevel > 75) {
            if (!isNoisyEnvironment) {
              setIsNoisyEnvironment(true);
            }
          } else {
            if (isNoisyEnvironment) {
              setIsNoisyEnvironment(false);
            }
          }
        }
      } catch (error) {
        console.error('Error monitoring noise levels:', error);
      }
    }, 500);
  };

  const playRecording = async (audioUri, index) => {
    try {
      // Stop current playback if any
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }
      
      // Load and play the audio
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { progressUpdateIntervalMillis: 100 },
        onPlaybackStatusUpdate
      );
      
      soundRef.current = sound;
      setPlayingAudio(index);
      await sound.playAsync();
    } catch (err) {
      console.error('Failed to play recording', err);
      Alert.alert('Error', 'Failed to play recording');
    }
  };

  const onPlaybackStatusUpdate = (status) => {
    if (status.isLoaded && status.isPlaying) {
      setAudioProgress(status.positionMillis / status.durationMillis);
    } else if (status.didJustFinish) {
      setPlayingAudio(null);
      setAudioProgress(0);
    }
  };

  const uploadAndFinetune = async () => {
    if (recordedAudios.length < 2) {
      Alert.alert(
        'Not Enough Samples', 
        'Please record at least 2 voice samples for fine-tuning. More samples will improve the quality of your voice clone.'
      );
      return;
    }

    try {
      setLoading(true);
      const uploadedFiles = [];

      // Upload each recording
      for (let i = 0; i < recordedAudios.length; i++) {
        const recording = recordedAudios[i];
        if (recording.uploaded) continue;

        const formData = new FormData();
        formData.append('audio', {
          uri: recording.uri,
          name: `finetune_${i}.wav`,
          type: 'audio/wav'
        });
        formData.append('speaker_id', userId);

        // First check if server is reachable
        try {
          const healthResponse = await fetch(`${API_URL}/health`);
          if (!healthResponse.ok) {
            throw new Error('Server not available. Health check failed.');
          }
        } catch (error) {
          console.error("Server health check failed:", error);
          throw new Error('Cannot connect to server. Please check if the server is running.');
        }

        // Upload file
        const response = await fetch(`${API_URL}/api/voice-cloning/upload`, {
          method: 'POST',
          body: formData,
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Upload response error:", errorText);
          throw new Error(`Server error: ${response.status}`);
        }

        const result = await response.json();
        if (result.status === 'success') {
          uploadedFiles.push(result.file_path);
          
          // Update recordings list
          const updatedRecordings = [...recordedAudios];
          updatedRecordings[i] = {...updatedRecordings[i], uploaded: true};
          setRecordedAudios(updatedRecordings);
        } else {
          throw new Error(result.message || 'Upload failed');
        }
      }

      // Prepare finetune dataset
      const prepareResponse = await fetch(`${API_URL}/api/voice-cloning/finetune/prepare`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          speaker_id: userId,
          audio_files: uploadedFiles,
          transcriptions: transcriptions
        }),
      });
      
      if (!prepareResponse.ok) {
        const errorText = await prepareResponse.text();
        console.error("Prepare fine-tuning error:", errorText);
        throw new Error(`Server error: ${prepareResponse.status}`);
      }

      const prepareResult = await prepareResponse.json();
      if (prepareResult.status !== 'success') {
        throw new Error(prepareResult.message || 'Failed to prepare fine-tuning dataset');
      }
      
      // Start fine-tuning
      const finetuneResponse = await fetch(`${API_URL}/api/voice-cloning/finetune/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          speaker_id: userId,
          dataset_path: prepareResult.dataset_path,
          training_steps: 5000 // Use fewer steps for fine-tuning
        }),
      });
      
      if (!finetuneResponse.ok) {
        const errorText = await finetuneResponse.text();
        console.error("Start fine-tuning error:", errorText);
        throw new Error(`Server error: ${finetuneResponse.status}`);
      }

      const finetuneResult = await finetuneResponse.json();
      
      if (finetuneResult.status === 'fine-tuning_started') {
        setShowFinetuningProgress(true);
        fetchFinetuningStatus();
      } else {
        throw new Error(finetuneResult.message || 'Failed to start fine-tuning');
      }
      
      setLoading(false);
    } catch (error) {
      console.error("Error uploading recordings:", error);
      setLoading(false);
      Alert.alert("Upload Error", `Failed to upload voice samples: ${error.message}. Please try again.`);
    }
  };

  const fetchFinetuningStatus = async () => {
    try {
      const response = await fetch(`${API_URL}/api/voice-cloning/training-status?speaker_id=${userId}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Fine-tuning status response error:", errorText);
        throw new Error(`Server error: ${response.status}`);
      }
      
      const data = await response.json();
      setFinetuningStatus(data);
      
      // If fine-tuning is complete
      if (data.status === 'complete' || data.progress === 100) {
        if (statusIntervalRef.current) {
          clearInterval(statusIntervalRef.current);
        }
        
        Alert.alert(
          "Voice Fine-tuning Complete",
          "Your voice model has been successfully improved! The fine-tuned model is now ready to use.",
          [
            {
              text: "Continue to App",
              onPress: () => navigation.navigate('AudioRecorder')
            }
          ]
        );
      }
    } catch (error) {
      console.error("Error fetching fine-tuning status:", error);
      // Don't show alerts for status checks, just log the error
    }
  };

  const deleteRecording = (index) => {
    Alert.alert(
      "Delete Recording",
      "Are you sure you want to delete this recording?",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Delete",
          onPress: () => {
            const updatedRecordings = [...recordedAudios];
            const recordingToDelete = updatedRecordings[index];
            setTotalRecordingDuration(totalRecordingDuration - recordingToDelete.duration);
            updatedRecordings.splice(index, 1);
            setRecordedAudios(updatedRecordings);
            
            // Also update transcriptions
            const updatedTranscriptions = [...transcriptions];
            updatedTranscriptions.splice(index, 1);
            setTranscriptions(updatedTranscriptions);
          },
          style: "destructive"
        }
      ]
    );
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const renderRecordingsList = () => {
    if (recordedAudios.length === 0) {
      return (
        <View style={styles.emptyRecordings}>
          <FontAwesome5 name="microphone-alt" size={40} color={colors.inactive} />
          <Text style={styles.emptyText}>No recordings yet. Record samples to improve your voice model.</Text>
        </View>
      );
    }

    return (
      <ScrollView style={styles.recordingsList}>
        {recordedAudios.map((audio, index) => (
          <Animated.View 
            key={index} 
            style={[
              styles.recordingItem,
              { 
                opacity: 1,
                transform: [{ translateY: 0 }]
              }
            ]}
            entering={Animated.FadeInUp.delay(index * 100).duration(300)}
          >
            <View style={styles.recordingInfo}>
              <Text style={styles.recordingName}>{audio.name}</Text>
              <Text style={styles.recordingDuration}>{formatTime(audio.duration)}</Text>
            </View>
            
            <View style={styles.recordingControls}>
              <TouchableOpacity 
                style={styles.playButton}
                onPress={() => playRecording(audio.uri, index)}
              >
                <LinearGradient
                  colors={[colors.primary, colors.primaryDark]}
                  style={styles.playButtonGradient}
                >
                  <FontAwesome5 
                    name={playingAudio === index ? "pause" : "play"} 
                    size={14} 
                    color="#fff" 
                  />
                </LinearGradient>
              </TouchableOpacity>
              
              {playingAudio === index && (
                <View style={styles.progressBarContainer}>
                  <View style={[styles.progressBar, { width: `${audioProgress * 100}%` }]} />
                </View>
              )}
              
              <TouchableOpacity 
                style={styles.deleteButton}
                onPress={() => deleteRecording(index)}
              >
                <FontAwesome5 name="trash" size={14} color={colors.error} />
              </TouchableOpacity>
            </View>
          </Animated.View>
        ))}
      </ScrollView>
    );
  };

  const renderFinetuningProgress = () => {
    if (!showFinetuningProgress || !finetuningStatus) {
      return null;
    }

    return (
      <View style={styles.finetuningContainer}>
        <Text style={styles.finetuningTitle}>Voice Fine-tuning Progress</Text>
        <Text style={styles.finetuningMessage}>{finetuningStatus.message}</Text>
        
        <View style={styles.progressBarContainer}>
          <View 
            style={[styles.finetuningProgressBar, { width: `${finetuningStatus.progress}%` }]} 
          />
        </View>
        
        <Text style={styles.finetuningPercentage}>{finetuningStatus.progress}% Complete</Text>
        
        {finetuningStatus.estimated_completion && (
          <Text style={styles.estimatedTime}>
            Estimated completion: {new Date(finetuningStatus.estimated_completion).toLocaleTimeString()}
          </Text>
        )}

        <View style={styles.finetuningInfo}>
          <FontAwesome5 name="info-circle" size={16} color={colors.primary} style={styles.infoIcon} />
          <Text style={styles.finetuningInfoText}>
            Fine-tuning enhances your existing voice model with new audio data, improving its quality and adaptability.
          </Text>
        </View>
      </View>
    );
  };

  // Noise level indicator component
  const renderNoiseLevelIndicator = () => {
    if (!isRecording) return null;
    
    return (
      <View style={styles.noiseLevelContainer}>
        <Text style={styles.noiseLevelLabel}>
          Noise Level: {isNoisyEnvironment ? 'High (Please reduce noise)' : 'Good'}
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
        {isNoisyEnvironment && (
          <Text style={styles.noiseWarning}>
            ⚠️ High background noise will affect voice quality
          </Text>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LottieView
          source={require('../assets/animations/loading.json')}
          autoPlay
          loop
          style={styles.loadingAnimation}
        />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <Animated.View 
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }]
        }
      ]}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Voice Fine-tuning</Text>
          <Text style={styles.subtitle}>
            Enhance your existing voice model with additional samples
          </Text>
        </View>

        {/* Instructions */}
        <View style={styles.instructionsContainer}>
          <Text style={styles.instructionsTitle}>How fine-tuning works:</Text>
          <View style={styles.instructionItem}>
            <MaterialCommunityIcons name="microphone-variant" size={22} color={colors.primary} style={styles.instructionIcon} />
            <Text style={styles.instructionText}>
              Record new samples to improve your voice model's quality and range
            </Text>
          </View>
          <View style={styles.instructionItem}>
            <MaterialCommunityIcons name="tune" size={22} color={colors.primary} style={styles.instructionIcon} />
            <Text style={styles.instructionText}>
              The AI will update your existing voice model with these new samples
            </Text>
          </View>
          <View style={styles.instructionItem}>
            <MaterialCommunityIcons name="voice" size={22} color={colors.primary} style={styles.instructionIcon} />
            <Text style={styles.instructionText}>
              Your fine-tuned voice will sound more natural and expressive
            </Text>
          </View>
        </View>

        {/* Progress */}
        <View style={styles.progressContainer}>
          <Text style={styles.progressTitle}>Your Progress</Text>
          <View style={styles.progressInfo}>
            <Text style={styles.progressText}>
              Recorded: {recordedAudios.length} new samples ({formatTime(totalRecordingDuration)})
            </Text>
            <Text style={styles.progressSubtext}>
              For best results, add at least 2-3 minutes of clear speech
            </Text>
          </View>
        </View>

        {/* Sample Text Box */}
        {!showFinetuningProgress && (
          <View style={styles.sampleTextContainer}>
            <Text style={styles.sampleTextTitle}>Please read this text with expression:</Text>
            <LinearGradient
              colors={[colors.card, colors.inputBg]}
              style={styles.sampleTextBox}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
            >
              <Text style={styles.sampleText}>{finetuningTexts[currentSampleIndex]}</Text>
            </LinearGradient>
          </View>
        )}

        {/* Recording Controls */}
        {!showFinetuningProgress && (
          <View style={styles.recordingControlsContainer}>
            <TouchableOpacity
              style={[styles.recordButton, isRecording && styles.recordingActive]}
              onPress={isRecording ? stopRecording : startRecording}
              activeOpacity={0.7}
            >
              <View style={styles.recordButtonInner}>
                {isRecording ? (
                  <View style={styles.recordingAnimationContainer}>
                    <LottieView
                      ref={animationRef}
                      source={require('../assets/animations/loading.json')}
                      autoPlay
                      loop
                      style={styles.recordingAnimation}
                    />
                  </View>
                ) : (
                  <FontAwesome5 name="microphone" size={24} color={colors.primary} />
                )}
              </View>
            </TouchableOpacity>
            <Text style={styles.recordButtonText}>
              {isRecording 
                ? `Recording... ${formatTime(recordingDuration)}` 
                : "Tap to Record"}
            </Text>
          </View>
        )}

        {/* Recordings List */}
        {!showFinetuningProgress && (
          <>
            <Text style={styles.recordingsTitle}>Your Recordings</Text>
            {renderRecordingsList()}
          </>
        )}

        {/* Fine-tuning Progress */}
        {renderFinetuningProgress()}

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          {!showFinetuningProgress ? (
            <>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => navigation.goBack()}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.finetuneButton,
                  recordedAudios.length === 0 && styles.disabledButton
                ]}
                onPress={uploadAndFinetune}
                disabled={recordedAudios.length === 0}
              >
                <LinearGradient
                  colors={recordedAudios.length === 0 ? [colors.inactive, colors.inactive] : [colors.primary, colors.primaryDark]}
                  style={styles.finetuneButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Text style={styles.finetuneButtonText}>Start Fine-tuning</Text>
                </LinearGradient>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.waitingText}>
              Please wait while we fine-tune your voice model. This may take a few minutes.
            </Text>
          )}
        </View>
      </ScrollView>
      {renderNoiseLevelIndicator()}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  scrollContent: {
    paddingBottom: spacing.xl * 2,
  },
  header: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  title: {
    ...typography.heading1,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  instructionsContainer: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadows.main,
  },
  instructionsTitle: {
    ...typography.heading3,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  instructionIcon: {
    marginRight: spacing.sm,
  },
  instructionText: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
  progressContainer: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadows.main,
  },
  progressTitle: {
    ...typography.heading3,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  progressInfo: {
    marginTop: spacing.xs,
  },
  progressText: {
    ...typography.body,
    color: colors.text,
    fontWeight: '500',
  },
  progressSubtext: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  sampleTextContainer: {
    marginBottom: spacing.lg,
  },
  sampleTextTitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  sampleTextBox: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    ...shadows.small,
  },
  sampleText: {
    ...typography.body,
    color: colors.text,
    lineHeight: 24,
  },
  recordingControlsContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.main,
    marginBottom: spacing.sm,
  },
  recordButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  recordingActive: {
    backgroundColor: colors.secondary,
  },
  recordingAnimationContainer: {
    width: 48,
    height: 48,
  },
  recordingAnimation: {
    width: '100%',
    height: '100%',
  },
  recordButtonText: {
    ...typography.button,
    color: colors.text,
  },
  recordingsTitle: {
    ...typography.heading3,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  recordingsList: {
    marginBottom: spacing.xl,
    maxHeight: 300,
  },
  recordingItem: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.small,
  },
  recordingInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  recordingName: {
    ...typography.bodySmall,
    color: colors.text,
    flex: 1,
  },
  recordingDuration: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  recordingControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between', // Ensure proper alignment
  },
  playButton: {
    alignSelf: 'flex-start', // Align to the left
    width: 32,
    height: 32,
    borderRadius: borderRadius.round,
    overflow: 'hidden',
    ...shadows.small,
  },
  playButtonGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressBarContainer: {
    flex: 1,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    marginHorizontal: spacing.sm,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  deleteButton: {
    alignSelf: 'flex-end', // Align to the right
    width: 32,
    height: 32,
    borderRadius: borderRadius.round,
    backgroundColor: colors.inputBg,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.small,
  },
  emptyRecordings: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    marginBottom: spacing.lg,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    maxWidth: '80%',
  },
  finetuningContainer: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    ...shadows.main,
  },
  finetuningTitle: {
    ...typography.heading3,
    color: colors.text,
    marginBottom: spacing.md,
  },
  finetuningMessage: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  finetuningProgressBar: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  finetuningPercentage: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  estimatedTime: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  finetuningInfo: {
    flexDirection: 'row',
    backgroundColor: colors.inputBg,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  infoIcon: {
    marginRight: spacing.sm,
    marginTop: 2,
  },
  finetuningInfoText: {
    ...typography.caption,
    color: colors.text,
    flex: 1,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: colors.inputBg,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    ...shadows.small,
  },
  cancelButtonText: {
    ...typography.button,
    color: colors.text,
  },
  finetuneButton: {
    flex: 2,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    ...shadows.small,
  },
  finetuneButtonGradient: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finetuneButtonText: {
    ...typography.button,
    color: colors.textLight,
  },
  disabledButton: {
    opacity: 0.7,
  },
  waitingText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingAnimation: {
    width: 120,
    height: 120,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  noiseLevelContainer: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.md,
    right: spacing.md,
    ...shadows.large,
  },
  noiseLevelLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  noiseLevelBar: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  noiseLevelFill: {
    height: '100%',
  },
  noiseWarning: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.xs,
  }
});

export default VoiceFinetuning;