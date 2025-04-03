import React, { useEffect, useState, useRef } from 'react';
import { 
  View, 
  Text, 
  ScrollView, 
  StyleSheet, 
  TouchableOpacity, 
  ActivityIndicator, 
  Alert, 
  Share,
  Animated,
  StatusBar
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { colors, shadows, typography, borderRadius, spacing } from '../styles/theme';
import { getNotes, deleteNote } from '../firebase/storage';
import { auth } from '../firebase/config';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

export default function History({ navigation }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(!!auth.currentUser);
  const [refreshing, setRefreshing] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    // Check authentication state
    const unsubscribe = auth.onAuthStateChanged(user => {
      setIsAuthenticated(!!user);
    });
    
    loadNotes();
    
    return () => unsubscribe();
  }, []);

  const loadNotes = async () => {
    try {
      setLoading(true);
      setError(null);
      const fetchedNotes = await getNotes();
      setNotes(fetchedNotes);
      
      // Reset error state if successful
      if (error && fetchedNotes.length > 0) {
        setError(null);
      }
    } catch (error) {
      console.error('Failed to load notes:', error);
      setError(error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadNotes();
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

  const handleLogin = () => {
    // Navigation to login screen would go here
    Alert.alert('Login Required', 
      'Please log in to sync your transcriptions to the cloud.',
      [
        { text: 'OK' }
      ]
    );
  };

  const renderNoteActions = (note) => (
    <View style={styles.noteActions}>
      <TouchableOpacity 
        onPress={() => handleShare(note)}
        style={styles.actionButton}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={[colors.primary, colors.primaryDark]}
          style={styles.actionButtonGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <FontAwesome5 name="share-alt" size={14} color={colors.textLight} style={styles.actionButtonIcon} />
          <Text style={styles.actionButtonText}>Share</Text>
        </LinearGradient>
      </TouchableOpacity>
      
      <TouchableOpacity 
        onPress={() => handleDelete(note.id)}
        style={styles.actionButton}
        activeOpacity={0.8}
      >
        <View style={styles.deleteButtonView}>
          <FontAwesome5 name="trash-alt" size={14} color={colors.textLight} style={styles.actionButtonIcon} />
          <Text style={styles.actionButtonText}>Delete</Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  const renderAuthWarning = () => {
    if (isAuthenticated) return null;
    
    return (
      <TouchableOpacity 
        onPress={handleLogin}
        style={styles.authWarning}
      >
        <Text style={styles.authWarningText}>
          You're not logged in. Transcriptions are stored locally and won't sync across devices.
        </Text>
        <Text style={styles.authLoginText}>Tap to login</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      
      {/* Header with animated properties */}
      <Animated.View style={[
        styles.header,
        {
          opacity: scrollY.interpolate({
            inputRange: [0, 50],
            outputRange: [1, 0.9],
            extrapolate: 'clamp'
          })
        }
      ]}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <LinearGradient
            colors={[colors.primary, colors.primaryDark]}
            style={styles.backButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <FontAwesome5 name="arrow-left" size={16} color={colors.textLight} />
          </LinearGradient>
        </TouchableOpacity>
        
        <Text style={styles.title}>History</Text>
        
        <TouchableOpacity 
          onPress={handleRefresh} 
          style={styles.refreshButton}
          activeOpacity={0.7}
          disabled={refreshing}
        >
          <Animated.View style={{
            transform: [{ 
              rotate: refreshing ? '360deg' : '0deg' 
            }]
          }}>
            <FontAwesome5 
              name="sync" 
              size={18} 
              color={colors.primary} 
              style={refreshing ? { opacity: 0.7 } : null} 
            />
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>

      {renderAuthWarning()}

      {loading && notes.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading transcriptions...</Text>
        </View>
      ) : error && notes.length === 0 ? (
        <View style={styles.emptyStateContainer}>
          <FontAwesome5 name="exclamation-circle" size={50} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity 
            style={styles.retryButton} 
            onPress={loadNotes}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[colors.primary, colors.primaryDark]}
              style={styles.retryButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.retryText}>Retry</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : notes.length === 0 ? (
        <View style={styles.emptyStateContainer}>
          <FontAwesome5 name="history" size={60} color={colors.inactive} />
          <Text style={styles.emptyTitle}>No History Yet</Text>
          <Text style={styles.emptyText}>
            Your saved transcriptions will appear here
          </Text>
        </View>
      ) : (
        <Animated.ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollViewContent}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: false }
          )}
        >
          {notes.map((note, index) => (
            <Animated.View 
              key={note.id} 
              style={[
                styles.noteCard,
                note.localOnly && styles.localNoteCard,
                // Add entry animation with staggered delay
                { opacity: 1, transform: [{ translateY: 0 }] }
              ]}
              entering={Animated.FadeInUp.delay(index * 100).duration(300)}
            >
              <View style={styles.noteHeader}>
                <View style={styles.noteInfo}>
                  <Text style={styles.noteDate}>{formatDate(note.createdAt)}</Text>
                  {note.localOnly && (
                    <View style={styles.badgeContainer}>
                      <FontAwesome5 name="mobile-alt" size={10} color={colors.secondary} style={styles.badgeIcon} />
                      <Text style={styles.localBadge}>Local Only</Text>
                    </View>
                  )}
                </View>
                <View style={styles.itemCount}>
                  <Text style={styles.itemCountText}>
                    {note.items?.length || 0} {note.items?.length === 1 ? 'item' : 'items'}
                  </Text>
                </View>
              </View>
              
              {note.items?.map((item, itemIndex) => (
                <View key={itemIndex} style={styles.transcriptionItem}>
                  <Text style={styles.transcriptionText} numberOfLines={3} ellipsizeMode="tail">
                    {item.text}
                  </Text>
                  <Text style={styles.timestamp}>{item.timestamp}</Text>
                </View>
              ))}
              
              <View style={styles.noteActions}>
                <TouchableOpacity 
                  onPress={() => handleShare(note)}
                  style={styles.actionButton}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={[colors.primary, colors.primaryDark]}
                    style={styles.actionButtonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <FontAwesome5 name="share-alt" size={14} color={colors.textLight} style={styles.actionButtonIcon} />
                    <Text style={styles.actionButtonText}>Share</Text>
                  </LinearGradient>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  onPress={() => handleDelete(note.id)}
                  style={styles.actionButton}
                  activeOpacity={0.8}
                >
                  <View style={styles.deleteButtonView}>
                    <FontAwesome5 name="trash-alt" size={14} color={colors.textLight} style={styles.actionButtonIcon} />
                    <Text style={styles.actionButtonText}>Delete</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </Animated.View>
          ))}
        </Animated.ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    paddingVertical: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.round,
    overflow: 'hidden',
    ...shadows.small,
  },
  backButtonGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.heading2,
    color: colors.text,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.round,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.small,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingBottom: spacing.xl,
  },
  noteCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.main,
  },
  localNoteCard: {
    borderLeftWidth: 4,
    borderLeftColor: colors.secondary,
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  noteInfo: {
    flex: 1,
  },
  noteDate: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  badgeIcon: {
    marginRight: spacing.xs,
  },
  localBadge: {
    ...typography.caption,
    color: colors.secondary,
    fontWeight: 'bold',
  },
  itemCount: {
    backgroundColor: colors.inputBg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemCountText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  transcriptionItem: {
    backgroundColor: colors.inputBg,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  transcriptionText: {
    ...typography.body,
    color: colors.text,
  },
  timestamp: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'right',
  },
  noteActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.md,
  },
  actionButton: {
    flex: 1,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    ...shadows.small,
  },
  actionButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  deleteButtonView: {
    backgroundColor: colors.error,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  actionButtonIcon: {
    marginRight: spacing.xs,
  },
  actionButtonText: {
    ...typography.button,
    color: colors.textLight,
    fontSize: 14,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    ...typography.heading2,
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    textAlign: 'center',
    marginVertical: spacing.md,
  },
  retryButton: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    ...shadows.small,
  },
  retryButtonGradient: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    ...typography.button,
    color: colors.textLight,
  },
  authWarning: {
    backgroundColor: 'rgba(255, 92, 119, 0.1)',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.secondary,
    flexDirection: 'row',
    alignItems: 'center',
  },
  authWarningText: {
    ...typography.bodySmall,
    flex: 1,
    color: colors.text,
  },
  authLoginText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: 'bold',
    marginTop: spacing.xs,
  }
});
