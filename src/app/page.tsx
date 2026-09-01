import { redirect } from 'next/navigation'

/**
 * `/` cannot know auth state server-side (Firebase Auth lives client-side, in
 * IndexedDB — see AuthGuard), so it always redirects to one fixed target. `/login`
 * rather than `/dashboard`: an already-authenticated visitor still lands correctly
 * (the login page itself bounces them straight to `/dashboard`), but a first-time
 * visitor or crawler — the far more common hit on the bare domain root, since the PWA
 * manifest's `start_url` sends installed users straight to `/dashboard` and skips
 * this route entirely — reaches real, indexable content in one hop instead of two.
 */
export default function HomePage() {
  redirect('/login')
}
