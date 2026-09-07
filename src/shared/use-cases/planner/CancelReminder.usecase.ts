import { repositories } from '@/shared/repositories'

/** Cancels a pending reminder (`status:'cancelled'` — the only client-allowed transition). */
export async function cancelReminder(userId: string, id: string): Promise<void> {
  return repositories.reminders.cancel(userId, id)
}
