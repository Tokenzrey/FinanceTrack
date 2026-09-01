import { z } from 'zod'

// No `.default()` in these schemas: a zod default makes the parsed input type differ from
// the output type, which breaks react-hook-form's resolver typing. Defaults belong in
// `useForm({ defaultValues })` instead.

// Firebase enforces a 6-character minimum; matching it here gives an instant client-side error.
const password = z.string().min(6, 'Kata sandi minimal 6 karakter')

export const loginSchema = z.object({
  email: z.string().min(1, 'Email wajib diisi').email('Format email tidak valid'),
  password: z.string().min(1, 'Kata sandi wajib diisi'),
  rememberMe: z.boolean(),
})

export const registerSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2, 'Nama minimal 2 karakter')
      .max(50, 'Nama terlalu panjang'),
    email: z.string().min(1, 'Email wajib diisi').email('Format email tidak valid'),
    password,
    confirmPassword: z.string().min(1, 'Konfirmasi kata sandi wajib diisi'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Konfirmasi kata sandi tidak cocok',
    path: ['confirmPassword'],
  })

export const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'Email wajib diisi').email('Format email tidak valid'),
})

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Kata sandi saat ini wajib diisi'),
    newPassword: password,
    confirmPassword: z.string().min(1, 'Konfirmasi kata sandi wajib diisi'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Konfirmasi kata sandi tidak cocok',
    path: ['confirmPassword'],
  })

export const changeEmailSchema = z.object({
  newEmail: z.string().min(1, 'Email baru wajib diisi').email('Format email tidak valid'),
  currentPassword: z.string().optional(),
})

export const transactionSchema = z.object({
  date: z.date(),
  type: z.enum(['income', 'expense', 'transfer']),
  categoryId: z.string().min(1, 'Pilih kategori'),
  categoryItemId: z.string().optional(),
  amount: z.number().positive('Jumlah harus lebih dari nol'),
  description: z.string().max(200, 'Deskripsi terlalu panjang').optional(),
  tags: z.array(z.string()),
  paymentMethod: z.enum(['cash', 'debit', 'credit', 'transfer', 'ewallet', 'qris']).optional(),
  location: z.string().max(100).optional(),
  mood: z.enum(['regret', 'neutral', 'happy']).optional(),
})

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Nama kategori wajib diisi').max(40, 'Nama terlalu panjang'),
  pillar: z.enum(['income', 'needs', 'wants', 'savings']),
  percentOfIncome: z.number().min(0, 'Minimal 0%').max(100, 'Maksimal 100%'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Warna harus format hex'),
  icon: z.string().min(1),
  isSinkingFund: z.boolean(),
  sinkingFundTargetMonths: z.number().int().min(1).max(120).optional(),
  isRecurring: z.boolean(),
  notes: z.string().max(200).optional(),
})

/** The three spend pillars must add up to exactly 100%. */
export const pillarConfigSchema = z
  .object({
    needs: z.number().min(0).max(1),
    wants: z.number().min(0).max(1),
    savings: z.number().min(0).max(1),
  })
  .refine((c) => Math.abs(c.needs + c.wants + c.savings - 1) < 0.001, {
    message: 'Total alokasi harus 100%',
  })

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>
export type TransactionInput = z.infer<typeof transactionSchema>
export type CategoryInput = z.infer<typeof categorySchema>
