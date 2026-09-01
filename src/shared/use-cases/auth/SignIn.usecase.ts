import { signInWithEmailAndPassword, signInWithPopup, type UserCredential } from 'firebase/auth'
import { getFirebaseAuth, getGoogleProvider } from '@/shared/lib/firebase'

export async function signInWithEmail(email: string, password: string): Promise<UserCredential> {
  return signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password)
}

export async function signInWithGoogle(): Promise<UserCredential> {
  return signInWithPopup(getFirebaseAuth(), getGoogleProvider())
}
