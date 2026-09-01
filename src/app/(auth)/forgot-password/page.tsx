'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react'
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
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/shared/lib/validation'
import { useAuthStore } from '@/shared/stores/auth.store'
import { FirebaseSetupNotice } from '@/shared/components/layout/FirebaseSetupNotice'

export default function ForgotPasswordPage() {
  const resetPassword = useAuthStore((s) => s.resetPassword)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  if (!isFirebaseConfigured) return <FirebaseSetupNotice />

  const onSubmit = async (values: ForgotPasswordInput) => {
    try {
      await resetPassword(values.email)
      setSentTo(values.email)
    } catch (error) {
      toast.error(authErrorMessage(error))
    }
  }

  if (sentTo) {
    return (
      <Card>
        <CardHeader>
          <span className="flex size-11 items-center justify-center rounded-2xl bg-safe/15 text-safe">
            <MailCheck className="size-5" aria-hidden />
          </span>
          <CardTitle>Email terkirim</CardTitle>
          <CardDescription>
            Tautan atur ulang kata sandi dikirim ke <strong>{sentTo}</strong>. Periksa juga folder
            spam.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="w-full gap-2">
            <Link href="/login">
              <ArrowLeft className="size-4" aria-hidden />
              Kembali ke halaman masuk
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lupa kata sandi</CardTitle>
        <CardDescription>Kami kirim tautan untuk mengatur ulang kata sandimu.</CardDescription>
      </CardHeader>

      <CardContent>
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

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Kirim tautan
          </Button>

          <Button asChild variant="ghost" className="w-full gap-2">
            <Link href="/login">
              <ArrowLeft className="size-4" aria-hidden />
              Kembali
            </Link>
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
