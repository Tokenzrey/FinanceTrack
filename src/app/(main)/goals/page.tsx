import type { Metadata } from 'next'
import { GoalsPage } from '@/modules/goals/GoalsPage'

export const metadata: Metadata = { title: 'Target' }

export default function Page() {
  return <GoalsPage />
}
