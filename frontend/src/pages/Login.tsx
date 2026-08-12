import { useEffect, useState } from 'react'
import { Dumbbell, Eye, EyeOff, LogIn } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import ThemeToggle from '../components/ThemeToggle'
import { authService } from '../services/api'
import { useAuthStore } from '../store/authStore'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberEmail, setRememberEmail] = useState(true)
  const [capsLockOn, setCapsLockOn] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const setAuth = useAuthStore((state) => state.setAuth)

  useEffect(() => {
    const saved = localStorage.getItem('gymesis-remember-email')
    if (saved) setEmail(saved)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail || !password.trim()) {
      setError('Completa email y contraseña')
      return
    }
    setLoading(true)

    try {
      const response = await authService.login({ email: normalizedEmail, password: password.trim() })
      const { token, user } = response.data
      setAuth(user, token)
      if (rememberEmail) {
        localStorage.setItem('gymesis-remember-email', normalizedEmail)
      } else {
        localStorage.removeItem('gymesis-remember-email')
      }
      const redirectTo = localStorage.getItem('gymesis-redirect-after-login') || '/dashboard'
      localStorage.removeItem('gymesis-redirect-after-login')
      navigate(redirectTo)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <section className="panel max-w-md w-full p-8">
        <div className="flex justify-end mb-3">
          <ThemeToggle />
        </div>
        <h1 className="app-title mb-2 text-center text-4xl font-bold text-slate-900 dark:text-slate-100">GYMESIS</h1>
        <p className="text-center section-subtitle mb-6">Entrena inteligente. Compite con precision.</p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div role="alert" className="status-error">
              {error}
            </div>
          )}
          
          <div>
            <label className="field-label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field"
              required
            />
          </div>

          <div>
            <label className="field-label" htmlFor="password">Contraseña</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyUp={(e) => setCapsLockOn(e.getModifierState('CapsLock'))}
                className="field pr-10"
                required
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 btn-soft !p-1"
                onClick={() => setShowPassword((v) => !v)}
                aria-label="Mostrar u ocultar contraseña"
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {capsLockOn && <div className="status-warning text-sm">Bloq Mayus activado</div>}

          <label className="inline-flex items-center gap-2 text-sm soft-text">
            <input type="checkbox" checked={rememberEmail} onChange={(e) => setRememberEmail(e.target.checked)} />
            Recordar email en este dispositivo
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {loading ? 'Cargando...' : <><LogIn size={16} />Iniciar Sesion</>}
          </button>
        </form>

        <p className="mt-4 text-center section-subtitle">
          ¿No tienes cuenta?{' '}
          <Link to="/register" className="text-sky-500 hover:underline font-semibold">
            <span className="inline-flex items-center gap-1"><Dumbbell size={14} />Registrate</span>
          </Link>
        </p>
      </section>
    </main>
  )
}
