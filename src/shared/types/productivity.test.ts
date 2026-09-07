import { describe, it, expect } from 'vitest'
import { isTaskStatus, isReminderFreq, normalizeTags, DEFAULT_PLANNER_PREFS } from './productivity'

describe('productivity type guards', () => {
  it('isTaskStatus accepts the three literals only', () => {
    expect(isTaskStatus('todo')).toBe(true)
    expect(isTaskStatus('doing')).toBe(true)
    expect(isTaskStatus('done')).toBe(true)
    expect(isTaskStatus('DONE')).toBe(false)
    expect(isTaskStatus('')).toBe(false)
    expect(isTaskStatus(undefined)).toBe(false)
  })

  it('isReminderFreq accepts daily/weekly/weekday', () => {
    expect(isReminderFreq('weekday')).toBe(true)
    expect(isReminderFreq('monthly')).toBe(false)
  })

  it('normalizeTags lowercases, trims, dedupes, caps at 12', () => {
    expect(normalizeTags([' Kerja ', 'kerja', 'IDE'])).toEqual(['kerja', 'ide'])
    expect(normalizeTags(Array.from({ length: 20 }, (_, i) => `t${i}`))).toHaveLength(12)
    expect(normalizeTags(['', '   '])).toEqual([])
  })

  it('DEFAULT_PLANNER_PREFS has digestHour 7 and leads [0,60]', () => {
    expect(DEFAULT_PLANNER_PREFS.digestHour).toBe(7)
    expect(DEFAULT_PLANNER_PREFS.taskLeadsMinutes).toEqual([0, 60])
  })
})
