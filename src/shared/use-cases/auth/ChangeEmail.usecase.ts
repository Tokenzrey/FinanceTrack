import {
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  verifyBeforeUpdateEmail,
  type User,
} from 'firebase/auth'

/**
 * `verifyBeforeUpdateEmail`, not `updateEmail`: Firebase emails a confirmation link to
 * the NEW address first and only swaps the account email once that link is clicked —
 * a typo or someone else's address can never silently lock the real owner out. The
 * Firestore profile's `email` field is left untouched here; it re-syncs the next time
 * `ensureProfile`/`refreshProfile` runs after the user actually signs in with the new
 * address, since Firebase itself only swaps it once the link is confirmed.
 */
export async function changeEmail(
  user: User,
  newEmail: string,
  currentPassword?: string,
): Promise<void> {
  const isPasswordAccount = user.providerData.some((p) => p.providerId === 'password')

  if (isPasswordAccount) {
    if (!user.email || !currentPassword) throw new Error('Kata sandi saat ini diperlukan.')
    await reauthenticateWithCredential(
      user,
      EmailAuthProvider.credential(user.email, currentPassword),
    )
  } else {
    await reauthenticateWithPopup(user, new GoogleAuthProvider())
  }

  await verifyBeforeUpdateEmail(user, newEmail)
}
