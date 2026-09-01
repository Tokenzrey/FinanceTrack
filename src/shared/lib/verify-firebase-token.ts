import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from 'jose'

/**
 * Verifies a Firebase ID token server-side.
 *
 * The plan called for the Firebase Admin SDK, which needs a service-account key the
 * project does not have. Firebase ID tokens are ordinary RS256 JWTs signed by Google,
 * so they can be verified against Google's published public keys instead — same
 * guarantee, no extra secret to store.
 *
 * Checks performed (all of them are required — dropping any one makes the check useless):
 *   - RS256 signature against Google's current signing keys
 *   - issuer  === https://securetoken.google.com/{projectId}
 *   - audience === {projectId}
 *   - exp / iat, with no clock tolerance beyond a small skew
 *   - a non-empty subject (the uid)
 */

const CERT_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'

// Google rotates these keys roughly daily; cache them but never past the rotation window.
const CACHE_TTL_MS = 60 * 60 * 1000

let cachedKeys: { keys: JSONWebKeySet; fetchedAt: number } | null = null

async function getSigningKeys(): Promise<JSONWebKeySet> {
  if (cachedKeys && Date.now() - cachedKeys.fetchedAt < CACHE_TTL_MS) {
    return cachedKeys.keys
  }

  const response = await fetch(CERT_URL, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Gagal mengambil kunci verifikasi Firebase (${response.status})`)
  }

  const keys = (await response.json()) as JSONWebKeySet
  cachedKeys = { keys, fetchedAt: Date.now() }
  return keys
}

export interface VerifiedUser {
  uid: string
  email?: string
}

export async function verifyFirebaseIdToken(token: string): Promise<VerifiedUser> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  if (!projectId) {
    throw new Error('NEXT_PUBLIC_FIREBASE_PROJECT_ID belum diset')
  }

  const jwks = createLocalJWKSet(await getSigningKeys())

  const { payload } = await jwtVerify(token, jwks, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    algorithms: ['RS256'],
    clockTolerance: 60,
  })

  const uid = typeof payload.sub === 'string' ? payload.sub : ''
  if (!uid) throw new Error('Token tidak memuat uid')

  return { uid, email: typeof payload.email === 'string' ? payload.email : undefined }
}
