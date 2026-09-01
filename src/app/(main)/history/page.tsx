import type { Metadata } from 'next'
import { HistoryPage } from '@/modules/history/HistoryPage'

export const metadata: Metadata = { title: 'Riwayat' }

export default function Page() {
  return <HistoryPage />
}
