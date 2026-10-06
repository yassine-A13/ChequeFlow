import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { getSession } from '../../lib/neon-auth'
import { deleteOwnChequeImage, readOwnChequeImage, replaceOwnChequeImage } from '../../../src/services/cheque.service'
import { maxChequeImageBytes } from '../../../src/services/file-storage.service'
import { isJsonRequest, isSameOriginRequest } from '../../../src/services/request-security.service'

type Request = IncomingMessage & { body?: unknown; query?: Record<string, string | string[] | undefined> }
type Response = ServerResponse & { status?: (code: number) => Response; json?: (body: unknown) => void }

function send(res: Response, status: number, data: unknown) {
  res.statusCode = status
  res.setHeader('Cache-Control', 'no-store')
  if (res.status) res.status(status)
  if (res.json) res.json(data)
  else { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)) }
}

function decodeUpload(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Le fichier image est invalide.')
  const body = value as Record<string, unknown>
  if (typeof body.filename !== 'string' || body.filename.length > 255 || typeof body.contentType !== 'string' || typeof body.data !== 'string') throw new Error('Le fichier image est invalide.')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body.data) || body.data.length > Math.ceil(maxChequeImageBytes / 3) * 4 || body.data.length % 4 !== 0) throw new Error('L’image doit peser au maximum 2 Mo et être correctement encodée.')
  const bytes = Buffer.from(body.data, 'base64')
  if (bytes.length === 0 || bytes.length > maxChequeImageBytes || bytes.toString('base64') !== body.data) throw new Error('L’image doit peser au maximum 2 Mo et être correctement encodée.')
  return { filename: body.filename, contentType: body.contentType, bytes }
}

function isBlobCredentialsError(error: unknown) {
  return error instanceof Error && error.message.includes('No blob credentials found')
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'GET' && req.method !== 'PUT' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'GET, PUT, DELETE')
    return send(res, 405, { error: 'Méthode non autorisée.' })
  }
  const user = await getSession(req)
  if (!user) return send(res, 401, { error: 'Connexion requise.' })
  const id = req.query?.id
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return send(res, 404, { error: 'Chèque introuvable.' })

  try {
    const principal = { userId: user.id }
    if (req.method === 'GET') {
      const image = await readOwnChequeImage(principal, id)
      if (image === undefined || image === null) return send(res, 404, { error: 'Image introuvable.' })
      res.statusCode = 200
      res.setHeader('Content-Type', image.contentType)
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
      res.setHeader('Cache-Control', 'private, no-store')
      Readable.fromWeb(image.stream as import('node:stream/web').ReadableStream).pipe(res)
      return
    }

    if (!isSameOriginRequest(req)) return send(res, 403, { error: 'Origine de requête invalide.' })
    if (req.method === 'DELETE') {
      const result = await deleteOwnChequeImage(principal, id)
      if (result === undefined) return send(res, 404, { error: 'Chèque introuvable.' })
      if (result === null) return send(res, 409, { error: 'L’image vient d’être modifiée. Rechargez puis réessayez.' })
      return send(res, 200, { ok: true })
    }

    if (!isJsonRequest(req)) return send(res, 415, { error: 'Le contenu doit être au format JSON.' })
    const file = decodeUpload(req.body)
    const stored = await replaceOwnChequeImage(principal, id, file)
    if (stored === undefined) return send(res, 404, { error: 'Chèque introuvable.' })
    if (stored === null) return send(res, 409, { error: 'L’image du chèque vient d’être modifiée. Réessayez.' })
    return send(res, 200, { hasImage: true })
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith('Choisissez') || error.message.startsWith('L’image') || error.message.startsWith('Le contenu'))) return send(res, 400, { error: error.message })
    if (isBlobCredentialsError(error)) {
      console.error('Cheque image storage is not configured for this environment')
      return send(res, 503, { error: 'Le stockage d’images Vercel Blob n’est pas configuré pour cet environnement.' })
    }
    console.error('Cheque image request failed', error instanceof Error ? error.name : 'unknown')
    return send(res, 500, { error: 'Impossible de traiter cette image pour le moment.' })
  }
}
