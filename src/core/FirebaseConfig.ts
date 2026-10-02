import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

export interface FirebaseEnvConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

const env = import.meta.env;

export const firebaseConfig: FirebaseEnvConfig = {
  apiKey: (env.VITE_FIREBASE_API_KEY || '').trim(),
  authDomain: (env.VITE_FIREBASE_AUTH_DOMAIN || '').trim(),
  projectId: (env.VITE_FIREBASE_PROJECT_ID || '').trim(),
  storageBucket: (env.VITE_FIREBASE_STORAGE_BUCKET || '').trim(),
  messagingSenderId: (env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim(),
  appId: (env.VITE_FIREBASE_APP_ID || '').trim(),
};

export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.apiKey.length > 5 &&
    !firebaseConfig.apiKey.includes('your_api_key')
  );
}

export function getFirebaseMissingKeys(): string[] {
  const missing: string[] = [];
  if (!firebaseConfig.apiKey) missing.push('VITE_FIREBASE_API_KEY');
  if (!firebaseConfig.authDomain) missing.push('VITE_FIREBASE_AUTH_DOMAIN');
  if (!firebaseConfig.projectId) missing.push('VITE_FIREBASE_PROJECT_ID');
  if (!firebaseConfig.appId) missing.push('VITE_FIREBASE_APP_ID');
  return missing;
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let googleProvider: GoogleAuthProvider | null = null;

if (isFirebaseConfigured()) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);
    db = getFirestore(app);
    googleProvider = new GoogleAuthProvider();
    googleProvider.setCustomParameters({
      prompt: 'select_account',
    });
    console.log('[FirebaseConfig] Successfully initialized Firebase & Firestore.');
  } catch (err) {
    console.error('[FirebaseConfig] Failed to initialize Firebase:', err);
  }
} else {
  console.info('[FirebaseConfig] Firebase is in unconfigured state. Add credentials to .env to activate.');
}

export { app, auth, db, googleProvider };
