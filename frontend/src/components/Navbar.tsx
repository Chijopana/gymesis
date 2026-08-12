import { useEffect, useState } from 'react'
import { Bell, CalendarDays, Dumbbell, Gauge, LogOut, Menu, Settings, Shield, Swords, User2, Users, X } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import ThemeToggle from './ThemeToggle'
import { friendService, routineService } from '../services/api'

export default function Navbar() {
  const navigate = useNavigate()
  const logout = useAuthStore((state) => state.logout)
  const [notificationCount, setNotificationCount] = useState(0)
  const [openMenu, setOpenMenu] = useState(false)

  useEffect(() => {
    const loadNotifications = async () => {
      try {
        const [friends, routines] = await Promise.all([
          friendService.getFriends(),
          routineService.getInvitations(),
        ])
        const pendingFriends = (friends.data.friendships || []).filter((f: any) => f.status === 'pending' && f.direction === 'incoming').length
        const pendingRoutines = (routines.data.invitations || []).filter((r: any) => r.status === 'pending').length
        setNotificationCount(pendingFriends + pendingRoutines)
      } catch {
        setNotificationCount(0)
      }
    }

    loadNotifications()
    const interval = window.setInterval(loadNotifications, 45000)
    return () => window.clearInterval(interval)
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const links = [
    { to: '/dashboard', label: 'Dashboard', icon: Gauge },
    { to: '/routines', label: 'Rutinas', icon: Dumbbell },
    { to: '/trainings', label: 'Entreno', icon: Shield },
    { to: '/friends', label: 'Amigos', icon: Users },
    { to: '/groups', label: 'Grupos', icon: Swords },
    { to: '/notifications', label: 'Notificaciones', icon: Bell },
    { to: '/calendar', label: 'Calendario', icon: CalendarDays },
    { to: '/profile', label: 'Perfil', icon: User2 },
    { to: '/settings', label: 'Settings', icon: Settings },
  ]

  const todayText = new Date().toLocaleDateString('es-ES', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  })

  return (
    <nav className="glass-panel sticky top-0 z-50 border-b border-slate-700/20">
      <div className="max-w-[1800px] mx-auto px-3 sm:px-6 xl:px-10">
        <div className="flex justify-between items-center min-h-16 gap-4 py-2">
          <div className="flex items-center gap-3">
            <NavLink to="/dashboard" className="app-title text-2xl font-bold text-slate-900 dark:text-slate-100">GYMESIS</NavLink>
            <span className="tiny-badge hidden md:inline-flex">{todayText}</span>
          </div>
          <div className="hidden lg:flex gap-2 text-sm md:text-base items-center flex-wrap justify-end">
            {links.map((link) => {
              const Icon = link.icon
              return (
                <NavLink key={link.to} to={link.to} className={({ isActive }) => `nav-link transition relative ${isActive ? 'active' : ''}`}>
                  <Icon size={15} />{link.label}
                  {link.to === '/notifications' && notificationCount > 0 && (
                    <span className="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] leading-none px-1.5 py-1 rounded-full">
                      {notificationCount}
                    </span>
                  )}
                </NavLink>
              )
            })}
            <ThemeToggle />
            <button onClick={handleLogout} className="btn-soft inline-flex items-center gap-2">
              <LogOut size={15} />Logout
            </button>
          </div>
          <button
            type="button"
            className="lg:hidden btn-soft !px-2 !py-2"
            onClick={() => setOpenMenu((prev) => !prev)}
            aria-label="Abrir menu"
          >
            {openMenu ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {openMenu && (
          <div className="lg:hidden pb-3 flex flex-col gap-2">
            <div className="status-info text-xs inline-flex">{todayText}</div>
            {links.map((link) => {
              const Icon = link.icon
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) => `nav-link transition ${isActive ? 'active' : ''}`}
                  onClick={() => setOpenMenu(false)}
                >
                  <Icon size={15} />{link.label}
                </NavLink>
              )
            })}
            <div className="flex gap-2 items-center">
              <ThemeToggle />
              <button onClick={handleLogout} className="btn-soft inline-flex items-center gap-2">
                <LogOut size={15} />Logout
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
