import { getResendClient, getResendFromEmail } from './resend'

if (typeof window !== 'undefined') {
  throw new Error('Cheque reminder emails are server-only and must not be imported by browser code.')
}

export interface SendChequeReminderEmailInput {
  idempotencyKey?: string
  cheque: {
    id: string
    chequeNumber: string
    amount: string | number
    dueDate: Date | string
    beneficiary: string
    bank?: string | null
  }
  recipient: {
    email: string
    name?: string | null
  }
}

const subject = '🔔 Rappel — Chèque à échéance dans 48h'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function getChequeUrl(chequeId: string) {
  const configuredUrl = process.env.APP_URL?.trim()
  const vercelUrl = process.env.VERCEL_URL?.trim()
  const baseUrl = configuredUrl || (vercelUrl ? `https://${vercelUrl}` : 'http://localhost:3000')
  const parsed = new URL(baseUrl)
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) {
    throw new Error('APP_URL must use HTTPS outside local development.')
  }
  return new URL(`/cheques/${encodeURIComponent(chequeId)}`, parsed.origin).toString()
}

function formatDueDate(value: Date | string) {
  const dueDate = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(dueDate.getTime())) throw new Error('Cheque due date is invalid.')
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(dueDate)
}

function formatAmount(value: string | number) {
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Cheque amount is invalid.')
  return `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} DH`
}

function createEmailHtml(input: SendChequeReminderEmailInput, amount: string, dueDate: string, chequeUrl: string) {
  const chequeNumber = escapeHtml(input.cheque.chequeNumber)
  const beneficiary = escapeHtml(input.cheque.beneficiary)
  const bank = input.cheque.bank?.trim()
  const recipientName = input.recipient.name?.trim()
  const bankRow = bank
    ? `<tr><td style="padding:12px 0;color:#667085;font-size:14px;border-top:1px solid #e9edf2">Banque</td><td style="padding:12px 0;color:#182230;font-size:14px;font-weight:600;text-align:right;border-top:1px solid #e9edf2">${escapeHtml(bank)}</td></tr>`
    : ''

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${escapeHtml(subject)}</title>
    <style>
      @media only screen and (max-width: 600px) {
        .email-shell { width: 100% !important; }
        .email-gutter { padding: 20px 14px !important; }
        .email-card { padding: 25px 20px !important; }
        .email-title { font-size: 25px !important; }
        .detail-cell { font-size: 13px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f3f5f7;font-family:Arial,Helvetica,sans-serif;color:#182230">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">Votre chèque n°${chequeNumber} arrive à échéance dans 48 heures.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f5f7">
      <tr><td class="email-gutter" align="center" style="padding:42px 18px">
        <table role="presentation" class="email-shell" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:600px">
          <tr><td style="padding:0 0 18px;font-size:13px;font-weight:700;letter-spacing:.3px;color:#246b55">CHEQUEFLOW</td></tr>
          <tr><td class="email-card" style="padding:36px 40px;background:#fff;border:1px solid #e5e9ef;border-radius:14px">
            <div style="display:inline-block;padding:7px 10px;border-radius:20px;background:#fff4dc;color:#8b5a00;font-size:12px;font-weight:700">ÉCHÉANCE DANS 48 H</div>
            <h1 class="email-title" style="margin:20px 0 8px;font-size:30px;line-height:1.2;letter-spacing:-.5px;color:#172b24">Un chèque arrive bientôt à échéance</h1>
            <p style="margin:0 0 25px;color:#667085;font-size:15px;line-height:1.6">${recipientName ? `Bonjour ${escapeHtml(recipientName)}, ` : ''}voici les informations du chèque à prévoir.</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse">
              <tr><td class="detail-cell" style="padding:12px 0;color:#667085;font-size:14px">Numéro du chèque</td><td class="detail-cell" style="padding:12px 0;color:#182230;font-size:14px;font-weight:600;text-align:right">${chequeNumber}</td></tr>
              <tr><td class="detail-cell" style="padding:12px 0;color:#667085;font-size:14px;border-top:1px solid #e9edf2">Montant</td><td class="detail-cell" style="padding:12px 0;color:#182230;font-size:14px;font-weight:700;text-align:right;border-top:1px solid #e9edf2">${escapeHtml(amount)}</td></tr>
              <tr><td class="detail-cell" style="padding:12px 0;color:#667085;font-size:14px;border-top:1px solid #e9edf2">Date d’échéance</td><td class="detail-cell" style="padding:12px 0;color:#182230;font-size:14px;font-weight:600;text-align:right;border-top:1px solid #e9edf2">${escapeHtml(dueDate)}</td></tr>
              <tr><td class="detail-cell" style="padding:12px 0;color:#667085;font-size:14px;border-top:1px solid #e9edf2">Bénéficiaire</td><td class="detail-cell" style="padding:12px 0;color:#182230;font-size:14px;font-weight:600;text-align:right;border-top:1px solid #e9edf2">${beneficiary}</td></tr>
              ${bankRow}
            </table>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:30px 0 0">
              <tr><td align="center" style="border-radius:8px;background:#246b55">
                <a href="${escapeHtml(chequeUrl)}" target="_blank" style="display:inline-block;padding:14px 22px;border:1px solid #246b55;border-radius:8px;color:#fff;font-size:14px;font-weight:700;text-decoration:none">Ouvrir le chèque</a>
              </td></tr>
            </table>
          </td></tr>
          <tr><td style="padding:20px 8px;color:#8a94a3;font-size:12px;line-height:1.5;text-align:center">Cet email a été envoyé par ChequeFlow pour vous aider à suivre vos échéances.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
}

function createEmailText(input: SendChequeReminderEmailInput, amount: string, dueDate: string, chequeUrl: string) {
  return [
    `Rappel — Chèque à échéance dans 48h`,
    '',
    `Numéro du chèque : ${input.cheque.chequeNumber}`,
    `Montant : ${amount}`,
    `Date d’échéance : ${dueDate}`,
    `Bénéficiaire : ${input.cheque.beneficiary}`,
    ...(input.cheque.bank?.trim() ? [`Banque : ${input.cheque.bank.trim()}`] : []),
    '',
    `Ouvrir le chèque : ${chequeUrl}`,
  ].join('\n')
}

/** Sends one 48-hour cheque reminder email from a server-side caller. */
export async function sendChequeReminderEmail(input: SendChequeReminderEmailInput) {
  const recipientEmail = input.recipient.email.trim()
  if (!recipientEmail || !recipientEmail.includes('@')) throw new Error('Recipient email is invalid.')
  if (!input.cheque.id.trim() || !input.cheque.chequeNumber.trim() || !input.cheque.beneficiary.trim()) {
    throw new Error('Cheque reminder details are incomplete.')
  }

  const amount = formatAmount(input.cheque.amount)
  const dueDate = formatDueDate(input.cheque.dueDate)
  const chequeUrl = getChequeUrl(input.cheque.id)
  const { data, error } = await getResendClient().emails.send({
    from: getResendFromEmail(),
    to: [recipientEmail],
    subject,
    html: createEmailHtml(input, amount, dueDate, chequeUrl),
    text: createEmailText(input, amount, dueDate, chequeUrl),
  }, input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined)

  if (error) throw new Error(`Resend email send failed: ${error.message}`)
  return data
}
