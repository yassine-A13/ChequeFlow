import { Bell, BellOff, Mail, Monitor, Moon, Send, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Theme } from '../../contexts/theme-context-core'
import { useTheme } from '../../hooks/use-theme'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { authClient } from '../../lib/auth-client'

const themes: { id: Theme; label: string; note: string; icon: typeof Sun }[] = [
  { id: 'light', label: 'Clair', note: 'Toujours utiliser le thème clair', icon: Sun },
  { id: 'dark', label: 'Sombre', note: 'Toujours utiliser le thème sombre', icon: Moon },
  { id: 'system', label: 'Système', note: 'Suivre les préférences de votre appareil', icon: Monitor },
]

export function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const session = authClient.useSession()
  const user = session.data?.user
  const [pushStatus, setPushStatus] = useState<'loading' | 'enabled' | 'disabled' | 'denied' | 'unsupported' | 'error'>('loading')
  const [pushBusy, setPushBusy] = useState(false)
  const [pushMessage, setPushMessage] = useState('')
  const [pushTestBusy, setPushTestBusy] = useState(false)
  const [pushTestMessage, setPushTestMessage] = useState('')
  const [emailTestBusy, setEmailTestBusy] = useState(false)
  const [emailTestMessage, setEmailTestMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    async function loadPushStatus() {
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        setPushStatus('unsupported')
        return
      }
      if (Notification.permission === 'denied') {
        setPushStatus('denied')
        return
      }
      try {
        const registration = await navigator.serviceWorker.register('/sw.js')
        const subscription = await registration.pushManager.getSubscription()
        if (!subscription) {
          if (!cancelled) setPushStatus('disabled')
          return
        }
        const response = await fetch(`/api/push-subscriptions?endpoint=${encodeURIComponent(subscription.endpoint)}`)
        const result = await response.json() as { enabled?: boolean }
        if (!response.ok) throw new Error('Impossible de vérifier l’abonnement.')
        if (!cancelled) setPushStatus(result.enabled ? 'enabled' : 'disabled')
      } catch {
        if (!cancelled) {
          setPushStatus('error')
          setPushMessage('Impossible de vérifier l’état des notifications.')
        }
      }
    }
    void loadPushStatus()
    return () => { cancelled = true }
  }, [])

  async function togglePush(enable: boolean) {
    setPushBusy(true)
    setPushMessage('')
    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        setPushStatus('unsupported')
        return
      }
      if (!enable) {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()
        if (subscription) {
          const response = await fetch('/api/notifications/subscribe', {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          })
          if (!response.ok) throw new Error('Impossible de désactiver les notifications sur le serveur.')
          await subscription.unsubscribe()
        }
        setPushStatus('disabled')
        return
      }

      if (Notification.permission === 'denied') {
        setPushStatus('denied')
        return
      }
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
      if (permission !== 'granted') {
        setPushStatus(permission === 'denied' ? 'denied' : 'disabled')
        return
      }
      const registration = await navigator.serviceWorker.register('/sw.js')
      const keyResponse = await fetch('/api/push-subscriptions')
      const keyResult = await keyResponse.json() as { publicKey?: string; error?: string }
      if (!keyResponse.ok || !keyResult.publicKey) throw new Error(keyResult.error ?? 'Clé VAPID publique indisponible.')
      const applicationServerKey = Uint8Array.from(atob(keyResult.publicKey.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0))
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
      const response = await fetch('/api/notifications/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subscription.toJSON()),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) {
        await subscription.unsubscribe()
        throw new Error(result.error ?? 'Impossible d’enregistrer l’abonnement.')
      }
      setPushStatus('enabled')
    } catch (error) {
      setPushStatus('error')
      setPushMessage(error instanceof Error ? error.message : 'Une erreur est survenue.')
    } finally {
      setPushBusy(false)
    }
  }

  async function sendPushTest() {
    setPushTestBusy(true)
    setPushTestMessage('')
    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        setPushStatus('unsupported')
        return
      }
      if (Notification.permission === 'denied') {
        setPushStatus('denied')
        setPushTestMessage('Permission refusée. Autorisez les notifications dans les réglages du navigateur.')
        return
      }
      if (Notification.permission !== 'granted') {
        setPushStatus('disabled')
        setPushTestMessage('Activez les notifications et autorisez leur affichage avant le test.')
        return
      }
      const registration = await navigator.serviceWorker.ready
      if (!await registration.pushManager.getSubscription()) {
        setPushStatus('disabled')
        setPushTestMessage('Aucun abonnement actif sur cet appareil. Activez d’abord les notifications.')
        return
      }

      const response = await fetch('/api/notifications/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      })
      const result = await response.json() as { error?: string; sent?: number }
      if (!response.ok) {
        if (response.status === 410) {
          const subscription = await registration.pushManager.getSubscription()
          await subscription?.unsubscribe()
          setPushStatus('disabled')
        }
        throw new Error(result.error ?? 'Impossible d’envoyer la notification de test.')
      }
      setPushTestMessage('Notification de test envoyée.')
    } catch (error) {
      setPushTestMessage(error instanceof Error ? error.message : 'Erreur lors de l’envoi du test.')
    } finally {
      setPushTestBusy(false)
    }
  }

  async function sendEmailTest() {
    setEmailTestBusy(true)
    setEmailTestMessage('')
    try {
      const response = await fetch('/api/notifications/test-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'Impossible d’envoyer l’email de test.')
      setEmailTestMessage('Email de test envoyé à votre adresse de compte.')
    } catch (error) {
      setEmailTestMessage(error instanceof Error ? error.message : 'Erreur lors de l’envoi de l’email de test.')
    } finally {
      setEmailTestBusy(false)
    }
  }

  const pushLabels = { loading: 'Vérification des notifications…', enabled: 'Notifications activées', disabled: 'Notifications désactivées', denied: 'Permission refusée', unsupported: 'Navigateur non compatible', error: 'État des notifications indisponible' }
  return <div className="page-stack"><section><div className="eyebrow">PRÉFÉRENCES</div><h2 className="page-heading">Paramètres</h2><p className="page-subtitle">Personnalisez votre espace de travail.</p></section><Card className="settings-card"><CardHeader><CardTitle>Compte</CardTitle><CardDescription>Identité gérée par Neon Auth.</CardDescription></CardHeader><CardContent><div className="profile-form"><label className="profile-field">Nom<input value={user?.name ?? ''} readOnly /></label><label className="profile-field">Adresse e-mail<input type="email" value={user?.email ?? ''} readOnly /></label></div></CardContent></Card><Card className="settings-card"><CardHeader><CardTitle>Notifications</CardTitle><CardDescription>Recevez les notifications sur cet appareil.</CardDescription></CardHeader><CardContent className="push-settings"><p className="push-status"><span className={`push-status-dot push-${pushStatus}`} /><strong>{pushLabels[pushStatus]}</strong></p>{pushMessage && <p className="push-error" role="alert">{pushMessage}</p>}<div className="push-actions">{pushStatus === 'enabled' ? <><button className="button button-outline" disabled={pushBusy || pushTestBusy} onClick={() => void togglePush(false)}><BellOff size={15} /> Désactiver les notifications</button><button className="button button-primary" disabled={pushTestBusy || pushBusy} onClick={() => void sendPushTest()}><Send size={15} /> {pushTestBusy ? 'Envoi…' : 'Envoyer une notification de test'}</button></> : <button className="button button-primary" disabled={pushBusy || pushStatus === 'loading' || pushStatus === 'unsupported' || pushStatus === 'denied'} onClick={() => void togglePush(true)}><Bell size={15} /> Activer les notifications</button>}</div>{pushTestMessage && <p className={pushTestMessage === 'Notification de test envoyée.' ? 'push-success' : 'push-error'} role={pushTestMessage === 'Notification de test envoyée.' ? 'status' : 'alert'}>{pushTestMessage}</p>}<hr /><div className="push-actions"><button className="button button-outline" disabled={emailTestBusy || !user?.email} onClick={() => void sendEmailTest()}><Mail size={15} /> {emailTestBusy ? 'Envoi…' : 'Envoyer un email de test'}</button></div>{emailTestMessage && <p className={emailTestMessage.startsWith('Email de test envoyé') ? 'push-success' : 'push-error'} role={emailTestMessage.startsWith('Email de test envoyé') ? 'status' : 'alert'}>{emailTestMessage}</p>}</CardContent></Card><Card className="settings-card"><CardHeader><CardTitle>Apparence</CardTitle><CardDescription>Choisissez le thème de l’application.</CardDescription></CardHeader><CardContent className="theme-options">{themes.map(({ id, label, note, icon: Icon }) => <button key={id} onClick={() => setTheme(id)} className={`theme-option${theme === id ? ' selected' : ''}`}><span className="theme-option-icon"><Icon size={18} /></span><span className="theme-copy"><strong>{label}</strong><small>{note}</small></span><span className="radio-indicator" /></button>)}</CardContent></Card></div>
}
