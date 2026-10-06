import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Download, Eye, FilePlus2, Pencil, Search, Trash2, WalletCards, X } from 'lucide-react'
import { Button } from '../../components/ui/button'

type Status = 'PENDING' | 'PROCESSING' | 'CASHED' | 'NOT_CASHED' | 'CANCELLED' | 'EXPIRED'
type Sort = 'dueDate' | 'issueDate' | 'amount' | 'beneficiary'
type ChequeRow = { id: string; beneficiary: string; amount: string; chequeNumber: string; bank: string | null; issueDate: string; dueDate: string; status: Status; requiresEncashmentConfirmation?: boolean }
type ListResponse = { cheques?: ChequeRow[]; total?: number; totalPages?: number; page?: number; error?: string }
const pageSize = 25
const statuses: { value: Status | ''; label: string }[] = [
  { value: '', label: 'Tous les statuts' }, { value: 'PENDING', label: 'En attente' }, { value: 'PROCESSING', label: 'En cours de traitement' },
  { value: 'CASHED', label: 'Encaissé' }, { value: 'NOT_CASHED', label: 'Non encaissé' }, { value: 'CANCELLED', label: 'Annulé' }, { value: 'EXPIRED', label: 'Expiré' },
]
const statusLabel = Object.fromEntries(statuses.filter(item => item.value).map(item => [item.value, item.label])) as Record<Status, string>
const sortOptions: { value: Sort; label: string }[] = [{ value: 'dueDate', label: "Date d'échéance" }, { value: 'issueDate', label: "Date d'émission" }, { value: 'amount', label: 'Montant' }, { value: 'beneficiary', label: 'Bénéficiaire' }]

function amount(value: string) { return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value)) }
function date(value: string) { return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) }

export function ChequesPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const queryKey = params.toString()
  const page = Math.max(1, Number(params.get('page')) || 1)
  const search = params.get('search') ?? ''
  const status = params.get('status') ?? ''
  const sort = (params.get('sort') ?? 'dueDate') as Sort
  const order = params.get('order') === 'desc' ? 'desc' : 'asc'
  const [searchInput, setSearchInput] = useState(search)
  const [result, setResult] = useState<{ key: string; cheques: ChequeRow[]; total: number; error: string } | null>(null)
  const [reload, setReload] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [toDelete, setToDelete] = useState<ChequeRow | null>(null), [deleting, setDeleting] = useState(false), [deleteError, setDeleteError] = useState('')
  const cheques = result?.key === queryKey ? result.cheques : []
  const total = result?.key === queryKey ? result.total : 0
  const loading = result?.key !== queryKey
  const error = result?.key === queryKey ? result.error : ''
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const allVisibleSelected = cheques.length > 0 && cheques.every(item => selectedIds.has(item.id))
  const someVisibleSelected = cheques.some(item => selectedIds.has(item.id))

  const patchParams = useCallback((updates: Record<string, string>, resetPage = true) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(updates)) value ? next.set(key, value) : next.delete(key)
    if (resetPage) next.delete('page')
    setParams(next, { replace: true })
  }, [params, setParams])

  useEffect(() => {
    const timer = setTimeout(() => setSearchInput(search), 0)
    return () => clearTimeout(timer)
  }, [search])
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput.trim() !== search) patchParams({ search: searchInput.trim() })
    }, 250)
    return () => clearTimeout(timer)
  }, [searchInput, search, patchParams])

  useEffect(() => {
    const controller = new AbortController()
    const requestParams = new URLSearchParams(params)
    requestParams.set('page', String(page))
    fetch(`/api/cheques?${requestParams}`, { credentials: 'same-origin', signal: controller.signal })
      .then(async response => { const body = await response.json() as ListResponse; if (!response.ok) throw new Error(body.error ?? 'Impossible de charger les chèques.'); return body })
      .then(body => { if (!controller.signal.aborted) setResult({ key: queryKey, cheques: body.cheques ?? [], total: body.total ?? 0, error: '' }) })
      .catch(reason => { if (!controller.signal.aborted) setResult({ key: queryKey, cheques: [], total: 0, error: reason instanceof Error ? reason.message : 'Une erreur est survenue.' }) })
    return () => controller.abort()
  }, [queryKey, params, page, reload])

  const updateSelection = useCallback((ids: string[], checked: boolean) => setSelectedIds(previous => {
    const next = new Set(previous)
    for (const id of ids) checked ? next.add(id) : next.delete(id)
    return next
  }), [])

  const deleteCheque = useCallback(async () => {
    if (!toDelete) return
    setDeleting(true); setDeleteError('')
    try {
      const response = await fetch(`/api/cheques/${toDelete.id}`, { method: 'DELETE', credentials: 'same-origin' })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error ?? 'La suppression a échoué.')
      setSelectedIds(previous => { const next = new Set(previous); next.delete(toDelete.id); return next })
      setToDelete(null)
      if (cheques.length === 1 && page > 1) patchParams({ page: String(page - 1) }, false)
      else setReload(value => value + 1)
    } catch (reason) { setDeleteError(reason instanceof Error ? reason.message : 'La suppression a échoué.') }
    finally { setDeleting(false) }
  }, [toDelete, cheques.length, page, patchParams])

  const emptyFilters = !search && !status && !params.get('startDate') && !params.get('endDate') && !params.get('amountMin') && !params.get('amountMax') && !params.get('bank')
  const selectedCountLabel = useMemo(() => `${selectedIds.size} chèque${selectedIds.size === 1 ? '' : 's'} sélectionné${selectedIds.size === 1 ? '' : 's'}`, [selectedIds.size])
  function openExport(scope: 'SELECTED' | 'FILTERED') {
    navigate('/exports', { state: { initialScope: scope, selectedIds: scope === 'SELECTED' ? [...selectedIds] : [], filters: Object.fromEntries(params) } })
  }

  return <div className="page-stack cheque-list-page">
    <section className="welcome-row"><div><div className="eyebrow">GESTION</div><h2 className="page-heading">Tous les chèques</h2><p className="page-subtitle">Consultez et gérez vos chèques enregistrés.</p></div><div className="cheque-page-actions"><Button variant="outline" onClick={() => openExport(selectedIds.size ? 'SELECTED' : 'FILTERED')}><Download size={16} /> Exporter</Button><Button asChild><Link to="/cheques/new"><FilePlus2 size={16} /> Nouveau chèque</Link></Button></div></section>
    <section className="cheque-list-panel">
      <div className="cheque-list-toolbar"><label className="cheque-search"><Search size={16} /><input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Rechercher un numéro, bénéficiaire ou banque" aria-label="Rechercher des chèques" /></label>
        <select aria-label="Filtrer par statut" value={status} onChange={event => patchParams({ status: event.target.value })}>{statuses.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
        <span className="cheque-result-count" aria-live="polite">{loading ? 'Chargement…' : `${total.toLocaleString('fr-FR')} résultat${total === 1 ? '' : 's'}`}</span>
      </div>
      <div className="cheque-filter-grid">
        <label className="cheque-field"><span className="cheque-field-label">Date d’échéance — début</span><input type="date" value={params.get('startDate') ?? ''} onChange={event => patchParams({ startDate: event.target.value })} /></label>
        <label className="cheque-field"><span className="cheque-field-label">Date d’échéance — fin</span><input type="date" value={params.get('endDate') ?? ''} onChange={event => patchParams({ endDate: event.target.value })} /></label>
        <label className="cheque-field"><span className="cheque-field-label">Montant minimum</span><input type="number" min="0" step="0.01" value={params.get('amountMin') ?? ''} onChange={event => patchParams({ amountMin: event.target.value })} placeholder="0,00" /></label>
        <label className="cheque-field"><span className="cheque-field-label">Montant maximum</span><input type="number" min="0" step="0.01" value={params.get('amountMax') ?? ''} onChange={event => patchParams({ amountMax: event.target.value })} placeholder="—" /></label>
        <label className="cheque-field"><span className="cheque-field-label">Banque</span><input value={params.get('bank') ?? ''} onChange={event => patchParams({ bank: event.target.value })} placeholder="Toutes les banques" /></label>
        <label className="cheque-field"><span className="cheque-field-label">Trier par</span><select value={sort} onChange={event => patchParams({ sort: event.target.value })}>{sortOptions.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
        <label className="cheque-field"><span className="cheque-field-label">Ordre</span><select value={order} onChange={event => patchParams({ order: event.target.value })}><option value="asc">Croissant</option><option value="desc">Décroissant</option></select></label>
        {!emptyFilters && <div className="cheque-filter-reset"><Button variant="outline" size="sm" onClick={() => { setSearchInput(''); setParams(new URLSearchParams(), { replace: true }) }}>Effacer les filtres</Button></div>}
      </div>
      {selectedIds.size > 0 && <div className="cheque-selection-bar"><span aria-live="polite">{selectedCountLabel}</span><div><Button variant="outline" size="sm" onClick={() => openExport('SELECTED')}><Download size={14} /> Exporter la sélection</Button><Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>Effacer la sélection</Button></div></div>}
      {loading ? <div className="cheque-table-loading" aria-busy="true">{Array.from({ length: 6 }, (_, index) => <div className="skeleton skeleton-row" key={index} />)}</div>
        : error ? <div className="cheque-list-message"><p role="alert">{error}</p><Button variant="outline" onClick={() => setReload(value => value + 1)}>Réessayer</Button></div>
          : cheques.length === 0 ? <div className="cheque-list-empty"><div className="dashboard-empty-icon"><WalletCards size={21} /></div><strong>{emptyFilters ? 'Aucun chèque enregistré' : 'Aucun résultat'}</strong><p>{emptyFilters ? 'Ajoutez votre premier chèque pour commencer à suivre ses échéances.' : 'Essayez de modifier votre recherche ou vos filtres.'}</p>{emptyFilters && <Button asChild><Link to="/cheques/new"><FilePlus2 size={16} /> Ajouter un chèque</Link></Button>}</div>
            : <><div className="upcoming-table-wrap"><table className="upcoming-table cheque-table"><thead><tr><th><input type="checkbox" aria-label="Sélectionner tous les chèques visibles" checked={allVisibleSelected} ref={element => { if (element) element.indeterminate = someVisibleSelected && !allVisibleSelected }} onChange={event => updateSelection(cheques.map(item => item.id), event.target.checked)} /></th><th>Numéro</th><th>Bénéficiaire</th><th>Montant</th><th>Banque</th><th>Émission</th><th>Échéance</th><th>Statut</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{cheques.map(cheque => <tr key={cheque.id}><td><input type="checkbox" aria-label={`Sélectionner le chèque ${cheque.chequeNumber}`} checked={selectedIds.has(cheque.id)} onChange={event => updateSelection([cheque.id], event.target.checked)} /></td><td className="cheque-number-cell">{cheque.chequeNumber}</td><td><Link className="beneficiary-link" to={`/cheques/${cheque.id}`}>{cheque.beneficiary}</Link></td><td className="amount-cell">{amount(cheque.amount)}</td><td>{cheque.bank || '—'}</td><td>{date(cheque.issueDate)}</td><td>{date(cheque.dueDate)}</td><td><span className={`status-pill ${cheque.status.toLowerCase().replace('_', '-')}`}><i />{statusLabel[cheque.status]}</span>{cheque.requiresEncashmentConfirmation && <Link className="cheque-confirmation-link" to={`/cheques/${cheque.id}`}>Confirmation requise</Link>}</td><td><div className="cheque-row-actions"><Link to={`/cheques/${cheque.id}`} aria-label={`Voir le chèque ${cheque.chequeNumber}`} title="Voir"><Eye size={15} /></Link><Link to={`/cheques/${cheque.id}/edit`} aria-label={`Modifier le chèque ${cheque.chequeNumber}`} title="Modifier"><Pencil size={15} /></Link><button onClick={() => { setToDelete(cheque); setDeleteError('') }} aria-label={`Supprimer le chèque ${cheque.chequeNumber}`} title="Supprimer"><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div><div className="cheque-pagination"><span>{total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} sur ${total}` : '0 résultat'}</span><div><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => patchParams({ page: String(page - 1) }, false)}>Précédent</Button><span>Page {page} sur {totalPages}</span><Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => patchParams({ page: String(page + 1) }, false)}>Suivant</Button></div></div></>}
    </section>
    {toDelete && <div className="cheque-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !deleting) setToDelete(null) }}><section className="cheque-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title"><button className="cheque-modal-close" onClick={() => setToDelete(null)} aria-label="Fermer" disabled={deleting}><X size={18} /></button><div className="delete-warning-icon"><Trash2 size={19} /></div><h2 id="delete-title">Supprimer ce chèque ?</h2><p>Voulez-vous vraiment supprimer ce chèque ? Les notifications associées seront également supprimées.</p><strong>{toDelete.chequeNumber} · {toDelete.beneficiary}</strong>{deleteError && <p role="alert" className="cheque-form-error">{deleteError}</p>}<div className="cheque-modal-actions"><Button variant="outline" onClick={() => setToDelete(null)} disabled={deleting}>Annuler</Button><Button className="button-danger" onClick={() => void deleteCheque()} disabled={deleting}>{deleting ? 'Suppression…' : 'Supprimer'}</Button></div></section></div>}
  </div>
}
