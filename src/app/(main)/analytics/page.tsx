import type { Metadata } from 'next'
import { AnalyticsPage } from '@/modules/analytics/AnalyticsPage'

export const metadata: Metadata = { title: 'Analitik' }

export default function Page() {
  return <AnalyticsPage />
}
