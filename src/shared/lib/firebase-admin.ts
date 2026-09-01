import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

/**
 * Firebase Admin SDK — server-only, used exclusively by the bot webhook subsystem
 * (`src/shared/bot/*`). This is a deliberate, scoped exception to the rest of the
 * app's Admin-SDK-free architecture (see `verify-firebase-token.ts`): every other
 * server route works because the request carries a Firebase ID token from a logged-in
 * browser. A webhook from Telegram/Meta carries no such thing — there is no user
 * session to forward, so the REST-plus-ID-token pattern used everywhere else in this
 * app structurally cannot apply here. Full reasoning in
 * `implementation_bot_integration.md` §6.
 *
 * Never import this from a Client Component — `firebase-admin` uses Node-only APIs
 * and will break the browser build.
 */

let app: App | null = null
let db: Firestore | null = null

function getAdminApp(): App {
  if (app) return app
  if (getApps().length > 0) {
    app = getApps()[0]
    return app
  }

  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase Admin belum dikonfigurasi. Isi FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, ' +
        'dan FIREBASE_PRIVATE_KEY di .env.local (lihat implementation_bot_integration.md §8).',
    )
  }

  app = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      // Env vars store the key with literal "\n" sequences, not real newlines.
      privateKey: privateKey.replace(/\\n/g, '\n'),
    }),
  })
  return app
}

export function getAdminDb(): Firestore {
  db ??= getFirestore(getAdminApp())
  return db
}
