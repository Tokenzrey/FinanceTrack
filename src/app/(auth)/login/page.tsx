import type { Metadata } from 'next'
import { LoginView } from './LoginView'

export const metadata: Metadata = {
  title: 'Masuk',
  description:
    'Masuk ke akun FinTrack untuk mengelola anggaran, mencatat transaksi, dan memantau target tabunganmu.',
  alternates: { canonical: '/login' },
}

export default function LoginPage() {
  return <LoginView />
}
