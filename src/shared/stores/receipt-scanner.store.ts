'use client'

import { create } from 'zustand'
import { repositories } from '@/shared/repositories'
import {
  ScanUnavailableError,
  scanReceipt,
  type ScanStage,
} from '@/shared/use-cases/receipt-scanner/ScanReceipt.usecase'
import {
  discardScan,
  saveScanAsTransactions,
} from '@/shared/use-cases/receipt-scanner/SaveScanAsTransactions.usecase'
import { learnFromCorrections } from '@/shared/use-cases/receipt-scanner/LearnFromCorrections.usecase'
import type {
  ReceiptScanRecord,
  SaveScanAsTransactionsDTO,
  ScanMode,
} from '@/shared/types/receipt-scanner.types'
import { useAuthStore } from './auth.store'
import { useGoogleDriveTokenStore } from './google-drive.store'
import { useMasterDataStore } from './master-data.store'

/** idle → scanning → reviewing → saved, with `failed` reachable from scanning. */
export type ScannerPhase = 'idle' | 'scanning' | 'reviewing' | 'failed'

interface ScannerStore {
  phase: ScannerPhase
  stage: ScanStage | null
  record: ReceiptScanRecord | null
  mode: ScanMode
  error: string | null
  /** Set when the AI failed but the photo did upload, so a retry needs no new photo. */
  salvagedImageUrl: string | null
  history: ReceiptScanRecord[]
  historyLoading: boolean

  open: () => void
  reset: () => void
  setMode: (mode: ScanMode) => void
  /** `execute` comes from useGoogleDrive — it owns acquiring and refreshing the token. */
  scan: (
    file: File,
    execute: <T>(action: (accessToken: string) => Promise<T>) => Promise<T>,
  ) => Promise<void>
  save: (
    dto: Omit<SaveScanAsTransactionsDTO, 'scanId'>,
    reviewed: { name: string; categoryId: string | null }[],
  ) => Promise<string[]>
  discard: () => Promise<void>
  loadHistory: () => Promise<void>
}

function currentUserId(): string | null {
  return useAuthStore.getState().user?.uid ?? null
}

export const useScannerStore = create<ScannerStore>((set, get) => ({
  phase: 'idle',
  stage: null,
  record: null,
  mode: 'single',
  error: null,
  salvagedImageUrl: null,
  history: [],
  historyLoading: false,

  open: () =>
    set({ phase: 'idle', stage: null, record: null, error: null, salvagedImageUrl: null }),

  reset: () =>
    set({
      phase: 'idle',
      stage: null,
      record: null,
      error: null,
      salvagedImageUrl: null,
      mode: 'single',
    }),

  setMode: (mode) => set({ mode }),

  scan: async (file, execute) => {
    const userId = currentUserId()
    if (!userId) {
      set({ phase: 'failed', error: 'Belum masuk.' })
      return
    }

    set({ phase: 'scanning', stage: 'compressing', error: null, salvagedImageUrl: null })

    try {
      const categories = useMasterDataStore.getState().categories
      const record = await execute((accessToken) =>
        scanReceipt(userId, accessToken, file, categories, {
          onStage: (stage: ScanStage) => set({ stage }),
        }),
      )

      // More than one line item means itemised review is the more useful default.
      set({
        record,
        phase: 'reviewing',
        stage: 'done',
        mode: record.scanResult.mappedItems.length > 1 ? 'itemized' : 'single',
      })
    } catch (error) {
      if (error instanceof ScanUnavailableError) {
        set({ phase: 'failed', error: error.message, salvagedImageUrl: error.imageUrl })
        return
      }
      set({
        phase: 'failed',
        error: error instanceof Error ? error.message : 'Gagal memindai struk.',
      })
    }
  },

  save: async (dto, reviewed) => {
    const userId = currentUserId()
    const record = get().record
    if (!userId || !record) throw new Error('Tidak ada hasil scan untuk disimpan')

    const ids = await saveScanAsTransactions(userId, record, { ...dto, scanId: record.id })

    // Learning must never block the save that already succeeded.
    void learnFromCorrections(userId, record.id, record.scanResult.mappedItems, reviewed).catch(
      () => {},
    )

    set({ phase: 'idle', record: null, stage: null })
    return ids
  },

  discard: async () => {
    const userId = currentUserId()
    const record = get().record
    if (!userId || !record) {
      get().reset()
      return
    }
    // Opportunistic only: reuse a token already acquired this session (e.g. from the
    // scan() call moments ago via the shared store), but never pop a fresh OAuth
    // consent window just to delete — that would be a jarring price for "Buang".
    const accessToken = useGoogleDriveTokenStore.getState().validToken() ?? undefined
    await discardScan(userId, record, accessToken)
    get().reset()
  },

  loadHistory: async () => {
    const userId = currentUserId()
    if (!userId) return

    set({ historyLoading: true })
    try {
      set({ history: await repositories.receiptScans.findAll(userId) })
    } catch (error) {
      console.warn('Gagal memuat riwayat struk:', error)
      set({ history: [] })
    } finally {
      set({ historyLoading: false })
    }
  },
}))
