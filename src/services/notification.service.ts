import { ChequeStatus, NotificationStatus } from '../../generated/prisma/client'
import { prisma } from '../lib/prisma'
import type { AuthenticatedPrincipal } from '../types/authenticated-principal'
import { sendChequeReminderEmail } from '../../api/lib/cheque-reminder-email'
import { getChequeReminderDueDateRange } from './cheque-reminder-window.service'

export function listOwnNotifications(principal: AuthenticatedPrincipal, status?: NotificationStatus) {
  return prisma.notification.findMany({
    where: { userId: principal.userId, ...(status ? { status } : {}) },
    orderBy: { scheduledAt: 'asc' },
    take: 100,
  })
}

export async function checkUpcomingChequeReminders(principal?: AuthenticatedPrincipal, now = new Date()) {
  const dueDateRange = getChequeReminderDueDateRange(now)
  const cheques = await prisma.cheque.findMany({
    where: {
      ...(principal ? { userId: principal.userId } : {}),
      status: { in: [ChequeStatus.PENDING, ChequeStatus.PROCESSING] },
      reminder48hSentAt: null,
      dueDate: dueDateRange,
      user: { is: { email: { not: null } } },
    },
    select: {
      id: true,
      userId: true,
      chequeNumber: true,
      amount: true,
      dueDate: true,
      beneficiary: true,
      bank: true,
      user: { select: { email: true, name: true } },
    },
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
  })

  const results = []
  for (const cheque of cheques) {
    try {
      const outcome = await prisma.$transaction(async tx => {
        // Serialize concurrent checks per cheque while the mail provider accepts
        // the message. The timestamp is only written after a successful send.
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "cheques"
          WHERE "id" = ${cheque.id}::uuid
            AND "user_id" = ${cheque.userId}::uuid
            AND "reminder_48h_sent_at" IS NULL
          FOR UPDATE
        `
        if (!locked.length) return { status: 'already_sent' as const }

        const current = await tx.cheque.findFirst({
          where: {
            id: cheque.id,
            userId: cheque.userId,
            reminder48hSentAt: null,
            status: { in: [ChequeStatus.PENDING, ChequeStatus.PROCESSING] },
            dueDate: dueDateRange,
          },
          select: {
            id: true,
            chequeNumber: true,
            amount: true,
            dueDate: true,
            beneficiary: true,
            bank: true,
            user: { select: { email: true, name: true } },
          },
        })
        if (!current?.user.email) return { status: 'skipped' as const }

        await sendChequeReminderEmail({
          cheque: {
            id: current.id,
            chequeNumber: current.chequeNumber,
            amount: current.amount.toFixed(2),
            dueDate: current.dueDate,
            beneficiary: current.beneficiary,
            bank: current.bank,
          },
          recipient: { email: current.user.email, name: current.user.name },
          idempotencyKey: `cheque-reminder-48h:${current.id}:${current.dueDate.toISOString().slice(0, 10)}`,
        })

        const sentAt = new Date()
        const updated = await tx.cheque.updateMany({
          where: { id: current.id, userId: cheque.userId, reminder48hSentAt: null },
          data: { reminder48hSentAt: sentAt },
        })
        if (updated.count !== 1) throw new Error('REMINDER_TIMESTAMP_NOT_RECORDED')
        return { status: 'sent' as const, sentAt: sentAt.toISOString() }
      }, { maxWait: 10_000, timeout: 30_000 })

      results.push({
        id: cheque.id,
        chequeNumber: cheque.chequeNumber,
        amount: cheque.amount.toFixed(2),
        dueDate: cheque.dueDate.toISOString(),
        email: cheque.user.email!,
        ...(cheque.user.name ? { name: cheque.user.name } : {}),
        ...outcome,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown email delivery error.'
      console.error('Cheque 48-hour reminder email failed', {
        chequeId: cheque.id,
        error: error instanceof Error ? error.name : 'unknown',
        message,
      })
      results.push({
        id: cheque.id,
        chequeNumber: cheque.chequeNumber,
        amount: cheque.amount.toFixed(2),
        dueDate: cheque.dueDate.toISOString(),
        email: cheque.user.email!,
        status: 'failed' as const,
        error: message,
      })
    }
  }
  return results
}
