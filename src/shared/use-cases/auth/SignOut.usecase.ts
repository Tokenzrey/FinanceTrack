import { signOut as fbSignOut } from 'firebase/auth'
import { getFirebaseAuth } from '@/shared/lib/firebase'

export async function signOut(): Promise<void> {
  return fbSignOut(getFirebaseAuth())
}
