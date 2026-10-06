import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import sharp from 'sharp'

export type ExportCheque = {
  id: string
  beneficiary: string
  amount: string
  chequeNumber: string
  bank: string | null
  issueDate: Date
  dueDate: Date
  status: string
  note: string | null
  imageUrl?: string | null
  createdAt: Date
  updatedAt: Date
}

const statusLabels: Record<string, string> = {
  PENDING: 'En attente', PROCESSING: 'En cours de traitement', CASHED: 'Encaissé',
  NOT_CASHED: 'Non encaissé', CANCELLED: 'Annulé', EXPIRED: 'Expiré',
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(value)
}

function formatAmount(value: string) {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value))
}

export async function createExcelExport(cheques: ExportCheque[]) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ChequeFlow'
  workbook.created = new Date()
  const sheet = workbook.addWorksheet('Chèques')
  sheet.columns = [
    { header: 'Bénéficiaire', key: 'beneficiary', width: 28 },
    { header: 'Montant', key: 'amount', width: 16, style: { numFmt: '#,##0.00' } },
    { header: 'Numéro du chèque', key: 'chequeNumber', width: 22 },
    { header: 'Banque', key: 'bank', width: 24 },
    { header: 'Date d’émission', key: 'issueDate', width: 18 },
    { header: 'Date d’échéance', key: 'dueDate', width: 18 },
    { header: 'Statut', key: 'status', width: 24 },
    { header: 'Note', key: 'note', width: 48 },
  ]
  const header = sheet.getRow(1)
  header.height = 25
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF276B61' } }
  for (const cheque of cheques) {
    sheet.addRow({
      beneficiary: cheque.beneficiary,
      amount: Number(cheque.amount),
      chequeNumber: cheque.chequeNumber,
      bank: cheque.bank ?? '',
      issueDate: formatDate(cheque.issueDate),
      dueDate: formatDate(cheque.dueDate),
      status: statusLabels[cheque.status] ?? cheque.status,
      note: cheque.note ?? '',
    })
  }
  sheet.autoFilter = { from: 'A1', to: 'H1' }
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export async function createPdfExport(cheques: ExportCheque[], privateImage?: Buffer | null) {
  const doc = new PDFDocument({ size: 'A4', margin: 42, ...(cheques.length === 1 ? {} : { layout: 'landscape' }) })
  const chunks: Buffer[] = []
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  if (cheques.length === 1) writeSingleChequePdf(doc, cheques[0], privateImage)
  else writeChequeSummaryPdf(doc, cheques)
  doc.end()
  return completed
}

function writeSingleChequePdf(doc: PDFKit.PDFDocument, cheque: ExportCheque, image?: Buffer | null) {
  doc.fillColor('#276b61').fontSize(10).font('Helvetica-Bold').text('CHEQUEFLOW', { characterSpacing: 1.2 })
  doc.moveDown(0.8).fillColor('#202b3b').fontSize(24).font('Helvetica-Bold').text('Fiche du chèque')
  doc.moveDown(0.2).fillColor('#687587').fontSize(11).font('Helvetica').text(`Numéro ${cheque.chequeNumber}`)
  doc.moveDown(1.4)

  const facts: Array<[string, string]> = [
    ['Bénéficiaire', cheque.beneficiary],
    ['Montant', `${formatAmount(cheque.amount)}`],
    ['Numéro du chèque', cheque.chequeNumber],
    ['Banque', cheque.bank || 'Non renseignée'],
    ['Date d’émission', formatDate(cheque.issueDate)],
    ['Date d’échéance', formatDate(cheque.dueDate)],
    ['Statut', statusLabels[cheque.status] ?? cheque.status],
    ['Créé le', `${formatDate(cheque.createdAt)} à ${cheque.createdAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`],
    ['Modifié le', `${formatDate(cheque.updatedAt)} à ${cheque.updatedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`],
  ]
  for (const [label, value] of facts) {
    const y = doc.y
    doc.fillColor('#687587').fontSize(9).font('Helvetica').text(label, 42, y, { width: 150 })
    doc.fillColor('#202b3b').fontSize(10).font('Helvetica-Bold').text(value, 192, y, { width: 350 })
    doc.moveDown(0.95)
  }
  doc.moveDown(0.45).fillColor('#687587').fontSize(9).font('Helvetica').text('Note')
  doc.moveDown(0.3).fillColor('#202b3b').fontSize(10).font('Helvetica').text(cheque.note || 'Aucune note.', { width: 510, lineGap: 3 })

  if (image) {
    doc.moveDown(1)
    if (doc.y > 540) doc.addPage()
    doc.fillColor('#276b61').fontSize(11).font('Helvetica-Bold').text('Image du chèque')
    doc.moveDown(0.5)
    doc.image(image, 42, doc.y, { fit: [510, Math.max(120, doc.page.height - doc.y - 48)] })
  }
}

function writeChequeSummaryPdf(doc: PDFKit.PDFDocument, cheques: ExportCheque[]) {
  const total = cheques.reduce((sum, cheque) => sum + Number(cheque.amount), 0)
  doc.fillColor('#276b61').fontSize(10).font('Helvetica-Bold').text('CHEQUEFLOW', { characterSpacing: 1.2 })
  doc.moveDown(0.7).fillColor('#202b3b').fontSize(22).font('Helvetica-Bold').text('Récapitulatif des chèques')
  doc.moveDown(0.3).fillColor('#687587').fontSize(10).font('Helvetica').text(`${cheques.length} chèque${cheques.length > 1 ? 's' : ''} · Montant total : ${formatAmount(total.toFixed(2))}`)
  doc.moveDown(1)

  const columns = [
    { label: 'Bénéficiaire', x: 42, width: 145 }, { label: 'Montant', x: 190, width: 78 },
    { label: 'N° du chèque', x: 270, width: 100 }, { label: 'Banque', x: 373, width: 110 },
    { label: 'Échéance', x: 486, width: 75 }, { label: 'Statut', x: 564, width: 90 },
  ]
  const drawHeader = () => {
    const y = doc.y
    doc.rect(42, y, 612, 23).fill('#e9f4f1')
    for (const col of columns) doc.fillColor('#1f5b52').fontSize(8).font('Helvetica-Bold').text(col.label, col.x + 4, y + 7, { width: col.width - 8, lineBreak: false })
    doc.y = y + 31
  }
  drawHeader()
  for (const [index, cheque] of cheques.entries()) {
    if (doc.y > doc.page.height - 52) { doc.addPage(); drawHeader() }
    const y = doc.y
    if (index % 2 === 1) doc.rect(42, y - 3, 612, 25).fill('#f7f8fa')
    const values = [cheque.beneficiary, formatAmount(cheque.amount), cheque.chequeNumber, cheque.bank || '—', formatDate(cheque.dueDate), statusLabels[cheque.status] ?? cheque.status]
    for (const [columnIndex, col] of columns.entries()) doc.fillColor('#202b3b').fontSize(8).font('Helvetica').text(values[columnIndex], col.x + 4, y + 3, { width: col.width - 8, height: 18, ellipsis: true, lineBreak: false })
    doc.y = y + 23
  }
  doc.moveDown(0.7).fillColor('#202b3b').fontSize(10).font('Helvetica-Bold').text(`Total : ${cheques.length} chèques · ${formatAmount(total.toFixed(2))}`)
}

export async function normalizeChequeImageForPdf(bytes: Buffer) {
  return sharp(bytes).rotate().png().toBuffer()
}
