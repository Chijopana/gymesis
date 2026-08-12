import { useState } from 'react'
import { BadgePlus, Eye, EyeOff, UserPlus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import ThemeToggle from '../components/ThemeToggle'
import { authService } from '../services/api'
import { useAuthStore } from '../store/authStore'

export default function Register() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [capsLockOn, setCapsLockOn] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const setAuth = useAuthStore((state) => state.setAuth)

  const passwordStrength =
    password.length >= 10
      ? 'fuerte'
      : password.length >= 6
        ? 'media'
        : 'baja'

  const passwordsMatch = password.length > 0 && confirmPassword.length > 0 && password === confirmPassword

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const normalizedEmail = email.trim().toLowerCase()
    const normalizedUsername = username.trim()

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }

    setLoading(true)

    try {
      const response = await authService.register({
        username: normalizedUsername,
        email: normalizedEmail,
        password,
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
      })
      const { token, user } = response.data
      setAuth(user, token)
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8">
      <section className="panel max-w-md w-full p-8">
        <div className="flex justify-end mb-3">
          <ThemeToggle />
        </div>
        <h1 className="app-title mb-2 text-center text-4xl font-bold text-slate-900 dark:text-slate-100">GYMESIS</h1>
        
        <h2 className="text-center section-subtitle mb-6 inline-flex items-center gap-1 justify-center w-full"><BadgePlus size={15} />Crea tu cuenta</h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <div role="alert" className="status-error text-sm">
              {error}
            </div>
          )}
          
          <div>
            <label className="field-label" htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="field"
              required
            />
          </div>

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

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="field-label" htmlFor="firstName">Nombre</label>
              <input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="field"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="lastName">Apellido</label>
              <input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="field"
              />
            </div>
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
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 btn-soft !p-1" onClick={() => setShowPassword((v) => !v)}>
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <div className="soft-text text-xs mt-1">Fuerza de contraseña: {passwordStrength}</div>
            {capsLockOn && <div className="status-warning text-xs mt-1">Bloq Mayus activado</div>}
          </div>

          <div>
            <label className="field-label" htmlFor="confirmPassword">Confirmar Contraseña</label>
            <div className="relative">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyUp={(e) => setCapsLockOn(e.getModifierState('CapsLock'))}
                className="field pr-10"
                required
              />
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 btn-soft !p-1" onClick={() => setShowConfirmPassword((v) => !v)}>
                {showConfirmPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {confirmPassword.length > 0 && (
              <div className={`text-xs mt-1 ${passwordsMatch ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>
                {passwordsMatch ? 'Las contraseñas coinciden' : 'Las contraseñas no coinciden'}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !username.trim() || !email.trim() || !password || !confirmPassword}
            className="w-full btn-primary disabled:opacity-50 mt-4 inline-flex items-center justify-center gap-2"
          >
            {loading ? 'Registrando...' : <><UserPlus size={16} />Registrarse</>}
          </button>
        </form>

        <p className="mt-4 text-center section-subtitle text-sm">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="text-sky-500 hover:underline font-semibold">
            Inicia sesión
          </Link>
        </p>
      </section>
    </main>
  )
}
