'use client'

import { useCallback, useRef } from 'react'
import { useGoogleLogin } from '@react-oauth/google'
import { getFirebaseAuth } from '@/shared/lib/firebase'
import { DRIVE_SCOPE, DriveError } from '@/shared/lib/gdrive'
import { useGoogleDriveTokenStore } from '@/shared/stores/google-drive.store'

export const isGoogleDriveConfigured = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID)

async function firebaseIdToken(): Promise<string> {
  const user = getFirebaseAuth().currentUser
  if (!user) throw new Error('Sesi berakhir. Masuk ulang lalu coba lagi.')
  return user.getIdToken()
}

/**
 * Drive access, backed by a server-held refresh token (`/api/auth/google-drive/*`) so a
 * linked account never needs a second consent popup — on any device, any tab,
 * indefinitely, until the user unlinks or revokes access at myaccount.google.com.
 *
 * Firebase Auth's own Google sign-in token is a separate grant with no Drive scope and
 * no refresh token of its own, so it cannot be reused for this — the one-time
 * `linkGoogleDrive()` consent (authorization-code flow) is what actually produces the
 * durable grant everything else here reads from.
 */
export function useGoogleDrive() {
  const linked = useGoogleDriveTokenStore((s) => s.linked)
  const linkedEmail = useGoogleDriveTokenStore((s) => s.linkedEmail)
  const authorizing = useGoogleDriveTokenStore((s) => s.authorizing)
  const hasToken = Boolean(useGoogleDriveTokenStore((s) => s.validToken()))

  const pending = useRef<{ resolve: () => void; reject: (error: Error) => void } | null>(null)

  const requestLink = useGoogleLogin({
    flow: 'auth-code',
    scope: `${DRIVE_SCOPE} openid email`,
    // This library's popup code-client has no `prompt`/`access_type` knob — unlike the
    // implicit token client it wraps, the popup code flow always runs a full
    // interactive consent on every call (it never silently re-uses a prior grant), so
    // Google issues a fresh refresh_token on every successful run without needing one.
    onSuccess: async (response) => {
      try {
        const idToken = await firebaseIdToken()
        const res = await fetch('/api/auth/google-drive/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ code: response.code }),
        })
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}))
          throw new DriveError(payload.error ?? 'Gagal menautkan Google Drive.')
        }
        const data = (await res.json()) as { googleEmail: string | null }
        useGoogleDriveTokenStore.getState().setLinked(true, data.googleEmail)
        pending.current?.resolve()
      } catch (error) {
        pending.current?.reject(
          error instanceof Error ? error : new DriveError('Gagal menautkan Google Drive.'),
        )
      } finally {
        pending.current = null
      }
    },
    onError: (error) => {
      pending.current?.reject(
        new DriveError(error.error_description ?? 'Akses Google Drive dibatalkan.'),
      )
      pending.current = null
    },
    onNonOAuthError: () => {
      pending.current?.reject(new DriveError('Jendela izin Google Drive ditutup.'))
      pending.current = null
    },
  })

  /**
   * Interactive — shows Google's consent popup once. Resolves once linked & stored
   * server-side.
   *
   * `useGoogleLogin` is a per-component hook instance, so two components calling this
   * around the same moment (e.g. the receipt uploader and the AI scanner, both unlinked)
   * would otherwise each open their own popup. The shared store's `linkingPromise` makes
   * every caller — regardless of which component started it — join the same one.
   */
  const linkGoogleDrive = useCallback((): Promise<void> => {
    if (!isGoogleDriveConfigured) {
      return Promise.reject(
        new DriveError('Google Drive belum dikonfigurasi. Isi NEXT_PUBLIC_GOOGLE_CLIENT_ID di .env.local.'),
      )
    }

    const store = useGoogleDriveTokenStore.getState()
    if (store.linkingPromise) return store.linkingPromise

    store.setAuthorizing(true)
    const promise = new Promise<void>((resolve, reject) => {
      pending.current = { resolve, reject }
      requestLink()
    }).finally(() => {
      useGoogleDriveTokenStore.getState().setAuthorizing(false)
      useGoogleDriveTokenStore.getState().setLinkingPromise(null)
    })

    store.setLinkingPromise(promise)
    return promise
  }, [requestLink])

  const unlinkGoogleDrive = useCallback(async (): Promise<void> => {
    const idToken = await firebaseIdToken()
    const res = await fetch('/api/auth/google-drive/unlink', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
    })
    if (!res.ok) throw new DriveError('Gagal memutuskan tautan Google Drive.')
    useGoogleDriveTokenStore.getState().clearToken()
    useGoogleDriveTokenStore.getState().setLinked(false, null)
  }, [])

  /** Cheap — just "does a link record exist", no Google API round trip. For status UI. */
  const checkLinkStatus = useCallback(async (): Promise<boolean> => {
    try {
      const idToken = await firebaseIdToken()
      const res = await fetch('/api/auth/google-drive/status', {
        headers: { Authorization: `Bearer ${idToken}` },
      })
      if (!res.ok) return false
      const data = (await res.json()) as { linked: boolean; googleEmail: string | null }
      useGoogleDriveTokenStore.getState().setLinked(data.linked, data.googleEmail)
      return data.linked
    } catch {
      return false
    }
  }, [])

  /** Silent — server mints a fresh access token from the stored refresh token. No popup. */
  const silentToken = useCallback(async (): Promise<string | null> => {
    const idToken = await firebaseIdToken()
    const res = await fetch('/api/auth/google-drive/token', {
      headers: { Authorization: `Bearer ${idToken}` },
    })
    if (!res.ok) return null
    const data = (await res.json()) as
      | { linked: true; accessToken: string; expiresIn: number; googleEmail: string | null }
      | { linked: false }
    if (!data.linked) {
      useGoogleDriveTokenStore.getState().setLinked(false, null)
      return null
    }
    const expiresAt = Date.now() + data.expiresIn * 1000 - 60_000
    useGoogleDriveTokenStore.getState().setToken(data.accessToken, expiresAt)
    useGoogleDriveTokenStore.getState().setLinked(true, data.googleEmail)
    return data.accessToken
  }, [])

  const getToken = useCallback(async (): Promise<string> => {
    const existing = useGoogleDriveTokenStore.getState().validToken()
    if (existing) return existing

    // A caller that already knows the account is unlinked (e.g. a prior status check,
    // or a previous /token call in this session) skips straight to the popup. This
    // matters when `getToken` runs inside a click handler — an extra network round
    // trip first can outlast the "recent user gesture" window some browsers require to
    // allow a popup at all (Safari in particular), silently blocking it. When the
    // status is unknown, the round trip through /token below still doubles as that
    // check, same as before.
    if (useGoogleDriveTokenStore.getState().linked === false) {
      await linkGoogleDrive()
      const afterLink = await silentToken()
      if (afterLink) return afterLink
      throw new DriveError('Gagal mendapatkan akses Google Drive.')
    }

    const fromServer = await silentToken()
    if (fromServer) return fromServer

    // Not linked yet — the one and only popup a user should ever see for Drive.
    await linkGoogleDrive()
    const afterLink = await silentToken()
    if (afterLink) return afterLink
    throw new DriveError('Gagal mendapatkan akses Google Drive.')
  }, [silentToken, linkGoogleDrive])

  /**
   * Runs an action with a valid token, re-authorizing once if Drive rejects the
   * token mid-flight (revoked between issue and use).
   */
  const executeWithToken = useCallback(
    async <T,>(action: (accessToken: string) => Promise<T>): Promise<T> => {
      const token = await getToken()

      try {
        return await action(token)
      } catch (error) {
        const expired =
          error instanceof DriveError && (error.status === 401 || error.status === 403)
        if (!expired) throw error

        useGoogleDriveTokenStore.getState().clearToken()
        return action(await getToken())
      }
    },
    [getToken],
  )

  return {
    executeWithToken,
    linkGoogleDrive,
    unlinkGoogleDrive,
    checkLinkStatus,
    authorizing,
    hasToken,
    isConfigured: isGoogleDriveConfigured,
    linked,
    linkedEmail,
  }
}
