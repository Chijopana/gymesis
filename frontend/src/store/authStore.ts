import { create } from 'zustand'
import type { User } from '../types'

const TOKEN_KEY = 'token'
const USER_KEY = 'user'

interface AuthStore {
  user: User | null
  token: string | null
  isLoggedIn: boolean
  setAuth: (user: User, token: string) => void
  updateUser: (patch: Partial<User>) => void
  logout: () => void
}

/** Decodifica el payload del JWT sin verificarlo (eso es cosa del servidor). */
function readTokenPayload(token: string): { exp?: number } | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(normalized))
  } catch {
    return null
  }
}

function isExpired(token: string): boolean {
  const payload = readTokenPayload(token)
  if (!payload?.exp) return false
  return payload.exp * 1000 <= Date.now()
}

/**
 * Estado inicial leído de localStorage de forma SÍNCRONA.
 *
 * Antes esto se hacía en un `useEffect` de App, que corre después del primer
 * render: en ese primer render `isLoggedIn` era false, así que recargar
 * cualquier página (F5 en /dashboard) rebotaba al login aunque hubiera sesión.
 */
function readStoredAuth(): { user: User | null; token: string | null; isLoggedIn: boolean } {
  const empty = { user: null, token: null, isLoggedIn: false }

  try {
    const token = localStorage.getItem(TOKEN_KEY)
    const rawUser = localStorage.getItem(USER_KEY)
    if (!token || !rawUser) return empty

    // Un token caducado sólo daría 401 en la primera petición; mejor limpiarlo ya.
    if (isExpired(token)) {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
      return empty
    }

    return { user: JSON.parse(rawUser) as User, token, isLoggedIn: true }
  } catch {
    // localStorage bloqueado o JSON corrupto: se arranca sin sesión en vez de romper.
    return empty
  }
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  ...readStoredAuth(),

  setAuth: (user, token) => {
    try {
      localStorage.setItem(TOKEN_KEY, token)
      localStorage.setItem(USER_KEY, JSON.stringify(user))
    } catch {
      // Modo incógnito con almacenamiento bloqueado: la sesión vive sólo en memoria.
    }
    set({ user, token, isLoggedIn: true })
  },

  updateUser: (patch) => {
    const current = get().user
    if (!current) return
    const next = { ...current, ...patch }
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(next))
    } catch {
      /* ignorado a propósito */
    }
    set({ user: next })
  },

  logout: () => {
    try {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
    } catch {
      /* ignorado a propósito */
    }
    set({ user: null, token: null, isLoggedIn: false })
  },
}))

/** Cierra la sesión desde fuera de React (por ejemplo, el interceptor de axios). */
export function forceLogout() {
  useAuthStore.getState().logout()
}
