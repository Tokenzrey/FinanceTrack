/**
 * Browser notifications.
 *
 * These fire only while a tab is open — there is no service-worker push and no server,
 * so a "daily reminder" reaches the user only if the app happens to be running. The
 * Settings copy says so rather than implying a reminder that will not arrive.
 */

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false

  const result = await Notification.requestPermission()
  return result === 'granted'
}

export function showNotification(title: string, body?: string, tag?: string): void {
  if (!notificationsSupported() || Notification.permission !== 'granted') return

  // `tag` collapses repeats: the same budget alert should not stack up all afternoon.
  new Notification(title, { body, tag, icon: '/icon-192.png' })
}

/** Fires the daily reminder once per calendar day, at or after the configured time. */
export function maybeDailyReminder(reminderTime: string, lastShownKey = 'fintrack-reminder'): void {
  if (!notificationsSupported() || Notification.permission !== 'granted') return

  const [hour, minute] = reminderTime.split(':').map(Number)
  const now = new Date()
  if (now.getHours() < hour || (now.getHours() === hour && now.getMinutes() < minute)) return

  const today = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`

  try {
    if (localStorage.getItem(lastShownKey) === today) return
    localStorage.setItem(lastShownKey, today)
  } catch {
    // Private mode or blocked storage: show it rather than suppress it.
  }

  showNotification('Catat pengeluaran hari ini', 'Sisihkan 30 detik untuk mencatat.', 'daily')
}
