import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, shadows } from '../styles/theme';

export default function History({ savedTranscriptions = [], onBack }) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>History</Text>
      </View>
      <ScrollView style={styles.scrollView}>
        {savedTranscriptions.map((group, index) => (
          <View key={index} style={styles.transcriptionGroup}>
            <Text style={styles.groupDate}>{group.savedAt}</Text>
            {group.items.map(item => (
              <View key={item.id} style={styles.transcriptionItem}>
                <Text style={styles.transcriptionText}>{item.text}</Text>
                <Text style={styles.timestamp}>{item.timestamp}</Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

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
    paddingVertical: 10,
  },
  backButton: {
    position: 'absolute',
    left: 0,
    zIndex: 1,
  },
  backText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    flex: 1,
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
  },
});
