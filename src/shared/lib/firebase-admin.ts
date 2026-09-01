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

/**
 * Env-var private keys arrive mangled in ways that vary by *where* they were set, not
 * just how they were copied:
 * - literal `\n` two-char escapes instead of real newlines (how `.env` files store a
 *   multi-line value on one line) — always need converting back.
 * - a wrapping `"..."` pair, if the `.env`-style quoted value was pasted verbatim into
 *   a platform's raw env var box instead of just the inner value.
 * - stray `\r` (CRLF): `.env.local` is parsed by a line-based reader that strips `\r`
 *   as a side effect of splitting lines, but a platform's env var UI stores pasted text
 *   completely verbatim — a value copied from a Windows-saved file can carry `\r\n`
 *   through to production even though it looks identical locally. OpenSSL's PEM
 *   decoder can reject a CRLF-embedded key outright (`ERR_OSSL_UNSUPPORTED`).
 * Normalizing here means the app works regardless of which platform/paste-path set the
 * var, instead of relying on every future re-paste being byte-perfect.
 */
function normalizePrivateKey(raw: string): string {
  let key = raw.trim()
  if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1)
  return key.replace(/\\n/g, '\n').replace(/\r\n/g, '\n')
}

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
      privateKey: normalizePrivateKey(privateKey),
    }),
  })
  return app
}

export function getAdminDb(): Firestore {
  db ??= getFirestore(getAdminApp())
  return db
}
