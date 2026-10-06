const oneHourMs = 60 * 60 * 1000
const oneDayMs = 24 * oneHourMs
const earliestLeadMs = 46 * oneHourMs
const latestLeadMs = 48 * oneHourMs

function ceilUtcDate(timestamp: number) {
  const value = new Date(timestamp)
  const midnight = Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
  return new Date(midnight === timestamp ? midnight : midnight + oneDayMs)
}

function floorUtcDate(timestamp: number) {
  const value = new Date(timestamp)
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

/**
 * Cheque due dates are PostgreSQL DATE values (UTC calendar dates without a
 * time). Select dates whose UTC-midnight anchor is 46–48 hours ahead. This
 * gives the hourly cron a two-hour catch-up window without sending early.
 */
export function getChequeReminderDueDateRange(now: Date) {
  const timestamp = now.getTime()
  if (!Number.isFinite(timestamp)) throw new Error('Current reminder time is invalid.')

  const firstDueDate = ceilUtcDate(timestamp + earliestLeadMs)
  const lastDueDateExclusive = new Date(floorUtcDate(timestamp + latestLeadMs).getTime() + oneDayMs)
  return { gte: firstDueDate, lt: lastDueDateExclusive }
}
