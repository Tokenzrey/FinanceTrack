import {
  Timestamp,
  deleteDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentSnapshot,
} from 'firebase/firestore'
import type { IBudgetTemplateRepository } from '../interfaces'
import type { BudgetTemplate } from '@/shared/types/domain'
import { COLLECTIONS, col, colDoc, newDoc, stripUndefined } from './paths'

const NAME = COLLECTIONS.templates

function toTemplate(snap: DocumentSnapshot): BudgetTemplate {
  const data = snap.data()!
  return {
    id: snap.id,
    name: data.name,
    description: data.description,
    pillarConfig: data.pillarConfig,
    categoryAllocations: data.categoryAllocations ?? [],
    isDefault: data.isDefault ?? false,
    createdAt: data.createdAt ?? Timestamp.now(),
  }
}

export class FirestoreBudgetTemplateRepository implements IBudgetTemplateRepository {
  async findAll(userId: string): Promise<BudgetTemplate[]> {
    const snap = await getDocs(col(userId, NAME))
    return snap.docs.map(toTemplate)
  }

  async create(
    userId: string,
    data: Omit<BudgetTemplate, 'id' | 'createdAt'>,
  ): Promise<BudgetTemplate> {
    const ref = newDoc(userId, NAME)
    const payload = stripUndefined(data)
    await setDoc(ref, { ...payload, createdAt: serverTimestamp() })
    return { id: ref.id, ...payload, createdAt: Timestamp.now() } as BudgetTemplate
  }

  async update(userId: string, id: string, data: Partial<BudgetTemplate>): Promise<void> {
    // id and createdAt are Firestore-owned; never let a caller patch them.
    const rest = { ...data }
    delete rest.id
    delete rest.createdAt
    await updateDoc(colDoc(userId, NAME, id), stripUndefined(rest))
  }

  async delete(userId: string, id: string): Promise<void> {
    await deleteDoc(colDoc(userId, NAME, id))
  }
}
