import React, { useState, useEffect } from 'react';
import { 
  View, 
  TextInput, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Platform,
  Animated
} from 'react-native';
import { auth } from '../firebase/config';
import { signInWithEmailAndPassword } from 'firebase/auth';
import BiometricAuth from './BiometricAuth';
import Register from './Register';
import { colors, shadows, typography, borderRadius, spacing } from '../styles/theme';
import { useNavigation } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const fadeAnim = useState(new Animated.Value(0))[0];
  const navigation = useNavigation();

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true
    }).start();

    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      () => setKeyboardVisible(true)
    );
    const keyboardDidHideListener = Keyboard.addListener(
      'keyboardDidHide',
      () => setKeyboardVisible(false)
    );

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Auth state changes handled by the onAuthStateChanged listener in App.js
    } catch (error) {
      Alert.alert('Login Error', error.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricAuth = () => {
    // Auth state changes handled by the onAuthStateChanged listener in App.js
  };

  if (showRegister) {
    return (
      <Register 
        onRegister={() => {}} // Auth state changes handled by App.js
        onBackToLogin={() => setShowRegister(false)}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <Animated.View 
            style={[
              styles.inner, 
              { opacity: fadeAnim, transform: [{ translateY: fadeAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [50, 0]
              })}] 
            }]
          }>
            <View style={styles.logoContainer}>
              <Image 
                source={require('../assets/icon.png')} 
                style={styles.logo} 
                resizeMode="contain"
              />
              <Text style={styles.appName}>Avass</Text>
            </View>
            
            <View style={styles.card}>
              <Text style={styles.title}>Welcome Back</Text>
              <Text style={styles.subtitle}>Sign in to continue</Text>
              
              <View style={styles.inputContainer}>
                <MaterialCommunityIcons 
                  name="email-outline" 
                  size={20} 
                  color={colors.textSecondary} 
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor={colors.textSecondary}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
              </View>
              
              <View style={styles.inputContainer}>
                <MaterialCommunityIcons 
                  name="lock-outline" 
                  size={20} 
                  color={colors.textSecondary} 
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor={colors.textSecondary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoComplete="password"
                />
                <TouchableOpacity 
                  style={styles.passwordToggle}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <MaterialCommunityIcons 
                    name={showPassword ? "eye-off" : "eye"} 
                    size={20} 
                    color={colors.textSecondary} 
                  />
                </TouchableOpacity>
              </View>
              
              <TouchableOpacity 
                style={[styles.loginButton, loading && styles.loginButtonDisabled]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.7}
              >
                {loading ? (
                  <View style={styles.loadingContainer}>
                    <Text style={styles.buttonText}>Signing in...</Text>
                  </View>
                ) : (
                  <LinearGradient
                    colors={[colors.primary, colors.primaryDark]}
                    style={styles.gradientButton}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Text style={styles.buttonText}>Sign In</Text>
                  </LinearGradient>
                )}
              </TouchableOpacity>
              
              <BiometricAuth onAuthenticate={handleBiometricAuth} />
              
              <TouchableOpacity 
                style={styles.registerButton} 
                onPress={() => setShowRegister(true)}
                activeOpacity={0.6}
              >
                <Text style={styles.registerText}>
                  Don't have an account? <Text style={styles.registerTextBold}>Sign Up</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    padding: 20,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  logo: {
    width: 100,
    height: 100,
  },
  appName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.inputBg,
    borderRadius: borderRadius.md,
    padding: 25,
    ...shadows.main,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 12,
    marginTop: 10,
  },
  subtitle: {
    fontSize: 16,
    color: colors.secondary,
    textAlign: 'center',
    marginBottom: 25,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderRadius: borderRadius.md,
    paddingHorizontal: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.main,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: 50,
    fontSize: 16,
    color: colors.text,
  },
  passwordToggle: {
    marginLeft: 10,
  },
  loginButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  loginButtonDisabled: {
    backgroundColor: colors.primaryLight,
  },
  buttonText: {
    color: colors.textLight,
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  registerButton: {
    marginTop: 20,
  },
  registerText: {
    color: colors.secondary,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '500',
  },
  registerTextBold: {
    fontWeight: 'bold',
  },
  gradientButton: {
    borderRadius: borderRadius.md,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
