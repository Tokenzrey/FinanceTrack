'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog'
import { Button } from '@/shared/components/ui/button'
import { Label } from '@/shared/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { repositories } from '@/shared/repositories'
import { useAuthStore } from '@/shared/stores/auth.store'
import { useMasterDataStore } from '@/shared/stores/master-data.store'
import { PILLAR_LABELS, type Category } from '@/shared/types/domain'

/**
 * Categories are soft-deleted, so history keeps rendering. The dialog offers to move
 * existing transactions somewhere first — otherwise they stay attached to a hidden
 * category and quietly disappear from the dashboard totals.
 */
export function DeleteCategoryDialog({
  category,
  onOpenChange,
}: {
  category: Category | null
  onOpenChange: (open: boolean) => void
}) {
  const userId = useAuthStore((s) => s.user?.uid)
  const categories = useMasterDataStore((s) => s.categories)
  const deleteCategory = useMasterDataStore((s) => s.deleteCategory)

  const [affected, setAffected] = useState<number | null>(null)
  const [target, setTarget] = useState('keep')
  const [deleting, setDeleting] = useState(false)

  // Count what would be orphaned, so the warning states a real number.
  useEffect(() => {
    if (!category || !userId) {
      setAffected(null)
      return
    }
    setTarget('keep')
    let cancelled = false
    repositories.transactions
      .findByCategory(userId, category.id, 500)
      .then((rows) => !cancelled && setAffected(rows.length))
      .catch(() => !cancelled && setAffected(null))
    return () => {
      cancelled = true
    }
  }, [category, userId])

  if (!category) return null

  const alternatives = categories.filter(
    (c) => c.isActive && c.id !== category.id && c.pillar !== 'income',
  )

  const confirm = async () => {
    setDeleting(true)
    try {
      await deleteCategory(category.id, target === 'keep' ? undefined : target)
      toast.success(
        target === 'keep'
          ? 'Kategori disembunyikan'
          : `Kategori disembunyikan, transaksi dipindahkan`,
      )
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menghapus kategori')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus kategori &ldquo;{category.name}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            Kategori disembunyikan, bukan dihapus permanen, sehingga riwayat bulan lalu tetap utuh.
            {affected !== null && affected > 0 && (
              <>
                {' '}
                <strong>{affected} transaksi</strong> masih memakai kategori ini.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {affected !== null && affected > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="remap" className="text-xs">
              Pindahkan transaksi ke
            </Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger id="remap">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="keep">— Biarkan menempel di kategori ini —</SelectItem>
                {alternatives.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name} ({PILLAR_LABELS[option.pillar]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {target === 'keep' && (
              <p className="text-xs text-muted-foreground">
                Transaksi lama tidak akan muncul di dasbor selama kategorinya tersembunyi.
              </p>
            )}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
          <Button variant="destructive" onClick={() => void confirm()} disabled={deleting}>
            {deleting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Hapus kategori
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
