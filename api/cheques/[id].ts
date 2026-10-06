import type { IncomingMessage, ServerResponse } from 'node:http'
import { getSession } from '../lib/neon-auth'
import { deleteOwnCheque, getOwnCheque, transitionOwnChequeStatus, updateOwnCheque } from '../../src/services/cheque.service'
import { isJsonRequest, isSameOriginRequest } from '../../src/services/request-security.service'
import { validateChequeInput } from '../../src/validations/cheque.validation'
import { requiresEncashmentConfirmation, type ChequeStatusAction } from '../../src/services/cheque-status.service'

type Request = IncomingMessage & { body?: unknown; query?: Record<string, string | string[] | undefined> }
type Response = ServerResponse & { status?: (code: number) => Response; json?: (body: unknown) => void }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function send(res: Response, status: number, data: unknown) {
  res.statusCode = status; res.setHeader('Cache-Control', 'no-store')
  if (res.status) res.status(status)
  if (res.json) res.json(data)
  else { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)) }
}

function serialize<T extends { amount: { toFixed(places: number): string }; issueDate: Date; dueDate: Date; createdAt: Date; updatedAt: Date }>(cheque: T) {
  const { imageUrl, ...safeCheque } = cheque as T & { imageUrl?: string | null }
  return { ...safeCheque, ...(imageUrl === undefined ? {} : { hasImage: Boolean(imageUrl) }), amount: cheque.amount.toFixed(2), issueDate: cheque.issueDate.toISOString(), dueDate: cheque.dueDate.toISOString(), createdAt: cheque.createdAt.toISOString(), updatedAt: cheque.updatedAt.toISOString() }
}

export default async function handler(req: Request, res: Response) {
  const method = req.method
  if (method !== 'GET' && method !== 'PUT' && method !== 'DELETE' && method !== 'POST') { res.setHeader('Allow', 'GET, PUT, POST, DELETE'); return send(res, 405, { error: 'Méthode non autorisée.' }) }
  const user = await getSession(req)
  if (!user) return send(res, 401, { error: 'Connexion requise.' })
  const id = req.query?.id
  if (typeof id !== 'string' || !UUID.test(id)) return send(res, 404, { error: 'Chèque introuvable.' })

  try {
    const principal = { userId: user.id }
    if (method === 'GET') {
      const cheque = await getOwnCheque(principal, id)
      return cheque ? send(res, 200, { cheque: { ...serialize(cheque), requiresEncashmentConfirmation: requiresEncashmentConfirmation(cheque.status, cheque.dueDate, new Date()) } }) : send(res, 404, { error: 'Chèque introuvable.' })
    }
    if (!isSameOriginRequest(req)) return send(res, 403, { error: 'Origine de requête invalide.' })
    if (method === 'POST') {
      if (!isJsonRequest(req)) return send(res, 415, { error: 'Le contenu doit être au format JSON.' })
      const action = (req.body as { action?: unknown } | null)?.action
      if (action !== 'cancel' && action !== 'confirm-cashed' && action !== 'confirm-not-cashed') return send(res, 400, { error: 'Action de statut invalide.' })
      const cheque = await transitionOwnChequeStatus(principal, id, action as ChequeStatusAction)
      if (cheque === undefined) return send(res, 404, { error: 'Chèque introuvable.' })
      if (!cheque) return send(res, 409, { error: 'Cette transition de statut n’est pas autorisée à ce stade.' })
      return send(res, 200, { cheque: serialize(cheque) })
    }
    if (method === 'DELETE') {
      const deleted = await deleteOwnCheque(principal, id)
      return deleted ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Chèque introuvable.' })
    }
    if (!isJsonRequest(req)) return send(res, 415, { error: 'Le contenu doit être au format JSON.' })
    const validation = validateChequeInput(req.body)
    if (!validation.data) return send(res, 400, { error: 'Vérifiez les champs du formulaire.', fields: validation.errors })
    const cheque = await updateOwnCheque(principal, id, validation.data)
    return cheque ? send(res, 200, { cheque: serialize(cheque) }) : send(res, 404, { error: 'Chèque introuvable.' })
  } catch (error) {
    console.error('Cheque item request failed', error instanceof Error ? error.name : 'unknown')
    return send(res, 500, { error: 'Impossible de traiter ce chèque pour le moment.' })
  }
}
