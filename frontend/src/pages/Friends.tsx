import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDownAZ, RefreshCw, Search, UserCheck, UserPlus2, Users, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import PageHeader from '../components/PageHeader'
import { SkeletonList } from '../components/Skeleton'
import { useConfirm } from '../components/ConfirmDialog'
import { friendService, getErrorMessage, userService } from '../services/api'
import { clearCacheByPrefix, getCachedOrFetch } from '../utils/cache'
import { emitFeedback } from '../utils/feedback'

type Friendship = {
  id: string
  friend_id: string
  friend_username: string
  friend_image_url?: string | null
  status: 'pending' | 'accepted'
  direction: 'incoming' | 'outgoing'
}

type SearchUser = {
  id: string
  username: string
  first_name?: string | null
  profile_image_url?: string | null
  friendship_status: 'none' | 'pending' | 'accepted'
}

type StatusFilter = 'all' | 'accepted' | 'incoming' | 'outgoing'

const FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'accepted', label: 'Amigos' },
  { value: 'incoming', label: 'Recibidas' },
  { value: 'outgoing', label: 'Enviadas' },
]

function Avatar({ url, name, size = 40 }: { url?: string | null; name: string; size?: number }) {
  return (
    <div
      className="shrink-0 overflow-hidden rounded-full"
      style={{ width: size, height: size, border: '1px solid var(--line-strong)', background: 'var(--bg-elev)' }}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center text-xs font-bold"
          style={{ color: 'var(--brand-strong)' }}
        >
          {name.slice(0, 2).toUpperCase()}
        </div>
      )}
    </div>
  )
}

export default function Friends() {
  const navigate = useNavigate()
  const { confirm, confirmDialog } = useConfirm()

  const [friendships, setFriendships] = useState<Friendship[]>([])
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<SearchUser[]>([])
  const [searching, setSearching] = useState(false)
  const [loadingFriends, setLoadingFriends] = useState(true)
  const [sortAsc, setSortAsc] = useState(true)
  const [relationQuery, setRelationQuery] = useState('')
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')

  const loadFriends = useCallback(async (forceFresh = false) => {
    try {
      setLoadingFriends(true)
      setError('')
      if (forceFresh) clearCacheByPrefix('gymesis:friends:list')

      const result = await getCachedOrFetch(
        'gymesis:friends:list',
        () => friendService.getFriends().then((response) => response.data.friendships || []),
        { ttlMs: 30_000, version: 3 }
      )
      setFriendships(result.data)
      if (result.stale) {
        emitFeedback({
          kind: 'warning',
          title: 'Datos guardados en el dispositivo',
          message: 'No hemos podido contactar con el servidor.',
        })
      }
    } catch (err) {
      setError(getErrorMessage(err, 'No se han podido cargar tus amigos.'))
    } finally {
      setLoadingFriends(false)
    }
  }, [])

  useEffect(() => {
    loadFriends()
  }, [loadFriends])

  // Búsqueda con retardo: no se dispara una petición por cada tecla.
  useEffect(() => {
    const query = search.trim()
    if (query.length < 2) {
      setSearchResults([])
      setSearching(false)
      return
    }

    setSearching(true)
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const response = await userService.searchUsers(query)
        if (!controller.signal.aborted) setSearchResults(response.data.users || [])
      } catch (err) {
        if (!controller.signal.aborted) {
          setSearchResults([])
          emitFeedback({ kind: 'error', title: 'Búsqueda fallida', message: getErrorMessage(err) })
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false)
      }
    }, 300)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [search])

  /** Envuelve cada acción para que un fallo nunca quede en silencio. */
  const runAction = async (id: string, action: () => Promise<unknown>, success: string) => {
    try {
      setBusyId(id)
      await action()
      clearCacheByPrefix('gymesis:friends:')
      clearCacheByPrefix('gymesis:dashboard:')
      await loadFriends(true)
      emitFeedback({ kind: 'success', title: success })
    } catch (err) {
      const message = getErrorMessage(err)
      setError(message)
      emitFeedback({ kind: 'error', title: 'No ha sido posible', message })
    } finally {
      setBusyId('')
    }
  }

  const sendRequest = (userId: string) =>
    runAction(userId, () => friendService.sendRequest(userId), 'Solicitud enviada')

  const accept = (requestId: string) =>
    runAction(requestId, () => friendService.acceptRequest(requestId), 'Solicitud aceptada')

  const reject = (requestId: string) =>
    runAction(requestId, () => friendService.rejectRequest(requestId), 'Solicitud rechazada')

  const remove = async (friend: Friendship) => {
    const ok = await confirm({
      title: `Eliminar a ${friend.friend_username}`,
      message: 'Dejaréis de ser amigos. Podréis volver a enviaros una solicitud más adelante.',
      confirmLabel: 'Eliminar amistad',
      tone: 'danger',
    })
    if (!ok) return
    runAction(friend.friend_id, () => friendService.removeFriend(friend.friend_id), 'Amistad eliminada')
  }

  const stats = useMemo(
    () => ({
      accepted: friendships.filter((f) => f.status === 'accepted').length,
      incoming: friendships.filter((f) => f.status === 'pending' && f.direction === 'incoming').length,
      outgoing: friendships.filter((f) => f.status === 'pending' && f.direction === 'outgoing').length,
    }),
    [friendships]
  )

  const filtered = useMemo(
    () =>
      friendships
        .filter((f) => {
          if (status === 'accepted') return f.status === 'accepted'
          if (status === 'incoming') return f.status === 'pending' && f.direction === 'incoming'
          if (status === 'outgoing') return f.status === 'pending' && f.direction === 'outgoing'
          return true
        })
        .filter((f) => f.friend_username.toLowerCase().includes(relationQuery.trim().toLowerCase()))
        .sort((a, b) => {
          const left = a.friend_username.toLowerCase()
          const right = b.friend_username.toLowerCase()
          return sortAsc ? left.localeCompare(right) : right.localeCompare(left)
        }),
    [friendships, status, relationQuery, sortAsc]
  )

  return (
    <>
      <Navbar />
      {confirmDialog}
      <main id="main-content" className="page-shell">
        <PageHeader
          icon={<Users className="title-icon" />}
          title="Equipo y rivales"
          subtitle="Busca atletas, gestiona solicitudes y mantén tu círculo de entrenamiento."
          actions={
            <button className="btn-soft btn-sm" onClick={() => loadFriends(true)} disabled={loadingFriends}>
              <RefreshCw size={14} className={loadingFriends ? 'animate-spin' : ''} />
              Actualizar
            </button>
          }
          meta={
            <>
              <span className="tiny-badge">Amigos: {stats.accepted}</span>
              {stats.incoming > 0 && <span className="tiny-badge tiny-badge-warning">Recibidas: {stats.incoming}</span>}
              {stats.outgoing > 0 && <span className="tiny-badge">Enviadas: {stats.outgoing}</span>}
            </>
          }
        />

        {error && (
          <div role="alert" className="status-error mb-4">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="panel space-y-4 p-5">
            <div>
              <h2 className="inline-flex items-center gap-2 text-xl font-semibold">
                <Search size={18} />
                Buscar atletas
              </h2>
              <p className="section-subtitle">Escribe al menos 2 caracteres de su nombre de usuario.</p>
            </div>

            <div className="relative">
              <Search size={15} className="faint-text absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="nombre_de_usuario"
                className="field pl-8 pr-9"
                aria-label="Buscar usuarios por nombre"
              />
              {search && (
                <button
                  type="button"
                  className="btn-ghost absolute right-1 top-1/2 -translate-y-1/2 p-1.5"
                  onClick={() => setSearch('')}
                  aria-label="Limpiar búsqueda"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {searching && (
              <div className="soft-text flex items-center gap-2 text-sm">
                <span className="loader" />
                Buscando...
              </div>
            )}

            {!searching && search.trim().length >= 2 && searchResults.length === 0 && (
              <div className="empty-state">No hay ningún usuario con ese nombre.</div>
            )}

            <div className="space-y-2">
              {searchResults.map((user) => (
                <div key={user.id} className="list-row flex items-center justify-between gap-3">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => navigate(`/users/${user.id}`)}
                  >
                    <Avatar url={user.profile_image_url} name={user.username} />
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{user.username}</div>
                      {user.first_name && <div className="soft-text truncate text-xs">{user.first_name}</div>}
                    </div>
                  </button>

                  {user.friendship_status === 'accepted' ? (
                    <span className="tiny-badge tiny-badge-success shrink-0">
                      <UserCheck size={12} />
                      Amigos
                    </span>
                  ) : user.friendship_status === 'pending' ? (
                    <span className="tiny-badge tiny-badge-warning shrink-0">Pendiente</span>
                  ) : (
                    <button
                      onClick={() => sendRequest(user.id)}
                      className="btn-primary btn-sm shrink-0"
                      disabled={busyId === user.id}
                    >
                      <UserPlus2 size={14} />
                      Añadir
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="panel space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="inline-flex items-center gap-2 text-xl font-semibold">
                <UserCheck size={18} />
                Tus relaciones
              </h2>
              <button
                className="btn-soft btn-sm"
                onClick={() => setSortAsc((value) => !value)}
                title="Cambiar orden alfabético"
              >
                <ArrowDownAZ size={14} />
                {sortAsc ? 'A-Z' : 'Z-A'}
              </button>
            </div>

            <div className="mobile-tabs">
              {FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  className={`mobile-tab ${status === filter.value ? 'active' : ''}`}
                  onClick={() => setStatus(filter.value)}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <input
              className="field"
              value={relationQuery}
              onChange={(event) => setRelationQuery(event.target.value)}
              placeholder="Filtrar por nombre"
              aria-label="Filtrar relaciones"
            />

            {loadingFriends ? (
              <SkeletonList count={3} />
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                {friendships.length === 0
                  ? 'Todavía no tienes amigos. Búscalos en el panel de al lado.'
                  : 'No hay nadie en este filtro.'}
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((friend) => (
                  <div key={friend.id} className="list-row flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      onClick={() => navigate(`/users/${friend.friend_id}`)}
                    >
                      <Avatar url={friend.friend_image_url} name={friend.friend_username} />
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{friend.friend_username}</div>
                        <div className="soft-text text-xs">
                          {friend.status === 'accepted'
                            ? 'Amigos'
                            : friend.direction === 'incoming'
                              ? 'Te ha enviado una solicitud'
                              : 'Solicitud enviada, esperando respuesta'}
                        </div>
                      </div>
                    </button>

                    <div className="flex shrink-0 gap-2">
                      {friend.status === 'pending' && friend.direction === 'incoming' && (
                        <>
                          <button
                            onClick={() => accept(friend.id)}
                            className="btn-primary btn-sm"
                            disabled={busyId === friend.id}
                          >
                            Aceptar
                          </button>
                          <button
                            onClick={() => reject(friend.id)}
                            className="btn-soft btn-sm"
                            disabled={busyId === friend.id}
                          >
                            Rechazar
                          </button>
                        </>
                      )}
                      {friend.status === 'pending' && friend.direction === 'outgoing' && (
                        <button
                          onClick={() => reject(friend.id)}
                          className="btn-soft btn-sm"
                          disabled={busyId === friend.id}
                        >
                          Cancelar
                        </button>
                      )}
                      {friend.status === 'accepted' && (
                        <button
                          onClick={() => remove(friend)}
                          className="btn-danger btn-sm"
                          disabled={busyId === friend.friend_id}
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  )
}
