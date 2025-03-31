import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Share, Alert } from 'react-native';
import { colors, shadows } from '../styles/theme';
import LoadingAnimation from './LoadingAnimation';
import { deleteNote } from '../firebase/storage';

export default function History({ savedTranscriptions = [], onBack, onDelete }) {
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState([]);

  useEffect(() => {
    // Simulate loading delay
    const loadData = async () => {
      setIsLoading(true);
      try {
        // Wait for 3 seconds to show loading animation
        await new Promise(resolve => setTimeout(resolve, 3000));
        setData(savedTranscriptions);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [savedTranscriptions]);

  const handleShare = async (group) => {
    try {
      const message = group.items
        .map(item => `${item.timestamp}: ${item.text}`)
        .join('\n\n');
      
      await Share.share({
        message,
        title: 'Transcription History'
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to share transcriptions');
    }
  };

  const handleDelete = async (groupId) => {
    Alert.alert(
      'Delete Transcription',
      'Are you sure you want to delete this transcription? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsLoading(true);
              await deleteNote(groupId);
              setData(prev => prev.filter(group => group.id !== groupId));
              onDelete?.(groupId); // Notify parent component
            } catch (error) {
              Alert.alert('Error', 'Failed to delete transcription');
            } finally {
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>History</Text>
      </View>
      
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <LoadingAnimation />
        </View>
      ) : (
        <ScrollView style={styles.scrollView}>
          {data.length === 0 ? (
            <Text style={styles.emptyText}>No transcription history</Text>
          ) : (
            data.map((group, index) => (
              <View key={index} style={styles.transcriptionGroup}>
                <View style={styles.groupHeader}>
                  <Text style={styles.groupDate}>
                    {new Date(group.savedAt).toLocaleDateString()}
                  </Text>
                  <View style={styles.groupActions}>
                    <TouchableOpacity 
                      onPress={() => handleShare(group)}
                      style={styles.actionButton}
                    >
                      <Text style={styles.actionIcon}>📤</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => handleDelete(group.id)}
                      style={styles.actionButton}
                    >
                      <Text style={styles.actionIcon}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {group.items.map((item, itemIndex) => (
                  <View key={item.id} style={styles.transcriptionItem}>
                    <Text style={styles.itemNumber}>{itemIndex + 1}.</Text>
                    <View style={styles.itemContent}>
                      <Text style={styles.transcriptionText}>{item.text}</Text>
                      <Text style={styles.timestamp}>{item.timestamp}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ))
          )}
        </ScrollView>
      )}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transcriptionGroup: {
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    marginBottom: 16,
    padding: 16,
    ...shadows.main,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  groupDate: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  groupActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    padding: 8,
  },
  actionIcon: {
    fontSize: 20,
  },
  transcriptionItem: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  itemNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
    marginRight: 8,
    width: 24,
  },
  itemContent: {
    flex: 1,
  },
  transcriptionText: {
    fontSize: 15,
    color: colors.text,
    marginBottom: 4,
    lineHeight: 20,
  },
  timestamp: {
    fontSize: 12,
    color: colors.secondary,
  },
  emptyText: {
    textAlign: 'center',
    color: colors.secondary,
    fontSize: 16,
    marginTop: 40,
    fontStyle: 'italic',
  },
  scrollView: {
    flex: 1,
  }
});
