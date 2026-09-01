import { repositories } from '@/shared/repositories'
import type { Category } from '@/shared/types/domain'
import type { CreateCategoryDTO } from '@/shared/types/dto'

/** Name must be unique per pillar — two "Makan" rows under Kebutuhan make the table unreadable. */
export async function createCategory(userId: string, data: CreateCategoryDTO): Promise<Category> {
  const name = data.name.trim()
  if (!name) throw new Error('Nama kategori wajib diisi')
  if (data.percentOfIncome < 0 || data.percentOfIncome > 100) {
    throw new Error('Persentase harus antara 0 dan 100')
  }

  const existing = await repositories.categories.findAll(userId)
  const duplicate = existing.some(
    (c) => c.isActive && c.pillar === data.pillar && c.name.toLowerCase() === name.toLowerCase(),
  )
  if (duplicate) throw new Error(`Kategori "${name}" sudah ada di pilar ini`)

  const lastOrder = existing
    .filter((c) => c.pillar === data.pillar)
    .reduce((max, c) => Math.max(max, c.order), -1)

  return repositories.categories.create(userId, { ...data, name, order: lastOrder + 1 })
}
