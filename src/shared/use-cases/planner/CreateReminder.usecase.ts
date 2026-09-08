import { repositories } from '@/shared/repositories'
import type { CreateReminderDTO, Reminder } from '@/shared/types/productivity'

/** Creates a standalone reminder. Must fire in the future or it is worthless. */
export async function createReminder(
  userId: string,
  dto: CreateReminderDTO,
): Promise<Reminder> {
  const message = dto.message.trim()
  if (message.length === 0) throw new Error('Isi pengingat wajib diisi')
  if (message.length > 500) throw new Error('Pengingat maksimal 500 karakter')
  if (Number.isNaN(dto.remindAt.getTime()) || dto.remindAt.getTime() <= Date.now()) {
    throw new Error('Waktu pengingat harus di masa depan')
  }

  return repositories.reminders.create(userId, { ...dto, message })
}
