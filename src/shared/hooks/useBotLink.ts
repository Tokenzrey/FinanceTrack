'use client'

import { useCallback, useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { getDb, getFirebaseAuth } from '@/shared/lib/firebase'
import type { BotPlatform } from '@/shared/bot/types'

interface BotLinkEntry {
  externalId: string
  displayName: string | null
}

type BotLinkStatus = Record<BotPlatform, BotLinkEntry | null>

const EMPTY_STATUS: BotLinkStatus = { telegram: null, whatsapp: null }

async function firebaseIdToken(): Promise<string> {
  const user = getFirebaseAuth().currentUser
  if (!user) throw new Error('Sesi berakhir. Masuk ulang lalu coba lagi.')
  return user.getIdToken()
}

/**
 * Link status comes straight from `users/{uid}/meta/botLinks` via `onSnapshot` — the
 * same doc the bot's Admin SDK writes to on link/unlink (see `firestore.rules`: the
 * client can read it, never write it). Actions (`createCode`/`unlink`) go through
 * `/api/bot/link-code`, the only path allowed to touch the doc.
 */
export function useBotLink(userId: string | undefined) {
  const [status, setStatus] = useState<BotLinkStatus>(EMPTY_STATUS)
  const [creating, setCreating] = useState(false)
  const [unlinking, setUnlinking] = useState<BotPlatform | null>(null)

  useEffect(() => {
    if (!userId) {
      setStatus(EMPTY_STATUS)
      return
    }
    const ref = doc(getDb(), 'users', userId, 'meta', 'botLinks')
    return onSnapshot(ref, (snap) => {
      const data = snap.data() as Partial<BotLinkStatus> | undefined
      setStatus({ telegram: data?.telegram ?? null, whatsapp: data?.whatsapp ?? null })
    })
  }, [userId])

  const createCode = useCallback(async (): Promise<{ code: string; expiresAt: Date }> => {
    setCreating(true)
    try {
      const idToken = await firebaseIdToken()
      const res = await fetch('/api/bot/link-code', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      })
      if (!res.ok) throw new Error('Gagal membuat kode. Coba lagi.')
      const data = (await res.json()) as { code: string; expiresAt: string }
      return { code: data.code, expiresAt: new Date(data.expiresAt) }
    } finally {
      setCreating(false)
    }
  }, [])

  const unlink = useCallback(async (platform: BotPlatform): Promise<void> => {
    setUnlinking(platform)
    try {
      const idToken = await firebaseIdToken()
      const res = await fetch(`/api/bot/link-code?platform=${platform}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${idToken}` },
      })
      if (!res.ok) throw new Error('Gagal memutuskan tautan. Coba lagi.')
    } finally {
      setUnlinking(null)
    }
  }, [])

  return { status, creating, unlinking, createCode, unlink }
}
