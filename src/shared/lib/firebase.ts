import { getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'
import { getStorage, type FirebaseStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

/** False when .env.local has not been filled in — the UI shows a setup notice instead of crashing. */
export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)

/**
 * Everything below initializes lazily, on first use.
 *
 * Eager `getAuth()` at module scope runs during `next build` prerendering, where it
 * throws `auth/invalid-api-key` before a single page renders. Deferring means the SDK
 * only ever starts in the browser, after the config check has passed.
 */
function requireConfig() {
  if (!isFirebaseConfigured) {
    throw new Error(
      'Firebase belum dikonfigurasi. Isi NEXT_PUBLIC_FIREBASE_* di .env.local lalu jalankan ulang server.',
    )
  }
}

let appInstance: FirebaseApp | null = null
let dbInstance: Firestore | null = null
let authInstance: Auth | null = null
let storageInstance: FirebaseStorage | null = null
let googleProviderInstance: GoogleAuthProvider | null = null

export function getFirebaseApp(): FirebaseApp {
  requireConfig()
  appInstance ??= getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
  return appInstance
}

/**
 * Firestore with an offline-first IndexedDB cache. `persistentLocalCache` replaces the
 * deprecated `enableIndexedDbPersistence`; the multi-tab manager keeps open tabs in sync.
 * On the server there is no IndexedDB, so the default memory cache is used.
 */
export function getDb(): Firestore {
  if (!dbInstance) {
    const app = getFirebaseApp()
    dbInstance =
      typeof window === 'undefined'
        ? initializeFirestore(app, {})
        : initializeFirestore(app, {
            localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
          })
  }
  return dbInstance
}

export function getFirebaseAuth(): Auth {
  authInstance ??= getAuth(getFirebaseApp())
  return authInstance
}

export function getFirebaseStorage(): FirebaseStorage {
  storageInstance ??= getStorage(getFirebaseApp())
  return storageInstance
}

export function getGoogleProvider(): GoogleAuthProvider {
  if (!googleProviderInstance) {
    googleProviderInstance = new GoogleAuthProvider()
    googleProviderInstance.setCustomParameters({ prompt: 'select_account' })
  }
  return googleProviderInstance
}
