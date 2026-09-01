import type { Metadata } from 'next'
import { ScanHistoryPage } from '@/modules/receipt-scanner/ScanHistoryPage'

export const metadata: Metadata = { title: 'Riwayat Scan' }

export default function Page() {
  return <ScanHistoryPage />
}
