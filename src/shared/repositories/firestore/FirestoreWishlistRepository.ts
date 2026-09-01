import {
  Timestamp,
  deleteDoc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentSnapshot,
} from 'firebase/firestore'
import type { CreateWishlistDTO, UpdateWishlistDTO, Wishlist } from '@/shared/types/wishlist.types'
import { COLLECTIONS, col, colDoc, newDoc, stripUndefined } from './paths'

const NAME = COLLECTIONS.wishlist

function toWishlist(snap: DocumentSnapshot): Wishlist {
  const data = snap.data()!
  return {
    id: snap.id,
    name: data.name,
    estimatedPrice: data.estimatedPrice ?? 0,
    url: data.url,
    priority: data.priority ?? 'medium',
    status: data.status ?? 'idea',
    justification: data.justification ?? 'want',
    financingMethod: data.financingMethod ?? 'cash',
    estimatedMonthlyInstallment: data.estimatedMonthlyInstallment,
    installmentTenureMonths: data.installmentTenureMonths,
    coolingOffEndDate: data.coolingOffEndDate,
    actualPrice: data.actualPrice,
    transactionId: data.transactionId,
    purchasedAt: data.purchasedAt,
    createdAt: data.createdAt ?? Timestamp.now(),
    updatedAt: data.updatedAt ?? Timestamp.now(),
  }
}

/** Turns a cooling-off length in days into the concrete date it ends. */
function coolingOffEnd(days?: number): Timestamp | undefined {
  if (!days || days <= 0) return undefined
  return Timestamp.fromDate(new Date(Date.now() + days * 24 * 60 * 60 * 1000))
}

export class FirestoreWishlistRepository {
  async findAll(userId: string): Promise<Wishlist[]> {
    const snap = await getDocs(query(col(userId, NAME), orderBy('createdAt', 'desc')))
    return snap.docs.map(toWishlist)
  }

  async findById(userId: string, id: string): Promise<Wishlist | null> {
    const snap = await getDoc(colDoc(userId, NAME, id))
    return snap.exists() ? toWishlist(snap) : null
  }

  async create(userId: string, data: CreateWishlistDTO): Promise<Wishlist> {
    const ref = newDoc(userId, NAME)
    const payload = stripUndefined({
      name: data.name.trim(),
      estimatedPrice: data.estimatedPrice,
      url: data.url?.trim() || undefined,
      priority: data.priority,
      status: 'idea' as const,
      justification: data.justification,
      financingMethod: data.financingMethod,
      estimatedMonthlyInstallment: data.estimatedMonthlyInstallment,
      installmentTenureMonths: data.installmentTenureMonths,
      coolingOffEndDate: coolingOffEnd(data.coolingOffDays),
    })

    await setDoc(ref, { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    const now = Timestamp.now()
    return { id: ref.id, ...payload, createdAt: now, updatedAt: now } as Wishlist
  }

  async update(userId: string, id: string, data: UpdateWishlistDTO): Promise<void> {
    const { coolingOffDays, ...rest } = data
    await updateDoc(colDoc(userId, NAME, id), {
      ...stripUndefined(rest),
      ...(coolingOffDays !== undefined ? { coolingOffEndDate: coolingOffEnd(coolingOffDays) } : {}),
      updatedAt: serverTimestamp(),
    })
  }

  /**
   * Adds days to the cooling-off period — never subtracts. A user reconsidering a
   * purchase can give themselves more time to think; letting an edit quietly shorten
   * or clear the countdown would make "masa tunggu" decorative rather than real.
   */
  async extendCoolingOff(userId: string, id: string, additionalDays: number): Promise<void> {
    if (additionalDays <= 0) return

    const ref = colDoc(userId, NAME, id)
    const snap = await getDoc(ref)
    if (!snap.exists()) return

    const current = (snap.data().coolingOffEndDate as Timestamp | undefined)?.toDate()
    const base = current && current > new Date() ? current : new Date()
    const nextEnd = new Date(base.getTime() + additionalDays * 24 * 60 * 60 * 1000)

    await updateDoc(ref, { coolingOffEndDate: Timestamp.fromDate(nextEnd), updatedAt: serverTimestamp() })
  }

  /** Records the purchase and links the transaction that was created for it. */
  async markPurchased(
    userId: string,
    id: string,
    actualPrice: number,
    transactionId: string,
  ): Promise<void> {
    await updateDoc(colDoc(userId, NAME, id), {
      status: 'purchased',
      actualPrice,
      transactionId,
      purchasedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }

  async delete(userId: string, id: string): Promise<void> {
    await deleteDoc(colDoc(userId, NAME, id))
  }
}
