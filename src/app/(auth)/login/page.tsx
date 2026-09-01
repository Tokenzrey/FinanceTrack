'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { browserLocalPersistence, browserSessionPersistence, setPersistence } from 'firebase/auth'
import { Loader2 } from 'lucide-react'
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
import { getFirebaseAuth, isFirebaseConfigured } from '@/shared/lib/firebase'
import { authErrorMessage } from '@/shared/lib/auth-errors'
import { loginSchema, type LoginInput } from '@/shared/lib/validation'
import { useAuthStore } from '@/shared/stores/auth.store'
import { FirebaseSetupNotice } from '@/shared/components/layout/FirebaseSetupNotice'
import { GoogleButton } from '@/shared/components/layout/GoogleButton'

export default function LoginPage() {
  const router = useRouter()
  const signIn = useAuthStore((s) => s.signIn)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [googleLoading, setGoogleLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', rememberMe: true },
  })

  // Already signed in (e.g. opened /login in a second tab) — go straight through.
  useEffect(() => {
    if (isAuthenticated) router.replace('/dashboard')
  }, [isAuthenticated, router])

  if (!isFirebaseConfigured) return <FirebaseSetupNotice />

  const onSubmit = async (values: LoginInput) => {
    try {
      // "Ingat saya" off means the session dies with the tab.
      await setPersistence(
        getFirebaseAuth(),
        values.rememberMe ? browserLocalPersistence : browserSessionPersistence,
      )
      await signIn(values.email, values.password)
      router.replace('/dashboard')
    } catch (error) {
      toast.error(authErrorMessage(error))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Masuk</CardTitle>
        <CardDescription>Kelola anggaran dan transaksimu.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="nama@email.com"
              aria-invalid={Boolean(errors.email)}
              {...register('email')}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Kata sandi</Label>
              <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                Lupa kata sandi?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              {...register('password')}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded accent-primary"
              {...register('rememberMe')}
            />
            Ingat saya
          </label>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Masuk
          </Button>
        </form>

        <div className="relative py-1">
          <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
          <span className="relative mx-auto block w-fit bg-card px-2 text-xs text-muted-foreground">
            atau
          </span>
        </div>

        <GoogleButton
          loading={googleLoading}
          setLoading={setGoogleLoading}
          onDone={() => router.replace('/dashboard')}
        />

        <p className="text-center text-sm text-muted-foreground">
          Belum punya akun?{' '}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Daftar
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
