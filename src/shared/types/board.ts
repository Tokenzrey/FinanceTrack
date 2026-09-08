import type { Timestamp } from 'firebase/firestore'

export interface ChecklistItem {
  id: string
  title: string
  done: boolean
  order: number
}

export interface Attachment {
  id: string
  type: 'link'
  url: string
  name: string
  addedAt: Timestamp
}

export interface BoardList {
  id: string
  title: string // 1..40
  order: number // fractional rank
  mapsToStatus: 'todo' | 'doing' | 'done' // TaskStatus
  wipLimit: number | null
  isCollapsed: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface Label {
  id: string
  name: string // 1..24
  colorKey: LabelColorKey
  order: number
  createdAt: Timestamp
}

export type LabelColorKey = 'slate' | 'teal' | 'blue' | 'violet' | 'pink' | 'red' | 'orange' | 'green'

// Curated Tailwind color pairs (light/dark) for label strips/chips.
// Chosen for AA-contrast text-on-fill in both themes; no free hex values.
export const LABEL_COLORS: Record<LabelColorKey, { light: string; dark: string }> = {
  slate: { light: 'bg-slate-100 text-slate-900', dark: 'bg-slate-800 text-slate-100' },
  teal: { light: 'bg-teal-100 text-teal-900', dark: 'bg-teal-900 text-teal-100' },
  blue: { light: 'bg-blue-100 text-blue-900', dark: 'bg-blue-900 text-blue-100' },
  violet: { light: 'bg-violet-100 text-violet-900', dark: 'bg-violet-900 text-violet-100' },
  pink: { light: 'bg-pink-100 text-pink-900', dark: 'bg-pink-900 text-pink-100' },
  red: { light: 'bg-red-100 text-red-900', dark: 'bg-red-900 text-red-100' },
  orange: { light: 'bg-orange-100 text-orange-900', dark: 'bg-orange-900 text-orange-100' },
  green: { light: 'bg-green-100 text-green-900', dark: 'bg-green-900 text-green-100' },
}
