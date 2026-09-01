/** Short vibration on a successful save — feature-detected, silent no-op elsewhere (desktop, iOS Safari). */
export function hapticSuccess(): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return
  try {
    navigator.vibrate(15)
  } catch {
    // Some browsers throw when called outside a user gesture; never let this break a save.
  }
}
