import { useEffect, useState } from 'react'
import { Dumbbell, Eye, EyeOff, LogIn, TriangleAlert } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import ThemeToggle from '../components/ThemeToggle'
import { authService, getErrorMessage } from '../services/api'
import { useAuthStore } from '../store/authStore'

const REMEMBER_KEY = 'gymesis-remember-email'
const REDIRECT_KEY = 'gymesis-redirect-after-login'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberEmail, setRememberEmail] = useState(true)
  const [capsLockOn, setCapsLockOn] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const setAuth = useAuthStore((state) => state.setAuth)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY)
      if (saved) setEmail(saved)
      else setRememberEmail(false)
    } catch {
      /* almacenamiento bloqueado */
    }
  }, [])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail || !password) {
      setError('Completa el email y la contraseña.')
      return
    }

    setLoading(true)
    try {
      const response = await authService.login({ email: normalizedEmail, password })
      const { token, user } = response.data
      setAuth(user, token)

      try {
        if (rememberEmail) localStorage.setItem(REMEMBER_KEY, normalizedEmail)
        else localStorage.removeItem(REMEMBER_KEY)
      } catch {
        /* almacenamiento bloqueado */
      }

      // Destino: el que intentó abrir antes de que le pidieran sesión.
      const fromState = (location.state as { from?: string } | null)?.from
      let stored: string | null = null
      try {
        stored = localStorage.getItem(REDIRECT_KEY)
        localStorage.removeItem(REDIRECT_KEY)
      } catch {
        /* almacenamiento bloqueado */
      }
      navigate(fromState || stored || '/dashboard', { replace: true })
    } catch (err) {
      setError(getErrorMessage(err, 'No se ha podido iniciar sesión.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-4">
        <div className="flex justify-end">
          <ThemeToggle />
        </div>

        <section className="panel animate-in p-8" style={{ boxShadow: 'var(--shadow-lg)' }}>
          <div className="mb-7 text-center">
            <div
              className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{ background: 'var(--brand-tint-strong)', color: 'var(--brand-strong)' }}
            >
              <Dumbbell size={28} />
            </div>
            <h1 className="app-title text-4xl font-bold">GYMESIS</h1>
            <p className="section-subtitle mt-1">Entrena con datos. Compite con amigos.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {error && (
              <div role="alert" className="status-error">
                <TriangleAlert size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="field-label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="field"
                placeholder="tu@email.com"
                required
              />
            </div>

            <div>
              <label className="field-label" htmlFor="password">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyUp={(event) => setCapsLockOn(event.getModifierState('CapsLock'))}
                  onBlur={() => setCapsLockOn(false)}
                  className="field pr-11"
                  required
                />
                <button
                  type="button"
                  className="btn-ghost absolute right-1 top-1/2 -translate-y-1/2 p-2"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {capsLockOn && (
                <div className="status-warning mt-2 text-sm">
                  <TriangleAlert size={15} className="mt-0.5 shrink-0" />
                  <span>Bloq Mayús está activado</span>
                </div>
              )}
            </div>

            <label className="soft-text flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={rememberEmail}
                onChange={(event) => setRememberEmail(event.target.checked)}
              />
              Recordar mi email en este dispositivo
            </label>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? (
                <>
                  <span className="loader" />
                  Entrando...
                </>
              ) : (
                <>
                  <LogIn size={16} />
                  Iniciar sesión
                </>
              )}
            </button>
          </form>

          <p className="section-subtitle mt-6 text-center text-sm">
            ¿No tienes cuenta?{' '}
            <Link to="/register" className="font-semibold hover:underline" style={{ color: 'var(--brand-strong)' }}>
              Créala gratis
            </Link>
          </p>
        </section>
      </div>
    </main>
  )
}
