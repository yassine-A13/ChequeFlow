import test from 'node:test'
import assert from 'node:assert/strict'
import { getChequeReminderDueDateRange } from './cheque-reminder-window.service.ts'

const dueDate = new Date('2026-10-08T00:00:00.000Z')
const included = now => {
  const range = getChequeReminderDueDateRange(now)
  return dueDate >= range.gte && dueDate < range.lt
}

test('a cheque due more than 48 hours later is outside the reminder window', () => {
  assert.equal(included(new Date(dueDate.getTime() - 49 * 60 * 60 * 1000)), false)
})

test('the reminder window includes the 48-hour point and its hourly catch-up period', () => {
  assert.equal(included(new Date(dueDate.getTime() - 48 * 60 * 60 * 1000)), true)
  assert.equal(included(new Date(dueDate.getTime() - 47 * 60 * 60 * 1000)), true)
})

test('a cheque inside 46 hours of its UTC date anchor is outside the window', () => {
  assert.equal(included(new Date(dueDate.getTime() - 45 * 60 * 60 * 1000)), false)
})

test('UTC date boundaries are stable when the process timezone changes', () => {
  const previousTimezone = process.env.TZ
  try {
    process.env.TZ = 'Pacific/Auckland'
    const range = getChequeReminderDueDateRange(new Date('2026-10-06T00:00:00.000Z'))
    assert.equal(range.gte.toISOString(), '2026-10-08T00:00:00.000Z')
    assert.equal(range.lt.toISOString(), '2026-10-09T00:00:00.000Z')
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ
    else process.env.TZ = previousTimezone
  }
})
