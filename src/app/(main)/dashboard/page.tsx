import type { Metadata } from 'next'
import { DashboardPage } from '@/modules/dashboard/DashboardPage'

export const metadata: Metadata = { title: 'Dasbor' }

export default function Page() {
  return <DashboardPage />
}
