'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, Loader2, PartyPopper } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { MoneyInput } from '@/shared/components/finance/MoneyInput'
import { PillarColorDot } from '@/shared/components/finance/PillarBadge'
import { FirebaseSetupNotice } from '@/shared/components/layout/FirebaseSetupNotice'
import { isFirebaseConfigured } from '@/shared/lib/firebase'
import { formatIDR, formatPercent } from '@/shared/lib/format'
import { STARTER_CATEGORIES, scaleTemplates } from '@/shared/lib/category-templates'
import { authErrorMessage } from '@/shared/lib/auth-errors'
import { completeOnboarding } from '@/shared/use-cases/auth/CompleteOnboarding.usecase'
import { useAuthStore } from '@/shared/stores/auth.store'
import { DEFAULT_PILLAR_CONFIG, PILLAR_LABELS, type PillarConfig } from '@/shared/types/domain'
import { cn } from '@/shared/lib/utils'

const STEPS = ['Selamat datang', 'Penghasilan', 'Alokasi', 'Kategori'] as const

export default function OnboardingPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const isLoading = useAuthStore((s) => s.isLoading)
  const refreshProfile = useAuthStore((s) => s.refreshProfile)

  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [monthlyIncome, setMonthlyIncome] = useState(0)
  const [pillarConfig, setPillarConfig] = useState<PillarConfig>(DEFAULT_PILLAR_CONFIG)
  const [selected, setSelected] = useState<string[]>(() => STARTER_CATEGORIES.map((c) => c.name))

  useEffect(() => {
    if (isLoading) return
    if (!user) router.replace('/login')
    else if (profile?.onboardingCompleted) router.replace('/dashboard')
  }, [isLoading, user, profile, router])

  // Prefill the name from the auth profile (Google gives one straight away).
  useEffect(() => {
    if (profile?.displayName) setDisplayName(profile.displayName)
  }, [profile?.displayName])

  const templates = useMemo(
    () =>
      scaleTemplates(
        STARTER_CATEGORIES.filter((c) => selected.includes(c.name)),
        pillarConfig,
      ),
    [selected, pillarConfig],
  )

  if (!isFirebaseConfigured) return <FirebaseSetupNotice />

  const pillarTotal = pillarConfig.needs + pillarConfig.wants + pillarConfig.savings
  const pillarValid = Math.abs(pillarTotal - 1) < 0.001

  const canContinue =
    (step === 0 && displayName.trim().length >= 2) ||
    (step === 1 && monthlyIncome > 0) ||
    (step === 2 && pillarValid) ||
    (step === 3 && selected.length > 0)

  const finish = async () => {
    if (!user) return
    setSaving(true)
    try {
      await completeOnboarding(user.uid, {
        displayName,
        monthlyIncome,
        pillarConfig,
        templates: STARTER_CATEGORIES.filter((c) => selected.includes(c.name)),
      })
      await refreshProfile()
      toast.success('Selamat! Anggaran pertamamu siap.')
      router.replace('/dashboard')
    } catch (error) {
      toast.error(authErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="w-full">
      <CardHeader className="space-y-4">
        <div
          className="flex gap-1.5"
          role="progressbar"
          aria-valuenow={step + 1}
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
        >
          {STEPS.map((label, index) => (
            <span
              key={label}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                index <= step ? 'bg-primary' : 'bg-muted',
              )}
            />
          ))}
        </div>
        <div>
          <CardTitle>{STEPS[step]}</CardTitle>
          <CardDescription>
            Langkah {step + 1} dari {STEPS.length}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {step === 0 && (
              <div className="space-y-2">
                <Label htmlFor="displayName">Siapa namamu?</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Nama panggilan"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">Dipakai untuk menyapamu di dasbor.</p>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-2">
                <Label htmlFor="income">Berapa penghasilan bulananmu?</Label>
                <MoneyInput
                  id="income"
                  value={monthlyIncome}
                  onChange={setMonthlyIncome}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">Bisa diubah kapan saja dari dasbor.</p>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <p className="text-sm text-muted-foreground">
                  Skema 50/30/20 adalah titik awal yang umum. Geser bila perlu.
                </p>

                {(['needs', 'wants', 'savings'] as const).map((pillar) => (
                  <div key={pillar} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 font-medium">
                        <PillarColorDot pillar={pillar} />
                        {PILLAR_LABELS[pillar]}
                      </span>
                      <span className="tabular text-muted-foreground">
                        {formatPercent(pillarConfig[pillar] * 100)} ·{' '}
                        {formatIDR(monthlyIncome * pillarConfig[pillar])}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={Math.round(pillarConfig[pillar] * 100)}
                      onChange={(event) =>
                        setPillarConfig({
                          ...pillarConfig,
                          [pillar]: Number(event.target.value) / 100,
                        })
                      }
                      className="w-full accent-primary"
                      aria-label={`Alokasi ${PILLAR_LABELS[pillar]}`}
                    />
                  </div>
                ))}

                <div
                  className={cn(
                    'rounded-xl border px-3 py-2 text-sm',
                    pillarValid
                      ? 'border-safe/30 bg-safe/10 text-safe'
                      : 'border-exceeded/30 bg-exceeded/10 text-exceeded',
                  )}
                >
                  Total alokasi: {formatPercent(pillarTotal * 100)}
                  {!pillarValid && ' — harus tepat 100%'}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPillarConfig(DEFAULT_PILLAR_CONFIG)}
                >
                  Kembali ke 50/30/20
                </Button>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Pilih kategori awal. Semuanya bisa diubah, ditambah, atau dihapus nanti.
                </p>

                <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                  {STARTER_CATEGORIES.map((template) => {
                    const active = selected.includes(template.name)
                    const scaled = templates.find((t) => t.name === template.name)
                    return (
                      <button
                        key={template.name}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          setSelected(
                            active
                              ? selected.filter((name) => name !== template.name)
                              : [...selected, template.name],
                          )
                        }
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                          active ? 'border-primary bg-primary/5' : 'hover:bg-muted',
                        )}
                      >
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: template.color }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {template.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {PILLAR_LABELS[template.pillar]}
                            {template.pillar !== 'income' &&
                              ` · ${formatPercent(scaled?.percentOfIncome ?? template.percentOfIncome, 1)}`}
                          </span>
                        </span>
                        {active && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
                      </button>
                    )
                  })}
                </div>

                <p className="text-xs text-muted-foreground">{selected.length} kategori dipilih</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="flex gap-2">
          {step > 0 && (
            <Button
              variant="outline"
              onClick={() => setStep(step - 1)}
              disabled={saving}
              className="gap-2"
            >
              <ArrowLeft className="size-4" aria-hidden />
              Kembali
            </Button>
          )}

          {step < STEPS.length - 1 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!canContinue}
              className="flex-1 gap-2"
            >
              Lanjut
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          ) : (
            <Button onClick={finish} disabled={!canContinue || saving} className="flex-1 gap-2">
              {saving ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <PartyPopper className="size-4" aria-hidden />
              )}
              Selesai
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
