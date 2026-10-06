import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/app-layout'
import { AuthPage } from './pages/auth/auth-page'
import { DashboardPage } from './pages/dashboard/dashboard-page'
import { ChequesPage } from './pages/cheques/cheques-page'
import { ChequeFormPage } from './pages/cheques/cheque-form-page'
import { ChequeDetailPage } from './pages/cheques/cheque-detail-page'
import { CalendarPage } from './pages/calendar/calendar-page'
import { ExportsPage } from './pages/exports/exports-page'
import { SettingsPage } from './pages/settings/settings-page'
import { ProtectedRoute } from './components/auth/protected-route'

export default function App() {
  return <Routes>
    <Route path="/" element={<Navigate to="/login" replace />} />
    <Route path="/login" element={<AuthPage mode="login" />} />
    <Route path="/register" element={<AuthPage mode="register" />} />
    <Route path="/forgot-password" element={<AuthPage mode="forgot" />} />
    <Route element={<ProtectedRoute />}><Route element={<AppLayout />}>
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/cheques" element={<ChequesPage />} />
      <Route path="/cheques/new" element={<ChequeFormPage mode="create" />} />
      <Route path="/cheques/:id" element={<ChequeDetailPage />} />
      <Route path="/cheques/:id/edit" element={<ChequeFormPage mode="edit" />} />
      <Route path="/calendar" element={<CalendarPage />} />
      <Route path="/exports" element={<ExportsPage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Route></Route>
    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes>
}
