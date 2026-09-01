import {
  Timestamp,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { getDb } from '@/shared/lib/firebase'
import type { ICategoryRepository } from '../interfaces'
import type { Category, CategoryItem, Pillar } from '@/shared/types/domain'
import type {
  CreateCategoryDTO,
  CreateCategoryItemDTO,
  UpdateCategoryDTO,
  UpdateCategoryItemDTO,
} from '@/shared/types/dto'
import { COLLECTIONS, col, colDoc, newDoc, stripUndefined } from './paths'

const NAME = COLLECTIONS.categories
const ITEMS = COLLECTIONS.categoryItems

function toCategory(snap: DocumentSnapshot): Category {
  const data = snap.data()!
  return {
    id: snap.id,
    name: data.name,
    pillar: data.pillar,
    percentOfIncome: data.percentOfIncome ?? 0,
    color: data.color,
    icon: data.icon,
    isSinkingFund: data.isSinkingFund ?? false,
    sinkingFundTargetMonths: data.sinkingFundTargetMonths,
    isRecurring: data.isRecurring ?? false,
    isActive: data.isActive ?? true,
    order: data.order ?? 0,
    notes: data.notes,
    createdAt: data.createdAt ?? Timestamp.now(),
    updatedAt: data.updatedAt ?? Timestamp.now(),
  }
}

function toCategoryItem(snap: DocumentSnapshot): CategoryItem {
  const data = snap.data()!
  return {
    id: snap.id,
    categoryId: data.categoryId,
    name: data.name,
    description: data.description,
    isRecurring: data.isRecurring ?? false,
    recurringAmount: data.recurringAmount,
    recurringDay: data.recurringDay,
    isActive: data.isActive ?? true,
    createdAt: data.createdAt ?? Timestamp.now(),
  }
}

export class FirestoreCategoryRepository implements ICategoryRepository {
  async findAll(userId: string): Promise<Category[]> {
    const snap = await getDocs(query(col(userId, NAME), orderBy('order', 'asc')))
    return snap.docs.map(toCategory)
  }

  async findById(userId: string, id: string): Promise<Category | null> {
    const snap = await getDoc(colDoc(userId, NAME, id))
    return snap.exists() ? toCategory(snap) : null
  }

  async create(userId: string, data: CreateCategoryDTO): Promise<Category> {
    const ref = newDoc(userId, NAME)
    const payload = stripUndefined({
      name: data.name,
      pillar: data.pillar,
      percentOfIncome: data.percentOfIncome,
      color: data.color,
      icon: data.icon,
      isSinkingFund: data.isSinkingFund ?? false,
      sinkingFundTargetMonths: data.sinkingFundTargetMonths,
      isRecurring: data.isRecurring ?? false,
      isActive: true,
      order: data.order ?? Date.now(),
      notes: data.notes,
    })
    await setDoc(ref, { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    const now = Timestamp.now()
    return { id: ref.id, ...payload, createdAt: now, updatedAt: now } as Category
  }

  async update(userId: string, id: string, data: UpdateCategoryDTO): Promise<void> {
    await updateDoc(colDoc(userId, NAME, id), {
      ...stripUndefined(data),
      updatedAt: serverTimestamp(),
    })
  }

  async softDelete(userId: string, id: string): Promise<void> {
    await updateDoc(colDoc(userId, NAME, id), { isActive: false, updatedAt: serverTimestamp() })
  }

  async reorder(userId: string, pillar: Pillar, orderedIds: string[]): Promise<void> {
    const batch = writeBatch(getDb())
    orderedIds.forEach((id, index) => {
      batch.update(colDoc(userId, NAME, id), { order: index, pillar, updatedAt: serverTimestamp() })
    })
    await batch.commit()
  }

  subscribe(userId: string, callback: (categories: Category[]) => void): Unsubscribe {
    return onSnapshot(
      query(col(userId, NAME), orderBy('order', 'asc')),
      (snap) => callback(snap.docs.map(toCategory)),
      (error) => console.warn('Category listener error:', error),
    )
  }

  async findItems(userId: string, categoryId: string): Promise<CategoryItem[]> {
    const snap = await getDocs(query(col(userId, ITEMS), where('categoryId', '==', categoryId)))
    return snap.docs.map(toCategoryItem)
  }

  async findAllItems(userId: string): Promise<CategoryItem[]> {
    const snap = await getDocs(col(userId, ITEMS))
    return snap.docs.map(toCategoryItem)
  }

  async createItem(userId: string, data: CreateCategoryItemDTO): Promise<CategoryItem> {
    const ref = newDoc(userId, ITEMS)
    const payload = stripUndefined({
      categoryId: data.categoryId,
      name: data.name,
      description: data.description,
      isRecurring: data.isRecurring ?? false,
      recurringAmount: data.recurringAmount,
      recurringDay: data.recurringDay,
      isActive: true,
    })
    await setDoc(ref, { ...payload, createdAt: serverTimestamp() })
    return { id: ref.id, ...payload, createdAt: Timestamp.now() } as CategoryItem
  }

  async updateItem(userId: string, id: string, data: UpdateCategoryItemDTO): Promise<void> {
    await updateDoc(colDoc(userId, ITEMS, id), stripUndefined(data))
  }

  async deleteItem(userId: string, id: string): Promise<void> {
    await deleteDoc(colDoc(userId, ITEMS, id))
  }
}
