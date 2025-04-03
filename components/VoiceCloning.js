import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, Platform, RefreshControl } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { FontAwesome5, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import LottieView from 'lottie-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { API_URL, apiRequest } from '../services/api';
import styles from '../styles/VoiceCloning';

const VoiceCloning = ({ route }) => {
  const navigation = useNavigation();
  const { userId } = route.params || { userId: null };
  const [loading, setLoading] = useState(true);
  const [hasClonedVoice, setHasClonedVoice] = useState(false);
  const [recordedAudios, setRecordedAudios] = useState([]);
  const [recording, setRecording] = useState(null);
  const [audioProgress, setAudioProgress] = useState(0);
  const [playingAudio, setPlayingAudio] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [totalRecordingDuration, setTotalRecordingDuration] = useState(0);
  const [trainingStatus, setTrainingStatus] = useState(null);
  const [showTrainingProgress, setShowTrainingProgress] = useState(false);
  const [trainingElapsedTime, setTrainingElapsedTime] = useState(0);
  const trainingTimeIntervalRef = useRef(null);
  const recordingDurationRef = useRef(0);
  const durationIntervalRef = useRef(null);
  const statusIntervalRef = useRef(null);
  const soundRef = useRef(null);
  const animationRef = useRef(null);
  const [noiseLevel, setNoiseLevel] = useState(0);
  const [isNoisyEnvironment, setIsNoisyEnvironment] = useState(false);
  const noiseLevelRef = useRef(null);
  const audioAnalyzerIntervalRef = useRef(null);
  const [sampleAudioUrl, setSampleAudioUrl] = useState(null);
  const [isGeneratingSample, setIsGeneratingSample] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Sample texts for voice cloning
  const sampleTexts = [
    "The quick brown fox jumps over the lazy dog. This sentence contains every letter in the English alphabet.",
    "Hello, my name is Sam. I'm recording my voice to create a personalized voice clone.",
    "Artificial intelligence is transforming how we interact with technology every day.",
    "The sky was clear blue today, with just a few scattered clouds on the horizon.",
    "Please count from one to ten: one, two, three, four, five, six, seven, eight, nine, ten.",
    "Today is a wonderful day to go for a walk in the park and enjoy the fresh air.",
    "In order to achieve accurate voice cloning, I need to speak clearly and naturally.",
    "The rain in Spain stays mainly in the plain. How now brown cow.",
    "To be or not to be, that is the question. Whether 'tis nobler in the mind to suffer.",
    "Four score and seven years ago, our fathers brought forth on this continent a new nation.",
    "The purpose of life is not to be happy. It is to be useful, to be honorable, to be compassionate.",
    "Success is not final, failure is not fatal: it is the courage to continue that counts.",
    "The greatest glory in living lies not in never falling, but in rising every time we fall.",
    "Life is what happens when you're busy making other plans. Embrace the unexpected journey.",
    "In three words I can sum up everything I've learned about life: it goes on.",
    "The future belongs to those who believe in the beauty of their dreams.",
    "Happiness is not something ready-made. It comes from your own actions.",
    "The only way to do great work is to love what you do. Find your passion.",
    "Believe you can and you're halfway there. Confidence is key to success.",
    "You miss 100% of the shots you don't take. Take risks and explore opportunities.",
    "The best time to plant a tree was 20 years ago. The second best time is now.",
    "It does not matter how slowly you go as long as you do not stop moving forward.",
    "Quality is not an act, it's a habit. Excellence comes from consistent practice.",
    "Be yourself; everyone else is already taken. Authenticity is your superpower.",
    "The only limit to our realization of tomorrow is our doubts of today.",
    "Do what you can, with what you have, where you are. Start with available resources.",
    "Life is 10% what happens to us and 90% how we react to it.",
    "If you want to lift yourself up, lift up someone else. Help others succeed.",
    "Whether you think you can or you think you can't, you're right. Mindset matters.",
    "You have within you right now, everything you need to deal with whatever the world can throw at you.",
    "The best revenge is massive success. Let your achievements speak for themselves.",
    "It always seems impossible until it's done. Break big tasks into smaller steps.",
    "When one door of happiness closes, another opens. Look for new opportunities.",
    "Life isn't about finding yourself. Life is about creating yourself. Shape your destiny.",
    "Nothing will work unless you do. Hard work is the foundation of success.",
    "Keep your face always toward the sunshine, and shadows will fall behind you.",
    "What we think, we become. Positive thoughts lead to positive outcomes.",
    "The journey of a thousand miles begins with one step. Start small, grow steadily.",
    "Don't count the days, make the days count. Focus on quality over quantity.",
    "The more difficult the victory, the greater the happiness in winning.",
    "If opportunity doesn't knock, build a door. Create your own path to success.",
    "Try to be a rainbow in someone's cloud. Spread kindness wherever you go.",
    "Never let the fear of striking out keep you from playing the game.",
    "Happiness is not in the mere possession of money; it lies in the joy of achievement.",
    "Change your thoughts and you change your world. Perspective is everything.",
    "The only person you are destined to become is the person you decide to be.",
    "Believe in yourself and all that you are. Know that there is something inside you greater than any obstacle.",
    "Your time is limited, don't waste it living someone else's life. Be authentic.",
    "Success is stumbling from failure to failure with no loss of enthusiasm.",
    "The best way to predict the future is to create it. Take action toward your goals."
  ];
  
  const [currentSampleIndex, setCurrentSampleIndex] = useState(0);
  const [speakerId, setSpeakerId] = useState(null);

  useEffect(() => {
    // Check if user already has a cloned voice
    if (userId) {
      checkUserVoiceStatus();
    } else {
      setLoading(false);
    }

    // Generate a speaker ID if needed
    if (!speakerId) {
      setSpeakerId(userId || generateSpeakerId());
    }

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

  // Effect to poll training status
  useEffect(() => {
    if (showTrainingProgress && speakerId) {
      // Set up status polling interval
      statusIntervalRef.current = setInterval(() => {
        fetchTrainingStatus();
      }, 5000); // Check every 5 seconds
      
      // Set up training timer
      trainingTimeIntervalRef.current = setInterval(() => {
        setTrainingElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      // Clear intervals when training is not in progress
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
        statusIntervalRef.current = null;
      }
      if (trainingTimeIntervalRef.current) {
        clearInterval(trainingTimeIntervalRef.current);
        trainingTimeIntervalRef.current = null;
      }
    }

    return () => {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
      }
      if (trainingTimeIntervalRef.current) {
        clearInterval(trainingTimeIntervalRef.current);
      }
    };
  }, [showTrainingProgress, speakerId]);

  const checkUserVoiceStatus = async () => {
    try {
      setLoading(true);
      const data = await apiRequest(`/api/voice-cloning/check-user-status?user_id=${userId}`);
      setHasClonedVoice(data.has_cloned_voice);

      if (data.has_cloned_voice) {
        // If user already has a voice, go to transcription
        Alert.alert(
          "Voice Model Ready",
          "You already have a voice clone model ready to use.",
          [
            {
              text: "Continue to App",
              onPress: () => navigation.navigate('AudioRecorder')
            }
          ]
        );
      }
      
      setLoading(false);
    } catch (error) {
      console.error("Error checking voice status:", error);
      setLoading(false);
    }
  };

  const generateSpeakerId = () => {
    return 'user_' + Math.random().toString(36).substring(2, 10);
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
      
      // Enhanced recording options with advanced noise cancellation
      const recordingOptions = {
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        android: {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
          extension: '.wav',
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
          extension: '.wav',
          outputFormat: Audio.IOSOutputFormat.LINEARPCM,
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
      
      // Add to recordings list
      const newRecording = {
        uri,
        name: `Sample ${recordedAudios.length + 1} - ${sampleTexts[currentSampleIndex].substring(0, 30)}...`,
        size: info.size,
        duration: recordingDurationRef.current,
        text: sampleTexts[currentSampleIndex],
        uploaded: false
      };
      
      setRecordedAudios([...recordedAudios, newRecording]);
      setTotalRecordingDuration(totalRecordingDuration + recordingDurationRef.current);
      
      // Move to next sample text
      setCurrentSampleIndex((currentSampleIndex + 1) % sampleTexts.length);
      
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

    // Set up noise level monitoring
    audioAnalyzerIntervalRef.current = setInterval(async () => {
      try {
        const status = await recordingInstance.getStatusAsync();
        if (status.isRecording) {
          // This is a simulation since we can't directly access audio levels from the API
          // In a real implementation, we'd analyze the audio buffer
          const simulatedMeteringLevel = Math.random() * 100; // 0-100 scale
          
          // Update noise level display
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
    }, 500); // Check every 500ms
  };

  const playRecording = async (audioUri, index) => {
    try {
      // If this is the currently playing audio, toggle pause/play
      if (playingAudio === index && soundRef.current) {
        const status = await soundRef.current.getStatusAsync();
        
        if (status.isPlaying) {
          // Pause the current audio
          await soundRef.current.pauseAsync();
          return;
        } else {
          // Resume the current audio
          await soundRef.current.playAsync();
          return;
        }
      }
      
      // If another audio is playing, stop it first
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }
      
      // Load and play the new audio
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
    if (status.isLoaded) {
      if (status.isPlaying) {
        setAudioProgress(status.positionMillis / status.durationMillis);
        setIsPlaying(true);
      } else if (status.didJustFinish) {
        setPlayingAudio(null);
        setAudioProgress(0);
        setIsPlaying(false);
      } else {
        // Audio is paused or not playing
        setAudioProgress(status.positionMillis / status.durationMillis);
        setIsPlaying(false);
      }
    }
  };

  const uploadRecordings = async () => {
    if (recordedAudios.length < 3) {
      Alert.alert(
        'Not Enough Samples', 
        'Please record at least 3 voice samples for better results. More samples will improve the quality of your voice clone.'
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
          name: `sample_${i}.wav`, // Simple name without speaker ID to prevent duplication
          type: 'audio/wav'
        });
        formData.append('speaker_id', speakerId);

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

        // Now attempt the upload
        const response = await fetch(`${API_URL}/api/voice-cloning/upload`, {
          method: 'POST',
          body: formData,
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        // Check if the response is valid
        if (!response.ok) {
          const errorText = await response.text();
          console.error("Upload response error:", errorText);
          throw new Error(`Server error: ${response.status}`);
        }

        // Check content type before parsing JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const errorText = await response.text();
          console.error("Invalid response type:", contentType, "Response:", errorText);
          throw new Error('Server returned an invalid response format');
        }

        const result = await response.json();
        if (result.status === 'success') {
          // Get ONLY the filename without any paths or IDs to avoid duplication
          const filePathParts = result.file_path.split('\\').pop().split('/').pop().split('_');
          const samplePart = filePathParts[filePathParts.length - 2] + '_' + filePathParts[filePathParts.length - 1];
          
          // Store just the relevant filename for training
          uploadedFiles.push(result.file_path);
          
          // Update recordings list
          const updatedRecordings = [...recordedAudios];
          updatedRecordings[i] = {...updatedRecordings[i], uploaded: true};
          setRecordedAudios(updatedRecordings);
        } else {
          throw new Error(result.message || 'Upload failed');
        }
      }

      // Prepare training data with full file paths from server response
      try {
        const prepareResponse = await fetch(`${API_URL}/api/voice-cloning/prepare-training`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            speaker_id: speakerId,
            audio_files: uploadedFiles
          }),
        });
        
        if (!prepareResponse.ok) {
          const errorText = await prepareResponse.text();
          console.error("Prepare training error:", errorText);
          throw new Error(`Server error: ${prepareResponse.status}`);
        }

        // Check content type before parsing JSON
        const contentType = prepareResponse.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const errorText = await prepareResponse.text();
          console.error("Invalid response type:", contentType, "Response:", errorText);
          throw new Error('Server returned an invalid response format');
        }
        
        const prepareResult = await prepareResponse.json();
        if (!prepareResult.status || prepareResult.status !== 'success') {
          throw new Error(prepareResult.message || 'Failed to prepare training data');
        }
      } catch (error) {
        console.error("Error preparing training data:", error);
        throw new Error(`Failed to prepare training data: ${error.message}`);
      }
      
      // Start training
      try {
        const trainingResponse = await fetch(`${API_URL}/api/voice-cloning/start-training`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            speaker_id: speakerId,
            training_steps: 50000 // Default training steps
          }),
        });
        
        if (!trainingResponse.ok) {
          const errorText = await trainingResponse.text();
          console.error("Start training error:", errorText);
          throw new Error(`Server error: ${trainingResponse.status}`);
        }

        // Check content type before parsing JSON
        const contentType = trainingResponse.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const errorText = await trainingResponse.text();
          console.error("Invalid response type:", contentType, "Response:", errorText);
          throw new Error('Server returned an invalid response format');
        }

        const trainingResult = await trainingResponse.json();
        
        if (trainingResult.status === 'training_started') {
          setShowTrainingProgress(true);
          fetchTrainingStatus();
        } else {
          throw new Error(trainingResult.message || 'Failed to start training');
        }
      } catch (error) {
        console.error("Error starting training:", error);
        throw new Error(`Failed to start training: ${error.message}`);
      }
      
      setLoading(false);
    } catch (error) {
      console.error("Error uploading recordings:", error);
      setLoading(false);
      Alert.alert("Upload Error", `Failed to upload voice samples: ${error.message}. Please try again.`);
    }
  };

  const fetchTrainingStatus = async () => {
    try {
      // First check server health
      try {
        const healthResponse = await fetch(`${API_URL}/health`);
        if (!healthResponse.ok) {
          throw new Error('Server not available. Health check failed.');
        }
      } catch (error) {
        console.error("Server health check failed:", error);
        // We'll continue anyway as this is a status check
      }

      const response = await fetch(`${API_URL}/api/voice-cloning/training-status?speaker_id=${speakerId}`);
      
      // Check if the response is valid
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Training status response error:", errorText);
        throw new Error(`Server error: ${response.status}`);
      }

      // Check content type before parsing JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const errorText = await response.text();
        console.error("Invalid response type:", contentType, "Response:", errorText);
        throw new Error('Server returned an invalid response format');
      }
      
      const data = await response.json();
      setTrainingStatus(data);
      
      // If training is complete
      if (data.progress === 100) {
        if (statusIntervalRef.current) {
          clearInterval(statusIntervalRef.current);
        }
        
        Alert.alert(
          "Voice Clone Complete",
          "Your voice has been successfully cloned! You can now proceed to use the app with your personalized voice.",
          [
            {
              text: "Continue to App",
              onPress: () => navigation.navigate('AudioRecorder')
            }
          ]
        );
      }
    } catch (error) {
      console.error("Error fetching training status:", error);
      // Don't show alerts for status checks, just log the error
      // We'll retry on the next interval
    }
  };

  // Function to refresh training status
  const refreshTrainingStatus = async () => {
    setRefreshing(true);
    try {
      await fetchTrainingStatus();
    } catch (error) {
      console.error("Error refreshing training status:", error);
      Alert.alert("Refresh Error", "Failed to refresh training status. Please try again.");
    } finally {
      setRefreshing(false);
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
          },
          style: "destructive"
        }
      ]
    );
  };

  const skipVoiceCloning = () => {
    Alert.alert(
      "Skip Voice Cloning",
      "You can still use the app without a personalized voice. You can always set up voice cloning later. Are you sure you want to skip?",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Skip",
          onPress: () => navigation.navigate('AudioRecorder')
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
          <Text style={styles.emptyText}>No recordings yet. Start by recording the sample text above.</Text>
        </View>
      );
    }

    return (
      <ScrollView style={styles.recordingsList}>
        {/* Display recordings in reverse order (newest first) */}
        {[...recordedAudios].reverse().map((audio, index) => {
          // Adjust index for deletion since we're displaying in reverse order
          const originalIndex = recordedAudios.length - 1 - index;
          
          return (
          <View key={originalIndex} style={styles.recordingItem}>
            <View style={styles.recordingInfo}>
              <Text style={styles.recordingName}>{audio.name}</Text>
              <Text style={styles.recordingDuration}>{formatTime(audio.duration)}</Text>
            </View>
            
            <View style={styles.recordingItemControls}>
              <TouchableOpacity 
                style={styles.playButton}
                onPress={() => playRecording(audio.uri, originalIndex)}
              >
                <FontAwesome5 
                  name={(playingAudio === originalIndex && isPlaying) ? "pause" : "play"} 
                  size={20} 
                  color="#fff" 
                />
              </TouchableOpacity>
              
              {playingAudio === originalIndex && (
                <View style={styles.progressBarContainer}>
                  <View style={[styles.progressBar, { width: `${audioProgress * 100}%` }]} />
                </View>
              )}
              
              <TouchableOpacity 
                style={styles.deleteButton}
                onPress={() => deleteRecording(originalIndex)}
              >
                <FontAwesome5 name="trash" size={16} color="#ff5555" />
              </TouchableOpacity>
            </View>
          </View>
        )})}
      </ScrollView>
    );
  };

  const renderTrainingProgress = () => {
    if (!showTrainingProgress) {
      return null;
    }

    // If training status hasn't been fetched yet, show initial loading state
    const progress = trainingStatus ? trainingStatus.progress : 0;
    const message = trainingStatus ? trainingStatus.message : 'Initializing training...';

    return (
      <View style={styles.trainingContainer}>
        <View style={styles.trainingHeaderRow}>
          <Text style={styles.trainingTitle}>Voice Clone Training</Text>
          <TouchableOpacity 
            style={styles.reloadButton} 
            onPress={refreshTrainingStatus}
            disabled={refreshing}
          >
            <Ionicons 
              name="refresh" 
              size={22} 
              color="#4a90e2" 
              style={refreshing ? { opacity: 0.5 } : {}}
            />
          </TouchableOpacity>
        </View>
        <Text style={styles.trainingMessage}>{message}</Text>
        
        {/* Training timer display */}
        <Text style={styles.trainingElapsedTime}>
          Training time: {formatTime(trainingElapsedTime)}
        </Text>
        
        {/* Progress bar with proper container */}
        <View style={styles.trainingProgressContainer}>
          <View 
            style={[
              styles.trainingProgressBar, 
              { width: `${progress}%` }
            ]} 
          />
        </View>
        
        <Text style={styles.trainingPercentage}>{progress}% Complete</Text>
        
        {trainingStatus && trainingStatus.estimated_completion && (
          <Text style={styles.estimatedTime}>
            Estimated completion: {new Date(trainingStatus.estimated_completion).toLocaleTimeString()}
          </Text>
        )}
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
                backgroundColor: isNoisyEnvironment ? '#ff4a4a' : 
                  noiseLevel > 50 ? '#ffaa00' : '#4CAF50' 
              }
            ]} 
          />
        </View>
        {isNoisyEnvironment && (
          <Text style={styles.noiseWarning}>
            ⚠️ High background noise will affect voice clone quality
          </Text>
        )}
      </View>
    );
  };

  const generateSampleAudio = async () => {
    if (!speakerId) {
      Alert.alert("Error", "Speaker ID not found. Please try again.");
      return;
    }
    
    try {
      setIsGeneratingSample(true);
      
      // Sample text for demonstration
      const sampleText = "This is a sample of my cloned voice. How does it sound?";
      
      // Generate speech using the cloned voice
      const response = await fetch(`${API_URL}/api/voice-cloning/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: sampleText,
          speaker_id: speakerId
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.status === 'success') {
        // Save the sample audio URL for playback
        setSampleAudioUrl(result.output_file);
        
        // Play the sample audio
        const { sound } = await Audio.Sound.createAsync(
          { uri: `${API_URL}/tts_outputs/${result.output_file.split('/').pop()}` },
          { shouldPlay: true }
        );
        
        soundRef.current = sound;
        
        // Show success message
        Alert.alert(
          "Sample Generated",
          "Sample audio has been generated successfully. You can listen to it by pressing the 'Listen to Sample' button."
        );
      } else {
        throw new Error(result.error || 'Failed to generate sample audio');
      }
    } catch (error) {
      console.error("Error generating sample audio:", error);
      Alert.alert("Error", `Failed to generate sample audio: ${error.message}`);
    } finally {
      setIsGeneratingSample(false);
    }
  };
  
  const playGeneratedSample = async () => {
    if (!sampleAudioUrl) {
      Alert.alert("No Sample", "No sample audio has been generated yet.");
      return;
    }
    
    try {
      // Stop any currently playing audio
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }
      
      // Load and play the sample audio
      const { sound } = await Audio.Sound.createAsync(
        { uri: `${API_URL}/tts_outputs/${sampleAudioUrl.split('/').pop()}` },
        { shouldPlay: true }
      );
      
      soundRef.current = sound;
    } catch (error) {
      console.error("Error playing sample audio:", error);
      Alert.alert("Error", `Failed to play sample audio: ${error.message}`);
    }
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
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Voice Cloning Setup</Text>
          <Text style={styles.subtitle}>
            Create your own personal voice clone to use within the app
          </Text>
        </View>

        {/* Instructions */}
        <View style={styles.instructionsContainer}>
          <Text style={styles.instructionsTitle}>How it works:</Text>
          <View style={styles.instructionItem}>
            <MaterialCommunityIcons name="microphone" size={24} color="#4a90e2" style={styles.instructionIcon} />
            <Text style={styles.instructionText}>
              Record yourself reading the sample texts provided (at least 3 samples)
            </Text>
          </View>
          <View style={styles.instructionItem}>
            <MaterialCommunityIcons name="brain" size={24} color="#4a90e2" style={styles.instructionIcon} />
            <Text style={styles.instructionText}>
              Our AI will learn from your recordings to create a digital copy of your voice
            </Text>
          </View>
          <View style={styles.instructionItem}>
            <MaterialCommunityIcons name="account-voice" size={24} color="#4a90e2" style={styles.instructionIcon} />
            <Text style={styles.instructionText}>
              Your voice clone will be used to generate speech throughout the app
            </Text>
          </View>
        </View>

        {/* Progress */}
        <View style={styles.progressContainer}>
          <Text style={styles.progressTitle}>Your Progress</Text>
          <View style={styles.progressInfo}>
            <Text style={styles.progressText}>
              Recorded: {recordedAudios.length} samples ({formatTime(totalRecordingDuration)})
            </Text>
            <Text style={styles.progressSubtext}>
              Recommended: At least 5 minutes of clear speech
            </Text>
          </View>
        </View>

        {/* Sample Text Box */}
        {!showTrainingProgress && (
          <View style={styles.sampleTextContainer}>
            <Text style={styles.sampleTextTitle}>Please read this text aloud:</Text>
            <View style={styles.sampleTextBox}>
              <Text style={styles.sampleText}>{sampleTexts[currentSampleIndex]}</Text>
            </View>
          </View>
        )}

        {/* Recording Controls */}
        {!showTrainingProgress && (
          <View style={styles.recordingControls}>
            <TouchableOpacity
              style={[styles.recordButton, isRecording && styles.recordingActive]}
              onPress={isRecording ? stopRecording : startRecording}
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
                  <FontAwesome5 name="microphone" size={24} color="#fff" />
                )}
              </View>
              <Text style={styles.recordButtonText}>
                {isRecording 
                  ? `Recording... ${formatTime(recordingDuration)}` 
                  : "Start Recording"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        
        {/* Action Buttons - Moved to be above the recordings list */}
        {!showTrainingProgress && (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.button, styles.skipButton]}
              onPress={skipVoiceCloning}
            >
              <Text style={styles.skipButtonText}>Skip</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.button, styles.continueButton]}
              onPress={uploadRecordings}
              disabled={recordedAudios.length === 0}
            >
              <Text style={styles.continueButtonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Recordings List */}
        {!showTrainingProgress && renderRecordingsList()}

        {/* Training Progress */}
        {renderTrainingProgress()}
        
        {/* Navigation Options - Now visible during training too */}
        {showTrainingProgress && (
          <View style={styles.navigationOptions}>
            <TouchableOpacity
              style={styles.navigationButton}
              onPress={() => {
                // Confirm before resetting
                Alert.alert(
                  "Reset Voice Cloning",
                  "Are you sure you want to stop the training and restart the voice cloning process?",
                  [
                    {
                      text: "Cancel",
                      style: "cancel"
                    },
                    {
                      text: "Reset",
                      onPress: () => {
                        // Clear intervals first
                        if (statusIntervalRef.current) {
                          clearInterval(statusIntervalRef.current);
                        }
                        if (trainingTimeIntervalRef.current) {
                          clearInterval(trainingTimeIntervalRef.current);
                        }
                        
                        // Reset the voice cloning process
                        setShowTrainingProgress(false);
                        setRecordedAudios([]);
                        setTotalRecordingDuration(0);
                        setTrainingStatus(null);
                        setTrainingElapsedTime(0);
                        setSampleAudioUrl(null);
                      },
                      style: "destructive"
                    }
                  ]
                );
              }}
            >
              <Ionicons name="arrow-back" size={20} color="#4a90e2" />
              <Text style={styles.navigationButtonText}>Redo Voice Cloning</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.navigationButton}
              onPress={() => {
                // Don't show confirmation dialog if training is complete
                if (trainingStatus && trainingStatus.progress === 100) {
                  navigation.navigate('AudioRecorder');
                  return;
                }
                
                Alert.alert(
                  "Go to Transcription",
                  "Your voice model will continue training in the background. You can check its status later. Continue to transcription?",
                  [
                    {
                      text: "Cancel",
                      style: "cancel"
                    },
                    {
                      text: "Continue",
                      onPress: () => {
                        // Keep intervals running to maintain status checks in the background
                        // Just navigate without clearing intervals or resetting state
                        navigation.navigate('AudioRecorder');
                      }
                    }
                  ]
                );
              }}
            >
              <Ionicons name="arrow-forward" size={20} color="#4a90e2" />
              <Text style={styles.navigationButtonText}>Go to Transcription</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Post-Training Controls */}
        {trainingStatus && trainingStatus.progress === 100 && (
          <View style={styles.postTrainingContainer}>
            <Text style={styles.completionMessage}>
              Voice cloning completed successfully!
            </Text>
            
            {/* Listen to Sample Button */}
            <TouchableOpacity
              style={styles.listenSampleButton}
              onPress={sampleAudioUrl ? playGeneratedSample : generateSampleAudio}
            >
              <MaterialCommunityIcons 
                name={sampleAudioUrl ? "play-circle" : "waveform"} 
                size={24} 
                color="#fff" 
              />
              <Text style={styles.listenSampleText}>
                {isGeneratingSample 
                  ? "Generating Sample..." 
                  : sampleAudioUrl 
                    ? "Listen to Sample Audio" 
                    : "Generate Sample Audio"}
              </Text>
            </TouchableOpacity>
            
            {/* Navigation Options */}
            <View style={styles.navigationOptions}>
              <TouchableOpacity
                style={styles.navigationButton}
                onPress={() => {
                  // Reset the voice cloning process
                  setShowTrainingProgress(false);
                  setRecordedAudios([]);
                  setTotalRecordingDuration(0);
                  setTrainingStatus(null);
                  setTrainingElapsedTime(0);
                  setSampleAudioUrl(null);
                }}
              >
                <Ionicons name="arrow-back" size={20} color="#4a90e2" />
                <Text style={styles.navigationButtonText}>Redo Voice Cloning</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.navigationButton}
                onPress={() => navigation.navigate('AudioRecorder')}
              >
                <Ionicons name="arrow-forward" size={20} color="#4a90e2" />
                <Text style={styles.navigationButtonText}>Go to Transcription</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
      {renderNoiseLevelIndicator()}
    </View>
  );
};

export default VoiceCloning;