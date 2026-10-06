export const chequeStatuses = ['PENDING', 'PROCESSING', 'CASHED', 'NOT_CASHED', 'CANCELLED', 'EXPIRED'] as const
export type ChequeStatus = typeof chequeStatuses[number]
export type ChequeStatusAction = 'cancel' | 'confirm-cashed' | 'confirm-not-cashed'

export const processingWindowMs = 48 * 60 * 60 * 1000
export const expirationGraceMs = 7 * 24 * 60 * 60 * 1000

function dueAt(dueDate: Date) {
  return Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate())
}

export function resolveScheduledChequeStatus(status: ChequeStatus, dueDate: Date, now: Date): ChequeStatus {
  if (status !== 'PENDING' && status !== 'PROCESSING') return status
  const dueTime = dueAt(dueDate)
  if (now.getTime() >= dueTime + expirationGraceMs) return 'EXPIRED'
  if (status === 'PENDING' && now.getTime() < dueTime && dueTime - now.getTime() < processingWindowMs) return 'PROCESSING'
  return status
}

export function requiresEncashmentConfirmation(status: ChequeStatus, dueDate: Date, now: Date) {
  const dueTime = dueAt(dueDate)
  return (status === 'PENDING' || status === 'PROCESSING') && now.getTime() >= dueTime && now.getTime() < dueTime + expirationGraceMs
}

export function transitionChequeStatus(status: ChequeStatus, dueDate: Date, action: ChequeStatusAction, now: Date): ChequeStatus | null {
  const scheduledStatus = resolveScheduledChequeStatus(status, dueDate, now)
  if (action === 'cancel') return scheduledStatus === 'PENDING' || scheduledStatus === 'PROCESSING' ? 'CANCELLED' : null
  if (!requiresEncashmentConfirmation(scheduledStatus, dueDate, now)) return null
  return action === 'confirm-cashed' ? 'CASHED' : 'NOT_CASHED'
}
