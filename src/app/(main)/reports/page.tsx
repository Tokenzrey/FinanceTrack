import type { Metadata } from 'next'
import { ReportsPage } from '@/modules/reports/ReportsPage'

export const metadata: Metadata = { title: 'Laporan' }

export default function Page() {
  return <ReportsPage />
}
