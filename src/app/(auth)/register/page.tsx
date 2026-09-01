import type { Metadata } from 'next'
import { RegisterView } from './RegisterView'

export const metadata: Metadata = {
  title: 'Daftar',
  description:
    'Buat akun FinTrack gratis — mulai kelola anggaran bulanan dan catat transaksi keuanganmu dalam Rupiah.',
  alternates: { canonical: '/register' },
}

export default function RegisterPage() {
  return <RegisterView />
}
