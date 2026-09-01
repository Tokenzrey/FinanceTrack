'use client'

import { useState } from 'react'
import { Banknote, CreditCard, Frown, Meh, QrCode, Smile, Wallet, X } from 'lucide-react'
import { Badge } from '@/shared/components/ui/badge'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { cn } from '@/shared/lib/utils'
import type { PaymentMethod, SpendingMood } from '@/shared/types/domain'

export const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: typeof Wallet }[] = [
  { value: 'cash', label: 'Tunai', icon: Banknote },
  { value: 'debit', label: 'Kartu Debit', icon: CreditCard },
  { value: 'credit', label: 'Kartu Kredit', icon: CreditCard },
  { value: 'transfer', label: 'Transfer', icon: Wallet },
  { value: 'ewallet', label: 'E-Wallet', icon: Wallet },
  { value: 'qris', label: 'QRIS', icon: QrCode },
]

export function PaymentMethodSelect({
  value,
  onChange,
}: {
  value: PaymentMethod | ''
  onChange: (value: PaymentMethod | '') => void
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor="tx-payment" className="text-xs">
        Metode bayar
      </Label>
      <Select
        value={value || 'none'}
        onValueChange={(next) => onChange(next === 'none' ? '' : (next as PaymentMethod))}
      >
        <SelectTrigger id="tx-payment">
          <SelectValue placeholder="Pilih metode" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">— Tidak dicatat —</SelectItem>
          {PAYMENT_METHODS.map((method) => (
            <SelectItem key={method.value} value={method.value}>
              {method.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

const MOODS: { value: SpendingMood; label: string; icon: typeof Smile; className: string }[] = [
  { value: 'happy', label: 'Perlu', icon: Smile, className: 'text-safe border-safe/40 bg-safe/10' },
  {
    value: 'neutral',
    label: 'Oke',
    icon: Meh,
    className: 'text-warning border-warning/40 bg-warning/10',
  },
  {
    value: 'regret',
    label: 'Menyesal',
    icon: Frown,
    className: 'text-exceeded border-exceeded/40 bg-exceeded/10',
  },
]

export function MoodSelector({
  value,
  onChange,
}: {
  value: SpendingMood | ''
  onChange: (value: SpendingMood | '') => void
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium">Perasaan</span>
      <div className="flex gap-2" role="group" aria-label="Perasaan atas pengeluaran ini">
        {MOODS.map((mood) => {
          const active = value === mood.value
          return (
            <button
              key={mood.value}
              type="button"
              aria-pressed={active}
              // Tapping the active mood clears it — the field stays optional.
              onClick={() => onChange(active ? '' : mood.value)}
              className={cn(
                // See the same fix in SettingsPage's theme row: `min-w-0` lets a
                // `flex-1` item actually shrink instead of forcing the row wider than
                // its container to fit the icon+label at full size.
                'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-medium transition-colors',
                active ? mood.className : 'text-muted-foreground hover:bg-muted',
              )}
            >
              <mood.icon className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{mood.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function TagInput({
  tags,
  onChange,
  suggestions = [],
}: {
  tags: string[]
  onChange: (tags: string[]) => void
  suggestions?: string[]
}) {
  const [draft, setDraft] = useState('')

  const add = (raw: string) => {
    const tag = raw.trim().toLowerCase()
    if (!tag || tags.includes(tag)) {
      setDraft('')
      return
    }
    onChange([...tags, tag])
    setDraft('')
  }

  const unused = suggestions.filter((tag) => !tags.includes(tag)).slice(0, 6)

  return (
    <div className="space-y-1.5">
      <Label htmlFor="tx-tags" className="text-xs">
        Tag <span className="text-muted-foreground">(opsional)</span>
      </Label>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              {tag}
              <button
                type="button"
                onClick={() => onChange(tags.filter((t) => t !== tag))}
                aria-label={`Hapus tag ${tag}`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <Input
        id="tx-tags"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Ketik lalu Enter"
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            // Enter must not submit the surrounding form while adding a tag.
            event.preventDefault()
            add(draft)
          }
          if (event.key === 'Backspace' && !draft && tags.length > 0) {
            onChange(tags.slice(0, -1))
          }
        }}
      />

      {unused.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {unused.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => add(tag)}
              className="rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted"
            >
              + {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
