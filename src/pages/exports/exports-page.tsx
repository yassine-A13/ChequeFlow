import { useEffect, useMemo, useState } from 'react'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { Button } from '../../components/ui/button'

type ExportFormat = 'XLSX' | 'PDF'
type ExportScope = 'ALL' | 'SELECTED' | 'SINGLE' | 'FILTERED'
type NavigationState = { initialScope?: ExportScope; selectedIds?: string[]; singleChequeId?: string; filters?: Record<string, string> }
type HistoryRow = { id: string; format: string; scope: string; createdAt: string }

const scopeLabels: Record<ExportScope, string> = { ALL: 'Tous les chèques', SELECTED: 'Chèques sélectionnés', SINGLE: 'Un seul chèque', FILTERED: 'Résultats filtrés' }
const formatLabels: Record<ExportFormat, string> = { XLSX: 'Excel (.xlsx)', PDF: 'PDF (.pdf)' }

export function ExportsPage() {
  const location = useLocation()
  const navigation = (location.state ?? {}) as NavigationState
  const [format, setFormat] = useState<ExportFormat>('XLSX')
  const [scope, setScope] = useState<ExportScope>(navigation.initialScope ?? 'ALL')
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const canExportSelected = Boolean(navigation.selectedIds?.length)
  const singleId = navigation.singleChequeId
  const activeFilters = useMemo(() => Object.fromEntries(Object.entries(navigation.filters ?? {}).filter(([key, value]) => value && ['search', 'status', 'startDate', 'endDate', 'amountMin', 'amountMax', 'bank'].includes(key))), [navigation.filters])
  const filterCount = Object.keys(activeFilters).length

  useEffect(() => {
    fetch('/api/exports', { credentials: 'same-origin' })
      .then(async response => { const body = await response.json() as { history?: HistoryRow[] }; if (response.ok) setHistory(body.history ?? []) })
      .catch(() => undefined)
  }, [message])

  async function downloadExport() {
    setError(''); setMessage('')
    if (scope === 'SELECTED' && !canExportSelected) { setError('Sélectionnez au moins un chèque dans la liste.'); return }
    if (scope === 'SINGLE' && !singleId) { setError('Pour exporter un seul chèque, ouvrez sa fiche puis cliquez sur « Exporter ».'); return }
    setExporting(true)
    try {
      const response = await fetch('/api/exports', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ format, scope, ids: scope === 'SELECTED' ? navigation.selectedIds : scope === 'SINGLE' ? singleId : undefined, filters: scope === 'FILTERED' ? activeFilters : undefined }),
      })
      if (!response.ok) {
        const body = await response.json() as { error?: string }
        throw new Error(body.error ?? 'Impossible de générer l’export.')
      }
      const blob = await response.blob()
      const disposition = response.headers.get('content-disposition')
      const filename = disposition?.match(/filename="([^"]+)"/)?.[1] ?? `cheques.${format === 'XLSX' ? 'xlsx' : 'pdf'}`
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      const count = response.headers.get('x-export-count') ?? '0'
      const total = response.headers.get('x-export-total')
      setMessage(`${count} chèque${count === '1' ? '' : 's'} exporté${count === '1' ? '' : 's'}${total ? ` · montant total : ${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(total))}` : ''}.`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Le serveur est momentanément inaccessible.') }
    finally { setExporting(false) }
  }

  return <div className="page-stack export-page"><section><div className="eyebrow">VOS DOCUMENTS</div><h2 className="page-heading">Exporter les chèques</h2><p className="page-subtitle">Téléchargez vos chèques au format Excel ou PDF.</p></section>
    <section className="export-card"><div className="export-card-heading"><span className="export-icon"><Download size={18} /></span><div><h3>Nouvel export</h3><p>Le fichier contient uniquement vos chèques.</p></div></div>
      <div className="export-options-grid"><label className="cheque-field"><span className="cheque-field-label">Format</span><select value={format} onChange={event => setFormat(event.target.value as ExportFormat)}><option value="XLSX">Excel (.xlsx)</option><option value="PDF">PDF (.pdf)</option></select></label><label className="cheque-field"><span className="cheque-field-label">Chèques à exporter</span><select value={scope} onChange={event => setScope(event.target.value as ExportScope)}><option value="ALL">Tous les chèques</option><option value="SELECTED">Chèques sélectionnés</option><option value="SINGLE">Un seul chèque</option><option value="FILTERED">Résultats actuellement filtrés</option></select></label></div>
      <div className="export-scope-note">{scope === 'SELECTED' ? canExportSelected ? `${navigation.selectedIds?.length} chèque(s) sélectionné(s).` : 'Aucune sélection reçue. Retournez à la liste pour sélectionner des chèques.' : scope === 'SINGLE' ? singleId ? 'La fiche et ses informations seront exportées.' : 'Ouvrez la fiche du chèque à exporter seul, puis utilisez son bouton Exporter.' : scope === 'FILTERED' ? filterCount ? `${filterCount} filtre(s) seront appliqués à tous les résultats, pas uniquement à la page visible.` : 'Aucun filtre actif : tous les chèques correspondent.' : 'Tous les chèques enregistrés sur votre compte seront exportés.'}</div>
      {error && <p className="export-feedback export-error" role="alert">{error}</p>}{message && <p className="export-feedback" role="status">{message}</p>}
      <Button onClick={() => void downloadExport()} disabled={exporting}>{format === 'XLSX' ? <FileSpreadsheet size={16} /> : <FileText size={16} />}{exporting ? 'Génération…' : `Télécharger ${formatLabels[format]}`}</Button>
    </section>
    <section className="export-card"><div className="export-card-heading"><span className="export-icon"><FileSpreadsheet size={18} /></span><div><h3>Exports récents</h3><p>Historique des derniers téléchargements.</p></div></div>{history.length ? <div className="export-history-list">{history.map(item => <div className="export-history-row" key={item.id}><span>{formatLabels[item.format as ExportFormat] ?? 'Ancien export'} · {scopeLabels[item.scope as ExportScope] ?? '—'}</span><time dateTime={item.createdAt}>{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))}</time></div>)}</div> : <p className="export-empty-note">Aucun export généré pour le moment.</p>}</section>
  </div>
}
