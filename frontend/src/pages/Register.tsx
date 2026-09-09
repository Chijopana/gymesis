import { useMemo, useState } from 'react'
import { BadgePlus, Check, Eye, EyeOff, TriangleAlert, UserPlus, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import ThemeToggle from '../components/ThemeToggle'
import { authService, getErrorMessage } from '../services/api'
import { useAuthStore } from '../store/authStore'

/** Las mismas reglas que aplica el backend, para avisar antes de enviar. */
const RULES = [
  { id: 'length', label: 'Al menos 8 caracteres', test: (value: string) => value.length >= 8 },
  { id: 'letter', label: 'Incluye una letra', test: (value: string) => /[a-zA-Z]/.test(value) },
  { id: 'number', label: 'Incluye un número', test: (value: string) => /[0-9]/.test(value) },
]

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,30}$/

export default function Register() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [capsLockOn, setCapsLockOn] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const setAuth = useAuthStore((state) => state.setAuth)

  const passedRules = useMemo(() => RULES.filter((rule) => rule.test(password)), [password])
  const passwordOk = passedRules.length === RULES.length
  const usernameOk = USERNAME_PATTERN.test(username.trim())
  const passwordsMatch = password.length > 0 && password === confirmPassword
  const canSubmit = usernameOk && email.trim().length > 3 && passwordOk && passwordsMatch && !loading

  const strengthLabel = passedRules.length === 0 ? '' : ['Débil', 'Débil', 'Aceptable', 'Buena'][passedRules.length]
  const strengthTone =
    passedRules.length < 2 ? 'var(--danger)' : passedRules.length < 3 ? 'var(--warning)' : 'var(--success)'

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')

    if (!usernameOk) {
      setError('El usuario debe tener entre 3 y 30 caracteres, solo letras, números, guion y guion bajo.')
      return
    }
    if (!passwordOk) {
      setError('La contraseña debe tener 8+ caracteres, con al menos una letra y un número.')
      return
    }
    if (!passwordsMatch) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)
    try {
      const response = await authService.register({
        username: username.trim(),
        email: email.trim().toLowerCase(),
        password,
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
      })
      const { token, user } = response.data
      setAuth(user, token)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(getErrorMessage(err, 'No se ha podido crear la cuenta.'))
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
          <div className="mb-6 text-center">
            <h1 className="app-title text-4xl font-bold">GYMESIS</h1>
            <p className="section-subtitle mt-1 inline-flex items-center gap-1.5">
              <BadgePlus size={15} />
              Crea tu cuenta en un minuto
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
            {error && (
              <div role="alert" className="status-error">
                <TriangleAlert size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="field-label" htmlFor="username">
                Nombre de usuario
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className={`field ${username && !usernameOk ? 'field-error' : ''}`}
                placeholder="atleta_99"
                required
              />
              {username && !usernameOk && (
                <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>
                  Entre 3 y 30 caracteres. Solo letras, números, guion y guion bajo.
                </p>
              )}
            </div>

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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label" htmlFor="firstName">
                  Nombre
                </label>
                <input
                  id="firstName"
                  type="text"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  className="field"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="lastName">
                  Apellido
                </label>
                <input
                  id="lastName"
                  type="text"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  className="field"
                />
              </div>
            </div>

            <div>
              <label className="field-label" htmlFor="password">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
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

              {password && (
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="meter flex-1">
                      <span
                        style={{
                          width: `${(passedRules.length / RULES.length) * 100}%`,
                          background: strengthTone,
                        }}
                      />
                    </div>
                    <span className="text-xs font-semibold" style={{ color: strengthTone }}>
                      {strengthLabel}
                    </span>
                  </div>
                  <ul className="space-y-0.5">
                    {RULES.map((rule) => {
                      const ok = rule.test(password)
                      return (
                        <li
                          key={rule.id}
                          className="flex items-center gap-1.5 text-xs"
                          style={{ color: ok ? 'var(--success)' : 'var(--text-faint)' }}
                        >
                          {ok ? <Check size={12} /> : <X size={12} />}
                          {rule.label}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {capsLockOn && (
                <div className="status-warning mt-2 text-xs">
                  <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                  <span>Bloq Mayús está activado</span>
                </div>
              )}
            </div>

            <div>
              <label className="field-label" htmlFor="confirmPassword">
                Repite la contraseña
              </label>
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className={`field ${confirmPassword && !passwordsMatch ? 'field-error' : ''}`}
                required
              />
              {confirmPassword.length > 0 && (
                <p
                  className="mt-1 flex items-center gap-1 text-xs"
                  style={{ color: passwordsMatch ? 'var(--success)' : 'var(--danger)' }}
                >
                  {passwordsMatch ? <Check size={12} /> : <X size={12} />}
                  {passwordsMatch ? 'Las contraseñas coinciden' : 'Las contraseñas no coinciden'}
                </p>
              )}
            </div>

            <button type="submit" disabled={!canSubmit} className="btn-primary mt-2 w-full">
              {loading ? (
                <>
                  <span className="loader" />
                  Creando cuenta...
                </>
              ) : (
                <>
                  <UserPlus size={16} />
                  Crear cuenta
                </>
              )}
            </button>
          </form>

          <p className="section-subtitle mt-5 text-center text-sm">
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" className="font-semibold hover:underline" style={{ color: 'var(--brand-strong)' }}>
              Inicia sesión
            </Link>
          </p>
        </section>
      </div>
    </main>
  )
}
