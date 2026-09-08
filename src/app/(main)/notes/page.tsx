import type { Metadata } from 'next'
import { NotesPage } from '@/modules/notes/NotesPage'

export const metadata: Metadata = { title: 'Catatan' }

export default function Page() {
  return <NotesPage />
}
