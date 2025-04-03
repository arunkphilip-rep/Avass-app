import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { Audio } from 'expo-av';
import AudioRecorder from './components/AudioRecorder';
import LoadingAnimation from './components/LoadingAnimation';
import Login from './components/Login';
import History from './components/History';
import ChatroomScreen from './screens/ChatroomScreen';
import { auth } from './firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { colors } from './styles/theme';

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentScreen, setCurrentScreen] = useState('main');
  const [savedTranscriptions, setSavedTranscriptions] = useState([]);
  const [currentTranscriptions, setCurrentTranscriptions] = useState([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsLoggedIn(!!user);
      setIsLoading(false);
    });

    async function prepare() {
      try {
        await Audio.requestPermissionsAsync();
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
      } catch (error) {
        console.error('Failed to load audio:', error);
      }
    }
    prepare();

    return () => unsubscribe();
  }, []);

  const handleScreenChange = (screenName, data = null) => {
    setCurrentScreen(screenName);
    if (data) {
      setCurrentTranscriptions(data);
    }
  };

  const handleSaveTranscriptions = (newGroup) => {
    setSavedTranscriptions((prev) => [...prev, newGroup]);
  };

  const handleDeleteTranscription = (transcriptionId) => {
    setSavedTranscriptions((prev) =>
      prev.filter((transcription) => transcription.id !== transcriptionId)
    );
  };

  const renderCurrentScreen = () => {
    if (!isLoggedIn) {
      return <Login onLogin={() => setIsLoggedIn(true)} />;
    }

    switch (currentScreen) {
      case 'history':
        return (
          <History
            savedTranscriptions={savedTranscriptions}
            onBack={() => setCurrentScreen('main')}
            onDelete={handleDeleteTranscription}
          />
        );
      case 'chatroom':
        return (
          <ChatroomScreen
            onBack={() => setCurrentScreen('main')}
            transcriptions={currentTranscriptions}
          />
        );
      default:
        return (
          <AudioRecorder
            onSave={handleSaveTranscriptions}
            onNavigateToHistory={() => handleScreenChange('history')}
            onNavigateToChatroom={(transcriptions) =>
              handleScreenChange('chatroom', transcriptions)
            }
          />
        );
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {renderCurrentScreen()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 40,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
