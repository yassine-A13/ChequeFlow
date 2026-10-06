import { del, get, put } from '@vercel/blob'

export const maxChequeImageBytes = 2 * 1024 * 1024

export interface StorageUpload {
  filename: string
  contentType: string
  bytes: Uint8Array
}

export interface StoredFile {
  url: string
  contentType: string
}

export interface FileStorageService {
  uploadChequeImage(userId: string, chequeId: string, file: StorageUpload): Promise<StoredFile>
  delete(url: string): Promise<void>
  readPrivate(url: string): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string } | null>
}

const formats = {
  '.jpg': { contentType: 'image/jpeg', extension: 'jpg' },
  '.jpeg': { contentType: 'image/jpeg', extension: 'jpg' },
  '.png': { contentType: 'image/png', extension: 'png' },
  '.webp': { contentType: 'image/webp', extension: 'webp' },
} as const

export function validateChequeImage(file: StorageUpload): { extension: string } {
  const extension = file.filename.slice(file.filename.lastIndexOf('.')).toLowerCase() as keyof typeof formats
  const format = formats[extension]
  if (!format || file.contentType !== format.contentType) throw new Error('Choisissez une image JPEG, PNG ou WebP avec une extension et un type MIME valides.')
  if (file.bytes.byteLength === 0 || file.bytes.byteLength > maxChequeImageBytes) throw new Error('L’image doit peser au maximum 2 Mo.')

  const bytes = file.bytes
  const isPng = format.extension === 'png' && bytes.byteLength >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
  const isJpeg = format.extension === 'jpg' && bytes.byteLength >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  const isWebp = format.extension === 'webp' && bytes.byteLength >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  if (!isPng && !isJpeg && !isWebp) throw new Error('Le contenu du fichier ne correspond pas à son format image déclaré.')
  return { extension: format.extension }
}

class VercelBlobFileStorageService implements FileStorageService {
  async uploadChequeImage(userId: string, chequeId: string, file: StorageUpload) {
    const { extension } = validateChequeImage(file)
    const blob = await put(`users/${userId}/cheques/${chequeId}/image.${extension}`, Buffer.from(file.bytes), {
      access: 'private',
      addRandomSuffix: true,
      contentType: file.contentType,
    })
    return { url: blob.url, contentType: file.contentType }
  }

  async delete(url: string) {
    const parsed = this.validatePrivateUrl(url)
    await del(parsed.pathname.slice(1))
  }

  async readPrivate(url: string) {
    const parsed = this.validatePrivateUrl(url)
    const blob = await get(parsed.pathname.slice(1), { access: 'private', useCache: false })
    if (!blob || blob.statusCode !== 200) return null
    return { stream: blob.stream, contentType: blob.blob.contentType }
  }

  private validatePrivateUrl(value: string) {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.private.blob.vercel-storage.com')) throw new Error('URL de fichier privé invalide.')
    return url
  }
}

export const fileStorageService: FileStorageService = new VercelBlobFileStorageService()
