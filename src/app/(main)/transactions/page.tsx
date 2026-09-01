import type { Metadata } from 'next'
import { TransactionsPage } from '@/modules/transactions/TransactionsPage'

export const metadata: Metadata = { title: 'Transaksi' }

export default function Page() {
  return <TransactionsPage />
}
