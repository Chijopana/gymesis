import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { getVisualSettings } from './utils/settings'
import { emitFeedback } from './utils/feedback'
import GlobalFeedbackHost from './components/GlobalFeedbackHost'
import ErrorBoundary from './components/ErrorBoundary'
import Login from './pages/Login'
import Register from './pages/Register'

// Sólo el login y el registro entran en el bundle inicial: el resto se carga
// cuando se visita, así la primera pantalla pesa mucho menos.
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Routines = lazy(() => import('./pages/Routines'))
const Friends = lazy(() => import('./pages/Friends'))
const Trainings = lazy(() => import('./pages/Trainings'))
const Groups = lazy(() => import('./pages/Groups'))
const Profile = lazy(() => import('./pages/Profile'))
const Notifications = lazy(() => import('./pages/Notifications'))
const PublicProfile = lazy(() => import('./pages/PublicProfile'))
const CalendarPage = lazy(() => import('./pages/Calendar'))
const Settings = lazy(() => import('./pages/Settings'))
const NotFound = lazy(() => import('./pages/NotFound'))

const REDIRECT_KEY = 'gymesis-redirect-after-login'
const LAST_ROUTE_KEY = 'gymesis-last-route'

function PageFallback() {
  return (
    <div className="page-shell">
      <div className="panel flex items-center gap-3 p-6 soft-text">
        <span className="loader" />
        Cargando...
      </div>
    </div>
  )
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn)
  const location = useLocation()

  if (!isLoggedIn) {
    // El destino se pasa por el state de la navegación, no escribiendo en
    // localStorage durante el render (eso era un efecto secundario en render).
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  return <>{children}</>
}

/** Impide volver al login/registro con la sesión ya iniciada. */
function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn)
  if (isLoggedIn) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function AppEffects() {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
    if (location.pathname !== '/login' && location.pathname !== '/register') {
      try {
        localStorage.setItem(LAST_ROUTE_KEY, location.pathname)
      } catch {
        /* almacenamiento bloqueado */
      }
    }
  }, [location.pathname])

  // Sesión caducada: el interceptor de axios avisa y aquí se navega sin recargar.
  useEffect(() => {
    const onExpired = () => {
      try {
        localStorage.setItem(REDIRECT_KEY, window.location.pathname)
      } catch {
        /* almacenamiento bloqueado */
      }
      emitFeedback({ kind: 'warning', title: 'Sesión caducada', message: 'Vuelve a iniciar sesión para continuar.' })
      navigate('/login', { replace: true })
    }

    window.addEventListener('gymesis-session-expired', onExpired)
    return () => window.removeEventListener('gymesis-session-expired', onExpired)
  }, [navigate])

  return null
}

function RootRedirect() {
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn)
  if (!isLoggedIn) return <Navigate to="/login" replace />

  let last = '/dashboard'
  try {
    last = localStorage.getItem(LAST_ROUTE_KEY) || '/dashboard'
  } catch {
    /* almacenamiento bloqueado */
  }
  return <Navigate to={last} replace />
}

const PROTECTED_ROUTES: Array<{ path: string; element: ReactNode }> = [
  { path: '/dashboard', element: <Dashboard /> },
  { path: '/routines', element: <Routines /> },
  { path: '/friends', element: <Friends /> },
  { path: '/trainings', element: <Trainings /> },
  { path: '/groups', element: <Groups /> },
  { path: '/profile', element: <Profile /> },
  { path: '/notifications', element: <Notifications /> },
  { path: '/calendar', element: <CalendarPage /> },
  { path: '/settings', element: <Settings /> },
  { path: '/users/:userId', element: <PublicProfile /> },
]

export default function App() {
  useEffect(() => {
    document.documentElement.classList.toggle('compact-ui', getVisualSettings().compactMode)
  }, [])

  return (
    <ErrorBoundary>
      <Router>
        <GlobalFeedbackHost />
        <AppEffects />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[9999] btn-primary"
        >
          Saltar al contenido principal
        </a>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route
              path="/login"
              element={
                <PublicOnlyRoute>
                  <Login />
                </PublicOnlyRoute>
              }
            />
            <Route
              path="/register"
              element={
                <PublicOnlyRoute>
                  <Register />
                </PublicOnlyRoute>
              }
            />

            {PROTECTED_ROUTES.map(({ path, element }) => (
              <Route key={path} path={path} element={<ProtectedRoute>{element}</ProtectedRoute>} />
            ))}

            <Route path="/" element={<RootRedirect />} />
            {/* Una URL desconocida muestra un 404 real en vez de tragárselo
                con una redirección silenciosa al dashboard. */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </Router>
    </ErrorBoundary>
  )
}
