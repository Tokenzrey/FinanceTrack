import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import type { Reminder, ReminderStatus } from '@/shared/types/productivity'
import {
  groupReminders,
  humanizeReminderError,
  relativeReminderTime,
} from './reminder-grouping'

// Fixed reference clock: a Wednesday, 10:00 local.
const now = new Date('2026-09-09T10:00:00')

/** Minimal reminder factory — only the fields the grouper reads. */
function r(
  id: string,
  remindAtISO: string,
  status: ReminderStatus = 'pending',
  over: Partial<Reminder> = {},
): Reminder {
  return {
    id,
    remindAt: Timestamp.fromDate(new Date(remindAtISO)),
    status,
    lastError: null,
    recurrence: null,
    ...over,
  } as unknown as Reminder
}

describe('groupReminders', () => {
  it('buckets pending reminders by time proximity relative to the injected now', () => {
    const groups = groupReminders(
      [
        r('today', '2026-09-09T15:00:00'),
        r('tomorrow', '2026-09-10T09:00:00'),
        r('thisWeek', '2026-09-12T09:00:00'), // Saturday, same Mon-Sun week
        r('later', '2026-09-20T09:00:00'), // next week
      ],
      now,
    )

    const byKey = Object.fromEntries(groups.map((g) => [g.key, g.reminders.map((x) => x.id)]))
    expect(byKey.today).toEqual(['today'])
    expect(byKey.tomorrow).toEqual(['tomorrow'])
    expect(byKey.thisWeek).toEqual(['thisWeek'])
    expect(byKey.later).toEqual(['later'])
  })

  it('sends failed reminders to the failed group regardless of remindAt', () => {
    const groups = groupReminders(
      [
        r('failed-past', '2026-09-08T09:00:00', 'failed'),
        r('failed-future', '2026-09-15T09:00:00', 'failed'),
      ],
      now,
    )
    const failed = groups.find((g) => g.key === 'failed')
    expect(failed?.reminders.map((x) => x.id)).toEqual(['failed-future', 'failed-past']) // desc by remindAt
    // The past failed one did NOT land in `today`.
    expect(groups.find((g) => g.key === 'today')).toBeUndefined()
  })

  it('drops sent and cancelled reminders entirely', () => {
    const groups = groupReminders(
      [
        r('sent', '2026-09-09T09:00:00', 'sent'),
        r('cancelled', '2026-09-09T12:00:00', 'cancelled'),
      ],
      now,
    )
    expect(groups).toEqual([])
  })

  it('puts a past-due pending reminder into today (cron has not fired it yet)', () => {
    const groups = groupReminders([r('overdue', '2026-09-09T08:00:00', 'pending')], now)
    expect(groups.map((g) => g.key)).toEqual(['today'])
    expect(groups[0].reminders.map((x) => x.id)).toEqual(['overdue'])
  })

  it('returns only non-empty groups in the fixed order today, tomorrow, thisWeek, later, failed', () => {
    const groups = groupReminders(
      [
        r('l', '2026-09-20T09:00:00'),
        r('f', '2026-09-15T09:00:00', 'failed'),
        r('t', '2026-09-09T15:00:00'),
        r('tm', '2026-09-10T09:00:00'),
        r('tw', '2026-09-12T09:00:00'),
      ],
      now,
    )
    expect(groups.map((g) => g.key)).toEqual(['today', 'tomorrow', 'thisWeek', 'later', 'failed'])
    expect(groups.map((g) => g.label)).toEqual([
      'Hari ini',
      'Besok',
      'Minggu ini',
      'Nanti',
      'Gagal terkirim',
    ])
  })

  it('sorts time groups ascending by remindAt and failed descending', () => {
    const groups = groupReminders(
      [
        r('t-late', '2026-09-09T18:00:00'),
        r('t-early', '2026-09-09T11:00:00'),
        r('f-old', '2026-09-01T09:00:00', 'failed'),
        r('f-new', '2026-09-07T09:00:00', 'failed'),
      ],
      now,
    )
    expect(groups.find((g) => g.key === 'today')?.reminders.map((x) => x.id)).toEqual([
      't-early',
      't-late',
    ])
    expect(groups.find((g) => g.key === 'failed')?.reminders.map((x) => x.id)).toEqual([
      'f-new',
      'f-old',
    ])
  })
})

describe('humanizeReminderError', () => {
  it('maps not_linked to a "belum tertaut" sentence', () => {
    expect(humanizeReminderError('not_linked')).toContain('belum tertaut')
  })

  it('maps any whatsapp_http_* to a WhatsApp "tidak merespons" sentence', () => {
    const s = humanizeReminderError('whatsapp_http_500')
    expect(s).toContain('WhatsApp')
    expect(s).toContain('tidak merespons')
  })

  it('maps any telegram_http_* to a Telegram sentence', () => {
    expect(humanizeReminderError('telegram_http_403')).toContain('Telegram')
  })

  it('maps a free-form timeout/abort error to the generic chat-service sentence', () => {
    expect(humanizeReminderError('AbortError: The operation timed out')).toBe(
      'Layanan chat sedang tidak merespons',
    )
  })

  it("falls back to 'Gagal terkirim' for send failed, null, and anything unmapped", () => {
    expect(humanizeReminderError('send failed')).toBe('Gagal terkirim')
    expect(humanizeReminderError(null)).toBe('Gagal terkirim')
    expect(humanizeReminderError('weird unmapped thing')).toBe('Gagal terkirim')
  })

  it('checks not_linked before the http mappings', () => {
    // A pathological code containing both — not_linked wins per the documented order.
    expect(humanizeReminderError('not_linked whatsapp_http_500')).toContain('belum tertaut')
  })
})

describe('relativeReminderTime', () => {
  it('renders sub-hour distances as "dalam N menit"', () => {
    expect(relativeReminderTime(new Date('2026-09-09T10:30:00'), now)).toBe('dalam 30 menit')
  })

  it('renders same-day multi-hour distances as "dalam N jam"', () => {
    expect(relativeReminderTime(new Date('2026-09-09T14:00:00'), now)).toBe('dalam 4 jam')
  })

  it('renders past / now as "sekarang"', () => {
    expect(relativeReminderTime(new Date('2026-09-09T09:30:00'), now)).toBe('sekarang')
  })

  it('renders tomorrow as "besok HH.mm"', () => {
    expect(relativeReminderTime(new Date('2026-09-10T09:00:00'), now)).toBe('besok 09.00')
  })

  it('renders later this week starting with the Indonesian weekday name', () => {
    const s = relativeReminderTime(new Date('2026-09-12T09:00:00'), now)
    expect(s).toBe('Sabtu 09.00')
  })

  it('renders a date beyond this week as "d MMM" with the id-locale month token', () => {
    const s = relativeReminderTime(new Date('2026-10-03T09:00:00'), now)
    expect(s).toContain('3')
    expect(s).toMatch(/Okt|Oct/)
  })
})
