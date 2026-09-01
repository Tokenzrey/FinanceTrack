/**
 * Minimal Firestore REST client for one fixed document shape: the Google Drive link
 * record at `users/{uid}/meta/googleDriveLink`.
 *
 * This project deliberately has no Firebase Admin SDK (see `verify-firebase-token.ts`).
 * The Firestore REST API accepts a Firebase Auth ID token as its bearer credential and
 * enforces the exact same security rules a client SDK call would — so a server route
 * that already verified the caller's ID token can read/write that same user's document
 * by simply forwarding that token, with no separate service-account credential needed.
 */

const projectId = () => {
  const id = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  if (!id) throw new Error('NEXT_PUBLIC_FIREBASE_PROJECT_ID belum diset')
  return id
}

const docUrl = (uid: string) =>
  `https://firestore.googleapis.com/v1/projects/${projectId()}/databases/(default)/documents/users/${uid}/meta/googleDriveLink`

export interface DriveLinkDoc {
  enc: string
  googleEmail: string | null
  scope: string
  linkedAt: string
}

export async function getDriveLinkDoc(uid: string, idToken: string): Promise<DriveLinkDoc | null> {
  const response = await fetch(docUrl(uid), {
    headers: { Authorization: `Bearer ${idToken}` },
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Firestore GET gagal (${response.status})`)

  const data = (await response.json()) as { fields?: Record<string, { stringValue?: string }> }
  const fields = data.fields ?? {}
  const enc = fields.enc?.stringValue
  const linkedAt = fields.linkedAt?.stringValue
  if (!enc || !linkedAt) return null

  return {
    enc,
    googleEmail: fields.googleEmail?.stringValue ?? null,
    scope: fields.scope?.stringValue ?? '',
    linkedAt,
  }
}

export async function setDriveLinkDoc(
  uid: string,
  idToken: string,
  doc: DriveLinkDoc,
): Promise<void> {
  const fields: Record<string, { stringValue: string }> = {
    enc: { stringValue: doc.enc },
    scope: { stringValue: doc.scope },
    linkedAt: { stringValue: doc.linkedAt },
  }
  if (doc.googleEmail) fields.googleEmail = { stringValue: doc.googleEmail }

  // No updateMask: this doc has no other fields, so a full-field PATCH is a clean overwrite.
  const response = await fetch(docUrl(uid), {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Firestore PATCH gagal (${response.status}). ${detail.slice(0, 200)}`)
  }
}

export async function deleteDriveLinkDoc(uid: string, idToken: string): Promise<void> {
  const response = await fetch(docUrl(uid), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${idToken}` },
  })
  // 404 means already gone — that's the desired end state, not a failure.
  if (!response.ok && response.status !== 404) {
    throw new Error(`Firestore DELETE gagal (${response.status})`)
  }
}
