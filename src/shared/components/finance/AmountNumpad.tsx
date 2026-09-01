'use client'

import { useEffect, useState } from 'react'
import { Delete } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { formatNumber } from '@/shared/lib/format'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'back'] as const

/** Guards against a runaway string of taps producing an absurd/unsafe number — a numpad
 *  invites many rapid taps in a way typing rarely does. 15 digits covers any real IDR
 *  amount many times over (a quadrillion Rupiah) with headroom to spare. */
const MAX_DIGITS = 15

/**
 * Big-button numeric keypad for amount entry — an alternative to typing, not a
 * replacement: `MoneyInput` keeps its native `inputMode="numeric"` keyboard too. Useful
 * one-handed on mobile, or when the amount is easier to think of as digits than to type.
 */
export function AmountNumpad({
  open,
  onOpenChange,
  initialValue,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialValue: number
  onConfirm: (value: number) => void
}) {
  const [digits, setDigits] = useState('')

  useEffect(() => {
    if (open) setDigits(initialValue > 0 ? String(Math.trunc(initialValue)) : '')
  }, [open, initialValue])

  const value = digits ? Number(digits) : 0

  const press = (key: (typeof KEYS)[number]) => {
    if (key === 'back') {
      setDigits((d) => d.slice(0, -1))
      return
    }
    // Strip a leading zero the moment a real digit follows it (e.g. "0" + "5" → "5",
    // not "05"), but "000" alone still adds zeroes onto whatever came before it.
    setDigits((d) => (d + key).replace(/^0+(?=\d)/, '').slice(0, MAX_DIGITS))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Masukkan jumlah</DialogTitle>
        </DialogHeader>

        <p className="tabular py-2 text-center text-3xl font-semibold">
          Rp {digits ? formatNumber(value) : '0'}
        </p>

        <div className="grid grid-cols-3 gap-2">
          {KEYS.map((key) => (
            <Button
              key={key}
              type="button"
              variant="outline"
              className="h-14 text-lg"
              onClick={() => press(key)}
              aria-label={key === 'back' ? 'Hapus satu angka' : key}
            >
              {key === 'back' ? <Delete className="size-5" aria-hidden /> : key}
            </Button>
          ))}
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            className="flex-1"
            disabled={!digits}
            onClick={() => setDigits('')}
          >
            Hapus semua
          </Button>
          <Button
            type="button"
            className="flex-1"
            onClick={() => {
              onConfirm(value)
              onOpenChange(false)
            }}
          >
            Selesai
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
