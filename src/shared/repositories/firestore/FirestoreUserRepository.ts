import { Timestamp, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import type { IUserRepository } from '../interfaces'
import type { AppSettings, UserProfile } from '@/shared/types/domain'
import { DEFAULT_APP_SETTINGS } from '@/shared/types/domain'
import { COLLECTIONS, colDoc, stripUndefined } from './paths'

// Profile and settings are two fixed documents under users/{uid}/meta.
const META = COLLECTIONS.meta
const PROFILE_DOC = 'profile'
const SETTINGS_DOC = 'settings'

export class FirestoreUserRepository implements IUserRepository {
  async findProfile(userId: string): Promise<UserProfile | null> {
    const snap = await getDoc(colDoc(userId, META, PROFILE_DOC))
    if (!snap.exists()) return null
    const data = snap.data()
    return {
      uid: userId,
      displayName: data.displayName ?? '',
      email: data.email ?? '',
      photoURL: data.photoURL,
      currency: 'IDR',
      locale: 'id-ID',
      timezone: data.timezone ?? 'Asia/Jakarta',
      onboardingCompleted: data.onboardingCompleted ?? false,
      createdAt: data.createdAt ?? Timestamp.now(),
    }
  }

  async createProfile(userId: string, data: Omit<UserProfile, 'createdAt'>): Promise<UserProfile> {
    const payload = stripUndefined({ ...data, uid: userId })
    await setDoc(
      colDoc(userId, META, PROFILE_DOC),
      { ...payload, createdAt: serverTimestamp() },
      { merge: true },
    )
    return { ...payload, createdAt: Timestamp.now() } as UserProfile
  }

  async updateProfile(userId: string, data: Partial<UserProfile>): Promise<void> {
    await setDoc(colDoc(userId, META, PROFILE_DOC), stripUndefined(data), { merge: true })
  }

  async findSettings(userId: string): Promise<AppSettings | null> {
    const snap = await getDoc(colDoc(userId, META, SETTINGS_DOC))
    if (!snap.exists()) return null
    // Merge over defaults so a settings doc written by an older build stays valid.
    return { ...DEFAULT_APP_SETTINGS, ...(snap.data() as Partial<AppSettings>) }
  }

  async saveSettings(userId: string, settings: Partial<AppSettings>): Promise<void> {
    await setDoc(colDoc(userId, META, SETTINGS_DOC), stripUndefined(settings), { merge: true })
  }
}
