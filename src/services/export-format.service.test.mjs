import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import sharp from 'sharp'
import { createExcelExport, createPdfExport } from './export-format.service.ts'

const cheque = {
  id: '8f587f39-70e6-42cc-87e4-f91d6d2ba4c0',
  beneficiary: 'Société Exemple',
  amount: '1234.50',
  chequeNumber: 'CH-2026-01',
  bank: 'Banque Exemple',
  issueDate: new Date('2026-01-02T00:00:00.000Z'),
  dueDate: new Date('2026-02-02T00:00:00.000Z'),
  status: 'PENDING',
  note: 'Note de test',
  createdAt: new Date('2026-01-02T10:00:00.000Z'),
  updatedAt: new Date('2026-01-03T10:00:00.000Z'),
}

test('le classeur Excel contient les huit colonnes et les données du chèque', async () => {
  const bytes = await createExcelExport([cheque])
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(bytes)
  const sheet = workbook.getWorksheet('Chèques')
  assert.ok(sheet)
  assert.equal(sheet.getCell('A1').value, 'Bénéficiaire')
  assert.equal(sheet.getCell('H1').value, 'Note')
  assert.equal(sheet.getCell('A2').value, 'Société Exemple')
  assert.equal(sheet.getCell('B2').value, 1234.5)
  assert.equal(sheet.getCell('H2').value, 'Note de test')
})

test('le PDF détaillé est généré avec une image incorporée', async () => {
  const image = await sharp({ create: { width: 12, height: 12, channels: 3, background: '#276b61' } }).png().toBuffer()
  const bytes = await createPdfExport([cheque], image)
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-')
  assert.ok(bytes.byteLength > 500)
})

test('le PDF récapitulatif gère plusieurs chèques', async () => {
  const bytes = await createPdfExport([cheque, { ...cheque, id: 'c85347a9-63d7-4f6f-aa06-d89da8c2be8c', chequeNumber: 'CH-2026-02' }])
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-')
  assert.ok(bytes.byteLength > 500)
})
