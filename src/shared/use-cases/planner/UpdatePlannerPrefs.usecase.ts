import { getFirebaseAuth } from '@/shared/lib/firebase'

export interface PlannerPrefsPayload {
  digestHour: number
  digestEnabled: boolean
  taskLeadsMinutes: number[]
}

/**
 * Sends the digest / task-reminder prefs to `/api/planner/prefs`, the only path allowed
 * to write `users/{uid}/meta/plannerPrefs` and the `bot_meta/digestRoster` line (both via
 * the Admin SDK). Bearer auth mirrors `useBotLink` → `/api/bot/link-code`.
 */
export async function updatePlannerPrefs(payload: PlannerPrefsPayload): Promise<void> {
  const user = getFirebaseAuth().currentUser
  if (!user) throw new Error('Belum masuk.')
  const token = await user.getIdToken()

  const res = await fetch('/api/planner/prefs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const msg = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(msg?.error ?? 'Gagal menyimpan preferensi.')
  }
}
