import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()
const del = vi.fn()
const doc = vi.fn()
const getAdminDb = vi.fn()

vi.mock('@/shared/lib/firebase-admin', () => ({
  getAdminDb: (...args: unknown[]) => getAdminDb(...args),
}))

const decryptSecret = vi.fn()
vi.mock('@/shared/lib/token-crypto', () => ({
  decryptSecret: (...args: unknown[]) => decryptSecret(...args),
}))

const getOrCreateFinTrackFolders = vi.fn()
const uploadFileToGDrive = vi.fn()
vi.mock('@/shared/lib/gdrive', () => ({
  getOrCreateFinTrackFolders: (...args: unknown[]) => getOrCreateFinTrackFolders(...args),
  uploadFileToGDrive: (...args: unknown[]) => uploadFileToGDrive(...args),
}))

const { uploadReceiptForUser } = await import('./drive-upload')

const originalEnv = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = 'client-id'
  process.env.GOOGLE_CLIENT_SECRET = 'client-secret'
  del.mockResolvedValue(undefined)
  doc.mockReturnValue({ get, delete: del })
  getAdminDb.mockReturnValue({ doc })
})

afterEach(() => {
  process.env = { ...originalEnv }
})

describe('uploadReceiptForUser', () => {
  it('returns null without touching Firestore when Drive OAuth env vars are missing', async () => {
    delete process.env.GOOGLE_CLIENT_SECRET
    const result = await uploadReceiptForUser('user-1', new Blob(['x']), 'r.jpg')
    expect(result).toBeNull()
    expect(getAdminDb).not.toHaveBeenCalled()
  })

  it('returns null when the user has never linked Drive', async () => {
    get.mockResolvedValue({ exists: false })
    const result = await uploadReceiptForUser('user-1', new Blob(['x']), 'r.jpg')
    expect(result).toBeNull()
    expect(uploadFileToGDrive).not.toHaveBeenCalled()
  })

  it('self-heals by deleting the doc when the stored token cannot be decrypted', async () => {
    get.mockResolvedValue({ exists: true, data: () => ({ enc: 'corrupt' }) })
    decryptSecret.mockImplementation(() => {
      throw new Error('bad key')
    })

    const result = await uploadReceiptForUser('user-1', new Blob(['x']), 'r.jpg')
    expect(result).toBeNull()
    expect(del).toHaveBeenCalledTimes(1)
  })

  it('self-heals by deleting the doc when Google rejects the refresh token (revoked access)', async () => {
    get.mockResolvedValue({ exists: true, data: () => ({ enc: 'enc-token' }) })
    decryptSecret.mockReturnValue('refresh-token')
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch

    const result = await uploadReceiptForUser('user-1', new Blob(['x']), 'r.jpg')
    expect(result).toBeNull()
    expect(del).toHaveBeenCalledTimes(1)
  })

  it('uploads and returns the file id/link for a healthy linked account', async () => {
    get.mockResolvedValue({ exists: true, data: () => ({ enc: 'enc-token' }) })
    decryptSecret.mockReturnValue('refresh-token')
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ access_token: 'access-1' }) }) as unknown as typeof fetch
    getOrCreateFinTrackFolders.mockResolvedValue({ receiptsId: 'folder-1' })
    uploadFileToGDrive.mockResolvedValue({ fileId: 'file-1', webViewLink: 'https://drive/file-1' })

    const result = await uploadReceiptForUser('user-1', new Blob(['x']), 'r.jpg')

    expect(result).toEqual({ gDriveFileId: 'file-1', gDriveWebViewLink: 'https://drive/file-1' })
    expect(uploadFileToGDrive).toHaveBeenCalledWith(expect.any(Blob), 'r.jpg', 'folder-1', 'access-1')
  })

  it('never throws — an unexpected error from the upload step resolves to null instead', async () => {
    get.mockResolvedValue({ exists: true, data: () => ({ enc: 'enc-token' }) })
    decryptSecret.mockReturnValue('refresh-token')
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ access_token: 'access-1' }) }) as unknown as typeof fetch
    getOrCreateFinTrackFolders.mockRejectedValue(new Error('network blip'))

    const result = await uploadReceiptForUser('user-1', new Blob(['x']), 'r.jpg')
    expect(result).toBeNull()
  })
})
