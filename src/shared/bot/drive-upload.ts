import { getAdminDb } from '@/shared/lib/firebase-admin'
import { decryptSecret } from '@/shared/lib/token-crypto'
import { getOrCreateFinTrackFolders, uploadFileToGDrive } from '@/shared/lib/gdrive'

/**
 * Uploads a bot-received receipt photo to the user's own Drive — entirely
 * server-side, no browser, no popup. This is exactly what the server-held refresh
 * token (built earlier for the web app's "never reauth again" Drive flow) was for:
 * a linked user's Drive access works from anywhere that can prove it's acting on
 * their behalf, and the bot (already looked up the user via a verified chat link)
 * qualifies.
 *
 * Reads `users/{userId}/meta/googleDriveLink` via the Admin SDK directly rather than
 * the REST-plus-ID-token dance `/api/auth/google-drive/token` uses — Admin SDK is
 * exactly the credential meant to read this without a user session, and there is
 * none here. `decryptSecret` and `uploadFileToGDrive` are reused unchanged.
 */

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

interface DriveLinkDoc {
  enc: string
}

export interface UploadedReceipt {
  gDriveFileId: string
  gDriveWebViewLink: string
}

async function mintAccessToken(userId: string): Promise<string | null> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  const linkRef = getAdminDb().doc(`users/${userId}/meta/googleDriveLink`)
  const snap = await linkRef.get()
  if (!snap.exists) return null

  const doc = snap.data() as Partial<DriveLinkDoc>
  if (!doc.enc) return null

  let refreshToken: string
  try {
    refreshToken = decryptSecret(doc.enc)
  } catch {
    // Corrupt or undecryptable (e.g. TOKEN_ENCRYPTION_KEY rotated) — self-heal the
    // same way the web token-mint route does: delete the dead record.
    await linkRef.delete().catch(() => {})
    return null
  }

  const tokenRes = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!tokenRes.ok) {
    // invalid_grant — the user revoked access from myaccount.google.com directly.
    await linkRef.delete().catch(() => {})
    return null
  }

  const data = (await tokenRes.json()) as { access_token: string }
  return data.access_token
}

/**
 * Returns `null` (never throws) when the user hasn't linked Drive, or the link has
 * gone dead — the caller's job is to still record the transaction either way, just
 * without a receipt attached.
 */
export async function uploadReceiptForUser(
  userId: string,
  file: Blob,
  filename: string,
): Promise<UploadedReceipt | null> {
  try {
    const accessToken = await mintAccessToken(userId)
    if (!accessToken) return null

    const { receiptsId } = await getOrCreateFinTrackFolders(accessToken)
    const uploaded = await uploadFileToGDrive(file, filename, receiptsId, accessToken)
    return { gDriveFileId: uploaded.fileId, gDriveWebViewLink: uploaded.webViewLink }
  } catch (error) {
    console.error('uploadReceiptForUser error:', error)
    return null
  }
}
