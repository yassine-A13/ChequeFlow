import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, Download, Pencil, WalletCards } from 'lucide-react'
import { Button } from '../../components/ui/button'

type Cheque = { id: string; beneficiary: string; amount: string; chequeNumber: string; bank: string | null; issueDate: string; dueDate: string; status: 'PENDING' | 'PROCESSING' | 'CASHED' | 'NOT_CASHED' | 'CANCELLED' | 'EXPIRED'; requiresEncashmentConfirmation?: boolean; note: string | null; hasImage: boolean; createdAt: string; updatedAt: string }
const statusNames: Record<Cheque['status'], string> = { PENDING: 'En attente', PROCESSING: 'En traitement', CASHED: 'Encaissé', NOT_CASHED: 'Non encaissé', CANCELLED: 'Annulé', EXPIRED: 'Expiré' }
function date(value: string, withTime = false) { return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(new Date(value)) }
function amount(value: string) { return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value)) }

export function ChequeDetailPage() {
  const { id } = useParams(), navigate = useNavigate()
  const [cheque, setCheque] = useState<Cheque | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('')
  const [statusBusy, setStatusBusy] = useState(false), [statusError, setStatusError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/cheques/${id}`, { credentials: 'same-origin', signal: controller.signal })
      .then(async response => { const body = await response.json() as { cheque?: Cheque; error?: string }; if (!response.ok || !body.cheque) throw new Error(body.error ?? 'Chèque introuvable.'); return body.cheque })
      .then(value => { if (!controller.signal.aborted) setCheque(value) })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Impossible de charger ce chèque.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [id])

  async function updateStatus(action: 'confirm-cashed' | 'confirm-not-cashed' | 'cancel') {
    if (!cheque || statusBusy) return
    if (action === 'cancel' && !window.confirm('Voulez-vous vraiment annuler ce chèque ?')) return
    setStatusBusy(true); setStatusError('')
    try {
      const response = await fetch(`/api/cheques/${cheque.id}`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) })
      const body = await response.json() as { cheque?: Cheque; error?: string }
      if (!response.ok || !body.cheque) throw new Error(body.error ?? 'Impossible de modifier le statut.')
      setCheque({ ...body.cheque, requiresEncashmentConfirmation: false })
    } catch (reason) { setStatusError(reason instanceof Error ? reason.message : 'Impossible de modifier le statut.') }
    finally { setStatusBusy(false) }
  }

  if (loading) return <div className="cheque-detail-loading" aria-busy="true"><div className="skeleton skeleton-heading" /><div className="cheque-form-skeleton">{Array.from({ length: 7 }, (_, index) => <div key={index}><div className="skeleton skeleton-label" /><div className="skeleton skeleton-row" /></div>)}</div></div>
  if (error || !cheque) return <div className="cheque-list-message"><p role="alert">{error || 'Chèque introuvable.'}</p><Button asChild variant="outline"><Link to="/cheques">Retour à la liste</Link></Button></div>

  return <div className="page-stack cheque-detail-page"><section><Link className="back-link cheque-back-link" to="/cheques"><ArrowLeft size={15} /> Tous les chèques</Link><div className="eyebrow">DÉTAIL DU CHÈQUE</div><div className="cheque-detail-title-row"><div><h2 className="page-heading">{cheque.beneficiary}</h2><p className="page-subtitle">Numéro {cheque.chequeNumber}</p></div><div className="cheque-detail-actions"><span className={`status-pill ${cheque.status.toLowerCase().replace('_', '-')}`}><i />{statusNames[cheque.status]}</span><Button variant="outline" onClick={() => navigate('/exports', { state: { initialScope: 'SINGLE', singleChequeId: cheque.id } })}><Download size={15} /> Exporter</Button><Button asChild><Link to={`/cheques/${cheque.id}/edit`}><Pencil size={15} /> Modifier</Link></Button></div></div></section>
    {(cheque.requiresEncashmentConfirmation || cheque.status === 'PENDING' || cheque.status === 'PROCESSING') && <section className="cheque-status-actions" aria-live="polite">{cheque.requiresEncashmentConfirmation && <><strong>Le chèque a-t-il été encaissé ?</strong><p>Confirmez son encaissement pour mettre à jour son statut.</p><div><Button onClick={() => void updateStatus('confirm-cashed')} disabled={statusBusy}>Oui, encaissé</Button><Button variant="outline" onClick={() => void updateStatus('confirm-not-cashed')} disabled={statusBusy}>Non, pas encaissé</Button></div></>}{(cheque.status === 'PENDING' || cheque.status === 'PROCESSING') && <Button className="button-danger" variant="outline" onClick={() => void updateStatus('cancel')} disabled={statusBusy}>Annuler le chèque</Button>}{statusError && <p className="cheque-status-error" role="alert">{statusError}</p>}</section>}
    <section className="cheque-detail-grid"><article className="cheque-detail-card cheque-detail-main"><div className="cheque-detail-amount-label">Montant du chèque</div><strong className="cheque-detail-amount">{amount(cheque.amount)}</strong><div className="cheque-detail-rule" /><div className="cheque-detail-facts"><Fact label="Bénéficiaire" value={cheque.beneficiary} /><Fact label="Numéro du chèque" value={cheque.chequeNumber} /><Fact label="Banque" value={cheque.bank || 'Non renseignée'} /><Fact label="Statut" value={statusNames[cheque.status]} /></div></article>
      <article className="cheque-detail-card"><div className="cheque-detail-section-title"><CalendarDays size={17} /><h3>Dates</h3></div><Fact label="Date d’émission" value={date(cheque.issueDate)} /><Fact label="Date d’échéance" value={date(cheque.dueDate)} /></article>
      <article className="cheque-detail-card"><div className="cheque-detail-section-title"><WalletCards size={17} /><h3>Historique</h3></div><Fact label="Créé le" value={date(cheque.createdAt, true)} /><Fact label="Modifié le" value={date(cheque.updatedAt, true)} /></article>
      <article className="cheque-detail-card cheque-detail-wide"><div className="cheque-detail-section-title"><h3>Note</h3></div><p className="cheque-note">{cheque.note || 'Aucune note pour ce chèque.'}</p></article>
      {cheque.hasImage && <article className="cheque-detail-card cheque-detail-wide"><div className="cheque-detail-section-title"><h3>Image du chèque</h3></div><img className="cheque-detail-image" src={`/api/cheques/${cheque.id}/image`} alt={`Image du chèque ${cheque.chequeNumber}`} /></article>}
    </section>
  </div>
}

function Fact({ label, value }: { label: string; value: string }) { return <div className="cheque-fact"><span>{label}</span><strong>{value}</strong></div> }
