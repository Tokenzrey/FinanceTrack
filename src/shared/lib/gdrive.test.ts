import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DriveError,
  deleteDriveFile,
  getOrCreateFinTrackFolders,
  uploadFileToGDrive,
} from './gdrive'

/**
 * Drive is exercised against a mocked `fetch`. The point of these tests is the contract
 * the API depends on: the bearer header, the folder-reuse logic, and the multipart
 * envelope — none of which can be checked by types alone.
 */

const TOKEN = 'ya29.test-access-token'

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    blob: async () => new Blob([JSON.stringify(body)]),
  } as Response
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('crypto', { ...globalThis.crypto, randomUUID: () => 'fixed-boundary' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function headerFrom(call: unknown[]): Record<string, string> {
  return (call[1] as RequestInit).headers as Record<string, string>
}

describe('authorization header', () => {
  it('sends the bearer token on every request', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ files: [{ id: 'folder-1' }] }))

    await getOrCreateFinTrackFolders(TOKEN)

    expect(fetchMock).toHaveBeenCalled()
    for (const call of fetchMock.mock.calls) {
      expect(headerFrom(call).Authorization).toBe(`Bearer ${TOKEN}`)
    }
  })

  it('refuses to call Drive without a token', async () => {
    await expect(getOrCreateFinTrackFolders('')).rejects.toThrow(DriveError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('getOrCreateFinTrackFolders', () => {
  it('reuses folders that already exist instead of duplicating them', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ files: [{ id: 'existing' }] }))

    const folders = await getOrCreateFinTrackFolders(TOKEN)

    expect(folders).toEqual({ rootId: 'existing', receiptsId: 'existing', exportsId: 'existing' })
    // Three lookups, zero creations.
    expect(
      fetchMock.mock.calls.every((call) => (call[1] as RequestInit).method === undefined),
    ).toBe(true)
  })

  it('creates the folder tree on first use', async () => {
    // Every lookup misses, so each folder is created.
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve(jsonResponse({ id: 'created' }))
      return Promise.resolve(jsonResponse({ files: [] }))
    })

    const folders = await getOrCreateFinTrackFolders(TOKEN)

    expect(folders.rootId).toBe('created')
    const creates = fetchMock.mock.calls.filter(
      (call) => (call[1] as RequestInit).method === 'POST',
    )
    expect(creates).toHaveLength(3)
  })

  it('nests the subfolders under the FinTrack root', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve(jsonResponse({ id: 'root-id' }))
      return Promise.resolve(jsonResponse({ files: [] }))
    })

    await getOrCreateFinTrackFolders(TOKEN)

    const subfolderCreates = fetchMock.mock.calls
      .filter((call) => (call[1] as RequestInit).method === 'POST')
      .map((call) => JSON.parse((call[1] as RequestInit).body as string))
      .filter((body) => body.name !== 'FinTrack')

    expect(subfolderCreates).toHaveLength(2)
    for (const body of subfolderCreates) {
      expect(body.parents).toEqual(['root-id'])
    }
  })

  it('escapes a quote in a folder name rather than breaking the query', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ files: [{ id: 'x' }] }))
    await getOrCreateFinTrackFolders(TOKEN)

    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('trashed+%3D+false')
  })
})

describe('uploadFileToGDrive', () => {
  it('posts a multipart body with the declared boundary', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        id: 'file-1',
        name: 'struk.jpg',
        webViewLink: 'https://drive.google.com/file/d/file-1/view',
        thumbnailLink: 'https://lh3.google.com/thumb',
      }),
    )

    const result = await uploadFileToGDrive(
      new Blob(['bytes'], { type: 'image/jpeg' }),
      'struk.jpg',
      'folder-1',
      TOKEN,
    )

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('uploadType=multipart')
    expect((init as RequestInit).method).toBe('POST')
    expect(headerFrom(fetchMock.mock.calls[0])['Content-Type']).toBe(
      'multipart/related; boundary=fintrack-fixed-boundary',
    )

    expect(result).toEqual({
      fileId: 'file-1',
      name: 'struk.jpg',
      webViewLink: 'https://drive.google.com/file/d/file-1/view',
      thumbnailLink: 'https://lh3.google.com/thumb',
    })
  })

  it('falls back to a constructed view link when Drive omits one', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'file-2', name: 'a.jpg' }))

    const result = await uploadFileToGDrive(new Blob(['x']), 'a.jpg', 'folder', TOKEN)
    expect(result.webViewLink).toBe('https://drive.google.com/file/d/file-2/view')
  })
})

describe('error handling', () => {
  it('reports an expired token distinctly from other failures', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'invalid' }, 401))

    await expect(deleteDriveFile('file-1', TOKEN)).rejects.toThrow(/kedaluwarsa atau ditolak/)
  })

  it('treats a declined scope (403) the same as an expired token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'forbidden' }, 403))

    await expect(deleteDriveFile('file-1', TOKEN)).rejects.toMatchObject({ status: 403 })
  })

  it('surfaces the status for other errors', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'boom' }, 500))

    await expect(deleteDriveFile('file-1', TOKEN)).rejects.toThrow(/500/)
  })
})
