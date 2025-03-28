import { getFirestore, doc, setDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { auth } from './config';

const db = getFirestore();

export const saveTranscriptionNote = async (noteData) => {
  try {
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('User not authenticated');

    const timestamp = new Date().toISOString();
    const docRef = doc(db, 'users', userId, 'notes', timestamp);
    
    const noteObject = {
      ...noteData,
      items: noteData.items.map(item => ({
        id: item.id,
        text: item.text,
        timestamp: item.timestamp,
        audioUrl: item.audioUrl || null
      })),
      createdAt: timestamp,
      userId
    };

    await setDoc(docRef, noteObject);
    return timestamp;
  } catch (error) {
    console.error('Error saving note:', error);
    throw error;
  }
};

export const getNotes = async () => {
  try {
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('User not authenticated');

    const notesRef = collection(db, 'users', userId, 'notes');
    const q = query(notesRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return [];
    }

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      // Ensure dates are properly formatted
      createdAt: doc.data().createdAt || doc.data().savedAt,
      items: doc.data().items?.map(item => ({
        ...item,
        timestamp: item.timestamp || new Date(item.id).toLocaleTimeString()
      })) || []
    }));
  } catch (error) {
    console.error('Error fetching notes:', error);
    throw error;
  }
};
