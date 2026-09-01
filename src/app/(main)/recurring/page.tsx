import type { Metadata } from 'next'
import { RecurringPage } from '@/modules/recurring/RecurringPage'

export const metadata: Metadata = { title: 'Berulang' }

export default function Page() {
  return <RecurringPage />
}
