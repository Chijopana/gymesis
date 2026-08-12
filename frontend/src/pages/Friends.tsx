import { useEffect, useState } from 'react'
import { ArrowDownAZ, Copy, RefreshCw, Search, UserCheck, UserPlus2, Users, XCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import PageHeader from '../components/PageHeader'
import { useIsLargeScreen } from '../hooks/useResponsive'
import { friendService, userService } from '../services/api'
import { clearCacheByPrefix, getCachedOrFetch } from '../utils/cache'
import { emitFeedback } from '../utils/feedback'

type Friendship = {
  id: string
  friend_id: string
  friend_username: string
  status: 'pending' | 'accepted'
  direction: 'incoming' | 'outgoing'
}

type SearchUser = { id: string; username: string }

export default function Friends() {
  const navigate = useNavigate()
  const isLargeScreen = useIsLargeScreen()
  const [friendships, setFriendships] = useState<Friendship[]>([])
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<SearchUser[]>([])
  const [searching, setSearching] = useState(false)
  const [loadingFriends, setLoadingFriends] = useState(true)
  const [sortAsc, setSortAsc] = useState(true)
  const [relationQuery, setRelationQuery] = useState('')
  const [bulkRunning, setBulkRunning] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('all')
  const [statusMessage, setStatusMessage] = useState('')
  const [mobileView, setMobileView] = useState<'search' | 'relations'>('search')

  const loadFriends = async () => {
    try {
      setLoadingFriends(true)
      setError('')
      const result = await getCachedOrFetch(
        'gymesis:friends:list',
        async () => friendService.getFriends().then((response) => response.data.friendships || []),
        { ttlMs: 30_000, version: 2 }
      )
      setFriendships(result.data)
      if (result.stale) {
        emitFeedback({ kind: 'warning', title: 'Mostrando amigos recientes', message: 'Se usó caché local por conexión inestable.' })
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'No se pudieron cargar amigos')
      emitFeedback({ kind: 'error', title: 'No se pudieron cargar amigos', message: err.response?.data?.error || 'Revisa la conexión.' })
    } finally {
      setLoadingFriends(false)
    }
  }

  useEffect(() => {
    loadFriends()
  }, [])

  const searchUsers = async () => {
    if (search.trim().length < 2) {
      setSearchResults([])
      return
    }
    try {
      setSearching(true)
      const query = search.trim().toLowerCase()
      const result = await getCachedOrFetch(
        `gymesis:friends:search:${query}`,
        async () => userService.searchUsers(query).then((response) => response.data.users || []),
        { ttlMs: 120_000, version: 2 }
      )
      setSearchResults(result.data)
      if (result.stale) {
        emitFeedback({ kind: 'warning', title: 'Resultados recientes', message: 'La búsqueda se resolvió desde caché local.' })
      }
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  useEffect(() => {
    if (search.trim().length < 2) {
      setSearchResults([])
      return
    }
    const timer = window.setTimeout(() => {
      searchUsers()
    }, 260)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (!statusMessage) return
    const timer = window.setTimeout(() => setStatusMessage(''), 2500)
    return () => window.clearTimeout(timer)
  }, [statusMessage])

  const sendRequest = async (userId: string) => {
    try {
      clearCacheByPrefix('gymesis:friends:')
      await friendService.sendRequest(userId)
      await loadFriends()
      setStatusMessage('Solicitud enviada')
      emitFeedback({ kind: 'success', title: 'Solicitud enviada', message: 'Se creó la solicitud de amistad.' })
    } catch (err: any) {
      setError(err.response?.data?.error || 'No se pudo enviar solicitud')
      emitFeedback({ kind: 'error', title: 'No se pudo enviar la solicitud', message: err.response?.data?.error || 'Inténtalo de nuevo.' })
    }
  }

  const accept = async (requestId: string) => {
    clearCacheByPrefix('gymesis:friends:')
    await friendService.acceptRequest(requestId)
    await loadFriends()
    setStatusMessage('Solicitud aceptada')
    emitFeedback({ kind: 'success', title: 'Solicitud aceptada', message: 'Ahora sois amigos.' })
  }

  const reject = async (requestId: string) => {
    clearCacheByPrefix('gymesis:friends:')
    await friendService.rejectRequest(requestId)
    await loadFriends()
    setStatusMessage('Solicitud rechazada')
    emitFeedback({ kind: 'info', title: 'Solicitud rechazada', message: 'La petición fue descartada.' })
  }

  const remove = async (friendId: string) => {
    clearCacheByPrefix('gymesis:friends:')
    await friendService.removeFriend(friendId)
    await loadFriends()
    setStatusMessage('Amigo eliminado')
    emitFeedback({ kind: 'warning', title: 'Amigo eliminado', message: 'Se retiró la relación seleccionada.' })
  }

  const filtered = friendships.filter((f) => {
    if (status === 'all') return true
    if (status === 'accepted') return f.status === 'accepted'
    if (status === 'incoming') return f.status === 'pending' && f.direction === 'incoming'
    if (status === 'outgoing') return f.status === 'pending' && f.direction === 'outgoing'
    return true
  }).filter((f) => f.friend_username.toLowerCase().includes(relationQuery.toLowerCase())).sort((a, b) => {
    const left = a.friend_username.toLowerCase()
    const right = b.friend_username.toLowerCase()
    return sortAsc ? left.localeCompare(right) : right.localeCompare(left)
  })

  const stats = {
    accepted: friendships.filter((f) => f.status === 'accepted').length,
    incoming: friendships.filter((f) => f.status === 'pending' && f.direction === 'incoming').length,
    outgoing: friendships.filter((f) => f.status === 'pending' && f.direction === 'outgoing').length,
  }

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id)
      setStatusMessage('ID copiado al portapapeles')
      emitFeedback({ kind: 'info', title: 'ID copiado', message: 'El identificador quedó en el portapapeles.' })
    } catch {
      setStatusMessage('No se pudo copiar el ID')
    }
  }

  const copyUsername = async (username: string) => {
    try {
      await navigator.clipboard.writeText(username)
      setStatusMessage('Username copiado')
      emitFeedback({ kind: 'info', title: 'Username copiado', message: 'El usuario quedó en el portapapeles.' })
    } catch {
      setStatusMessage('No se pudo copiar username')
    }
  }

  const acceptAllIncoming = async () => {
    const incoming = friendships.filter((f) => f.status === 'pending' && f.direction === 'incoming')
    if (incoming.length === 0) return
    setBulkRunning(true)
    try {
      clearCacheByPrefix('gymesis:friends:')
      for (const item of incoming) {
        await friendService.acceptRequest(item.id)
      }
      await loadFriends()
      setStatusMessage('Se aceptaron todas las solicitudes recibidas')
      emitFeedback({ kind: 'success', title: 'Solicitudes recibidas aceptadas', message: 'Se procesaron todas las solicitudes visibles.' })
    } finally {
      setBulkRunning(false)
    }
  }

  const rejectAllOutgoing = async () => {
    const outgoing = friendships.filter((f) => f.status === 'pending' && f.direction === 'outgoing')
    if (outgoing.length === 0) return
    setBulkRunning(true)
    try {
      clearCacheByPrefix('gymesis:friends:')
      for (const item of outgoing) {
        await friendService.rejectRequest(item.id)
      }
      await loadFriends()
      setStatusMessage('Se cancelaron las solicitudes enviadas visibles')
      emitFeedback({ kind: 'info', title: 'Solicitudes enviadas canceladas', message: 'Se descartaron las solicitudes visibles.' })
    } finally {
      setBulkRunning(false)
    }
  }

  return (
    <>
      <Navbar />
      <main id="main-content" className="page-shell">
        <PageHeader
          icon={<Users className="title-icon" />}
          title="Equipo y rivales"
          subtitle="Gestiona solicitudes, amistades activas y contactos para retos de rutina."
        />
        {error && <div className="mb-4 status-error">{error}</div>}
        {statusMessage && <div className="mb-4 status-success">{statusMessage}</div>}
        <div className="sr-only" aria-live="polite">{statusMessage}</div>

        <section className="panel p-4 mb-4 stack-gap">
          <div className="flex flex-wrap gap-2">
            <span className="tiny-badge">Amigos: {stats.accepted}</span>
            <span className="tiny-badge">Recibidas: {stats.incoming}</span>
            <span className="tiny-badge">Enviadas: {stats.outgoing}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-soft text-sm inline-flex items-center gap-1" onClick={loadFriends}><RefreshCw size={14} />Refrescar</button>
            <button disabled={bulkRunning || stats.incoming === 0} className="btn-soft text-sm" onClick={acceptAllIncoming}>Aceptar recibidas</button>
            <button disabled={bulkRunning || stats.outgoing === 0} className="btn-soft text-sm" onClick={rejectAllOutgoing}>Cancelar enviadas</button>
          </div>
        </section>

        {!isLargeScreen && (
          <div className="mobile-tabs mb-4">
            <button className={`mobile-tab ${mobileView === 'search' ? 'active' : ''}`} onClick={() => setMobileView('search')}>Buscar</button>
            <button className={`mobile-tab ${mobileView === 'relations' ? 'active' : ''}`} onClick={() => setMobileView('relations')}>Relaciones</button>
          </div>
        )}

        {(isLargeScreen || mobileView === 'search') && (
        <section className="panel p-5 mb-6 stack-gap">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-2"><Search size={18} />Buscar usuarios</h2>
          <div className="flex gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  searchUsers()
                }
              }}
              placeholder="Buscar por username..."
              className="field"
            />
            <button onClick={searchUsers} className="btn-primary inline-flex items-center gap-1"><Search size={14} />Buscar</button>
            <button onClick={() => { setSearch(''); setSearchResults([]) }} className="btn-soft inline-flex items-center gap-1"><XCircle size={14} />Limpiar</button>
          </div>
          {searching && <div className="soft-text mt-2 inline-flex items-center gap-2"><span className="loader" />Buscando...</div>}
          <div className="mt-4 space-y-2">
            {searchResults.map((u) => (
              <div key={u.id} className="flex items-center justify-between border border-slate-400/30 dark:border-slate-700 rounded px-3 py-2 bg-white/40 dark:bg-slate-900/35">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">{u.username}</div>
                  <div className="text-xs soft-text">ID: {u.id}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => navigate(`/users/${u.id}`)} className="btn-soft text-sm">Ver perfil</button>
                  <button onClick={() => copyId(u.id)} className="btn-soft text-sm inline-flex items-center gap-1"><Copy size={14} />Copiar ID</button>
                  <button onClick={() => sendRequest(u.id)} className="btn-primary text-sm inline-flex items-center gap-1"><UserPlus2 size={14} />Enviar solicitud</button>
                </div>
              </div>
            ))}
          </div>
        </section>
        )}

        {(isLargeScreen || mobileView === 'relations') && (
        <section className="panel p-5 stack-gap">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-2"><UserCheck size={18} />Relaciones</h2>
            <div className="flex gap-2 items-center">
              <input className="field max-w-xs" value={relationQuery} onChange={(e) => setRelationQuery(e.target.value)} placeholder="Filtrar por nombre" />
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="field max-w-xs">
                <option value="all">Todas</option>
                <option value="accepted">Solo amigos</option>
                <option value="incoming">Pendientes recibidas</option>
                <option value="outgoing">Pendientes enviadas</option>
              </select>
              <button className="btn-soft inline-flex items-center gap-1" onClick={() => setSortAsc((v) => !v)}><ArrowDownAZ size={14} />{sortAsc ? 'A-Z' : 'Z-A'}</button>
            </div>
          </div>
          {loadingFriends && <div className="soft-text mb-3 inline-flex items-center gap-2"><span className="loader" />Cargando relaciones...</div>}
          <div className="space-y-3">
            {filtered.map((f) => (
              <div key={f.id} className="border border-slate-400/30 dark:border-slate-700 rounded p-3 flex items-center justify-between bg-white/40 dark:bg-slate-900/35">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">{f.friend_username}</div>
                  <div className="text-sm soft-text">Estado: {f.status} ({f.direction})</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => navigate(`/users/${f.friend_id}`)} className="btn-soft text-sm">Ver perfil</button>
                  <button onClick={() => copyUsername(f.friend_username)} className="btn-soft text-sm">Copiar user</button>
                  {f.status === 'pending' && f.direction === 'incoming' && (
                    <>
                      <button onClick={() => accept(f.id)} className="bg-emerald-600 text-white px-3 py-1 rounded text-sm">Aceptar</button>
                      <button onClick={() => reject(f.id)} className="btn-soft text-sm">Rechazar</button>
                    </>
                  )}
                  {f.status === 'accepted' && (
                    <button onClick={() => remove(f.friend_id)} className="bg-red-600 text-white px-3 py-1 rounded text-sm">Eliminar</button>
                  )}
                </div>
              </div>
            ))}
            {filtered.length === 0 && <div className="soft-text">No hay elementos en este filtro.</div>}
          </div>
        </section>
        )}
      </main>
    </>
  )
}
