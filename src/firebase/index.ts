'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';


// IMPORTANT: DO NOT MODIFY THIS FUNCTION
export function initializeFirebase() {
  if (!getApps().length) {
    const firebaseApp = initializeApp(firebaseConfig);
    return getSdks(firebaseApp);
  }
  // If already initialized, return the SDKs with the already initialized App
  return getSdks(getApp());
}

export function getSdks(firebaseApp: FirebaseApp) {
  const firestore = getFirestore(firebaseApp);
  const db = firebaseConfig.databaseURL ? getDatabase(firebaseApp, firebaseConfig.databaseURL) : null;
  return {
    firebaseApp,
    auth: getAuth(firebaseApp),
    firestore: firestore,
    db: db,
  };
}

export * from './provider';
export * from './client-provider';
export * from './database/use-db-data';
export * from './non-blocking-login';
