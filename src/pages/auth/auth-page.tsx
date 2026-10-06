import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { WalletCards } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { authClient, neonAuthConfigured } from '../../lib/auth-client'

type AuthMode = 'login' | 'register' | 'forgot'
const copy: Record<AuthMode, { title: string; description: string; button: string }> = {
  login: { title: 'Bon retour parmi nous', description: 'Connectez-vous pour retrouver votre espace.', button: 'Se connecter' },
  register: { title: 'Créez votre espace', description: 'Quelques instants pour mieux suivre vos chèques.', button: 'Créer mon compte' },
  forgot: { title: 'Mot de passe oublié ?', description: 'Saisissez votre adresse e-mail pour recevoir un lien de réinitialisation.', button: 'Envoyer le lien' },
}

function safeError(error: unknown) {
  if (error && typeof error === 'object' && 'error' in error) {
    const detail = (error as { error?: { code?: string } }).error
    if (detail?.code === 'INVALID_EMAIL_OR_PASSWORD' || detail?.code === 'USER_NOT_FOUND') return 'Adresse e-mail ou mot de passe incorrect.'
    if (detail?.code === 'EMAIL_NOT_VERIFIED') return 'Vérifiez votre adresse e-mail avant de vous connecter.'
    if (detail?.code === 'TOO_MANY_REQUESTS') return 'Trop de tentatives. Réessayez dans quelques minutes.'
  }
  return 'Une erreur est survenue. Vérifiez les informations et réessayez.'
}

export function AuthPage({ mode }: { mode: AuthMode }) {
  const auth = authClient
  const navigate = useNavigate(), location = useLocation(), [query] = useSearchParams()
  const [error, setError] = useState(query.get('error') ? 'La connexion Google a échoué. Réessayez.' : '')
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('')
  const resetToken = query.get('token')
  const resetting = mode === 'forgot' && Boolean(resetToken)
  const content = copy[mode]
  const dashboardPath = (location.state as { from?: string } | null)?.from || '/dashboard'

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage(''); setBusy(true)
    try {
      if (!neonAuthConfigured) throw new Error('Configurez VITE_NEON_AUTH_URL dans le fichier .env puis redémarrez le serveur.')
      if (mode === 'login') {
        const result = await auth.signIn.email({ email, password })
        if (result.error) throw result
        navigate(dashboardPath, { replace: true })
      } else if (mode === 'register') {
        if (password !== confirmation) throw new Error('Les mots de passe ne correspondent pas.')
        const result = await auth.signUp.email({ email, password, name })
        if (result.error) throw result
        navigate('/dashboard', { replace: true })
      } else if (resetting) {
        if (password !== confirmation) throw new Error('Les mots de passe ne correspondent pas.')
        const result = await auth.resetPassword({ newPassword: password, token: resetToken! })
        if (result.error) throw result
        navigate('/login', { replace: true })
      } else {
        const result = await auth.requestPasswordReset({ email, redirectTo: `${window.location.origin}/forgot-password` })
        if (result.error) throw result
        setMessage('Si un compte correspond à cette adresse, un lien de réinitialisation sera envoyé.')
      }
    } catch (caught) {
      setError(caught instanceof Error && caught.message.includes('ne correspondent pas') ? caught.message : safeError(caught))
    } finally { setBusy(false) }
  }

  async function googleSignIn() {
    setError(''); setBusy(true)
    try {
      if (!neonAuthConfigured) throw new Error('Configurez VITE_NEON_AUTH_URL dans le fichier .env puis redémarrez le serveur.')
      const result = await auth.signIn.social({ provider: 'google', callbackURL: `${window.location.origin}/dashboard` })
      if (result.error) throw result
    } catch (caught) { setError(caught instanceof Error && caught.message.startsWith('Configurez') ? caught.message : safeError(caught)); setBusy(false) }
  }

  return <main className="auth-screen"><Link to="/login" className="auth-brand"><span className="brand-mark"><WalletCards size={20} /></span>cheque<span className="brand-accent">reminder</span></Link><section className="auth-card">
    <div className="auth-mark"><WalletCards size={22} /></div><h1>{resetting ? 'Choisir un nouveau mot de passe' : content.title}</h1><p>{resetting ? 'Choisissez un mot de passe sécurisé pour votre compte.' : content.description}</p>
    <form onSubmit={submit}>
      {mode === 'register' && <><label className="field-label" htmlFor="name">Nom</label><input id="name" autoComplete="name" required maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder="Votre nom" /></>}
      {!resetting && <><label className="field-label" htmlFor="email">Adresse e-mail</label><input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="vous@exemple.com" />
      {mode !== 'forgot' && <><label className="field-label" htmlFor="password">Mot de passe</label><input id="password" type="password" minLength={10} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required value={password} onChange={e => setPassword(e.target.value)} placeholder="Au moins 10 caractères" /></>}</>}
      {resetting && <><label className="field-label" htmlFor="password">Nouveau mot de passe</label><input id="password" type="password" minLength={10} autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} /></>}
      {(mode === 'register' || resetting) && <><label className="field-label" htmlFor="confirmation">Confirmer le mot de passe</label><input id="confirmation" type="password" minLength={10} autoComplete="new-password" required value={confirmation} onChange={e => setConfirmation(e.target.value)} /></>}
      {error && <p role="alert" className="auth-error">{error}</p>}{message && <p role="status" className="auth-message">{message}</p>}
      <Button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Veuillez patienter…' : resetting ? 'Modifier le mot de passe' : content.button}</Button>
    </form>
    {mode === 'login' && <><Link className="forgot-link" to="/forgot-password">Mot de passe oublié ?</Link><Button className="auth-submit" variant="outline" disabled={busy} onClick={() => void googleSignIn()}>Continuer avec Google</Button></>}
    {mode === 'login' ? <div className="auth-switch">Vous n’avez pas de compte ? <Link to="/register">Créer un compte</Link></div> : <div className="auth-switch">Vous avez déjà un compte ? <Link to="/login">Se connecter</Link></div>}
    </section><span className="auth-caption">Un espace clair pour vos échéances.</span></main>
}
