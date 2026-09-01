import { FirebaseError } from 'firebase/app'

/**
 * Firebase throws English codes like `auth/invalid-credential`. The UI is Indonesian,
 * and raw codes tell the user nothing actionable, so map the ones a user can actually hit.
 */
const MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'Format email tidak valid.',
  'auth/user-disabled': 'Akun ini dinonaktifkan. Hubungi dukungan.',
  'auth/user-not-found': 'Email belum terdaftar.',
  'auth/wrong-password': 'Kata sandi salah.',
  'auth/invalid-credential': 'Email atau kata sandi salah.',
  'auth/email-already-in-use': 'Email sudah terdaftar. Coba masuk.',
  'auth/weak-password': 'Kata sandi minimal 6 karakter.',
  'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.',
  'auth/network-request-failed': 'Koneksi bermasalah. Periksa internet lalu coba lagi.',
  'auth/popup-closed-by-user': 'Jendela Google ditutup sebelum selesai.',
  'auth/popup-blocked': 'Popup diblokir browser. Izinkan popup lalu coba lagi.',
  'auth/cancelled-popup-request': 'Permintaan masuk sebelumnya dibatalkan.',
  'auth/account-exists-with-different-credential':
    'Email ini sudah terdaftar dengan metode masuk lain.',
  'auth/operation-not-allowed': 'Metode masuk ini belum diaktifkan di Firebase Console.',
  'auth/invalid-api-key': 'Konfigurasi Firebase tidak valid. Periksa .env.local.',
  'auth/requires-recent-login': 'Sesi terlalu lama. Masukkan kata sandi saat ini lalu coba lagi.',
  'auth/email-already-exists': 'Email sudah dipakai akun lain.',
}

export function authErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    return MESSAGES[error.code] ?? `Terjadi kesalahan (${error.code}).`
  }
  if (error instanceof Error && error.message) return error.message
  return 'Terjadi kesalahan tak terduga. Coba lagi.'
}
