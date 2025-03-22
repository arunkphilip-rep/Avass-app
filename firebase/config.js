import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyC3kY8wGhz09QLwZNr4axtHZMw3viO2YEs",
  authDomain: "avaass-e5307.firebaseapp.com",
  projectId: "avaass-e5307",
  storageBucket: "avaass-e5307.firebasestorage.app",
  messagingSenderId: "34298462034",
  appId: "1:34298462034:android:f33cc27ff7366d6e0cc48b"
};

const app = initializeApp(firebaseConfig);
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});
export default app;
