import type { IncomingMessage, ServerResponse } from 'node:http'
import { getSession } from './lib/neon-auth'
import { createOwnExport, ExportRequestError, listOwnExportHistory } from '../src/services/export.service'
import { isJsonRequest, isSameOriginRequest } from '../src/services/request-security.service'

type Request = IncomingMessage & { body?: unknown }
type Response = ServerResponse & { status?: (code: number) => Response; json?: (body: unknown) => void }

function sendJson(res: Response, status: number, data: unknown) {
  res.statusCode = status
  res.setHeader('Cache-Control', 'no-store')
  if (res.status) res.status(status)
  if (res.json) res.json(data)
  else { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)) }
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return sendJson(res, 405, { error: 'Méthode non autorisée.' })
  }

  const user = await getSession(req)
  if (!user) return sendJson(res, 401, { error: 'Connexion requise.' })
  const principal = { userId: user.id }

  if (req.method === 'GET') {
    try {
      const history = await listOwnExportHistory(principal)
      return sendJson(res, 200, { history })
    } catch (error) {
      console.error('Export history request failed', error instanceof Error ? error.name : 'unknown')
      return sendJson(res, 500, { error: 'Impossible de charger l’historique des exports.' })
    }
  }

  if (!isSameOriginRequest(req)) return sendJson(res, 403, { error: 'Origine de requête invalide.' })
  if (!isJsonRequest(req)) return sendJson(res, 415, { error: 'Le contenu doit être au format JSON.' })
  try {
    const result = await createOwnExport(principal, req.body)
    res.statusCode = 200
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Type', result.contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`)
    res.setHeader('Content-Length', String(result.file.byteLength))
    res.setHeader('X-Export-Count', String(result.count))
    res.setHeader('X-Export-Total', result.total)
    res.end(result.file)
  } catch (error) {
    if (error instanceof ExportRequestError) return sendJson(res, error.statusCode, { error: error.message })
    console.error('Cheque export request failed', error instanceof Error ? error.name : 'unknown')
    return sendJson(res, 500, { error: 'Impossible de générer cet export pour le moment.' })
  }
}
