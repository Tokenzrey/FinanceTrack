'use client'

import { create } from 'zustand'

interface GoogleDriveTokenStore {
  token: string | null
  expiresAt: number | null
  /** null = not checked yet this session; false/true once /status or /token has answered. */
  linked: boolean | null
  linkedEmail: string | null
  /** True while a link consent popup is open — shared so every component's button reflects it. */
  authorizing: boolean
  /**
   * The in-flight link popup's promise, if one is open. `useGoogleLogin` is a per-component
   * hook instance (it needs React/GIS context), so without this, two components calling
   * `getToken()` around the same moment — e.g. the receipt uploader and the AI scanner —
   * would each open their own consent popup instead of sharing one. Any caller joins this
   * promise instead of starting a second popup.
   */
  linkingPromise: Promise<void> | null
  setToken: (token: string, expiresAt: number) => void
  clearToken: () => void
  setLinked: (linked: boolean, email: string | null) => void
  setAuthorizing: (authorizing: boolean) => void
  setLinkingPromise: (promise: Promise<void> | null) => void
  /** The current token, or null if missing/expired — never triggers acquisition. */
  validToken: () => string | null
}

/**
 * Shared Drive access token, held in memory only (never localStorage — a Drive token in
 * storage is readable by any XSS on the page and would outlive the tab).
 *
 * This is a store, not a per-component ref, so every call site — the receipt uploader,
 * the AI scanner, the receipt viewer, exports — shares one acquired token. Before this
 * was centralised, each `useGoogleDrive()` call held its own ref, so authorizing once
 * while uploading a receipt did not stop the scanner from popping the consent window
 * again moments later for the same user.
 *
 * `linked`/`linkedEmail` mirror the server-held refresh-token record (see
 * `/api/auth/google-drive/*`) so Settings and every Drive-using screen can show the
 * same status without each polling Firestore separately.
 */
export const useGoogleDriveTokenStore = create<GoogleDriveTokenStore>((set, get) => ({
  token: null,
  expiresAt: null,
  linked: null,
  linkedEmail: null,
  authorizing: false,
  linkingPromise: null,
  setToken: (token, expiresAt) => set({ token, expiresAt }),
  clearToken: () => set({ token: null, expiresAt: null }),
  setLinked: (linked, linkedEmail) => set({ linked, linkedEmail }),
  setAuthorizing: (authorizing) => set({ authorizing }),
  setLinkingPromise: (linkingPromise) => set({ linkingPromise }),
  validToken: () => {
    const { token, expiresAt } = get()
    return token && expiresAt && expiresAt > Date.now() ? token : null
  },
}))
