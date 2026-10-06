import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Bell, CalendarDays, ChevronDown, CircleHelp, FileSpreadsheet, LayoutDashboard, Menu, Moon, Settings, Sun, WalletCards, X } from 'lucide-react'
import { useTheme } from '../../hooks/use-theme'
import { Button } from '../ui/button'
import { authClient } from '../../lib/auth-client'

const nav = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Chèques', to: '/cheques', icon: WalletCards },
  { label: 'Calendrier', to: '/calendar', icon: CalendarDays },
  { label: 'Exports', to: '/exports', icon: FileSpreadsheet },
  { label: 'Paramètres', to: '/settings', icon: Settings },
]
const titles: Record<string, string> = { '/dashboard': 'Dashboard', '/cheques': 'Chèques', '/calendar': 'Calendrier', '/exports': 'Exports', '/settings': 'Paramètres' }

function SidebarContent({ close, user }: { close?: () => void; user: { name?: string | null; email?: string | null } }) {
  return <><NavLink to="/dashboard" className="brand" onClick={close}><span className="brand-mark"><WalletCards size={20} /></span><span>cheque<span className="brand-accent">reminder</span></span></NavLink>
    <div className="nav-label">ESPACE DE TRAVAIL</div><nav className="side-nav">{nav.map(({ label, to, icon: Icon }) => <NavLink key={to} to={to} onClick={close} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{label === 'Chèques' && <span className="nav-dot" />}</NavLink>)}</nav>
    <div className="sidebar-bottom"><button className="help-link"><CircleHelp size={17} /> Centre d'aide</button><div className="user-card"><div className="avatar">{(user.name || user.email || 'CR').slice(0, 2).toUpperCase()}</div><div className="user-info"><strong>{user.name || user.email || 'Compte'}</strong><span>{user.email}</span></div><ChevronDown size={16} className="muted-icon" /></div></div></>
}

export function AppLayout() {
  const session = authClient.useSession()
  const user = session.data?.user
  const [open, setOpen] = useState(false)
  const { theme, setTheme } = useTheme()
  const { pathname } = useLocation()
  const title = titles[pathname] ?? (pathname.startsWith('/cheques') ? 'Chèques' : 'Dashboard')
  const cycleTheme = () => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light')
  async function logout() { await authClient.signOut(); window.location.assign('/login') }
  if (!user) return <main className="auth-screen" aria-busy="true">Chargement de votre session…</main>
  return <div className="app-shell"><aside className="sidebar"><SidebarContent user={user} /></aside>{open && <div className="mobile-overlay" onClick={() => setOpen(false)}><aside className="mobile-sidebar" onClick={event => event.stopPropagation()}><Button variant="ghost" size="icon" className="mobile-close" onClick={() => setOpen(false)} aria-label="Fermer le menu"><X size={19} /></Button><SidebarContent user={user} close={() => setOpen(false)} /></aside></div>}
    <div className="main-column"><header className="topbar"><div className="topbar-left"><Button variant="ghost" size="icon" className="mobile-menu" onClick={() => setOpen(true)} aria-label="Ouvrir le menu"><Menu size={20} /></Button><div><div className="breadcrumb">Espace de travail <span>/</span> <strong>{title}</strong></div><h1 className="topbar-title">{title}</h1></div></div><div className="topbar-actions"><Button variant="ghost" size="icon" aria-label="Notifications" className="notification-button"><Bell size={18} /><i /></Button><Button variant="ghost" size="icon" aria-label={`Thème actuel : ${theme}`} onClick={cycleTheme}>{theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}</Button><div className="topbar-divider" /><button className="top-user" onClick={() => void logout()} title="Se déconnecter"><div className="avatar avatar-small">{(user.name || user.email || 'CF').slice(0, 2).toUpperCase()}</div><span>Déconnexion</span><ChevronDown size={15} /></button></div></header><main className="page-content"><Outlet /></main><footer className="app-footer"><span>© 2026 ChequeFlow</span><span>Simplement à jour.</span></footer></div></div>
}
