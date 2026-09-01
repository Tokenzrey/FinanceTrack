'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
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
import { isFirebaseConfigured } from '@/shared/lib/firebase'
import { authErrorMessage } from '@/shared/lib/auth-errors'
import { registerSchema, type RegisterInput } from '@/shared/lib/validation'
import { useAuthStore } from '@/shared/stores/auth.store'
import { FirebaseSetupNotice } from '@/shared/components/layout/FirebaseSetupNotice'
import { GoogleButton } from '@/shared/components/layout/GoogleButton'

export default function RegisterPage() {
  const router = useRouter()
  const signUp = useAuthStore((s) => s.signUp)
  const [googleLoading, setGoogleLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { displayName: '', email: '', password: '', confirmPassword: '' },
  })

  if (!isFirebaseConfigured) return <FirebaseSetupNotice />

  const onSubmit = async (values: RegisterInput) => {
    try {
      await signUp(values.email, values.password, values.displayName)
      // A new account always has onboardingCompleted:false — go set the budget up.
      router.replace('/onboarding')
    } catch (error) {
      toast.error(authErrorMessage(error))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Buat akun</CardTitle>
        <CardDescription>Mulai lacak keuanganmu dalam Rupiah.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="displayName">Nama</Label>
            <Input
              id="displayName"
              autoComplete="name"
              placeholder="Nama panggilanmu"
              aria-invalid={Boolean(errors.displayName)}
              {...register('displayName')}
            />
            {errors.displayName && (
              <p className="text-xs text-destructive">{errors.displayName.message}</p>
            )}
          </div>

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
            <Label htmlFor="password">Kata sandi</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
              {...register('password')}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Ulangi kata sandi</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.confirmPassword)}
              {...register('confirmPassword')}
            />
            {errors.confirmPassword && (
              <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Daftar
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
          onDone={() => router.replace('/onboarding')}
          label="Daftar dengan Google"
        />

        <p className="text-center text-sm text-muted-foreground">
          Sudah punya akun?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Masuk
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
