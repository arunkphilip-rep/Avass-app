import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ActivityIndicator, Text, TouchableOpacity, StatusBar, Platform } from 'react-native';
import { Audio } from 'expo-av';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AudioRecorder from './components/AudioRecorder';
import Login from './components/Login';
import History from './components/History';
import VoiceCloning from './components/VoiceCloning';
import VoiceFinetuning from './components/VoiceFinetuning';
import { auth } from './firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { colors, typography, shadows, borderRadius } from './styles/theme';

// Import API configuration
import { initializeApi, API_URL, apiRequest } from './services/api';

const Stack = createStackNavigator();

// Custom navigation theme
const AppTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.card,
    text: colors.text,
    border: colors.border,
  },
};

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [hasCheckedVoice, setHasCheckedVoice] = useState(false);
  const [hasClonedVoice, setHasClonedVoice] = useState(false);
  const [apiInitialized, setApiInitialized] = useState(false);
  const [serverError, setServerError] = useState(false);

  useEffect(() => {
    // Initialize API
    const setupApi = async () => {
      try {
        await initializeApi();
        setApiInitialized(true);
      } catch (error) {
        console.error("API initialization failed:", error);
        setServerError(true);
        setApiInitialized(true); // Mark as initialized even though it failed
      }
    };
    
    setupApi();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user && apiInitialized) {
        // Check if user has a cloned voice
        checkUserVoiceStatus(user.uid);
      } else if (!user) {
        setIsLoading(false);
      }
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
  }, [apiInitialized]);

  // Effect to check voice status when API is initialized
  useEffect(() => {
    if (user && apiInitialized && !hasCheckedVoice) {
      checkUserVoiceStatus(user.uid);
    }
  }, [user, apiInitialized, hasCheckedVoice]);

  const checkUserVoiceStatus = async (userId) => {
    try {
      setIsLoading(true);
      
      // Use our apiRequest helper that handles mock API fallback
      const data = await apiRequest(`/api/voice-cloning/check-user-status?user_id=${userId}`, { userId });
      
      setHasClonedVoice(data.has_cloned_voice);
      setHasCheckedVoice(true);
      setIsLoading(false);
    } catch (error) {
      console.error("Error checking voice status:", error);
      // Handle the error gracefully - assume no cloned voice exists
      setHasClonedVoice(false);
      setHasCheckedVoice(true);
      setIsLoading(false);
    }
  };

  // If API initialization or voice check fails, provide a retry option
  const handleRetry = () => {
    setServerError(false);
    setApiInitialized(false);
    setHasCheckedVoice(false);
  };

  if (isLoading) {
    return (
      <SafeAreaProvider>
        <StatusBar 
          barStyle="dark-content" 
          backgroundColor={colors.background} 
          translucent={Platform.OS === 'android'} 
        />
        <SafeAreaView style={[styles.container, styles.centered]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (serverError) {
    return (
      <SafeAreaProvider>
        <StatusBar 
          barStyle="dark-content" 
          backgroundColor={colors.background} 
          translucent={Platform.OS === 'android'} 
        />
        <SafeAreaView style={[styles.container, styles.centered]}>
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>Cannot connect to server</Text>
            <Text style={styles.errorSubtext}>The app server seems to be offline or unreachable</Text>
            <TouchableOpacity 
              style={styles.retryButton} 
              onPress={handleRetry}
              activeOpacity={0.7}
            >
              <Text style={styles.retryText}>Retry Connection</Text>
            </TouchableOpacity>
            
            {user && (
              <TouchableOpacity 
                style={styles.continueButton} 
                onPress={() => {
                  setServerError(false);
                  setHasClonedVoice(false);  // Assume no voice clone
                  setHasCheckedVoice(true);  // Mark as checked
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.continueText}>Continue Offline</Text>
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar 
        barStyle="light-content" 
        backgroundColor={colors.primary} 
        translucent={Platform.OS === 'android'}
      />
      <NavigationContainer theme={AppTheme}>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            cardStyle: { backgroundColor: colors.background },
            cardShadowEnabled: true,
            cardOverlayEnabled: true,
            gestureEnabled: true,
            animationEnabled: true,
            presentation: 'card',
          }}
        >
          {!user ? (
            <Stack.Screen 
              name="Login" 
              component={Login} 
              options={{ headerShown: false }} 
            />
          ) : (
            <>
              {!hasClonedVoice && (
                <Stack.Screen 
                  name="VoiceCloning" 
                  component={VoiceCloning} 
                  options={{ 
                    headerShown: false,
                    gestureEnabled: false,
                    // Pass userId as a param to VoiceCloning
                    initialParams: { 
                      userId: user.uid,
                      serverError: serverError
                    }
                  }} 
                />
              )}
              <Stack.Screen 
                name="AudioRecorder" 
                component={AudioRecorder} 
                options={{ headerShown: false }}
              />
              <Stack.Screen 
                name="History" 
                component={History} 
                options={{ 
                  headerShown: false,
                  gestureEnabled: true,
                }}
              />
              <Stack.Screen 
                name="VoiceFinetuning" 
                component={VoiceFinetuning} 
                options={{ headerShown: false }}
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: colors.textSecondary,
    ...typography.body,
  },
  errorContainer: {
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 480,
    width: '100%',
  },
  errorText: {
    ...typography.heading2,
    color: colors.error,
    marginBottom: 12,
    textAlign: 'center',
  },
  errorSubtext: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: borderRadius.md,
    marginVertical: 8,
    ...shadows.main,
  },
  retryText: {
    color: colors.textLight,
    ...typography.button,
  },
  continueButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: 'transparent',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: borderRadius.md,
    marginTop: 8,
  },
  continueText: {
    color: colors.primary,
    ...typography.button,
  },
});