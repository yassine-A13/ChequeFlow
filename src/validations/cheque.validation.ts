import { ChequeStatus } from '../../generated/prisma/client'

export interface ChequeInput {
  beneficiary: string
  amount: string
  chequeNumber: string
  bank: string | null
  issueDate: Date
  dueDate: Date
  status: ChequeStatus
  note: string | null
}

export interface ValidationResult {
  data?: ChequeInput
  errors: Record<string, string>
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

function parseDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? parsed : null
}

export function validateChequeInput(value: unknown): ValidationResult {
  const errors: Record<string, string> = {}
  if (!isObject(value)) return { errors: { form: 'Les informations du chèque sont invalides.' } }

  const beneficiary = readString(value.beneficiary)
  if (!beneficiary) errors.beneficiary = 'Le bénéficiaire est obligatoire.'
  else if (beneficiary.length > 150) errors.beneficiary = 'Le bénéficiaire ne peut pas dépasser 150 caractères.'

  const amountValue = typeof value.amount === 'number' ? String(value.amount) : readString(value.amount)
  if (!amountValue) errors.amount = 'Le montant est obligatoire.'
  else if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(amountValue) || Number(amountValue) <= 0) errors.amount = 'Le montant doit être supérieur à zéro et comporter au plus deux décimales.'

  const chequeNumber = readString(value.chequeNumber)
  if (!chequeNumber) errors.chequeNumber = 'Le numéro du chèque est obligatoire.'
  else if (chequeNumber.length > 80) errors.chequeNumber = 'Le numéro ne peut pas dépasser 80 caractères.'

  const bankValue = readString(value.bank)
  if (bankValue.length > 100) errors.bank = 'Le nom de la banque ne peut pas dépasser 100 caractères.'

  const issueDate = parseDate(value.issueDate)
  const dueDate = parseDate(value.dueDate)
  if (!issueDate) errors.issueDate = 'La date d’émission est obligatoire et doit être valide.'
  if (!dueDate) errors.dueDate = 'La date d’échéance est obligatoire et doit être valide.'
  else if (issueDate && dueDate < issueDate) errors.dueDate = 'La date d’échéance doit être égale ou postérieure à la date d’émission.'

  const rawStatus = value.status === undefined || value.status === '' ? ChequeStatus.PENDING : value.status
  if (typeof rawStatus !== 'string' || !Object.values(ChequeStatus).includes(rawStatus as ChequeStatus)) errors.status = 'Sélectionnez un statut valide.'

  const noteValue = readString(value.note)
  if (noteValue.length > 2000) errors.note = 'La note ne peut pas dépasser 2 000 caractères.'
  if (Object.keys(errors).length > 0 || !issueDate || !dueDate) return { errors }
  return {
    errors,
    data: {
      beneficiary,
      amount: amountValue,
      chequeNumber,
      bank: bankValue || null,
      issueDate,
      dueDate,
      status: rawStatus as ChequeStatus,
      note: noteValue || null,
    },
  }
}
