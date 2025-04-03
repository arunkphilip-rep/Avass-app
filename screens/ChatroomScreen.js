import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import Chatroom from '../components/Chatroom';
import { colors } from '../styles/theme';

const ChatroomScreen = ({ onBack, transcriptions }) => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>
      <Chatroom transcriptions={transcriptions} />
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
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    padding: 10,
  },
  backText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  }
});

export default ChatroomScreen;
