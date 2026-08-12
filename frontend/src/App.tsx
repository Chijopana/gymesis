import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './store/authStore.ts'
import { getVisualSettings } from './utils/settings.ts'
import Login from './pages/Login.tsx'
import Register from './pages/Register.tsx'
import Dashboard from './pages/Dashboard.tsx'
import Routines from './pages/Routines.tsx'
import Friends from './pages/Friends.tsx'
import Trainings from './pages/Trainings.tsx'
import Groups from './pages/Groups.tsx'
import Profile from './pages/Profile.tsx'
import Notifications from './pages/Notifications.tsx'
import PublicProfile from './pages/PublicProfile.tsx'
import CalendarPage from './pages/Calendar.tsx'
import Settings from './pages/Settings.tsx'
import GlobalFeedbackHost from './components/GlobalFeedbackHost.tsx'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn)
  const location = useLocation()
  
  if (!isLoggedIn) {
    localStorage.setItem('gymesis-redirect-after-login', location.pathname)
    return <Navigate to="/login" replace />
  }
  
  return <>{children}</>
}

function RouteEnhancer() {
  const location = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    if (location.pathname !== '/login' && location.pathname !== '/register') {
      localStorage.setItem('gymesis-last-route', location.pathname)
    }
  }, [location.pathname])

  return null
}

function App() {
  const loadFromStorage = useAuthStore((state) => state.loadFromStorage)
  
  useEffect(() => {
    loadFromStorage()
    const visual = getVisualSettings()
    if (visual.compactMode) {
      document.documentElement.classList.add('compact-ui')
    } else {
      document.documentElement.classList.remove('compact-ui')
    }
  }, [loadFromStorage])

  return (
    <Router>
      <GlobalFeedbackHost />
      <RouteEnhancer />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[9999] focus:bg-sky-600 focus:text-white focus:px-3 focus:py-2 focus:rounded"
      >
        Saltar al contenido principal
      </a>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/routines"
          element={
            <ProtectedRoute>
              <Routines />
            </ProtectedRoute>
          }
        />
        <Route
          path="/friends"
          element={
            <ProtectedRoute>
              <Friends />
            </ProtectedRoute>
          }
        />
        <Route
          path="/trainings"
          element={
            <ProtectedRoute>
              <Trainings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/groups"
          element={
            <ProtectedRoute>
              <Groups />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/notifications"
          element={
            <ProtectedRoute>
              <Notifications />
            </ProtectedRoute>
          }
        />
        <Route
          path="/calendar"
          element={
            <ProtectedRoute>
              <CalendarPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/users/:userId"
          element={
            <ProtectedRoute>
              <PublicProfile />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to={localStorage.getItem('gymesis-last-route') || '/dashboard'} replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  )
}

export default App
