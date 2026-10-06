import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ImagePlus, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/button'

type Status = 'PENDING' | 'PROCESSING' | 'CASHED' | 'NOT_CASHED' | 'CANCELLED' | 'EXPIRED'
type FormState = { beneficiary: string; amount: string; chequeNumber: string; bank: string; issueDate: string; dueDate: string; status: Status; note: string }
type FieldErrors = Partial<Record<keyof FormState | 'form' | 'image', string>>
const initialForm: FormState = { beneficiary: '', amount: '', chequeNumber: '', bank: '', issueDate: '', dueDate: '', status: 'PENDING', note: '' }
const statusOptions: { value: Status; label: string }[] = [
  { value: 'PENDING', label: 'En attente' }, { value: 'PROCESSING', label: 'En traitement' }, { value: 'CASHED', label: 'Encaissé' },
  { value: 'NOT_CASHED', label: 'Non encaissé' }, { value: 'CANCELLED', label: 'Annulé' }, { value: 'EXPIRED', label: 'Expiré' },
]
const maxImageBytes = 2 * 1024 * 1024
async function readJson<T>(response: Response): Promise<T> {
  const body = await response.text()
  if (!body.trim()) throw new Error(`L’API n’a renvoyé aucune réponse (HTTP ${response.status}). Le serveur Vite local ne démarre pas les fonctions du dossier api/.`)
  try { return JSON.parse(body) as T }
  catch { throw new Error(`Réponse API invalide (HTTP ${response.status}). Le serveur Vite local ne démarre pas les fonctions du dossier api/.`) }
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {}
  if (!form.beneficiary.trim()) errors.beneficiary = 'Le bénéficiaire est obligatoire.'
  else if (form.beneficiary.trim().length > 150) errors.beneficiary = '150 caractères maximum.'
  if (!form.amount) errors.amount = 'Le montant est obligatoire.'
  else if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(form.amount) || Number(form.amount) <= 0) errors.amount = 'Saisissez un montant supérieur à zéro avec deux décimales maximum.'
  if (!form.chequeNumber.trim()) errors.chequeNumber = 'Le numéro du chèque est obligatoire.'
  else if (form.chequeNumber.trim().length > 80) errors.chequeNumber = '80 caractères maximum.'
  if (form.bank.trim().length > 100) errors.bank = '100 caractères maximum.'
  if (!isValidDate(form.issueDate)) errors.issueDate = 'La date d’émission est obligatoire et doit être valide.'
  if (!isValidDate(form.dueDate)) errors.dueDate = 'La date d’échéance est obligatoire et doit être valide.'
  else if (form.issueDate && form.dueDate < form.issueDate) errors.dueDate = 'La date d’échéance doit être égale ou postérieure à la date d’émission.'
  if (form.note.length > 2000) errors.note = 'La note ne peut pas dépasser 2 000 caractères.'
  return errors
}

export function ChequeFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { id } = useParams(), navigate = useNavigate(), isEdit = mode === 'edit'
  const [form, setForm] = useState<FormState>(initialForm), [errors, setErrors] = useState<FieldErrors>({})
  const [loading, setLoading] = useState(isEdit), [saving, setSaving] = useState(false)
  const [selectedImage, setSelectedImage] = useState<File | null>(null), [imagePreview, setImagePreview] = useState(''), [existingImage, setExistingImage] = useState(false), [removeImage, setRemoveImage] = useState(false)

  useEffect(() => {
    if (!isEdit || !id) return
    const controller = new AbortController()
    fetch(`/api/cheques/${id}`, { credentials: 'same-origin', signal: controller.signal })
      .then(async response => { const body = await readJson<{ cheque?: Record<string, unknown>; error?: string }>(response); if (!response.ok || !body.cheque) throw new Error(body.error ?? 'Chèque introuvable.'); return body.cheque })
      .then(cheque => { if (!controller.signal.aborted) { setForm({ beneficiary: String(cheque.beneficiary ?? ''), amount: String(cheque.amount ?? ''), chequeNumber: String(cheque.chequeNumber ?? ''), bank: String(cheque.bank ?? ''), issueDate: String(cheque.issueDate).slice(0, 10), dueDate: String(cheque.dueDate).slice(0, 10), status: cheque.status as Status, note: String(cheque.note ?? '') }); setExistingImage(Boolean(cheque.hasImage)) } })
      .catch(error => { if (!controller.signal.aborted) setErrors({ form: error instanceof Error ? error.message : 'Impossible de charger ce chèque.' }) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [id, isEdit])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(current => ({ ...current, [key]: value }))
    setErrors(current => ({ ...current, [key]: undefined, form: undefined }))
  }

  async function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || !/\.(png|jpe?g|webp)$/i.test(file.name)) { setErrors(current => ({ ...current, image: 'Choisissez une image JPEG, PNG ou WebP avec une extension valide.' })); return }
    if (file.size > maxImageBytes) { setErrors(current => ({ ...current, image: 'L’image ne doit pas dépasser 2 Mo.' })); return }
    const reader = new FileReader()
    reader.onload = () => { if (typeof reader.result === 'string') { setSelectedImage(file); setImagePreview(reader.result); setRemoveImage(false); setErrors(current => ({ ...current, image: undefined })) } }
    reader.onerror = () => setErrors(current => ({ ...current, image: 'Impossible de lire cette image.' }))
    reader.readAsDataURL(file)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    const validationErrors = validate(form)
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length) return
    setSaving(true)
    try {
      const response = await fetch(isEdit ? `/api/cheques/${id}` : '/api/cheques', { method: isEdit ? 'PUT' : 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) })
      const body = await readJson<{ cheque?: { id: string }; error?: string; fields?: FieldErrors }>(response)
      if (!response.ok || !body.cheque) { setErrors(body.fields ?? { form: body.error ?? 'Impossible d’enregistrer le chèque.' }); return }
      const chequeId = body.cheque.id
      if (selectedImage) {
        if (!imagePreview.startsWith('data:') || !selectedImage.name) throw new Error('La prévisualisation de l’image est invalide.')
        const uploadResponse = await fetch(`/api/cheques/${chequeId}/image`, { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: selectedImage.name, contentType: selectedImage.type, data: imagePreview.slice(imagePreview.indexOf(',') + 1) }) })
        const uploadBody = await readJson<{ error?: string }>(uploadResponse)
        if (!uploadResponse.ok) {
          if (!isEdit) await fetch(`/api/cheques/${chequeId}`, { method: 'DELETE', credentials: 'same-origin' })
          throw new Error(uploadBody.error ?? 'Impossible d’envoyer l’image.')
        }
      } else if (removeImage && isEdit) {
        const deleteResponse = await fetch(`/api/cheques/${chequeId}/image`, { method: 'DELETE', credentials: 'same-origin' })
        const deleteBody = await readJson<{ error?: string }>(deleteResponse)
        if (!deleteResponse.ok) throw new Error(deleteBody.error ?? 'Impossible de supprimer l’image.')
      }
      navigate(`/cheques/${chequeId}`, { replace: true })
    } catch (reason) { setErrors({ form: reason instanceof Error ? reason.message : 'Le serveur est momentanément inaccessible. Réessayez.' }) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="page-stack"><div className="skeleton skeleton-heading" /><div className="cheque-form-skeleton" aria-busy="true">{Array.from({ length: 8 }, (_, i) => <div key={i}><div className="skeleton skeleton-label" /><div className="skeleton skeleton-row" /></div>)}</div></div>

  return <div className="page-stack cheque-editor-page"><section><Link className="back-link cheque-back-link" to={isEdit && id ? `/cheques/${id}` : '/cheques'}><ArrowLeft size={15} /> Retour aux chèques</Link><div className="eyebrow">GESTION</div><h2 className="page-heading">{isEdit ? 'Modifier le chèque' : 'Nouveau chèque'}</h2><p className="page-subtitle">Renseignez les informations du chèque et son échéance.</p></section>
    <form className="cheque-form-panel" onSubmit={save} noValidate>
      {errors.form && <div className="cheque-form-error" role="alert">{errors.form}</div>}
      <div className="cheque-form-grid">
        <Field id="cheque-beneficiary" label="Bénéficiaire" required error={errors.beneficiary}><input id="cheque-beneficiary" autoFocus name="beneficiary" maxLength={150} value={form.beneficiary} onChange={event => update('beneficiary', event.target.value)} placeholder="Nom du bénéficiaire" /></Field>
        <Field id="cheque-amount" label="Montant" required error={errors.amount}><input id="cheque-amount" name="amount" type="number" min="0.01" max="9999999999.99" step="0.01" value={form.amount} onChange={event => update('amount', event.target.value)} placeholder="0,00" /></Field>
        <Field id="cheque-number" label="Numéro du chèque" required error={errors.chequeNumber}><input id="cheque-number" name="chequeNumber" maxLength={80} value={form.chequeNumber} onChange={event => update('chequeNumber', event.target.value)} placeholder="Ex. CH-2026-001" /></Field>
        <Field id="cheque-bank" label="Banque" error={errors.bank}><input id="cheque-bank" name="bank" maxLength={100} value={form.bank} onChange={event => update('bank', event.target.value)} placeholder="Nom de la banque (facultatif)" /></Field>
        <Field id="cheque-issue-date" label="Date d’émission" required error={errors.issueDate}><input id="cheque-issue-date" name="issueDate" type="date" value={form.issueDate} onChange={event => update('issueDate', event.target.value)} /></Field>
        <Field id="cheque-due-date" label="Date d’échéance" required error={errors.dueDate}><input id="cheque-due-date" name="dueDate" type="date" value={form.dueDate} onChange={event => update('dueDate', event.target.value)} /></Field>
        {isEdit ? <div className="cheque-field"><span className="cheque-field-label">Statut actuel</span><input value={statusOptions.find(option => option.value === form.status)?.label ?? form.status} disabled /></div> : <Field id="cheque-status" label="Statut" error={errors.status}><select id="cheque-status" name="status" value={form.status} onChange={event => update('status', event.target.value as Status)}>{statusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>}
        <Field id="cheque-note" label="Note" hint="Facultatif · 2 000 caractères maximum" error={errors.note} className="cheque-form-wide"><textarea id="cheque-note" name="note" maxLength={2000} rows={4} value={form.note} onChange={event => update('note', event.target.value)} placeholder="Ajouter une note sur ce chèque…" /></Field>
        <Field id="cheque-image" label="Image du chèque" hint="JPEG, PNG ou WebP · 2 Mo maximum" error={errors.image} className="cheque-form-wide"><div className="cheque-image-input"><input className="sr-only" id="cheque-image" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => void selectImage(event)} />{imagePreview || (existingImage && !removeImage) ? <div className="cheque-image-preview"><img src={imagePreview || `/api/cheques/${id}/image`} alt="Aperçu du chèque" /><button type="button" onClick={() => { if (selectedImage) { setSelectedImage(null); setImagePreview('') } else setRemoveImage(true) }}><Trash2 size={14} /> Retirer l’image</button></div> : <label className="cheque-image-drop" htmlFor="cheque-image"><ImagePlus size={22} /><span>{removeImage ? 'Image à supprimer' : 'Choisir une image'}</span><small>JPEG, PNG ou WebP · 2 Mo maximum</small></label>}{(imagePreview || (existingImage && !removeImage)) && <label className="cheque-image-replace" htmlFor="cheque-image"><ImagePlus size={14} /> Remplacer l’image</label>}</div></Field>
      </div>
      <div className="cheque-form-actions"><Button type="button" variant="outline" asChild><Link to={isEdit && id ? `/cheques/${id}` : '/cheques'}>Annuler</Link></Button><Button type="submit" disabled={saving}>{saving ? 'Enregistrement…' : isEdit ? 'Enregistrer les modifications' : 'Créer le chèque'}</Button></div>
    </form>
  </div>
}

function Field({ id, label, required, error, hint, className = '', children }: { id: string; label: string; required?: boolean; error?: string; hint?: string; className?: string; children: ReactNode }) {
  return <div className={`cheque-field ${className}`}><label className="cheque-field-label" htmlFor={id}>{label}{required && <i> *</i>}</label>{children}{hint && <small className="cheque-field-hint">{hint}</small>}{error && <small className="cheque-field-error" role="alert">{error}</small>}</div>
}
