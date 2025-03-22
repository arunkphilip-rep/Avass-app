import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { colors, shadows } from '../styles/theme';

const BiometricAuth = ({ onAuthenticate }) => {
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState("");

  useEffect(() => {
    checkBiometricSupport();
  }, []);

  const checkBiometricSupport = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    setBiometricAvailable(compatible);

    if (compatible) {
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const typeNames = types.map((type) => {
        if (type === LocalAuthentication.AuthenticationType.FINGERPRINT) return "Fingerprint";
        if (type === LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) return "Face ID";
        return "Biometric";
      });
      setBiometricType(typeNames[0]);
    }
  };

  const handleBiometricAuth = async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Authenticate with Biometrics",
      fallbackLabel: "Use Passcode",
    });

    if (result.success) {
      onAuthenticate();
    }
  };

  if (!biometricAvailable) return null;

  return (
    <TouchableOpacity onPress={handleBiometricAuth} style={styles.biometricButton}>
      <Text style={styles.biometricText}>
        Login with {biometricType}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  biometricButton: {
    padding: 15,
    backgroundColor: colors.secondary,
    borderRadius: 10,
    marginTop: 15,
    ...shadows.main,
  },
  biometricText: {
    color: colors.textLight,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default BiometricAuth;
