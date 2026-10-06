import { ChequeStatus, NotificationChannel, NotificationStatus, NotificationType, Prisma } from '../../generated/prisma/client'
import { prisma } from '../lib/prisma'
import type { AuthenticatedPrincipal } from '../types/authenticated-principal'
import type { ChequeInput } from '../validations/cheque.validation'
import { expirationGraceMs, processingWindowMs, resolveScheduledChequeStatus, transitionChequeStatus, type ChequeStatusAction } from './cheque-status.service'
import { fileStorageService } from './file-storage.service'

export interface ChequeSearch {
  search?: string
  status?: ChequeStatus
  startDate?: Date
  endDate?: Date
  amountMin?: string
  amountMax?: string
  bank?: string
  sort?: 'dueDate' | 'issueDate' | 'amount' | 'beneficiary'
  order?: 'asc' | 'desc'
  take?: number
  skip?: number
}

const listSelection = {
  id: true,
  beneficiary: true,
  amount: true,
  chequeNumber: true,
  bank: true,
  issueDate: true,
  dueDate: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ChequeSelect

function upcomingNotificationRecords(userId: string, chequeId: string, dueDate: Date, status: ChequeStatus, now = new Date()) {
  if (status !== ChequeStatus.PENDING && status !== ChequeStatus.PROCESSING) return []
  const dueAt = new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate()))
  const schedules = [
    { type: NotificationType.DUE_48H, scheduledAt: new Date(dueAt.getTime() - 48 * 60 * 60 * 1000) },
    { type: NotificationType.DUE_TODAY, scheduledAt: new Date(dueAt.getTime() + 9 * 60 * 60 * 1000) },
    { type: NotificationType.OVERDUE, scheduledAt: new Date(dueAt.getTime() + 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000) },
  ]
  return schedules
    .filter(({ scheduledAt }) => scheduledAt > now)
    .map(({ type, scheduledAt }) => ({ userId, chequeId, type, scheduledAt, channel: NotificationChannel.WEB, status: NotificationStatus.PENDING }))
}

/** Every query is constrained by the principal created from the verified server session. */
function ownChequeWhere(principal: AuthenticatedPrincipal, search: ChequeSearch): Prisma.ChequeWhereInput {
  const term = search.search?.trim()
  const dateRange = search.startDate || search.endDate ? { dueDate: { ...(search.startDate ? { gte: search.startDate } : {}), ...(search.endDate ? { lte: search.endDate } : {}) } } : {}
  const amountRange = search.amountMin || search.amountMax ? { amount: { ...(search.amountMin ? { gte: new Prisma.Decimal(search.amountMin) } : {}), ...(search.amountMax ? { lte: new Prisma.Decimal(search.amountMax) } : {}) } } : {}
  return {
    userId: principal.userId,
    ...(search.status ? { status: search.status } : {}),
    ...dateRange,
    ...amountRange,
    ...(search.bank?.trim() ? { bank: { contains: search.bank.trim(), mode: 'insensitive' as const } } : {}),
    ...(term ? { OR: [
      { beneficiary: { contains: term, mode: 'insensitive' as const } },
      { chequeNumber: { contains: term, mode: 'insensitive' as const } },
      { bank: { contains: term, mode: 'insensitive' as const } },
    ] } : {}),
  }
}

export async function synchronizeOwnChequeStatuses(principal: AuthenticatedPrincipal, now = new Date()) {
  const dueSoonLimit = new Date(now.getTime() + processingWindowMs)
  const expirationLimit = new Date(now.getTime() - expirationGraceMs)
  await prisma.$transaction(async (tx) => {
    await tx.cheque.updateMany({ where: { userId: principal.userId, status: ChequeStatus.PENDING, dueDate: { gt: now, lt: dueSoonLimit } }, data: { status: ChequeStatus.PROCESSING } })
    const expiring = await tx.cheque.findMany({ where: { userId: principal.userId, status: { in: [ChequeStatus.PENDING, ChequeStatus.PROCESSING] }, dueDate: { lte: expirationLimit } }, select: { id: true } })
    if (!expiring.length) return
    const ids = expiring.map(({ id }) => id)
    await tx.cheque.updateMany({ where: { userId: principal.userId, id: { in: ids }, status: { in: [ChequeStatus.PENDING, ChequeStatus.PROCESSING] } }, data: { status: ChequeStatus.EXPIRED } })
    await tx.notification.deleteMany({ where: { userId: principal.userId, chequeId: { in: ids }, status: NotificationStatus.PENDING } })
  })
}

export async function listOwnCheques(principal: AuthenticatedPrincipal, search: ChequeSearch = {}) {
  await synchronizeOwnChequeStatuses(principal)
  const direction = search.order ?? 'asc'
  const sort = search.sort ?? 'dueDate'
  const primaryOrder: Prisma.ChequeOrderByWithRelationInput = { [sort]: direction }
  return prisma.cheque.findMany({
    where: ownChequeWhere(principal, search),
    select: listSelection,
    orderBy: [primaryOrder, { id: 'asc' }],
    take: Math.min(Math.max(search.take ?? 25, 1), 100),
    skip: Math.max(search.skip ?? 0, 0),
  })
}

export async function countOwnCheques(principal: AuthenticatedPrincipal, search: ChequeSearch = {}) {
  await synchronizeOwnChequeStatuses(principal)
  return prisma.cheque.count({ where: ownChequeWhere(principal, search) })
}

export async function getOwnCheque(principal: AuthenticatedPrincipal, chequeId: string) {
  await synchronizeOwnChequeStatuses(principal)
  return prisma.cheque.findFirst({ where: { id: chequeId, userId: principal.userId } })
}

export function createOwnCheque(principal: AuthenticatedPrincipal, input: ChequeInput) {
  return prisma.$transaction(async (tx) => {
    const cheque = await tx.cheque.create({ data: { ...input, userId: principal.userId, imageUrl: null } })
    const notifications = upcomingNotificationRecords(principal.userId, cheque.id, cheque.dueDate, cheque.status)
    if (notifications.length) await tx.notification.createMany({ data: notifications })
    return cheque
  })
}

export function updateOwnCheque(principal: AuthenticatedPrincipal, chequeId: string, input: ChequeInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.cheque.findFirst({ where: { id: chequeId, userId: principal.userId }, select: { dueDate: true, status: true } })
    if (!existing) return null
    const status = resolveScheduledChequeStatus(existing.status, input.dueDate, new Date())
    const changedReminderFields = existing.dueDate.getTime() !== input.dueDate.getTime() || existing.status !== status
    const result = await tx.cheque.updateMany({ where: { id: chequeId, userId: principal.userId }, data: { ...input, status } })
    if (!result.count) return null
    const updated = await tx.cheque.findFirst({ where: { id: chequeId, userId: principal.userId } })
    if (!updated) return null
    if (changedReminderFields) {
      await tx.notification.deleteMany({ where: { chequeId, userId: principal.userId, status: NotificationStatus.PENDING } })
      const notifications = upcomingNotificationRecords(principal.userId, chequeId, updated.dueDate, updated.status)
      if (notifications.length) await tx.notification.createMany({ data: notifications })
    }
    return updated
  })
}

export async function transitionOwnChequeStatus(principal: AuthenticatedPrincipal, chequeId: string, action: ChequeStatusAction) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.cheque.findFirst({ where: { id: chequeId, userId: principal.userId }, select: { dueDate: true, status: true } })
    if (!existing) return undefined
    const now = new Date()
    const currentStatus = resolveScheduledChequeStatus(existing.status, existing.dueDate, now)
    const nextStatus = transitionChequeStatus(currentStatus, existing.dueDate, action, now)
    if (!nextStatus) return null
    const updated = await tx.cheque.updateMany({ where: { id: chequeId, userId: principal.userId, status: existing.status }, data: { status: nextStatus } })
    if (!updated.count) return null
    await tx.notification.deleteMany({ where: { chequeId, userId: principal.userId, status: NotificationStatus.PENDING } })
    return tx.cheque.findFirst({ where: { id: chequeId, userId: principal.userId } })
  })
}

export async function deleteOwnCheque(principal: AuthenticatedPrincipal, chequeId: string) {
  const cheque = await prisma.cheque.findFirst({ where: { id: chequeId, userId: principal.userId }, select: { imageUrl: true } })
  if (!cheque) return false
  const result = await prisma.cheque.deleteMany({ where: { id: chequeId, userId: principal.userId } })
  if (!result.count) return false
  if (cheque.imageUrl) {
    try { await fileStorageService.delete(cheque.imageUrl) }
    catch (error) { console.error('Cheque image cleanup failed', error instanceof Error ? error.name : 'unknown') }
  }
  return true
}

export async function replaceOwnChequeImage(principal: AuthenticatedPrincipal, chequeId: string, file: Parameters<typeof fileStorageService.uploadChequeImage>[2]) {
  const cheque = await prisma.cheque.findFirst({ where: { id: chequeId, userId: principal.userId }, select: { imageUrl: true } })
  if (!cheque) return undefined
  const uploaded = await fileStorageService.uploadChequeImage(principal.userId, chequeId, file)
  const changed = await prisma.cheque.updateMany({ where: { id: chequeId, userId: principal.userId, imageUrl: cheque.imageUrl }, data: { imageUrl: uploaded.url } })
  if (!changed.count) {
    await fileStorageService.delete(uploaded.url)
    return null
  }
  if (cheque.imageUrl) {
    try { await fileStorageService.delete(cheque.imageUrl) }
    catch (error) { console.error('Replaced cheque image cleanup failed', error instanceof Error ? error.name : 'unknown') }
  }
  return uploaded
}

export async function deleteOwnChequeImage(principal: AuthenticatedPrincipal, chequeId: string) {
  const cheque = await prisma.cheque.findFirst({ where: { id: chequeId, userId: principal.userId }, select: { imageUrl: true } })
  if (!cheque) return undefined
  if (!cheque.imageUrl) return true
  const changed = await prisma.cheque.updateMany({ where: { id: chequeId, userId: principal.userId, imageUrl: cheque.imageUrl }, data: { imageUrl: null } })
  if (!changed.count) return null
  try { await fileStorageService.delete(cheque.imageUrl) }
  catch (error) { console.error('Cheque image deletion failed', error instanceof Error ? error.name : 'unknown') }
  return true
}

export async function readOwnChequeImage(principal: AuthenticatedPrincipal, chequeId: string) {
  const cheque = await prisma.cheque.findFirst({ where: { id: chequeId, userId: principal.userId }, select: { imageUrl: true } })
  if (!cheque) return undefined
  if (!cheque.imageUrl) return null
  return fileStorageService.readPrivate(cheque.imageUrl)
}
