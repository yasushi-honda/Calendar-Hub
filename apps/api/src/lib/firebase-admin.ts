import { initializeApp, getApps, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';

let adminApp: App;

function getAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  // Cloud Run: ADC (Application Default Credentials) で自動認証
  // ローカル: gcloud auth application-default login で認証
  adminApp = initializeApp({
    projectId: process.env.GCP_PROJECT_ID ?? 'calendar-hub-prod',
  });

  return adminApp;
}

export function getDb(): Firestore {
  return getFirestore(getAdminApp());
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}
