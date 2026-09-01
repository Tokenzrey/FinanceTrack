import { createUserWithEmailAndPassword, updateProfile, type User } from 'firebase/auth'
import { getFirebaseAuth } from '@/shared/lib/firebase'
import { repositories } from '@/shared/repositories'

/**
 * Creates the Firebase Auth user *and* the Firestore profile document.
 * The profile is what onboarding and every later screen read, so both must exist
 * before the caller redirects — a user without a profile lands on a broken dashboard.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string,
): Promise<User> {
  const credential = await createUserWithEmailAndPassword(getFirebaseAuth(), email.trim(), password)
  const user = credential.user

  await updateProfile(user, { displayName })
  await ensureProfile(user, displayName)

  return user
}

/** Idempotent — safe to call on every sign-in, including the first Google sign-in. */
export async function ensureProfile(user: User, displayName?: string): Promise<void> {
  const existing = await repositories.users.findProfile(user.uid)
  if (existing) return

  await repositories.users.createProfile(user.uid, {
    uid: user.uid,
    displayName: displayName ?? user.displayName ?? user.email?.split('@')[0] ?? 'Pengguna',
    email: user.email ?? '',
    photoURL: user.photoURL ?? undefined,
    currency: 'IDR',
    locale: 'id-ID',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jakarta',
    onboardingCompleted: false,
  })
}
