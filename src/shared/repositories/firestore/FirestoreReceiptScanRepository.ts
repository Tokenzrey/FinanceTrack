import {
  Timestamp,
  deleteDoc,
  getDoc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentSnapshot,
} from 'firebase/firestore'
import type {
  CategoryHint,
  ReceiptScanRecord,
  ReceiptScanResult,
  ScanStatus,
  UserCorrection,
} from '@/shared/types/receipt-scanner.types'
import { COLLECTIONS, col, colDoc, newDoc, stripUndefined } from './paths'

const NAME = COLLECTIONS.receiptScans
const META = COLLECTIONS.meta
const HINTS_DOC = 'scan_hints'

function toRecord(snap: DocumentSnapshot): ReceiptScanRecord {
  const data = snap.data()!
  return {
    id: snap.id,
    imageUrl: data.imageUrl ?? '',
    imagePath: data.imagePath ?? '',
    gDriveFileId: data.gDriveFileId,
    scanResult: data.scanResult,
    status: data.status ?? 'pending',
    savedTransactionIds: data.savedTransactionIds ?? [],
    userCorrections: data.userCorrections ?? [],
    createdAt: data.createdAt ?? Timestamp.now(),
    reviewedAt: data.reviewedAt,
  }
}

export interface IReceiptScanRepository {
  /** Reserves an id before upload, so the Storage path and the document agree. */
  newScanId(userId: string): string
  create(
    userId: string,
    scanId: string,
    imageUrl: string,
    gDriveFileId: string,
    result: ReceiptScanResult,
  ): Promise<ReceiptScanRecord>
  findById(userId: string, scanId: string): Promise<ReceiptScanRecord | null>
  findAll(userId: string, status?: ScanStatus, limit?: number): Promise<ReceiptScanRecord[]>
  markSaved(userId: string, scanId: string, transactionIds: string[]): Promise<void>
  markDiscarded(userId: string, scanId: string): Promise<void>
  recordCorrections(userId: string, scanId: string, corrections: UserCorrection[]): Promise<void>
  delete(userId: string, scanId: string): Promise<void>
  findHints(userId: string): Promise<CategoryHint[]>
  saveHints(userId: string, hints: CategoryHint[]): Promise<void>
}

export class FirestoreReceiptScanRepository implements IReceiptScanRepository {
  newScanId(userId: string): string {
    return newDoc(userId, NAME).id
  }

  async create(
    userId: string,
    scanId: string,
    imageUrl: string,
    gDriveFileId: string,
    result: ReceiptScanResult,
  ): Promise<ReceiptScanRecord> {
    const payload = {
      imageUrl,
      // Legacy Firebase Storage path stays empty for Drive-era scans.
      imagePath: '',
      gDriveFileId,
      scanResult: result,
      status: 'pending' as ScanStatus,
      savedTransactionIds: [],
      userCorrections: [],
    }
    await setDoc(colDoc(userId, NAME, scanId), { ...payload, createdAt: serverTimestamp() })
    return { id: scanId, ...payload, createdAt: Timestamp.now() }
  }

  async findById(userId: string, scanId: string): Promise<ReceiptScanRecord | null> {
    const snap = await getDoc(colDoc(userId, NAME, scanId))
    return snap.exists() ? toRecord(snap) : null
  }

  async findAll(userId: string, status?: ScanStatus, limit = 50): Promise<ReceiptScanRecord[]> {
    const constraints = status ? [where('status', '==', status)] : []
    const snap = await getDocs(
      query(col(userId, NAME), ...constraints, orderBy('createdAt', 'desc'), fbLimit(limit)),
    )
    return snap.docs.map(toRecord)
  }

  async markSaved(userId: string, scanId: string, transactionIds: string[]): Promise<void> {
    await updateDoc(colDoc(userId, NAME, scanId), {
      status: 'saved',
      savedTransactionIds: transactionIds,
      reviewedAt: serverTimestamp(),
    })
  }

  async markDiscarded(userId: string, scanId: string): Promise<void> {
    await updateDoc(colDoc(userId, NAME, scanId), {
      status: 'discarded',
      reviewedAt: serverTimestamp(),
    })
  }

  async recordCorrections(
    userId: string,
    scanId: string,
    corrections: UserCorrection[],
  ): Promise<void> {
    await updateDoc(colDoc(userId, NAME, scanId), {
      userCorrections: corrections.map((c) => stripUndefined(c)),
      status: 'reviewed',
      reviewedAt: serverTimestamp(),
    })
  }

  async delete(userId: string, scanId: string): Promise<void> {
    await deleteDoc(colDoc(userId, NAME, scanId))
  }

  /**
   * Hints live in their own document rather than on the profile: the list grows with
   * every correction, and the profile is read on every page load.
   */
  async findHints(userId: string): Promise<CategoryHint[]> {
    const snap = await getDoc(colDoc(userId, META, HINTS_DOC))
    if (!snap.exists()) return []
    return (snap.data().hints ?? []) as CategoryHint[]
  }

  async saveHints(userId: string, hints: CategoryHint[]): Promise<void> {
    await setDoc(colDoc(userId, META, HINTS_DOC), { hints }, { merge: true })
  }
}
