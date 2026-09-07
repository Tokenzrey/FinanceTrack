import type { Metadata } from 'next'
import { PlannerPage } from '@/modules/planner/PlannerPage'

export const metadata: Metadata = { title: 'Tugas' }

export default function Page() {
  return <PlannerPage />
}
