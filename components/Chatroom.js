import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList } from 'react-native';
import { colors, shadows } from '../styles/theme';
import { auth } from '../firebase/config';
import { sendMessage, subscribeToMessages, categories } from '../firebase/chat';

const Chatroom = () => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [currentCategory, setCurrentCategory] = useState(categories[0]);

  useEffect(() => {
    const unsubscribe = subscribeToMessages(currentCategory.id, (newMessages) => {
      setMessages(newMessages);
    });
    return () => unsubscribe && unsubscribe();
  }, [currentCategory]);

  const handleSend = async () => {
    if (!newMessage.trim()) return;
    try {
      await sendMessage(newMessage, currentCategory.id);
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.categories}>
        <FlatList
          horizontal
          data={categories}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.categoryButton,
                currentCategory.id === item.id && styles.activeCategoryButton
              ]}
              onPress={() => setCurrentCategory(item)}
            >
              <Text style={styles.categoryText}>{item.name}</Text>
            </TouchableOpacity>
          )}
          keyExtractor={item => item.id}
          showsHorizontalScrollIndicator={false}
        />
      </View>

      <FlatList
        style={styles.messageList}
        data={messages}
        renderItem={({ item }) => (
          <View style={[
            styles.messageContainer,
            item.userId === auth.currentUser?.uid ? styles.ownMessage : styles.otherMessage
          ]}>
            <Text style={styles.messageUser}>{item.userEmail}</Text>
            <Text style={styles.messageText}>{item.text}</Text>
            <Text style={styles.messageTime}>
              {new Date(item.timestamp).toLocaleTimeString()}
            </Text>
          </View>
        )}
        keyExtractor={item => item.id}
        inverted
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={newMessage}
          onChangeText={setNewMessage}
          placeholder={`Message in ${currentCategory.hashtag}...`}
          placeholderTextColor={colors.secondary}
          multiline
        />
        <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.inputBg,
    borderRadius: 15,
    ...shadows.main,
  },
  categories: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  categoryButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: colors.background,
  },
  activeCategoryButton: {
    backgroundColor: colors.primary,
  },
  categoryText: {
    color: colors.text,
    fontSize: 14,
  },
  messageList: {
    flex: 1,
    padding: 15,
  },
  messageContainer: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    maxWidth: '80%',
    ...shadows.main,
  },
  ownMessage: {
    backgroundColor: colors.primary,
    alignSelf: 'flex-end',
  },
  otherMessage: {
    backgroundColor: colors.background,
    alignSelf: 'flex-start',
  },
  messageUser: {
    fontSize: 12,
    color: colors.secondary,
    marginBottom: 4,
  },
  messageText: {
    fontSize: 14,
    color: colors.text,
  },
  messageTime: {
    fontSize: 10,
    color: colors.secondary,
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 8,
    marginRight: 10,
    fontSize: 14,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  sendButtonText: {
    color: colors.textLight,
    fontSize: 14,
    fontWeight: '600',
  },
});

export default Chatroom;
