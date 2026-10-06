import { ChequeStatus, Prisma } from '../../generated/prisma/client'
import { prisma } from '../lib/prisma'
import type { AuthenticatedPrincipal } from '../types/authenticated-principal'
import { synchronizeOwnChequeStatuses } from './cheque.service'

const statuses = Object.values(ChequeStatus)
const activeStatuses: ChequeStatus[] = [ChequeStatus.PENDING, ChequeStatus.PROCESSING]
const chartMonths = 6

export async function getDashboardData(principal: AuthenticatedPrincipal) {
  const now = new Date()
  await synchronizeOwnChequeStatuses(principal, now)
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  // Cheque dates have PostgreSQL DATE precision, so use today plus the next day.
  const dayAfterTomorrow = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000)
  const firstMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - chartMonths + 1, 1))

  const [statusAggregates, dueSoon, upcoming, monthlyRows] = await Promise.all([
    prisma.cheque.groupBy({
      by: ['status'],
      where: { userId: principal.userId },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.cheque.count({
      where: {
        userId: principal.userId,
        status: { in: activeStatuses },
        dueDate: { gte: today, lt: dayAfterTomorrow },
      },
    }),
    prisma.cheque.findMany({
      where: {
        userId: principal.userId,
        status: { in: activeStatuses },
        dueDate: { gte: today },
      },
      select: { id: true, beneficiary: true, amount: true, chequeNumber: true, dueDate: true, status: true },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      take: 5,
    }),
    prisma.$queryRaw<Array<{ month: Date; count: bigint; amount: string | null }>>`
      SELECT date_trunc('month', issue_date::timestamp) AS month,
             count(*) AS count,
             coalesce(sum(amount), 0)::text AS amount
      FROM cheques
      WHERE user_id = ${principal.userId}::uuid
        AND issue_date >= ${firstMonth}::date
      GROUP BY date_trunc('month', issue_date::timestamp)
      ORDER BY month ASC
    `,
  ])

  const counts = Object.fromEntries(statuses.map((status) => [status, 0])) as Record<ChequeStatus, number>
  let total = 0
  let amountTotal = new Prisma.Decimal(0)
  for (const row of statusAggregates) {
    counts[row.status] = row._count._all
    total += row._count._all
    amountTotal = amountTotal.plus(row._sum.amount ?? 0)
  }

  const monthlyByKey = new Map(monthlyRows.map((row) => [row.month.toISOString().slice(0, 7), row]))
  const monthly = Array.from({ length: chartMonths }, (_, index) => {
    const date = new Date(Date.UTC(firstMonth.getUTCFullYear(), firstMonth.getUTCMonth() + index, 1))
    const key = date.toISOString().slice(0, 7)
    const row = monthlyByKey.get(key)
    return {
      month: key,
      label: new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' }).format(date),
      count: Number(row?.count ?? 0),
      amount: Number(row?.amount ?? 0),
    }
  })

  return {
    stats: {
      total,
      pending: counts[ChequeStatus.PENDING],
      processing: counts[ChequeStatus.PROCESSING],
      cashed: counts[ChequeStatus.CASHED],
      notCashed: counts[ChequeStatus.NOT_CASHED],
      cancelled: counts[ChequeStatus.CANCELLED],
      expired: counts[ChequeStatus.EXPIRED],
      dueWithin48Hours: dueSoon,
      amountTotal: amountTotal.toFixed(2),
    },
    statuses: statuses.map((status) => ({ status, count: counts[status] })),
    monthly,
    upcoming: upcoming.map((cheque) => ({
      ...cheque,
      amount: cheque.amount.toFixed(2),
      dueDate: cheque.dueDate.toISOString(),
    })),
    generatedAt: now.toISOString(),
  }
}
