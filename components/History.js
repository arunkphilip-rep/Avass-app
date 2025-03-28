import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Share } from 'react-native';
import { AntDesign } from '@expo/vector-icons'; // Add this import
import { colors, shadows } from '../styles/theme';
import { getNotes, deleteNote } from '../firebase/storage';

export default function History({ onBack }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = async () => {
    try {
      setLoading(true);
      setError(null);
      const fetchedNotes = await getNotes();
      setNotes(fetchedNotes);
    } catch (error) {
      console.error('Failed to load notes:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const handleDelete = async (noteId) => {
    Alert.alert(
      'Delete Note',
      'Are you sure you want to delete this note?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await deleteNote(noteId);
              await loadNotes(); // Reload notes after deletion
              Alert.alert('Success', 'Note deleted successfully');
            } catch (error) {
              console.error('Delete error:', error);
              Alert.alert('Error', 'Failed to delete note');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleShare = async (note) => {
    try {
      const shareText = note.items
        .map(item => `${item.text} (${item.timestamp})`)
        .join('\n\n');
      
      await Share.share({
        message: shareText,
        title: 'Shared Transcription'
      });
    } catch (error) {
      console.error('Share error:', error);
      Alert.alert('Error', 'Failed to share note');
    }
  };

  const renderNoteActions = (note) => (
    <View style={styles.noteActions}>
      <TouchableOpacity 
        onPress={() => handleShare(note)}
        style={[styles.actionButton, styles.iconButton]}
      >
        <AntDesign name="sharealt" size={20} color={colors.textLight} />
      </TouchableOpacity>
      <TouchableOpacity 
        onPress={() => handleDelete(note.id)}
        style={[styles.actionButton, styles.iconButton, styles.deleteButton]}
      >
        <AntDesign name="delete" size={20} color={colors.textLight} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>History</Text>
        <TouchableOpacity onPress={loadNotes} style={styles.refreshButton}>
          <Text style={styles.refreshText}>↻</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading transcriptions...</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={loadNotes} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : notes.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No saved transcriptions yet</Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView}>
          {notes.map((note) => (
            <View key={note.id} style={styles.noteCard}>
              <Text style={styles.noteDate}>{formatDate(note.createdAt)}</Text>
              {note.items?.map((item, itemIndex) => (
                <View key={itemIndex} style={styles.transcriptionItem}>
                  <Text style={styles.transcriptionText}>{item.text}</Text>
                  <Text style={styles.timestamp}>{item.timestamp}</Text>
                </View>
              ))}
              {renderNoteActions(note)}
            </View>
          ))}
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
  noteCard: {
    backgroundColor: colors.inputBg,
    borderRadius: 15,
    padding: 15,
    marginBottom: 20,
    ...shadows.main,
  },
  noteDate: {
    fontSize: 14,
    color: colors.secondary,
    marginBottom: 10,
    fontWeight: '500',
  },
  transcriptionItem: {
    backgroundColor: colors.background,
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: colors.secondary,
  },
  errorText: {
    color: colors.error,
    textAlign: 'center',
    marginBottom: 15,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: colors.textLight,
    fontWeight: '600',
  },
  emptyText: {
    color: colors.secondary,
    fontStyle: 'italic',
  },
  refreshButton: {
    position: 'absolute',
    right: 0,
    padding: 10,
  },
  refreshText: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: '600',
  },
  noteActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 10,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 15,
  },
  actionButton: {
    padding: 8,
    borderRadius: 20,
  },
  iconButton: {
    backgroundColor: colors.primary,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButton: {
    backgroundColor: colors.error,
  }
});
