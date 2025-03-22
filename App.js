import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import { Audio } from 'expo-av';
import AudioRecorder from './components/AudioRecorder';
import Login from './components/Login';
import History from './components/History';
import { auth } from './firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { colors } from './styles/theme';  // Add this import

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [currentScreen, setCurrentScreen] = useState('main');
  const [savedTranscriptions, setSavedTranscriptions] = useState([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
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

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const handleSavedTranscriptions = (newGroup) => {
    setSavedTranscriptions(prev => [...prev, newGroup]);
  };

  return (
    <View style={styles.container}>
      {!isLoggedIn ? (
        <Login onLogin={() => setIsLoggedIn(true)} />
      ) : currentScreen === 'main' ? (
        <AudioRecorder 
          onSave={handleSavedTranscriptions}
          onNavigateToHistory={() => setCurrentScreen('history')}
        />
      ) : (
        <History 
          savedTranscriptions={savedTranscriptions}
          onBack={() => setCurrentScreen('main')}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,  // Update background color
    paddingTop: 40,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
