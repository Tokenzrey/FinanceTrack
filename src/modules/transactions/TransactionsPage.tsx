'use client'

import { useEffect, useMemo, useState } from 'react'
import { FileUp, Plus, Receipt, ScanLine } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent } from '@/shared/components/ui/card'
import { EmptyState, LoadingSkeleton } from '@/shared/components/finance/EmptyState'
import { PageHeader } from '@/shared/components/layout/TopBar'
import { MoneyDisplay } from '@/shared/components/finance/MoneyDisplay'
import { ReceiptViewerDialog, type ReceiptRef } from '@/shared/components/finance/ReceiptViewerDialog'
import { PeriodSelector } from '@/modules/dashboard/components/DashboardHeader'
import {
  EMPTY_FILTERS,
  collectTags,
  filterTransactions,
  hasActiveFilters,
  type TransactionFilterState,
} from '@/shared/lib/transaction-filters'
import { useAuthStore } from '@/shared/stores/auth.store'
import { useBudgetStore } from '@/shared/stores/budget.store'
import { useMasterDataStore } from '@/shared/stores/master-data.store'
import { useTransactionStore } from '@/shared/stores/transaction.store'
import type { Transaction } from '@/shared/types/domain'
import { BulkActionBar } from './components/BulkActionBar'
import { TransactionCardList } from './components/TransactionCardList'
import { TransactionFilters } from './components/TransactionFilters'
import { ImportCsvWizard } from './components/ImportCsvWizard'
import { TransactionForm } from './components/TransactionForm'
import { TransactionTable } from './components/TransactionTable'
import { ScanDialog } from '@/modules/receipt-scanner/ScanDialog'

export function TransactionsPage() {
  const userId = useAuthStore((s) => s.user?.uid)
  const { year, month } = useBudgetStore((s) => s.activePeriod)

  const categories = useMasterDataStore((s) => s.categories)
  const loadAll = useMasterDataStore((s) => s.loadAll)

  const transactions = useTransactionStore((s) => s.transactions)
  const isLoading = useTransactionStore((s) => s.isLoading)
  const subscribeToMonth = useTransactionStore((s) => s.subscribeToMonth)
  const unsubscribeAll = useTransactionStore((s) => s.unsubscribeAll)
  const remove = useTransactionStore((s) => s.remove)
  const bulkRemove = useTransactionStore((s) => s.bulkRemove)
  const add = useTransactionStore((s) => s.add)

  const [filters, setFilters] = useState<TransactionFilterState>(EMPTY_FILTERS)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [duplicating, setDuplicating] = useState<Partial<Transaction> | null>(null)
  const [viewingReceipt, setViewingReceipt] = useState<ReceiptRef | null>(null)
  const [scanOpen, setScanOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)

  useEffect(() => {
    if (!userId) return
    void loadAll()
  }, [userId, loadAll])

  useEffect(() => {
    if (!userId) return
    subscribeToMonth(year, month)
    return () => unsubscribeAll()
  }, [userId, year, month, subscribeToMonth, unsubscribeAll])

  const categoryNames = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])),
    [categories],
  )

  const filtered = useMemo(
    () => filterTransactions(transactions, filters, categoryNames),
    [transactions, filters, categoryNames],
  )

  const availableTags = useMemo(() => collectTags(transactions), [transactions])

  // Selecting rows then filtering them away would leave invisible rows selected.
  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => filtered.some((tx) => tx.id === id)))
  }, [filtered])

  const selectedTotal = filtered
    .filter((tx) => selectedIds.includes(tx.id))
    .reduce((sum, tx) => sum + tx.amount, 0)

  const openCreate = () => {
    setEditing(null)
    setDuplicating(null)
    setFormOpen(true)
  }

  /**
   * Delete with a 5-second undo. Firestore has no undelete, so the row is re-created
   * from the snapshot we still hold in memory — a new id, same content.
   */
  const deleteWithUndo = async (tx: Transaction) => {
    try {
      await remove(tx.id)
      toast.success('Transaksi dihapus', {
        duration: 5000,
        action: {
          label: 'Urungkan',
          onClick: () => {
            void add({
              date: tx.date.toDate(),
              type: tx.type,
              pillar: tx.pillar,
              categoryId: tx.categoryId,
              categoryItemId: tx.categoryItemId,
              amount: tx.amount,
              description: tx.description,
              tags: tx.tags,
              paymentMethod: tx.paymentMethod,
              location: tx.location,
              mood: tx.mood,
              receiptUrl: tx.receiptUrl,
            }).catch(() => toast.error('Gagal mengurungkan penghapusan'))
          },
        },
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menghapus transaksi')
    }
  }

  const deleteSelected = async () => {
    setDeleting(true)
    try {
      await bulkRemove(selectedIds)
      toast.success(`${selectedIds.length} transaksi dihapus`)
      setSelectedIds([])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menghapus transaksi')
    } finally {
      setDeleting(false)
    }
  }

  const totalShown = filtered.reduce((sum, tx) => (tx.type === 'income' ? sum : sum + tx.amount), 0)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Transaksi"
        description="Semua pemasukan dan pengeluaran bulan ini."
        actions={
          <>
            <PeriodSelector />
            <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-2">
              <FileUp className="size-4" aria-hidden />
              Impor CSV
            </Button>
            <Button variant="outline" onClick={() => setScanOpen(true)} className="gap-2">
              <ScanLine className="size-4" aria-hidden />
              Scan struk
            </Button>
            <Button onClick={openCreate} className="gap-2">
              <Plus className="size-4" aria-hidden />
              Transaksi
            </Button>
          </>
        }
      />

      <TransactionFilters filters={filters} onChange={setFilters} availableTags={availableTags} />

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{filtered.length} transaksi</span>
        <span aria-hidden>·</span>
        <span>
          Total pengeluaran{' '}
          <MoneyDisplay value={totalShown} className="font-medium text-foreground" />
        </span>
      </div>

      {isLoading && transactions.length === 0 ? (
        <Card>
          <CardContent className="p-4">
            <LoadingSkeleton rows={6} />
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={hasActiveFilters(filters) ? 'Tidak ada yang cocok' : 'Belum ada transaksi'}
          description={
            hasActiveFilters(filters)
              ? 'Coba longgarkan filter atau ubah kata kunci pencarian.'
              : 'Catat transaksi pertamamu bulan ini.'
          }
          actionLabel={hasActiveFilters(filters) ? 'Reset filter' : 'Catat transaksi'}
          onAction={hasActiveFilters(filters) ? () => setFilters(EMPTY_FILTERS) : openCreate}
        />
      ) : (
        <>
          <TransactionTable
            transactions={filtered}
            categories={categories}
            selectedIds={selectedIds}
            onToggleSelect={(id) =>
              setSelectedIds((current) =>
                current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
              )
            }
            onToggleAll={() =>
              setSelectedIds((current) =>
                current.length === filtered.length ? [] : filtered.map((tx) => tx.id),
              )
            }
            onEdit={(tx) => {
              setEditing(tx)
              setDuplicating(null)
              setFormOpen(true)
            }}
            onDuplicate={(tx) => {
              setEditing(null)
              setDuplicating({ ...tx, id: undefined, receiptUrl: undefined })
              setFormOpen(true)
            }}
            onDelete={(tx) => void deleteWithUndo(tx)}
            onViewReceipt={setViewingReceipt}
          />

          <TransactionCardList
            transactions={filtered}
            categories={categories}
            selectedIds={selectedIds}
            selectionMode={selectedIds.length > 0}
            onToggleSelect={(id) =>
              setSelectedIds((current) =>
                current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
              )
            }
            onEdit={(tx) => {
              setEditing(tx)
              setDuplicating(null)
              setFormOpen(true)
            }}
            onDelete={(tx) => void deleteWithUndo(tx)}
          />
        </>
      )}

      <BulkActionBar
        count={selectedIds.length}
        total={selectedTotal}
        onClear={() => setSelectedIds([])}
        onDelete={() => void deleteSelected()}
        deleting={deleting}
      />

      <ScanDialog open={scanOpen} onOpenChange={setScanOpen} />

      <ImportCsvWizard open={importOpen} onOpenChange={setImportOpen} categories={categories} />

      <TransactionForm
        open={formOpen}
        onOpenChange={setFormOpen}
        transaction={editing}
        initial={duplicating}
      />

      <ReceiptViewerDialog
        receipt={viewingReceipt}
        open={Boolean(viewingReceipt)}
        onOpenChange={(open) => !open && setViewingReceipt(null)}
      />
    </div>
  )
}
