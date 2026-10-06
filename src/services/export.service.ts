import { ChequeStatus, ExportFormat, ExportScope, Prisma } from '../../generated/prisma/client'
import { Readable } from 'node:stream'
import { prisma } from '../lib/prisma'
import type { AuthenticatedPrincipal } from '../types/authenticated-principal'
import { fileStorageService } from './file-storage.service'
import { createExcelExport, createPdfExport, normalizeChequeImageForPdf, type ExportCheque } from './export-format.service'

const maxExportRows = 10_000
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type ExportFilters = {
  search?: string
  status?: ChequeStatus
  startDate?: Date
  endDate?: Date
  amountMin?: string
  amountMax?: string
  bank?: string
}

export class ExportRequestError extends Error {
  readonly statusCode: number
  constructor(message: string, statusCode = 400) { super(message); this.statusCode = statusCode }
}

export interface CreateExportRecord {
  format: ExportFormat
  scope: ExportScope
  fileUrl?: string | null
}

export function listOwnExportHistory(principal: AuthenticatedPrincipal) {
  return prisma.exportHistory.findMany({ where: { userId: principal.userId }, orderBy: { createdAt: 'desc' }, take: 100 })
}

function parseFilters(value: unknown): ExportFilters {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const raw = value as Record<string, unknown>
  const filters: ExportFilters = {}
  if (typeof raw.search === 'string' && raw.search.trim()) filters.search = raw.search.trim().slice(0, 100)
  if (typeof raw.status === 'string' && raw.status) {
    if (!Object.values(ChequeStatus).includes(raw.status as ChequeStatus)) throw new ExportRequestError('Le filtre de statut est invalide.')
    filters.status = raw.status as ChequeStatus
  }
  for (const [key, target] of [['startDate', 'startDate'], ['endDate', 'endDate']] as const) {
    const rawDate = raw[key]
    if (typeof rawDate !== 'string' || !rawDate) continue
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) throw new ExportRequestError('Une date de filtre est invalide.')
    const parsed = new Date(`${rawDate}T00:00:00.000Z`)
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== rawDate) throw new ExportRequestError('Une date de filtre est invalide.')
    filters[target] = parsed
  }
  for (const key of ['amountMin', 'amountMax'] as const) {
    const amount = raw[key]
    if (typeof amount !== 'string' || !amount) continue
    if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(amount)) throw new ExportRequestError('Un montant de filtre est invalide.')
    filters[key] = amount
  }
  if (typeof raw.bank === 'string' && raw.bank.trim()) filters.bank = raw.bank.trim().slice(0, 100)
  if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) throw new ExportRequestError('La date de début doit précéder la date de fin.')
  if (filters.amountMin && filters.amountMax && Number(filters.amountMin) > Number(filters.amountMax)) throw new ExportRequestError('Le montant minimum doit être inférieur au montant maximum.')
  return filters
}

function buildWhere(userId: string, filters: ExportFilters): Prisma.ChequeWhereInput {
  const term = filters.search?.trim()
  return {
    userId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.startDate || filters.endDate ? { dueDate: { ...(filters.startDate ? { gte: filters.startDate } : {}), ...(filters.endDate ? { lte: filters.endDate } : {}) } } : {}),
    ...(filters.amountMin || filters.amountMax ? { amount: { ...(filters.amountMin ? { gte: new Prisma.Decimal(filters.amountMin) } : {}), ...(filters.amountMax ? { lte: new Prisma.Decimal(filters.amountMax) } : {}) } } : {}),
    ...(filters.bank ? { bank: { contains: filters.bank, mode: 'insensitive' as const } } : {}),
    ...(term ? { OR: [
      { beneficiary: { contains: term, mode: 'insensitive' as const } },
      { chequeNumber: { contains: term, mode: 'insensitive' as const } },
      { bank: { contains: term, mode: 'insensitive' as const } },
    ] } : {}),
  }
}

async function resolveExportRows(principal: AuthenticatedPrincipal, scope: ExportScope, ids: unknown, rawFilters: unknown) {
  const baseWhere = buildWhere(principal.userId, parseFilters(rawFilters))
  if (scope === ExportScope.SINGLE) {
    if (typeof ids !== 'string' || !uuidPattern.test(ids)) throw new ExportRequestError('Sélectionnez un chèque valide.')
    const cheque = await prisma.cheque.findFirst({ where: { id: ids, userId: principal.userId } })
    if (!cheque) throw new ExportRequestError('Chèque introuvable.', 404)
    return [cheque]
  }

  if (scope === ExportScope.SELECTED) {
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500 || !ids.every((id) => typeof id === 'string' && uuidPattern.test(id))) throw new ExportRequestError('Sélectionnez entre 1 et 500 chèques valides.')
    const uniqueIds = [...new Set(ids as string[])]
    if (uniqueIds.length !== ids.length) throw new ExportRequestError('La sélection contient des doublons.')
    const cheques = await prisma.cheque.findMany({ where: { userId: principal.userId, id: { in: uniqueIds } } })
    if (cheques.length !== uniqueIds.length) throw new ExportRequestError('Un ou plusieurs chèques sélectionnés sont introuvables.', 404)
    return cheques
  }

  if (scope !== ExportScope.ALL && scope !== ExportScope.FILTERED) throw new ExportRequestError('La portée d’export est invalide.')
  const where = scope === ExportScope.ALL ? { userId: principal.userId } : baseWhere
  const count = await prisma.cheque.count({ where })
  if (count > maxExportRows) throw new ExportRequestError(`Cet export dépasse la limite de ${maxExportRows.toLocaleString('fr-FR')} chèques. Ajoutez des filtres.`, 413)
  return prisma.cheque.findMany({ where, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }] })
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>) {
  const chunks: Buffer[] = []
  for await (const chunk of Readable.fromWeb(stream as import('node:stream/web').ReadableStream)) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

export async function createOwnExport(principal: AuthenticatedPrincipal, input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ExportRequestError('Les options d’export sont invalides.')
  const body = input as Record<string, unknown>
  if (body.format !== ExportFormat.XLSX && body.format !== ExportFormat.PDF) throw new ExportRequestError('Choisissez Excel ou PDF.')
  if (typeof body.scope !== 'string' || !Object.values(ExportScope).includes(body.scope as ExportScope)) throw new ExportRequestError('La portée d’export est invalide.')
  const format = body.format
  const scope = body.scope as ExportScope
  const cheques = await resolveExportRows(principal, scope, body.ids, body.filters)
  if (!cheques.length) throw new ExportRequestError('Aucun chèque ne correspond à cet export.', 422)

  const rows: ExportCheque[] = cheques.map((cheque) => ({
    ...cheque,
    amount: cheque.amount.toFixed(2),
  }))
  let file: Buffer
  let contentType: string
  let extension: string
  if (format === ExportFormat.XLSX) {
    file = await createExcelExport(rows)
    contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    extension = 'xlsx'
  } else {
    let image: Buffer | null = null
    if (rows.length === 1 && rows[0].imageUrl) {
      const privateImage = await fileStorageService.readPrivate(rows[0].imageUrl)
      if (privateImage) image = await normalizeChequeImageForPdf(await streamToBuffer(privateImage.stream))
    }
    file = await createPdfExport(rows, image)
    contentType = 'application/pdf'
    extension = 'pdf'
  }

  await prisma.exportHistory.create({ data: { userId: principal.userId, format, scope } })
  const filename = `cheques-${new Date().toISOString().slice(0, 10)}.${extension}`
  const total = cheques.reduce((sum, cheque) => sum.plus(cheque.amount), new Prisma.Decimal(0))
  return { file, contentType, filename, count: cheques.length, total: total.toFixed(2) }
}
