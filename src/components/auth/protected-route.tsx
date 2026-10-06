import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { authClient, neonAuthConfigured } from '../../lib/auth-client'

export function ProtectedRoute() {
  const location = useLocation()
  if (!neonAuthConfigured) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  const session = authClient.useSession()

  if (session.isPending) return <main className="auth-screen" aria-busy="true">Chargement de votre session…</main>
  return session.data?.user
    ? <Outlet />
    : <Navigate to="/login" replace state={{ from: location.pathname }} />
}
