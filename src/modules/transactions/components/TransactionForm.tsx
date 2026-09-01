'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/shared/components/ui/drawer'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { MoneyInput } from '@/shared/components/finance/MoneyInput'
import { useIsDesktop } from '@/shared/hooks/useMediaQuery'
import { useGoogleDrive } from '@/shared/hooks/useGoogleDrive'
import { collectTags } from '@/shared/lib/transaction-filters'
import { describeSuggestions } from '@/shared/lib/insights'
import { hapticSuccess } from '@/shared/lib/haptics'
import { uploadReceipt } from '@/shared/use-cases/transactions/UploadReceipt.usecase'
import { useTransactionStore } from '@/shared/stores/transaction.store'
import type {
  PaymentMethod,
  Pillar,
  SpendingMood,
  Transaction,
  TransactionType,
} from '@/shared/types/domain'
import { CategoryCascader } from './CategoryCascader'
import { MoodSelector, PaymentMethodSelect, TagInput } from './FormFields'
import { ReceiptUploader } from './ReceiptUploader'

interface TransactionFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Present when editing; absent when creating. */
  transaction?: Transaction | null
  /** Prefilled values for "duplicate". */
  initial?: Partial<Transaction> | null
}

function toDateInput(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

const TYPES: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: 'Pengeluaran' },
  { value: 'income', label: 'Pemasukan' },
  { value: 'transfer', label: 'Transfer' },
]

function TransactionFormBody({
  transaction,
  initial,
  onDone,
}: {
  transaction?: Transaction | null
  initial?: Partial<Transaction> | null
  onDone: () => void
}) {
  const { executeWithToken } = useGoogleDrive()
  const transactions = useTransactionStore((s) => s.transactions)
  const add = useTransactionStore((s) => s.add)
  const update = useTransactionStore((s) => s.update)

  const source = transaction ?? initial ?? null

  const [type, setType] = useState<TransactionType>(source?.type ?? 'expense')
  const [date, setDate] = useState(() =>
    toDateInput(source?.date ? source.date.toDate() : new Date()),
  )
  const [amount, setAmount] = useState(source?.amount ?? 0)
  const [pillar, setPillar] = useState<Pillar | ''>(source?.pillar ?? '')
  const [categoryId, setCategoryId] = useState(source?.categoryId ?? '')
  const [categoryItemId, setCategoryItemId] = useState(source?.categoryItemId ?? '')
  const [description, setDescription] = useState(source?.description ?? '')
  const [location, setLocation] = useState(source?.location ?? '')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>(
    source?.paymentMethod ?? '',
  )
  const [mood, setMood] = useState<SpendingMood | ''>(source?.mood ?? '')
  const [tags, setTags] = useState<string[]>(source?.tags ?? [])
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  // Legacy Firebase URL for old records; Drive fields for anything uploaded since.
  const [receiptUrl, setReceiptUrl] = useState(source?.receiptUrl)
  const [drive, setDrive] = useState<{
    gDriveFileId?: string
    gDriveWebViewLink?: string
    gDriveThumbnailLink?: string
  }>({
    gDriveFileId: source?.gDriveFileId,
    gDriveWebViewLink: source?.gDriveWebViewLink,
    gDriveThumbnailLink: source?.gDriveThumbnailLink,
  })
  const [saving, setSaving] = useState(false)

  // Switching to income moves the pillar; keeping "needs" would file income as a cost.
  useEffect(() => {
    if (type === 'income' && pillar !== 'income') {
      setPillar('')
      setCategoryId('')
      setCategoryItemId('')
    }
    if (type !== 'income' && pillar === 'income') {
      setPillar('')
      setCategoryId('')
      setCategoryItemId('')
    }
  }, [type, pillar])

  const tagSuggestions = useMemo(() => collectTags(transactions), [transactions])

  // Suggestions from what the user has written before, same category first.
  const descriptionSuggestions = useMemo(
    () => (categoryId ? describeSuggestions(transactions, categoryId, description) : []),
    [transactions, categoryId, description],
  )

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (amount <= 0) {
      toast.error('Jumlah harus lebih dari nol')
      return
    }
    if (!categoryId) {
      toast.error('Pilih kategori dulu')
      return
    }

    setSaving(true)
    try {
      const payload = {
        date: new Date(`${date}T12:00:00`),
        type,
        pillar: (pillar || 'needs') as Pillar,
        categoryId,
        categoryItemId: categoryItemId || undefined,
        amount,
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        paymentMethod: paymentMethod || undefined,
        mood: mood || undefined,
        tags,
        receiptUrl,
        ...drive,
      }

      if (transaction) {
        // Editing: the id already exists, so a new receipt can upload straight away.
        let uploaded = drive
        if (receiptFile) {
          uploaded = await executeWithToken((token) =>
            uploadReceipt(token, transaction.id, receiptFile),
          )
        }
        await update(transaction.id, { ...payload, ...uploaded })
        toast.success('Transaksi diperbarui')
        hapticSuccess()
      } else {
        // Creating: the Drive file name is keyed by transaction id, so upload after the write.
        const created = await add(payload)
        if (receiptFile) {
          const uploaded = await executeWithToken((token) =>
            uploadReceipt(token, created.id, receiptFile),
          )
          await update(created.id, uploaded)
        }
        toast.success('Transaksi tersimpan')
        hapticSuccess()
      }

      onDone()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan transaksi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex gap-2" role="group" aria-label="Jenis transaksi">
        {TYPES.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={type === option.value ? 'default' : 'outline'}
            size="sm"
            className="flex-1"
            onClick={() => setType(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="tx-date" className="text-xs">
            Tanggal
          </Label>
          <Input
            id="tx-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tx-amount" className="text-xs">
            Jumlah
          </Label>
          <MoneyInput id="tx-amount" value={amount} onChange={setAmount} />
        </div>
      </div>

      <CategoryCascader
        pillar={pillar}
        categoryId={categoryId}
        categoryItemId={categoryItemId}
        incomeMode={type === 'income'}
        onChange={(next) => {
          setPillar(next.pillar)
          setCategoryId(next.categoryId)
          setCategoryItemId(next.categoryItemId)
        }}
      />

      <div className="space-y-1.5">
        <Label htmlFor="tx-description" className="text-xs">
          Keterangan
        </Label>
        <Textarea
          id="tx-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
          placeholder="Opsional"
        />
        {descriptionSuggestions.length > 0 && description !== descriptionSuggestions[0] && (
          <div className="flex flex-wrap gap-1.5">
            {descriptionSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setDescription(suggestion)}
                className="rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="tx-location" className="text-xs">
            Toko / merchant
          </Label>
          <Input
            id="tx-location"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="Opsional"
          />
        </div>
        <PaymentMethodSelect value={paymentMethod} onChange={setPaymentMethod} />
      </div>

      {type === 'expense' && <MoodSelector value={mood} onChange={setMood} />}

      <TagInput tags={tags} onChange={setTags} suggestions={tagSuggestions} />

      <ReceiptUploader
        value={drive.gDriveThumbnailLink ?? receiptUrl}
        driveLink={drive.gDriveWebViewLink}
        file={receiptFile}
        onFileChange={setReceiptFile}
        onRemoveExisting={() => {
          setReceiptUrl(undefined)
          setDrive({})
        }}
      />

      <Button type="submit" className="w-full" disabled={saving}>
        {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
        {transaction ? 'Simpan perubahan' : 'Simpan transaksi'}
      </Button>
    </form>
  )
}

/** Desktop gets a dialog, mobile a bottom sheet — same fields either way. */
export function TransactionForm({
  open,
  onOpenChange,
  transaction,
  initial,
}: TransactionFormProps) {
  const isDesktop = useIsDesktop()
  const title = transaction ? 'Ubah transaksi' : 'Transaksi baru'
  const description = transaction
    ? 'Perbarui detail transaksi ini.'
    : 'Catat pemasukan atau pengeluaran.'

  // Remounting on open resets the fields to the record being edited.
  const body = open ? (
    <TransactionFormBody
      transaction={transaction}
      initial={initial}
      onDone={() => onOpenChange(false)}
    />
  ) : null

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {body}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92dvh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-8">{body}</div>
      </DrawerContent>
    </Drawer>
  )
}
