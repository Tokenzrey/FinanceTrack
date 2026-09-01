/**
 * Google Drive REST client.
 *
 * Files live in the user's own Drive, not in Firebase Storage — zero storage cost, and
 * the user keeps custody of their receipts. The app requests only the `drive.file`
 * scope, which grants access to files this app created and nothing else: it cannot
 * list, read, or touch anything else in the user's Drive.
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

export const ROOT_FOLDER = 'FinTrack'
export const RECEIPTS_FOLDER = 'Receipts'
export const EXPORTS_FOLDER = 'Exports'

const FOLDER_MIME = 'application/vnd.google-apps.folder'

export class DriveError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'DriveError'
  }
}

export interface DriveFile {
  fileId: string
  webViewLink: string
  thumbnailLink?: string
  name: string
}

export interface DriveFolders {
  rootId: string
  receiptsId: string
  exportsId: string
}

function authHeaders(accessToken: string): HeadersInit {
  if (!accessToken) throw new DriveError('Token Google Drive tidak tersedia')
  return { Authorization: `Bearer ${accessToken}` }
}

async function driveFetch(url: string, accessToken: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { ...authHeaders(accessToken), ...(init.headers ?? {}) },
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    // 401/403 means the token expired or the scope was declined — the caller retries
    // after re-requesting a token rather than surfacing a raw Google error.
    throw new DriveError(
      response.status === 401 || response.status === 403
        ? 'Akses Google Drive kedaluwarsa atau ditolak.'
        : `Google Drive menolak permintaan (${response.status}). ${detail.slice(0, 120)}`,
      response.status,
    )
  }

  return response
}

/** Escapes a name for the Drive query language, where `'` and `\` are significant. */
function escapeQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

async function findFolder(
  name: string,
  parentId: string | null,
  accessToken: string,
): Promise<string | null> {
  const clauses = [
    `name = '${escapeQuery(name)}'`,
    `mimeType = '${FOLDER_MIME}'`,
    'trashed = false',
    parentId ? `'${escapeQuery(parentId)}' in parents` : null,
  ].filter(Boolean)

  const params = new URLSearchParams({
    q: clauses.join(' and '),
    fields: 'files(id,name)',
    // `drive.file` already limits the view to app-created files; this is belt and braces.
    spaces: 'drive',
    pageSize: '1',
  })

  const response = await driveFetch(`${DRIVE_API}/files?${params}`, accessToken)
  const data = (await response.json()) as { files?: { id: string }[] }
  return data.files?.[0]?.id ?? null
}

async function createFolder(
  name: string,
  parentId: string | null,
  accessToken: string,
): Promise<string> {
  const response = await driveFetch(`${DRIVE_API}/files?fields=id`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  })

  const data = (await response.json()) as { id: string }
  return data.id
}

async function getOrCreateFolder(
  name: string,
  parentId: string | null,
  accessToken: string,
): Promise<string> {
  return (
    (await findFolder(name, parentId, accessToken)) ?? createFolder(name, parentId, accessToken)
  )
}

/**
 * Ensures `FinTrack/Receipts` and `FinTrack/Exports` exist, and returns their ids.
 * Idempotent: an existing structure is reused rather than duplicated.
 */
export async function getOrCreateFinTrackFolders(accessToken: string): Promise<DriveFolders> {
  const rootId = await getOrCreateFolder(ROOT_FOLDER, null, accessToken)

  const [receiptsId, exportsId] = await Promise.all([
    getOrCreateFolder(RECEIPTS_FOLDER, rootId, accessToken),
    getOrCreateFolder(EXPORTS_FOLDER, rootId, accessToken),
  ])

  return { rootId, receiptsId, exportsId }
}

/**
 * Multipart upload: one request carrying both the metadata and the bytes.
 *
 * Drive's multipart format needs a hand-built body — the browser's FormData picks its
 * own boundary and omits the per-part Content-Type headers Drive requires.
 */
export async function uploadFileToGDrive(
  file: Blob,
  fileName: string,
  folderId: string,
  accessToken: string,
): Promise<DriveFile> {
  const boundary = `fintrack-${crypto.randomUUID()}`
  const metadata = { name: fileName, parents: [folderId] }

  const body = new Blob([
    `--${boundary}\r\n`,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\n`,
    `Content-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`,
    file,
    `\r\n--${boundary}--`,
  ])

  const params = new URLSearchParams({
    uploadType: 'multipart',
    fields: 'id,name,webViewLink,thumbnailLink',
  })

  const response = await driveFetch(`${DRIVE_UPLOAD_API}/files?${params}`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })

  const data = (await response.json()) as {
    id: string
    name: string
    webViewLink?: string
    thumbnailLink?: string
  }

  return {
    fileId: data.id,
    name: data.name,
    webViewLink: data.webViewLink ?? `https://drive.google.com/file/d/${data.id}/view`,
    thumbnailLink: data.thumbnailLink,
  }
}

export async function deleteDriveFile(fileId: string, accessToken: string): Promise<void> {
  await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, accessToken, {
    method: 'DELETE',
  })
}

/**
 * Fetches a Drive file's bytes as an object URL for display.
 *
 * Drive's `webContentLink` cannot be used in an `<img>` tag: it needs the Authorization
 * header, and browsers do not send one on image requests.
 */
export async function fetchDriveFileUrl(fileId: string, accessToken: string): Promise<string> {
  const response = await driveFetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`,
    accessToken,
  )
  return URL.createObjectURL(await response.blob())
}
