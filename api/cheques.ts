import type { IncomingMessage, ServerResponse } from 'node:http'
import { getSession } from './lib/neon-auth'
import { countOwnCheques, createOwnCheque, listOwnCheques } from '../src/services/cheque.service'
import { isJsonRequest, isSameOriginRequest } from '../src/services/request-security.service'
import { validateChequeInput } from '../src/validations/cheque.validation'
import { ChequeStatus } from '../generated/prisma/client'
import { requiresEncashmentConfirmation } from '../src/services/cheque-status.service'

type Request = IncomingMessage & { body?: unknown; url?: string }
type Response = ServerResponse & { status?: (code: number) => Response; json?: (body: unknown) => void }

function send(res: Response, status: number, data: unknown) {
  res.statusCode = status; res.setHeader('Cache-Control', 'no-store')
  if (res.status) res.status(status)
  if (res.json) res.json(data)
  else { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)) }
}

function serialize<T extends { amount: { toFixed(places: number): string }; issueDate: Date; dueDate: Date; createdAt: Date; updatedAt: Date }>(cheque: T) {
  return { ...cheque, amount: cheque.amount.toFixed(2), issueDate: cheque.issueDate.toISOString(), dueDate: cheque.dueDate.toISOString(), createdAt: cheque.createdAt.toISOString(), updatedAt: cheque.updatedAt.toISOString() }
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'GET' && req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(res, 405, { error: 'Méthode non autorisée.' }) }
  const user = await getSession(req)
  if (!user) return send(res, 401, { error: 'Connexion requise.' })

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url ?? '/api/cheques', process.env.APP_URL ?? 'http://localhost')
      const rawStatus = url.searchParams.get('status')
      if (rawStatus && !Object.values(ChequeStatus).includes(rawStatus as ChequeStatus)) return send(res, 400, { error: 'Filtre de statut invalide.' })
      const rawPage = url.searchParams.get('page') ?? '1'
      const page = /^\d+$/.test(rawPage) ? Number(rawPage) : 0
      if (!Number.isSafeInteger(page) || page < 1 || page > 100_000) return send(res, 400, { error: 'Numéro de page invalide.' })
      const sort = url.searchParams.get('sort') ?? 'dueDate'
      const order = url.searchParams.get('order') ?? 'asc'
      if (!['dueDate', 'issueDate', 'amount', 'beneficiary'].includes(sort)) return send(res, 400, { error: 'Tri invalide.' })
      if (order !== 'asc' && order !== 'desc') return send(res, 400, { error: 'Ordre de tri invalide.' })
      const parseDate = (key: string) => {
        const value = url.searchParams.get(key)
        if (!value) return undefined
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`INVALID_DATE:${key}`)
        const parsed = new Date(`${value}T00:00:00.000Z`)
        if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`INVALID_DATE:${key}`)
        return parsed
      }
      const parseAmount = (key: string) => {
        const value = url.searchParams.get(key)
        if (!value) return undefined
        if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(value)) throw new Error(`INVALID_AMOUNT:${key}`)
        return value
      }
      const startDate = parseDate('startDate'), endDate = parseDate('endDate')
      const amountMin = parseAmount('amountMin'), amountMax = parseAmount('amountMax')
      if (startDate && endDate && startDate > endDate) return send(res, 400, { error: 'La date de début doit précéder la date de fin.' })
      if (amountMin && amountMax && Number(amountMin) > Number(amountMax)) return send(res, 400, { error: 'Le montant minimum doit être inférieur au montant maximum.' })
      const search = url.searchParams.get('search')?.trim().slice(0, 100) || undefined
      const bank = url.searchParams.get('bank')?.trim().slice(0, 100) || undefined
      const principal = { userId: user.id }, query = { search, status: rawStatus as ChequeStatus | undefined, startDate, endDate, amountMin, amountMax, bank, sort: sort as 'dueDate' | 'issueDate' | 'amount' | 'beneficiary', order: order as 'asc' | 'desc' }
      const [cheques, total] = await Promise.all([
        listOwnCheques(principal, { ...query, take: 25, skip: (page - 1) * 25 }),
        countOwnCheques(principal, query),
      ])
      return send(res, 200, { cheques: cheques.map((cheque) => ({ ...serialize(cheque), requiresEncashmentConfirmation: requiresEncashmentConfirmation(cheque.status, cheque.dueDate, new Date()) })), total, page, pageSize: 25, totalPages: Math.ceil(total / 25) })
    }

    if (!isSameOriginRequest(req)) return send(res, 403, { error: 'Origine de requête invalide.' })
    if (!isJsonRequest(req)) return send(res, 415, { error: 'Le contenu doit être au format JSON.' })
    const validation = validateChequeInput(req.body)
    if (!validation.data) return send(res, 400, { error: 'Vérifiez les champs du formulaire.', fields: validation.errors })
    const cheque = await createOwnCheque({ userId: user.id }, validation.data)
    return send(res, 201, { cheque: serialize(cheque) })
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('INVALID_DATE:')) return send(res, 400, { error: 'Une date de filtre est invalide.' })
    if (error instanceof Error && error.message.startsWith('INVALID_AMOUNT:')) return send(res, 400, { error: 'Un montant de filtre est invalide.' })
    console.error('Cheque collection request failed', error instanceof Error ? error.name : 'unknown')
    return send(res, 500, { error: 'Impossible de traiter les chèques pour le moment.' })
  }
}
