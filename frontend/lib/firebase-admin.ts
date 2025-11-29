// lib/firebase-admin.ts
// Firebase Admin SDK for server-side operations

import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage, type Storage } from 'firebase-admin/storage';

let _app: App | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _storage: Storage | null = null;

function initializeFirebaseAdmin() {
  if (_app) {
    return { app: _app, auth: _auth!, db: _db!, storage: _storage! };
  }

  if (getApps().length === 0) {
    // Initialize with service account credentials
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
      : undefined;

    if (serviceAccount) {
      _app = initializeApp({
        credential: cert(serviceAccount),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      });
    } else {
      // Fallback for development - uses default credentials
      _app = initializeApp({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      });
    }
  } else {
    _app = getApps()[0];
  }

  _auth = getAuth(_app);
  _db = getFirestore(_app);
  _storage = getStorage(_app);

  return { app: _app, auth: _auth, db: _db, storage: _storage };
}

// Lazy getters - only initialize when actually accessed
export const db = new Proxy({} as Firestore, {
  get(_, prop) {
    const { db } = initializeFirebaseAdmin();
    return (db as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const auth = new Proxy({} as Auth, {
  get(_, prop) {
    const { auth } = initializeFirebaseAdmin();
    return (auth as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const storage = new Proxy({} as Storage, {
  get(_, prop) {
    const { storage } = initializeFirebaseAdmin();
    return (storage as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// Direct access function for when you need the actual instances
export function getFirebaseAdmin() {
  return initializeFirebaseAdmin();
}

const firebaseAdmin = { db, auth, storage, getFirebaseAdmin };
export default firebaseAdmin;
