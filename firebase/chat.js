import { db, auth } from './config';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot,
  serverTimestamp,
  where 
} from 'firebase/firestore';

export const categories = [
  { id: 'general', name: 'General', hashtag: '#general' },
  { id: 'appreview', name: 'App Reviews', hashtag: '#appreview' },
  { id: 'successstory', name: 'Success Stories', hashtag: '#successstory' },
  { id: 'support', name: 'Support', hashtag: '#support' },
  { id: 'feedback', name: 'Feedback', hashtag: '#feedback' }
];

export const sendMessage = async (message, category) => {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    await addDoc(collection(db, 'messages'), {
      text: message,
      userId: user.uid,
      userEmail: user.email,
      category: category,
      timestamp: serverTimestamp(),
      hashtags: extractHashtags(message)
    });
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
};

export const subscribeToMessages = (category, callback) => {
  const user = auth.currentUser;
  if (!user) return null;

  // Simplified query that doesn't require composite index
  const q = query(
    collection(db, 'messages'),
    where('category', '==', category),
    orderBy('timestamp', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate()
    }));
    callback(messages);
  });
};

const extractHashtags = (text) => {
  const hashtagRegex = /#[a-zA-Z0-9_]+/g;
  return (text.match(hashtagRegex) || []).map(tag => tag.toLowerCase());
};
