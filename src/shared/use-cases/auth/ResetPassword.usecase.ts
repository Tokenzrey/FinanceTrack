import { sendPasswordResetEmail } from 'firebase/auth'
import { getFirebaseAuth } from '@/shared/lib/firebase'

export async function resetPassword(email: string): Promise<void> {
  return sendPasswordResetEmail(getFirebaseAuth(), email.trim())
}
