import { getFirestore, collection, setDoc, getDocs } from 'firebase/firestore';
import { auth } from './config';

const db = getFirestore();

export const saveTranscriptionNote = async (noteData) => {
  try {
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error('User not authenticated');

    const timestamp = new Date().toISOString();
    const noteRef = collection(db, `users/${userId}/notes`);
    
    // Convert data to plain object suitable for Firestore
    const noteObject = {
      ...noteData,
      items: noteData.items.map(item => ({
        id: item.id,
        text: item.text,
        timestamp: item.timestamp,
        audioUrl: item.audioUrl || null
      })),
      createdAt: timestamp
    };

    await setDoc(noteRef.doc(timestamp), noteObject);
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

    const notesRef = collection(db, `users/${userId}/notes`);
    const snapshot = await getDocs(notesRef);
    
    const notes = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return notes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (error) {
    console.error('Error fetching notes:', error);
    throw error;
  }
};
