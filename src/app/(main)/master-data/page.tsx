import type { Metadata } from 'next'
import { MasterDataPage } from '@/modules/master-data/MasterDataPage'

export const metadata: Metadata = { title: 'Master Data' }

export default function Page() {
  return <MasterDataPage />
}
