import { NextResponse } from 'next/server'

/**
 * Security headers only — this is deliberately NOT an auth guard.
 *
 * Firebase Auth keeps its session in IndexedDB, which Edge Middleware cannot read, so a
 * real "is this user signed in" check cannot live here (see `AuthGuard.tsx`, which does
 * that client-side, backed by Firestore security rules as the actual access boundary).
 * What middleware CAN do safely and universally is attach headers to every response —
 * that is the entire scope of this file.
 *
 * The CSP allow-list matches exactly what the app calls from the browser: Firebase
 * (auth/firestore over its own domains), Google Identity Services + Drive (OAuth +
 * upload), and the app's own `/api/*` proxy routes for Gemini/market data — those two
 * never need client-side CSP entries because the browser only ever talks to same-origin
 * `/api/...`, not to generativelanguage.googleapis.com or frankfurter.app directly.
 */
export function middleware() {
  const response = NextResponse.next()

  const csp = [
    "default-src 'self'",
    // Next.js dev/build output needs inline+eval; Google Identity Services injects inline script too.
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://apis.google.com",
    "style-src 'self' 'unsafe-inline' https://accounts.google.com",
    "img-src 'self' data: blob: https://*.googleusercontent.com https://drive.google.com https://lh3.googleusercontent.com",
    "font-src 'self' data:",
    "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebase.com wss://*.firebaseio.com wss://firestore.googleapis.com https://accounts.google.com https://www.googleapis.com https://content.googleapis.com ws://localhost:* ws://127.0.0.1:*",
    "frame-src 'self' https://accounts.google.com https://*.firebaseapp.com",
    "object-src data:",
    "base-uri 'self'",
  ].join('; ')

  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups')
  response.headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()')

  return response
}

export const config = {
  // Skip static assets and Next internals — they never need these headers re-computed.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon-.*\\.png).*)'],
}
