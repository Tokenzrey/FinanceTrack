'use client'

import { onAuthStateChanged, type User } from 'firebase/auth'
import { create } from 'zustand'
import { getFirebaseAuth, isFirebaseConfigured } from '@/shared/lib/firebase'
import { repositories } from '@/shared/repositories'
import { ensureProfile, signUpWithEmail } from '@/shared/use-cases/auth/SignUp.usecase'
import { signInWithEmail, signInWithGoogle } from '@/shared/use-cases/auth/SignIn.usecase'
import { signOut as signOutUseCase } from '@/shared/use-cases/auth/SignOut.usecase'
import { resetPassword as resetPasswordUseCase } from '@/shared/use-cases/auth/ResetPassword.usecase'
import { changePassword as changePasswordUseCase } from '@/shared/use-cases/auth/ChangePassword.usecase'
import { changeEmail as changeEmailUseCase } from '@/shared/use-cases/auth/ChangeEmail.usecase'
import type { UserProfile } from '@/shared/types/domain'

interface AuthStore {
  user: User | null
  profile: UserProfile | null
  isLoading: boolean
  isAuthenticated: boolean
  signIn: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signUp: (email: string, password: string, name: string) => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  changeEmail: (newEmail: string, currentPassword?: string) => Promise<void>
  refreshProfile: () => Promise<void>
  initialize: () => () => void
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  profile: null,
  // Starts true so guards render a spinner instead of flashing the login page.
  isLoading: true,
  isAuthenticated: false,

  signIn: async (email, password) => {
    await signInWithEmail(email, password)
  },

  signInWithGoogle: async () => {
    const credential = await signInWithGoogle()
    // A first Google sign-in has no profile document yet.
    await ensureProfile(credential.user)
  },

  signUp: async (email, password, name) => {
    await signUpWithEmail(email, password, name)
  },

  signOut: async () => {
    await signOutUseCase()
    set({ user: null, profile: null, isAuthenticated: false })
  },

  resetPassword: async (email) => {
    await resetPasswordUseCase(email)
  },

  changePassword: async (currentPassword, newPassword) => {
    const user = get().user
    if (!user) throw new Error('Belum masuk.')
    await changePasswordUseCase(user, currentPassword, newPassword)
  },

  changeEmail: async (newEmail, currentPassword) => {
    const user = get().user
    if (!user) throw new Error('Belum masuk.')
    await changeEmailUseCase(user, newEmail, currentPassword)
  },

  refreshProfile: async () => {
    const user = get().user
    if (!user) return
    try {
      set({ profile: await repositories.users.findProfile(user.uid) })
    } catch (error) {
      console.warn('Gagal me-refresh profil:', error)
    }
  },

  initialize: () => {
    if (!isFirebaseConfigured) {
      set({ isLoading: false })
      return () => {}
    }

    return onAuthStateChanged(getFirebaseAuth(), async (user) => {
      if (!user) {
        set({ user: null, profile: null, isAuthenticated: false, isLoading: false })
        return
      }

      set({ user, isAuthenticated: true })
      try {
        set({ profile: await repositories.users.findProfile(user.uid) })
      } catch (error) {
        console.warn('Gagal mengambil profil (offline/error):', error)
        set({ profile: null })
      } finally {
        set({ isLoading: false })
      }
    })
  },
}))
