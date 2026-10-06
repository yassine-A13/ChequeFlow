import test from 'node:test'
import assert from 'node:assert/strict'
import { requiresEncashmentConfirmation, resolveScheduledChequeStatus, transitionChequeStatus } from './cheque-status.service.ts'

const dueDate = new Date('2026-06-10T00:00:00.000Z')
const now = (value) => new Date(value)

test('PENDING devient PROCESSING lorsqu’il reste moins de 48 heures', () => {
  assert.equal(resolveScheduledChequeStatus('PENDING', dueDate, now('2026-06-08T01:00:00Z')), 'PROCESSING')
  assert.equal(resolveScheduledChequeStatus('PENDING', dueDate, now('2026-06-08T00:00:00Z')), 'PENDING')
})

test('PROCESSING reste en traitement avant la fin du délai de grâce', () => {
  assert.equal(resolveScheduledChequeStatus('PROCESSING', dueDate, now('2026-06-10T12:00:00Z')), 'PROCESSING')
  assert.equal(requiresEncashmentConfirmation('PROCESSING', dueDate, now('2026-06-10T12:00:00Z')), true)
})

test('CASHED reste encaissé', () => {
  assert.equal(resolveScheduledChequeStatus('CASHED', dueDate, now('2026-07-01T00:00:00Z')), 'CASHED')
})

test('NOT_CASHED reste non encaissé', () => {
  assert.equal(resolveScheduledChequeStatus('NOT_CASHED', dueDate, now('2026-07-01T00:00:00Z')), 'NOT_CASHED')
})

test('CANCELLED reste annulé et ne peut pas être confirmé', () => {
  assert.equal(resolveScheduledChequeStatus('CANCELLED', dueDate, now('2026-07-01T00:00:00Z')), 'CANCELLED')
  assert.equal(transitionChequeStatus('CANCELLED', dueDate, 'confirm-cashed', now('2026-06-10T12:00:00Z')), null)
})

test('PENDING et PROCESSING deviennent EXPIRED après sept jours sans confirmation', () => {
  const afterGrace = now('2026-06-17T00:00:00Z')
  assert.equal(resolveScheduledChequeStatus('PENDING', dueDate, afterGrace), 'EXPIRED')
  assert.equal(resolveScheduledChequeStatus('PROCESSING', dueDate, afterGrace), 'EXPIRED')
  assert.equal(resolveScheduledChequeStatus('EXPIRED', dueDate, afterGrace), 'EXPIRED')
})

test('la confirmation à échéance fixe un statut final explicite', () => {
  const atDueDate = now('2026-06-10T00:00:00Z')
  assert.equal(transitionChequeStatus('PROCESSING', dueDate, 'confirm-cashed', atDueDate), 'CASHED')
  assert.equal(transitionChequeStatus('PROCESSING', dueDate, 'confirm-not-cashed', atDueDate), 'NOT_CASHED')
  assert.equal(transitionChequeStatus('PROCESSING', dueDate, 'confirm-cashed', now('2026-06-09T23:59:59Z')), null)
})

test('les statuts terminaux sont immuables avec les actions de cycle de vie', () => {
  for (const status of ['CASHED', 'NOT_CASHED', 'CANCELLED', 'EXPIRED']) {
    assert.equal(transitionChequeStatus(status, dueDate, 'cancel', now('2026-06-10T12:00:00Z')), null)
    assert.equal(transitionChequeStatus(status, dueDate, 'confirm-not-cashed', now('2026-06-10T12:00:00Z')), null)
  }
})
