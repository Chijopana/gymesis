import { useEffect, useRef, useState } from 'react'
import {
  Bell,
  CalendarDays,
  Dumbbell,
  Gauge,
  LogOut,
  Menu,
  Settings,
  Shield,
  Swords,
  User2,
  Users,
  X,
} from 'lucide-react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import ThemeToggle from './ThemeToggle'
import { friendService, routineService } from '../services/api'

const LINKS = [
  { to: '/dashboard', label: 'Dashboard', icon: Gauge },
  { to: '/routines', label: 'Rutinas', icon: Dumbbell },
  { to: '/trainings', label: 'Entreno', icon: Shield },
  { to: '/calendar', label: 'Calendario', icon: CalendarDays },
  { to: '/friends', label: 'Amigos', icon: Users },
  { to: '/groups', label: 'Grupos', icon: Swords },
  { to: '/notifications', label: 'Avisos', icon: Bell },
  { to: '/profile', label: 'Perfil', icon: User2 },
  { to: '/settings', label: 'Ajustes', icon: Settings },
]

const POLL_INTERVAL_MS = 60_000

export default function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const logout = useAuthStore((state) => state.logout)
  const user = useAuthStore((state) => state.user)
  const [notificationCount, setNotificationCount] = useState(0)
  const [openMenu, setOpenMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false

    const loadNotifications = async () => {
      // Con la pestaña en segundo plano no tiene sentido seguir sondeando.
      if (document.hidden) return
      try {
        const [friends, routines] = await Promise.all([friendService.getFriends(), routineService.getInvitations()])
        if (cancelled) return
        const pendingFriends = (friends.data.friendships || []).filter(
          (f: { status: string; direction: string }) => f.status === 'pending' && f.direction === 'incoming'
        ).length
        const pendingRoutines = (routines.data.invitations || []).filter(
          (r: { status: string }) => r.status === 'pending'
        ).length
        setNotificationCount(pendingFriends + pendingRoutines)
      } catch {
        // Un fallo de red no debe borrar el contador ya mostrado.
      }
    }

    loadNotifications()
    const interval = window.setInterval(loadNotifications, POLL_INTERVAL_MS)
    document.addEventListener('visibilitychange', loadNotifications)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', loadNotifications)
    }
  }, [])

  // El menú móvil se cierra al navegar y al pulsar Escape.
  useEffect(() => setOpenMenu(false), [location.pathname])

  useEffect(() => {
    if (!openMenu) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(false)
    }
    const onClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpenMenu(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onClickOutside)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onClickOutside)
    }
  }, [openMenu])

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const todayText = new Date().toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' })
  const initials = (user?.username ?? '?').slice(0, 2).toUpperCase()

  const badge =
    notificationCount > 0 ? (
      <span
        className="absolute -top-1.5 -right-1.5 min-w-[1.15rem] rounded-full px-1 py-0.5 text-[10px] font-bold leading-none text-white"
        style={{ background: 'var(--danger-strong)' }}
        aria-label={`${notificationCount} pendientes`}
      >
        {notificationCount > 9 ? '9+' : notificationCount}
      </span>
    ) : null

  return (
    <nav className="glass-panel sticky top-0 z-50" ref={menuRef}>
      <div className="mx-auto flex max-w-[1600px] flex-col px-3 sm:px-6">
        <div className="flex min-h-16 items-center justify-between gap-4 py-2">
          <div className="flex items-center gap-3">
            <NavLink to="/dashboard" className="app-title text-2xl font-bold tracking-tight">
              GYMESIS
            </NavLink>
            <span className="tiny-badge hidden md:inline-flex">{todayText}</span>
          </div>

          <div className="hidden items-center gap-1 xl:flex">
            {LINKS.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) => `nav-link relative ${isActive ? 'active' : ''}`}>
                <Icon size={15} />
                {label}
                {to === '/notifications' && badge}
              </NavLink>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:block">
              <ThemeToggle />
            </div>

            <NavLink
              to="/profile"
              className="hidden h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold xl:flex"
              style={{ background: 'var(--brand-tint-strong)', color: 'var(--brand-strong)' }}
              title={user?.username ?? 'Perfil'}
            >
              {user?.profileImageUrl ? (
                <img src={user.profileImageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </NavLink>

            <button onClick={handleLogout} className="btn-soft btn-sm hidden xl:inline-flex" title="Cerrar sesión">
              <LogOut size={15} />
              Salir
            </button>

            <button
              type="button"
              className="btn-soft btn-icon xl:hidden relative"
              onClick={() => setOpenMenu((prev) => !prev)}
              aria-label={openMenu ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={openMenu}
            >
              {openMenu ? <X size={18} /> : <Menu size={18} />}
              {!openMenu && badge}
            </button>
          </div>
        </div>

        {openMenu && (
          <div className="animate-in flex flex-col gap-1 pb-3 xl:hidden">
            {LINKS.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) => `nav-link relative ${isActive ? 'active' : ''}`}>
                <Icon size={16} />
                {label}
                {to === '/notifications' && badge}
              </NavLink>
            ))}
            <div className="mt-2 flex items-center justify-between gap-2">
              <ThemeToggle />
              <button onClick={handleLogout} className="btn-soft btn-sm">
                <LogOut size={15} />
                Cerrar sesión
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
