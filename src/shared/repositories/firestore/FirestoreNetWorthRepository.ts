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
  type DocumentSnapshot,
} from 'firebase/firestore'
import type { INetWorthRepository } from '../interfaces'
import type { Asset, Liability, NetWorthSnapshot } from '@/shared/types/domain'
import type { AssetDTO, LiabilityDTO } from '@/shared/types/dto'
import { COLLECTIONS, col, colDoc, newDoc, stripUndefined } from './paths'

const SNAPSHOTS = COLLECTIONS.netWorth
const ASSETS = COLLECTIONS.assets
const LIABILITIES = COLLECTIONS.liabilities

function toAsset(snap: DocumentSnapshot): Asset {
  const data = snap.data()!
  return {
    id: snap.id,
    name: data.name,
    type: data.type,
    value: data.value ?? 0,
    institution: data.institution,
    notes: data.notes,
    updatedAt: data.updatedAt ?? Timestamp.now(),
  }
}

function toLiability(snap: DocumentSnapshot): Liability {
  const data = snap.data()!
  return {
    id: snap.id,
    name: data.name,
    type: data.type,
    totalAmount: data.totalAmount ?? 0,
    remainingAmount: data.remainingAmount ?? 0,
    monthlyPayment: data.monthlyPayment ?? 0,
    interestRate: data.interestRate,
    dueDate: data.dueDate,
    institution: data.institution,
    updatedAt: data.updatedAt ?? Timestamp.now(),
  }
}

function toSnapshot(snap: DocumentSnapshot): NetWorthSnapshot {
  const data = snap.data()!
  return {
    id: snap.id,
    yearMonth: data.yearMonth,
    totalAssets: data.totalAssets ?? 0,
    totalLiabilities: data.totalLiabilities ?? 0,
    netWorth: data.netWorth ?? 0,
    assets: data.assets ?? [],
    liabilities: data.liabilities ?? [],
    createdAt: data.createdAt ?? Timestamp.now(),
  }
}

export class FirestoreNetWorthRepository implements INetWorthRepository {
  async findSnapshots(userId: string, limit = 24): Promise<NetWorthSnapshot[]> {
    const snap = await getDocs(
      query(col(userId, SNAPSHOTS), orderBy('yearMonth', 'desc'), fbLimit(limit)),
    )
    return snap.docs.map(toSnapshot)
  }

  async findSnapshot(userId: string, yearMonth: string): Promise<NetWorthSnapshot | null> {
    const snap = await getDoc(colDoc(userId, SNAPSHOTS, yearMonth))
    return snap.exists() ? toSnapshot(snap) : null
  }

  /** Snapshot stores a frozen copy of assets/liabilities — later edits must not rewrite history. */
  async saveSnapshot(
    userId: string,
    yearMonth: string,
    assets: AssetDTO[],
    liabilities: LiabilityDTO[],
  ): Promise<NetWorthSnapshot> {
    const totalAssets = assets.reduce((sum, a) => sum + a.value, 0)
    const totalLiabilities = liabilities.reduce((sum, l) => sum + l.remainingAmount, 0)

    const payload = {
      yearMonth,
      totalAssets,
      totalLiabilities,
      netWorth: totalAssets - totalLiabilities,
      assets: assets.map((a) => stripUndefined(a)),
      liabilities: liabilities.map((l) =>
        stripUndefined({ ...l, dueDate: l.dueDate ? Timestamp.fromDate(l.dueDate) : undefined }),
      ),
    }

    await setDoc(colDoc(userId, SNAPSHOTS, yearMonth), {
      ...payload,
      createdAt: serverTimestamp(),
    })

    return { id: yearMonth, ...payload, createdAt: Timestamp.now() } as NetWorthSnapshot
  }

  async findAssets(userId: string): Promise<Asset[]> {
    const snap = await getDocs(col(userId, ASSETS))
    return snap.docs.map(toAsset)
  }

  async upsertAsset(userId: string, data: AssetDTO): Promise<Asset> {
    const ref = data.id ? colDoc(userId, ASSETS, data.id) : newDoc(userId, ASSETS)
    const payload = stripUndefined({
      name: data.name,
      type: data.type,
      value: data.value,
      institution: data.institution,
      notes: data.notes,
    })
    await setDoc(ref, { ...payload, updatedAt: serverTimestamp() }, { merge: true })
    return { id: ref.id, ...payload, updatedAt: Timestamp.now() } as Asset
  }

  async deleteAsset(userId: string, id: string): Promise<void> {
    await deleteDoc(colDoc(userId, ASSETS, id))
  }

  async findLiabilities(userId: string): Promise<Liability[]> {
    const snap = await getDocs(col(userId, LIABILITIES))
    return snap.docs.map(toLiability)
  }

  async upsertLiability(userId: string, data: LiabilityDTO): Promise<Liability> {
    const ref = data.id ? colDoc(userId, LIABILITIES, data.id) : newDoc(userId, LIABILITIES)
    const payload = stripUndefined({
      name: data.name,
      type: data.type,
      totalAmount: data.totalAmount,
      remainingAmount: data.remainingAmount,
      monthlyPayment: data.monthlyPayment,
      interestRate: data.interestRate,
      dueDate: data.dueDate ? Timestamp.fromDate(data.dueDate) : undefined,
      institution: data.institution,
    })
    await setDoc(ref, { ...payload, updatedAt: serverTimestamp() }, { merge: true })
    return { id: ref.id, ...payload, updatedAt: Timestamp.now() } as Liability
  }

  async deleteLiability(userId: string, id: string): Promise<void> {
    await deleteDoc(colDoc(userId, LIABILITIES, id))
  }
}
