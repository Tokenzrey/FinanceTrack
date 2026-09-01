import type { Metadata } from 'next'
import { SettingsPage } from '@/modules/settings/SettingsPage'

export const metadata: Metadata = { title: 'Pengaturan' }

export default function Page() {
  return <SettingsPage />
}
