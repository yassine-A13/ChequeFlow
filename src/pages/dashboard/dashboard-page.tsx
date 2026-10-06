import { useEffect, useState } from 'react'
import { AlarmClock, ArrowRight, Banknote, CalendarDays, CheckCircle2, Clock3, Download, Plus, RefreshCw, WalletCards } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/button'

type Status = 'PENDING' | 'PROCESSING' | 'CASHED' | 'NOT_CASHED' | 'CANCELLED' | 'EXPIRED'
type DashboardData = {
  stats: { total: number; pending: number; processing: number; cashed: number; notCashed: number; cancelled: number; expired: number; dueWithin48Hours: number; amountTotal: string }
  statuses: { status: Status; count: number }[]
  monthly: { month: string; label: string; count: number; amount: number }[]
  upcoming: { id: string; beneficiary: string; amount: string; chequeNumber: string; dueDate: string; status: Status }[]
}

const statusNames: Record<Status, string> = { PENDING: 'En attente', PROCESSING: 'En traitement', CASHED: 'Encaissé', NOT_CASHED: 'Non encaissé', CANCELLED: 'Annulé', EXPIRED: 'Expiré' }
const statusColors: Record<Status, string> = { PENDING: '#d4a84c', PROCESSING: '#7184c2', CASHED: '#378a70', NOT_CASHED: '#d17b64', CANCELLED: '#9299a5', EXPIRED: '#a477ad' }
const statusClass: Record<Status, string> = { PENDING: 'pending', PROCESSING: 'processing', CASHED: 'cashed', NOT_CASHED: 'not-cashed', CANCELLED: 'cancelled', EXPIRED: 'expired' }
const statCards = [
  { key: 'total', label: 'Total des chèques', icon: WalletCards, tone: 'green' },
  { key: 'pending', label: 'En attente', icon: Clock3, tone: 'amber' },
  { key: 'cashed', label: 'Encaissés', icon: CheckCircle2, tone: 'green' },
  { key: 'dueWithin48Hours', label: 'Échéance sous 48 h', icon: AlarmClock, tone: 'amber' },
] as const

function formatDate(value: string) { return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) }
function formatAmount(value: number | string) { return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value)) }
function formatCompact(value: number) { return new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(value) }

function LoadingDashboard() {
  return <div className="page-stack dashboard-page" aria-busy="true" aria-label="Chargement du tableau de bord">
    <div className="dashboard-heading"><div className="skeleton skeleton-heading" /><div className="skeleton skeleton-copy" /></div>
    <div className="dashboard-stats">{Array.from({ length: 5 }, (_, i) => <div className="dashboard-stat-skeleton" key={i}><div className="skeleton skeleton-label" /><div className="skeleton skeleton-number" /></div>)}</div>
    <div className="dashboard-chart-grid">{[0, 1, 2].map(i => <div className="dashboard-panel-skeleton" key={i}><div className="skeleton skeleton-label" /><div className="skeleton skeleton-chart" /></div>)}</div>
    <div className="dashboard-panel-skeleton"><div className="skeleton skeleton-label" /><div className="skeleton skeleton-row" /><div className="skeleton skeleton-row" /><div className="skeleton skeleton-row" /></div>
  </div>
}

function MonthlyBars({ rows, field, title, description }: { rows: DashboardData['monthly']; field: 'amount' | 'count'; title: string; description: string }) {
  const max = Math.max(1, ...rows.map(row => row[field]))
  const bars = rows.map((row, index) => {
    const value = row[field], height = value === 0 ? 2 : Math.max(5, value / max * 130)
    const x = 48 + index * 86
    return <g key={row.month}><title>{`${row.label} : ${field === 'amount' ? formatAmount(value) : value} ${field === 'amount' ? '' : 'chèque(s)'}`}</title><rect className="dashboard-bar" x={x} y={158 - height} width="42" height={height} rx="5" /><text className="dashboard-chart-value" x={x + 21} y={Math.max(14, 151 - height)} textAnchor="middle">{value === 0 ? '' : field === 'amount' ? formatCompact(value) : value}</text><text className="dashboard-chart-label" x={x + 21} y="180" textAnchor="middle">{row.label}</text></g>
  })
  return <section className="dashboard-panel" aria-label={title}><div className="dashboard-panel-heading"><div><h3>{title}</h3><p>{description}</p></div><span className="chart-trend-icon"><ArrowRight size={15} /></span></div>{rows.every(row => row[field] === 0) ? <div className="chart-empty">Les données mensuelles apparaîtront ici.</div> : <div className="dashboard-svg-wrap"><svg className="monthly-chart" viewBox="0 0 600 200" role="img" aria-label={title}><line x1="30" y1="158" x2="575" y2="158" className="chart-axis" />{bars}</svg></div>}</section>
}

function StatusChart({ data }: { data: DashboardData['statuses'] }) {
  const total = data.reduce((sum, item) => sum + item.count, 0)
  let accumulated = 0
  const segments = data.filter(item => item.count > 0).map(item => {
    const start = accumulated / Math.max(1, total) * 100
    accumulated += item.count
    const end = accumulated / Math.max(1, total) * 100
    return `${statusColors[item.status]} ${start}% ${end}%`
  })
  return <section className="dashboard-panel status-panel"><div className="dashboard-panel-heading"><div><h3>Répartition par statut</h3><p>Vue d’ensemble de votre portefeuille</p></div><span className="chart-trend-icon"><WalletCards size={15} /></span></div><div className="status-chart-content"><div className="status-donut" role="img" aria-label={`Répartition des ${total} chèques par statut`} style={{ background: total ? `conic-gradient(${segments.join(', ')})` : 'var(--border)' }}><div><strong>{total}</strong><span>chèques</span></div></div><div className="status-legend">{data.map(item => <div key={item.status}><span className="legend-dot" style={{ background: statusColors[item.status] }} /><span>{statusNames[item.status]}</span><strong>{item.count}</strong></div>)}</div></div></section>
}

function QuickActions() {
  return <section className="quick-actions" aria-label="Actions rapides"><Link to="/cheques/new" className="quick-action quick-action-primary"><Plus size={17} /><span>Nouveau chèque</span></Link><Link to="/cheques" className="quick-action"><WalletCards size={17} /><span>Voir tous les chèques</span></Link><Link to="/calendar" className="quick-action"><CalendarDays size={17} /><span>Calendrier</span></Link><Link to="/exports" className="quick-action"><Download size={17} /><span>Exporter</span></Link></section>
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/dashboard', { credentials: 'same-origin', signal: controller.signal })
      .then(async response => {
        const result = await response.json() as DashboardData & { error?: string }
        if (!response.ok) throw new Error(result.error ?? 'Impossible de charger le tableau de bord.')
        return result
      })
      .then(result => { if (!controller.signal.aborted) setData(result) })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Une erreur est survenue.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [retry])

  if (loading) return <LoadingDashboard />
  if (error || !data) return <main className="dashboard-error"><div className="dashboard-error-icon"><RefreshCw size={21} /></div><h2>Le tableau de bord ne se charge pas</h2><p>{error || 'Aucune réponse du serveur.'}</p><Button onClick={() => { setLoading(true); setError(''); setRetry(value => value + 1) }}><RefreshCw size={15} /> Réessayer</Button></main>

  const isEmpty = data.stats.total === 0
  return <div className="page-stack dashboard-page">
    <section className="dashboard-top"><div><div className="eyebrow">VOTRE ACTIVITÉ</div><h2 className="page-heading">Tableau de bord</h2><p className="page-subtitle">Un aperçu clair de vos chèques et prochaines échéances.</p></div><QuickActions /></section>
    <section className="dashboard-stats" aria-label="Statistiques des chèques">
      {statCards.map(({ key, label, icon: Icon, tone }) => <article className="dashboard-stat" key={key}><div className="dashboard-stat-top"><span>{label}</span><span className={`dashboard-stat-icon ${tone}`}><Icon size={17} /></span></div><strong>{data.stats[key].toLocaleString('fr-FR')}</strong><small>{key === 'dueWithin48Hours' ? 'Chèques actifs' : 'Dans votre espace'}</small></article>)}
      <article className="dashboard-stat amount-stat"><div className="dashboard-stat-top"><span>Montant total des chèques</span><span className="dashboard-stat-icon blue"><Banknote size={17} /></span></div><strong>{formatAmount(data.stats.amountTotal)}</strong><small>Montant cumulé enregistré</small></article>
    </section>
    <section className="dashboard-chart-grid" aria-label="Graphiques des chèques"><StatusChart data={data.statuses} /><MonthlyBars rows={data.monthly} field="amount" title="Évolution du montant" description="Montant des chèques par mois" /><MonthlyBars rows={data.monthly} field="count" title="Chèques par mois" description="Nombre de chèques par date d’émission" /></section>
    <section className="dashboard-panel upcoming-panel"><div className="dashboard-panel-heading upcoming-heading"><div><h3>Prochaines échéances</h3><p>Les cinq prochains chèques actifs, triés par date d’échéance.</p></div><Link to="/cheques" className="upcoming-all">Voir tous <ArrowRight size={15} /></Link></div>
      {isEmpty || data.upcoming.length === 0 ? <div className="dashboard-empty"><div className="dashboard-empty-icon"><CalendarDays size={20} /></div><strong>{isEmpty ? 'Votre espace est prêt' : 'Aucune échéance à venir'}</strong><p>{isEmpty ? 'Ajoutez votre premier chèque pour suivre ses échéances et consulter vos statistiques.' : 'Les chèques actifs apparaîtront ici dès qu’ils auront une date future.'}</p>{isEmpty && <Button asChild><Link to="/cheques/new"><Plus size={16} /> Nouveau chèque</Link></Button>}</div> : <div className="upcoming-table-wrap"><table className="upcoming-table"><thead><tr><th>Bénéficiaire</th><th>Montant</th><th>Numéro</th><th>Échéance</th><th>Statut</th></tr></thead><tbody>{data.upcoming.map(item => <tr key={item.id}><td><Link to={`/cheques/${item.id}`} className="beneficiary-link">{item.beneficiary}</Link></td><td className="amount-cell">{formatAmount(item.amount)}</td><td className="cheque-number-cell">{item.chequeNumber}</td><td>{formatDate(item.dueDate)}</td><td><span className={`status-pill ${statusClass[item.status]}`}><i />{statusNames[item.status]}</span></td></tr>)}</tbody></table></div>}
    </section>
    {isEmpty && <p className="dashboard-empty-note">Les graphiques et statistiques sont calculés directement à partir de vos chèques enregistrés.</p>}
  </div>
}
