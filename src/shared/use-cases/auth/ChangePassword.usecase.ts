import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, type User } from 'firebase/auth'

/**
 * Firebase requires a recent sign-in before a sensitive change like a password swap —
 * `reauthenticateWithCredential` re-proves the current password first so a stale
 * session (e.g. a shared/borrowed device) can't silently change it.
 */
export async function changePassword(
  user: User,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (!user.email) throw new Error('Akun ini tidak memakai email/kata sandi.')
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword))
  await updatePassword(user, newPassword)
}
