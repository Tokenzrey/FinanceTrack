'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  AlertTriangle,
  Bell,
  Cloud,
  KeyRound,
  Link2,
  Loader2,
  LogOut,
  Lock,
  LockOpen,
  Mail,
  Monitor,
  Moon,
  Sun,
  Trash2,
  Unlink,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Switch } from '@/shared/components/ui/switch'
import { PageHeader } from '@/shared/components/layout/TopBar'
import { PeriodSelector } from '@/modules/dashboard/components/DashboardHeader'
import { cn } from '@/shared/lib/utils'
import { formatMonthLong } from '@/shared/lib/format'
import { fireConfetti } from '@/shared/lib/confetti'
import { requestNotificationPermission } from '@/shared/lib/notifications'
import { authErrorMessage } from '@/shared/lib/auth-errors'
import { useGoogleDrive, isGoogleDriveConfigured } from '@/shared/hooks/useGoogleDrive'
import {
  changeEmailSchema,
  changePasswordSchema,
  type ChangeEmailInput,
  type ChangePasswordInput,
} from '@/shared/lib/validation'
import { repositories } from '@/shared/repositories'
import { resetAllData, resetMonthData } from '@/shared/use-cases/data/ResetData.usecase'
import { useAuthStore } from '@/shared/stores/auth.store'
import { useBudgetStore } from '@/shared/stores/budget.store'
import { DEFAULT_APP_SETTINGS, type AppSettings, type ResetSummary } from '@/shared/types/domain'

const RESET_CONFIRM_WORD = 'HAPUS'
type ResetScope = 'current' | 'specific' | 'all'

const THEMES = [
  { value: 'light', label: 'Terang', icon: Sun },
  { value: 'dark', label: 'Gelap', icon: Moon },
  { value: 'system', label: 'Sistem', icon: Monitor },
] as const

export function SettingsPage() {
  const userId = useAuthStore((s) => s.user?.uid)
  const profile = useAuthStore((s) => s.profile)
  const signOut = useAuthStore((s) => s.signOut)
  const changePassword = useAuthStore((s) => s.changePassword)
  const changeEmail = useAuthStore((s) => s.changeEmail)
  const hasPasswordProvider = useAuthStore((s) =>
    s.user?.providerData.some((p) => p.providerId === 'password') ?? false,
  )
  const { theme, setTheme } = useTheme()

  const {
    linked: driveLinked,
    linkedEmail: driveLinkedEmail,
    authorizing: driveAuthorizing,
    checkLinkStatus,
    linkGoogleDrive,
    unlinkGoogleDrive,
  } = useGoogleDrive()
  const [unlinking, setUnlinking] = useState(false)
  const [confirmUnlinkDrive, setConfirmUnlinkDrive] = useState(false)

  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
  const [emailDialogOpen, setEmailDialogOpen] = useState(false)

  const passwordForm = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })
  const emailForm = useForm<ChangeEmailInput>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: { newEmail: '', currentPassword: '' },
  })

  const { year, month } = useBudgetStore((s) => s.activePeriod)
  const monthlyBudget = useBudgetStore((s) => s.monthlyBudget)
  const summary = useBudgetStore((s) => s.summary)
  const closeActiveMonth = useBudgetStore((s) => s.closeActiveMonth)
  const reopenActiveMonth = useBudgetStore((s) => s.reopenActiveMonth)
  const loadSummary = useBudgetStore((s) => s.loadSummary)

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)
  const [saving, setSaving] = useState(false)
  const [closing, setClosing] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [resetScope, setResetScope] = useState<ResetScope>('current')
  const [resetYear, setResetYear] = useState(year)
  const [resetMonth, setResetMonth] = useState(month)
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    if (!userId) return
    void repositories.users.findSettings(userId).then((stored) => {
      if (stored) setSettings(stored)
    })
    void loadSummary()
  }, [userId, year, month, loadSummary])

  useEffect(() => {
    if (!userId || !isGoogleDriveConfigured) return
    void checkLinkStatus()
  }, [userId, checkLinkStatus])

  const handleLinkDrive = async () => {
    try {
      await linkGoogleDrive()
      toast.success('Google Drive tertaut. Scan struk dan ekspor tidak akan minta izin lagi.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menautkan Google Drive.')
    }
  }

  const handleUnlinkDrive = async () => {
    setUnlinking(true)
    try {
      await unlinkGoogleDrive()
      toast.success('Tautan Google Drive diputus.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal memutuskan tautan.')
    } finally {
      setUnlinking(false)
      setConfirmUnlinkDrive(false)
    }
  }

  const submitPasswordChange = async (values: ChangePasswordInput) => {
    try {
      await changePassword(values.currentPassword, values.newPassword)
      toast.success('Kata sandi berhasil diganti.')
      passwordForm.reset()
      setPasswordDialogOpen(false)
    } catch (error) {
      toast.error(authErrorMessage(error))
    }
  }

  const submitEmailChange = async (values: ChangeEmailInput) => {
    if (values.newEmail.trim().toLowerCase() === profile?.email?.toLowerCase()) {
      emailForm.setError('newEmail', { message: 'Ini email yang sudah kamu pakai.' })
      return
    }
    try {
      await changeEmail(values.newEmail, values.currentPassword || undefined)
      toast.success('Cek email baru untuk konfirmasi — email akun berganti setelah kamu mengklik link itu.')
      emailForm.reset()
      setEmailDialogOpen(false)
    } catch (error) {
      toast.error(authErrorMessage(error))
    }
  }

  const persist = async (next: AppSettings) => {
    setSettings(next)
    if (!userId) return
    setSaving(true)
    try {
      await repositories.users.saveSettings(userId, next)
    } catch {
      toast.error('Gagal menyimpan pengaturan')
    } finally {
      setSaving(false)
    }
  }

  const toggleNotification = async (key: keyof AppSettings['notifications'], value: boolean) => {
    // Browser permission must be granted before any of these can actually fire.
    if (value && (key === 'dailyReminder' || key === 'budgetAlert')) {
      const granted = await requestNotificationPermission()
      if (!granted) {
        toast.error('Izin notifikasi browser ditolak.')
        return
      }
    }
    await persist({ ...settings, notifications: { ...settings.notifications, [key]: value } })
  }

  const closeMonth = async () => {
    setClosing(true)
    try {
      // Under budget is worth celebrating — the moment "Tutup Bulan" becomes real.
      const underBudget = summary ? summary.totalUsed < summary.totalBudget : false
      await closeActiveMonth()
      toast.success(`${formatMonthLong(year, month)} ditutup`)
      if (underBudget) fireConfetti()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menutup bulan')
    } finally {
      setClosing(false)
      setConfirmClose(false)
    }
  }

  const reopenMonth = async () => {
    setClosing(true)
    try {
      await reopenActiveMonth()
      toast.success(`${formatMonthLong(year, month)} dibuka kembali`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal membuka bulan')
    } finally {
      setClosing(false)
    }
  }

  const isClosed = Boolean(monthlyBudget?.closedAt)

  const summarizeReset = (result: ResetSummary) =>
    `${result.transactionsDeleted} transaksi, ${result.goalContributionsDeleted} setoran goal, ${result.otherDeleted} data lain terhapus. Memuat ulang…`

  const handleReset = async () => {
    if (!userId || resetConfirmText !== RESET_CONFIRM_WORD) return
    setResetting(true)
    try {
      const result =
        resetScope === 'all'
          ? await resetAllData(userId)
          : await resetMonthData(
              userId,
              resetScope === 'current' ? year : resetYear,
              resetScope === 'current' ? month : resetMonth,
            )
      toast.success(summarizeReset(result))
      // A full reload rather than reconciling every store (transactions, budget, goals,
      // net worth, recurring, scans, wishlist) individually — this action is rare and
      // heavy enough that a clean refetch of everything is simpler and safer than
      // trying to enumerate every in-memory cache that might now be stale.
      setTimeout(() => window.location.reload(), 1200)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal mereset data.')
      setResetting(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Pengaturan" description="Tampilan, notifikasi, dan akun." />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Akun</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{profile?.displayName ?? 'Pengguna'}</p>
              <p className="truncate text-xs text-muted-foreground">{profile?.email}</p>
            </div>
            <Button variant="outline" onClick={() => void signOut()} className="gap-2">
              <LogOut className="size-4" aria-hidden />
              Keluar
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasPasswordProvider && (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setPasswordDialogOpen(true)}>
                <KeyRound className="size-3.5" aria-hidden />
                Ganti kata sandi
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setEmailDialogOpen(true)}>
              <Mail className="size-3.5" aria-hidden />
              Ganti email
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="size-4" aria-hidden />
            Google Drive
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!isGoogleDriveConfigured ? (
            <p className="text-xs text-muted-foreground">
              Belum dikonfigurasi — isi NEXT_PUBLIC_GOOGLE_CLIENT_ID di .env.local.
            </p>
          ) : driveLinked === null ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Memeriksa status tautan…
            </div>
          ) : driveLinked ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-safe">Tertaut</p>
                <p className="truncate text-xs text-muted-foreground">
                  {driveLinkedEmail
                    ? `Struk dan ekspor tersimpan ke Drive akun ${driveLinkedEmail}.`
                    : 'Struk dan ekspor tersimpan ke Drive-mu tanpa perlu izin ulang.'}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={unlinking}
                onClick={() => setConfirmUnlinkDrive(true)}
              >
                {unlinking ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Unlink className="size-3.5" aria-hidden />
                )}
                Putuskan tautan
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Belum tertaut</p>
                <p className="text-xs text-muted-foreground">
                  Perlu ditautkan sekali agar scan struk dan ekspor bisa menyimpan ke Drive-mu.
                </p>
              </div>
              <Button
                size="sm"
                className="gap-2"
                disabled={driveAuthorizing}
                onClick={() => void handleLinkDrive()}
              >
                {driveAuthorizing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Link2 className="size-3.5" aria-hidden />
                )}
                Tautkan Google Drive
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Tampilan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <span className="text-xs font-medium">Tema</span>
            <div className="flex gap-2">
              {THEMES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={theme === option.value}
                  onClick={() => setTheme(option.value)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors',
                    theme === option.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'hover:bg-muted',
                  )}
                >
                  <option.icon className="size-4" aria-hidden />
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="min-w-0 pr-3">
              <p className="text-sm font-medium">Tampilkan perasaan belanja</p>
              <p className="text-xs text-muted-foreground">
                Pilihan emoji saat mencatat pengeluaran.
              </p>
            </div>
            <Switch
              checked={settings.display.showMoodTracker}
              onCheckedChange={(value) =>
                void persist({
                  ...settings,
                  display: { ...settings.display, showMoodTracker: value },
                })
              }
              aria-label="Tampilkan perasaan belanja"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="size-4" aria-hidden />
            Notifikasi
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="min-w-0 pr-3">
              <p className="text-sm font-medium">Pengingat harian</p>
              <p className="text-xs text-muted-foreground">
                Ingatkan mencatat transaksi setiap hari.
              </p>
            </div>
            <Switch
              checked={settings.notifications.dailyReminder}
              onCheckedChange={(value) => void toggleNotification('dailyReminder', value)}
              aria-label="Pengingat harian"
            />
          </div>

          {settings.notifications.dailyReminder && (
            <div className="space-y-1.5">
              <Label htmlFor="reminder-time" className="text-xs">
                Jam pengingat
              </Label>
              <Input
                id="reminder-time"
                type="time"
                value={settings.notifications.reminderTime}
                onChange={(event) =>
                  void persist({
                    ...settings,
                    notifications: { ...settings.notifications, reminderTime: event.target.value },
                  })
                }
                className="w-32"
              />
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="min-w-0 pr-3">
              <p className="text-sm font-medium">Peringatan anggaran</p>
              <p className="text-xs text-muted-foreground">
                Beri tahu saat kategori melewati {settings.notifications.budgetAlertThreshold}%.
              </p>
            </div>
            <Switch
              checked={settings.notifications.budgetAlert}
              onCheckedChange={(value) => void toggleNotification('budgetAlert', value)}
              aria-label="Peringatan anggaran"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Notifikasi hanya muncul selama aplikasi terbuka di browser — tanpa server push,
            pengingat tidak berjalan saat tab tertutup.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="size-4" aria-hidden />
            Tutup bulan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <PeriodSelector />
            {isClosed ? (
              <>
                <span className="text-sm font-medium text-safe">
                  {formatMonthLong(year, month)} sudah ditutup
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void reopenMonth()}
                  disabled={closing}
                  className="gap-2"
                >
                  {closing ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <LockOpen className="size-3.5" aria-hidden />
                  )}
                  Buka kembali
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setConfirmClose(true)} disabled={closing}>
                {closing && <Loader2 className="mr-2 size-4 animate-spin" />}
                Tutup {formatMonthLong(year, month)}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Bulan tertutup dikunci sungguhan: transaksi baru, perubahan, dan penghapusan di bulan
            itu ditolak sampai dibuka kembali di sini.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Cloud className="size-4" aria-hidden />
            Privasi data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p>
            <strong className="text-foreground">Cloud (Firestore, milik Google/Firebase):</strong>{' '}
            transaksi, kategori, anggaran, target, dan aturan berulang — semuanya milikmu, hanya
            bisa dibaca oleh akunmu.
          </p>
          <p>
            <strong className="text-foreground">Google Drive milikmu sendiri:</strong> foto struk
            dan file ekspor {isGoogleDriveConfigured ? '(aktif)' : '(belum dikonfigurasi)'} —
            tersimpan di folder &ldquo;FinTrack&rdquo; di akun Drive-mu sendiri, bukan di server
            aplikasi ini. Aplikasi hanya bisa membaca/menulis folder itu, tidak file lain di Drive-mu.
          </p>
          <p>
            <strong className="text-foreground">Browser (perangkat ini saja):</strong> tema, status
            sidebar, dan cache offline Firestore — tidak pernah terkirim ke mana pun.
          </p>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-destructive">
            <AlertTriangle className="size-4" aria-hidden />
            Zona berbahaya
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Hapus transaksi dan catatan keuangan supaya bisa mulai dari awal — kategori, template
            anggaran, dan akunmu tidak ikut terhapus.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setResetDialogOpen(true)}
          >
            <Trash2 className="size-3.5" aria-hidden />
            Reset data
          </Button>
        </CardContent>
      </Card>

      {saving && <p className="text-xs text-muted-foreground">Menyimpan…</p>}

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tutup {formatMonthLong(year, month)}?</AlertDialogTitle>
            <AlertDialogDescription>
              Bulan ini akan ditandai selesai dan muncul dengan label &ldquo;Ditutup&rdquo; di
              riwayat.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => void closeMonth()}>Tutup bulan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmUnlinkDrive} onOpenChange={setConfirmUnlinkDrive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Putuskan tautan Google Drive?</AlertDialogTitle>
            <AlertDialogDescription>
              Scan struk dan ekspor baru tidak akan tersimpan ke Drive sampai kamu tautkan lagi.
              Struk yang sudah tersimpan tetap aman di Drive-mu, tapi tidak bisa dilihat di
              aplikasi ini sampai tertaut kembali.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleUnlinkDrive()}>
              Putuskan tautan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ganti kata sandi</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={passwordForm.handleSubmit(submitPasswordChange)}
            className="space-y-4"
            noValidate
          >
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword">Kata sandi saat ini</Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                aria-invalid={Boolean(passwordForm.formState.errors.currentPassword)}
                {...passwordForm.register('currentPassword')}
              />
              {passwordForm.formState.errors.currentPassword && (
                <p className="text-xs text-destructive">
                  {passwordForm.formState.errors.currentPassword.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">Kata sandi baru</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                aria-invalid={Boolean(passwordForm.formState.errors.newPassword)}
                {...passwordForm.register('newPassword')}
              />
              {passwordForm.formState.errors.newPassword && (
                <p className="text-xs text-destructive">
                  {passwordForm.formState.errors.newPassword.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Ulangi kata sandi baru</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                aria-invalid={Boolean(passwordForm.formState.errors.confirmPassword)}
                {...passwordForm.register('confirmPassword')}
              />
              {passwordForm.formState.errors.confirmPassword && (
                <p className="text-xs text-destructive">
                  {passwordForm.formState.errors.confirmPassword.message}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={passwordForm.formState.isSubmitting}>
              {passwordForm.formState.isSubmitting && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Simpan kata sandi baru
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ganti email</DialogTitle>
          </DialogHeader>
          <form onSubmit={emailForm.handleSubmit(submitEmailChange)} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="newEmail">Email baru</Label>
              <Input
                id="newEmail"
                type="email"
                autoComplete="email"
                placeholder="email-baru@email.com"
                aria-invalid={Boolean(emailForm.formState.errors.newEmail)}
                {...emailForm.register('newEmail')}
              />
              {emailForm.formState.errors.newEmail && (
                <p className="text-xs text-destructive">{emailForm.formState.errors.newEmail.message}</p>
              )}
            </div>
            {hasPasswordProvider && (
              <div className="space-y-1.5">
                <Label htmlFor="emailCurrentPassword">Kata sandi saat ini</Label>
                <Input
                  id="emailCurrentPassword"
                  type="password"
                  autoComplete="current-password"
                  {...emailForm.register('currentPassword')}
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {hasPasswordProvider
                ? 'Link konfirmasi dikirim ke email baru. Email akun baru aktif setelah link itu diklik.'
                : 'Akun Google akan minta konfirmasi masuk ulang, lalu link konfirmasi dikirim ke email baru.'}
            </p>
            <Button type="submit" className="w-full" disabled={emailForm.formState.isSubmitting}>
              {emailForm.formState.isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Kirim link konfirmasi
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={resetDialogOpen}
        onOpenChange={(open) => {
          setResetDialogOpen(open)
          if (!open) {
            setResetConfirmText('')
            setResetScope('current')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" aria-hidden />
              Reset data
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <span className="text-xs font-medium">Cakupan</span>
              <div className="grid gap-2">
                {(
                  [
                    { value: 'current', label: `Bulan ini (${formatMonthLong(year, month)})` },
                    { value: 'specific', label: 'Bulan tertentu' },
                    { value: 'all', label: 'Semua data' },
                  ] satisfies { value: ResetScope; label: string }[]
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={resetScope === option.value}
                    onClick={() => setResetScope(option.value)}
                    className={cn(
                      'rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                      resetScope === option.value
                        ? 'border-destructive bg-destructive/10 text-destructive'
                        : 'hover:bg-muted',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {resetScope === 'specific' && (
              <div className="flex gap-2">
                <select
                  value={resetMonth}
                  onChange={(event) => setResetMonth(Number(event.target.value))}
                  className="h-9 flex-1 rounded-lg border bg-background px-2 text-sm"
                  aria-label="Bulan"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {formatMonthLong(resetYear, m).split(' ')[0]}
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  value={resetYear}
                  onChange={(event) => setResetYear(Number(event.target.value) || resetYear)}
                  className="w-24"
                  aria-label="Tahun"
                />
              </div>
            )}

            <div className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-muted-foreground">
              {resetScope === 'all' ? (
                <>
                  <p>
                    <strong className="text-foreground">Dihapus permanen:</strong> semua transaksi,
                    anggaran bulanan, goal &amp; setoran, snapshot kekayaan bersih, aset &amp;
                    utang, aturan rutin, riwayat scan struk, dan wishlist.
                  </p>
                  <p>
                    <strong className="text-foreground">Tetap ada:</strong> kategori, item
                    kategori, template anggaran, profil, pengaturan, dan tautan Google Drive.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    <strong className="text-foreground">Dihapus permanen untuk{' '}
                      {formatMonthLong(
                        resetScope === 'current' ? year : resetYear,
                        resetScope === 'current' ? month : resetMonth,
                      )}:
                    </strong>{' '}
                    transaksi, anggaran/pemasukan bulan itu, setoran goal bulan itu (total goal
                    disesuaikan), snapshot kekayaan bersih bulan itu, riwayat scan struk bulan
                    itu — termasuk kunci &ldquo;tutup bulan&rdquo; jika ada.
                  </p>
                  <p>
                    <strong className="text-foreground">Tidak ikut terhapus:</strong> goal, aturan
                    rutin, aset/utang, dan wishlist.
                  </p>
                </>
              )}
              <p>
                Struk yang sudah tersimpan di Google Drive-mu tidak ikut terhapus — hanya
                catatannya di aplikasi.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="resetConfirm">
                Ketik <span className="font-mono font-semibold">{RESET_CONFIRM_WORD}</span> untuk
                konfirmasi
              </Label>
              <Input
                id="resetConfirm"
                value={resetConfirmText}
                onChange={(event) => setResetConfirmText(event.target.value)}
                autoComplete="off"
              />
            </div>

            <Button
              variant="destructive"
              className="w-full gap-2"
              disabled={resetConfirmText !== RESET_CONFIRM_WORD || resetting}
              onClick={() => void handleReset()}
            >
              {resetting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" aria-hidden />
              )}
              Reset sekarang
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
