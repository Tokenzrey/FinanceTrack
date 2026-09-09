import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getAdminDb } from '@/shared/lib/firebase-admin'

/**
 * WhatsApp has no inline-button message type, but GOWA *does* support native
 * polls end to end: `/send/poll` to create, and a decrypted `poll` webhook when
 * someone votes. We use a single-answer poll as a button substitute for reminder
 * actions (Selesai / +15 mnt / +1 jam).
 *
 * The vote webhook only tells us the option **label** the user picked, not any
 * hidden payload — so when the poll goes out we stash `label -> command token`
 * here, keyed by the poll's message id, and look it back up on the vote. The doc
 * self-expires after a day; a poll acted on later than that just falls through to
 * the normal text handler (the token is also a valid typed command).
 */

const COLLECTION = 'bot_poll_map'
const TTL_MS = 24 * 60 * 60 * 1000

interface PollMapDoc {
  /** Option label (exactly as WhatsApp echoes it) → command token. */
  options: Record<string, string>
  expiresAt: Timestamp
}

/** Record the label→token mapping for a poll we just sent. */
export async function rememberPoll(
  pollId: string,
  options: { label: string; token: string }[],
): Promise<void> {
  const map: Record<string, string> = {}
  for (const o of options) map[o.label] = o.token

  await getAdminDb()
    .collection(COLLECTION)
    .doc(pollId)
    .set({
      options: map,
      expiresAt: Timestamp.fromMillis(Date.now() + TTL_MS),
      createdAt: FieldValue.serverTimestamp(),
    })
}

/**
 * Resolve a poll vote back to its command token. Returns `null` when the poll is
 * unknown or expired, or the label was not one we set — the caller then treats
 * the label as plain text.
 */
export async function resolvePollVote(pollId: string, label: string): Promise<string | null> {
  if (!pollId || !label) return null
  const snap = await getAdminDb().collection(COLLECTION).doc(pollId).get()
  if (!snap.exists) return null

  const data = snap.data() as PollMapDoc
  if (data.expiresAt.toMillis() < Date.now()) return null

  return data.options?.[label] ?? null
}
