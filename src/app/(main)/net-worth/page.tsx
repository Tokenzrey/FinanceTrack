import type { Metadata } from 'next'
import { NetWorthPage } from '@/modules/net-worth/NetWorthPage'

export const metadata: Metadata = { title: 'Kekayaan' }

export default function Page() {
  return <NetWorthPage />
}
