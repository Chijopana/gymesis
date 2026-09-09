import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Copy,
  Crown,
  LogOut,
  PlusCircle,
  RefreshCw,
  Search,
  Swords,
  Trash2,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import PageHeader from '../components/PageHeader'
import { SkeletonList } from '../components/Skeleton'
import { useConfirm } from '../components/ConfirmDialog'
import { friendService, getErrorMessage, groupService } from '../services/api'
import { emitFeedback } from '../utils/feedback'
import { useAuthStore } from '../store/authStore'

type Group = {
  id: string
  name: string
  description?: string
  members_count?: number
  routine_name?: string | null
  creator_username?: string
  creator_id?: string
  is_creator?: boolean
  pending_requests_count?: number
}

type Member = {
  user_id: string
  username: string
  joined_at: string
  is_creator?: boolean
  total_volume?: number | string
}

type JoinRequest = { id: string; user_id: string; username: string; created_at: string }

type Competition = {
  id: string
  name: string
  group_id_1: string
  group_id_2: string
  group_1_name: string
  group_2_name: string
  start_date?: string | null
  end_date?: string | null
}

type ScoreRow = { group_id: string; total_volume: number; members_count: number; sessions: number }

type Friend = { friend_id: string; friend_username: string; status: string }

const kg = (value: number | string) => `${Math.round(Number(value) || 0).toLocaleString('es-ES')} kg`

export default function Groups() {
  const navigate = useNavigate()
  const { confirm, confirmDialog } = useConfirm()
  const currentUserId = useAuthStore((state) => state.user?.id)

  const [groups, setGroups] = useState<Group[]>([])
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [friends, setFriends] = useState<Friend[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([])
  const [scores, setScores] = useState<Record<string, ScoreRow[]>>({})

  const [loadingGroups, setLoadingGroups] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [groupQuery, setGroupQuery] = useState('')

  const [groupForm, setGroupForm] = useState({ name: '', description: '', groupImageUrl: '' })
  const [inviteFriendId, setInviteFriendId] = useState('')
  const [compForm, setCompForm] = useState({ rivalGroupId: '', name: '', startDate: '', endDate: '' })
  const [joinLookupId, setJoinLookupId] = useState('')
  const [lookupResult, setLookupResult] = useState<{
    id: string
    name: string
    members_count?: number
    is_member?: boolean
    has_pending_request?: boolean
  } | null>(null)

  const loadGroups = useCallback(async () => {
    try {
      setLoadingGroups(true)
      setError('')
      const response = await groupService.getGroups()
      const data: Group[] = response.data.groups || []
      setGroups(data)
      setSelectedGroupId((current) => (current && data.some((g) => g.id === current) ? current : data[0]?.id || ''))
    } catch (err) {
      setError(getErrorMessage(err, 'No se han podido cargar los grupos.'))
    } finally {
      setLoadingGroups(false)
    }
  }, [])

  const loadCompetitions = useCallback(async () => {
    try {
      const response = await groupService.listMyCompetitions()
      setCompetitions(response.data.competitions || [])
    } catch {
      setCompetitions([])
    }
  }, [])

  const loadFriends = useCallback(async () => {
    try {
      const response = await friendService.getFriends()
      setFriends((response.data.friendships || []).filter((f: Friend) => f.status === 'accepted'))
    } catch {
      setFriends([])
    }
  }, [])

  const loadGroupDetail = useCallback(
    async (groupId: string) => {
      if (!groupId) {
        setSelectedGroup(null)
        setMembers([])
        setJoinRequests([])
        return
      }
      try {
        const response = await groupService.getGroupById(groupId)
        // El backend ya devuelve members_count en el propio grupo: antes se
        // descartaba y la ficha mostraba siempre "Miembros: 0".
        setSelectedGroup(response.data.group)
        setMembers(response.data.members || [])

        if (response.data.group?.creator_id === currentUserId) {
          const requests = await groupService.listJoinRequests(groupId)
          setJoinRequests(requests.data.requests || [])
        } else {
          setJoinRequests([])
        }
      } catch {
        setSelectedGroup(null)
        setMembers([])
        setJoinRequests([])
      }
    },
    [currentUserId]
  )

  useEffect(() => {
    loadGroups()
    loadCompetitions()
    loadFriends()
  }, [loadGroups, loadCompetitions, loadFriends])

  useEffect(() => {
    loadGroupDetail(selectedGroupId)
  }, [selectedGroupId, loadGroupDetail])

  const runAction = async (key: string, action: () => Promise<unknown>, success: string) => {
    try {
      setBusy(key)
      setError('')
      await action()
      emitFeedback({ kind: 'success', title: success })
      return true
    } catch (err) {
      const message = getErrorMessage(err)
      setError(message)
      emitFeedback({ kind: 'error', title: 'No ha sido posible', message })
      return false
    } finally {
      setBusy('')
    }
  }

  const createGroup = async (event: React.FormEvent) => {
    event.preventDefault()
    const ok = await runAction('create', () => groupService.createGroup(groupForm), 'Grupo creado')
    if (ok) {
      setGroupForm({ name: '', description: '', groupImageUrl: '' })
      await loadGroups()
    }
  }

  const inviteFriend = async () => {
    if (!selectedGroupId || !inviteFriendId) return
    const ok = await runAction(
      'invite',
      () => groupService.inviteMember(selectedGroupId, inviteFriendId),
      'Miembro añadido al grupo'
    )
    if (ok) {
      setInviteFriendId('')
      await Promise.all([loadGroups(), loadGroupDetail(selectedGroupId)])
    }
  }

  const respondJoinRequest = async (requestId: string, action: 'accepted' | 'rejected') => {
    const ok = await runAction(
      requestId,
      () => groupService.respondJoinRequest(selectedGroupId, requestId, action),
      action === 'accepted' ? 'Solicitud aceptada' : 'Solicitud rechazada'
    )
    if (ok) await Promise.all([loadGroups(), loadGroupDetail(selectedGroupId)])
  }

  const removeMember = async (member: Member) => {
    const isSelf = member.user_id === currentUserId
    const ok = await confirm({
      title: isSelf ? 'Salir del grupo' : `Expulsar a ${member.username}`,
      message: isSelf
        ? 'Dejarás de ver este grupo y sus competencias.'
        : `${member.username} dejará de pertenecer al grupo.`,
      confirmLabel: isSelf ? 'Salir' : 'Expulsar',
      tone: 'danger',
    })
    if (!ok) return

    const done = await runAction(
      member.user_id,
      () => groupService.removeMember(selectedGroupId, member.user_id),
      isSelf ? 'Has salido del grupo' : 'Miembro expulsado'
    )
    if (done) {
      if (isSelf) setSelectedGroupId('')
      await Promise.all([loadGroups(), loadGroupDetail(isSelf ? '' : selectedGroupId)])
    }
  }

  const deleteGroup = async (group: Group) => {
    const ok = await confirm({
      title: `Eliminar "${group.name}"`,
      message: 'Se borrarán el grupo, sus miembros y sus competencias. No se puede deshacer.',
      confirmLabel: 'Eliminar grupo',
      tone: 'danger',
    })
    if (!ok) return

    const done = await runAction(group.id, () => groupService.deleteGroup(group.id), 'Grupo eliminado')
    if (done) {
      setSelectedGroupId('')
      await Promise.all([loadGroups(), loadCompetitions()])
    }
  }

  const createCompetition = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedGroupId) return

    const ok = await runAction('competition', () => groupService.createCompetition(selectedGroupId, compForm), 'Competencia creada')
    if (ok) {
      setCompForm({ rivalGroupId: '', name: '', startDate: '', endDate: '' })
      await loadCompetitions()
    }
  }

  const loadScore = async (competitionId: string) => {
    try {
      setBusy(competitionId)
      const response = await groupService.getCompetitionScore(competitionId)
      setScores((current) => ({ ...current, [competitionId]: response.data.score || [] }))
    } catch (err) {
      emitFeedback({ kind: 'error', title: 'No se ha podido cargar el marcador', message: getErrorMessage(err) })
    } finally {
      setBusy('')
    }
  }

  const lookupGroup = async () => {
    const id = joinLookupId.trim()
    if (!id) return
    try {
      setBusy('lookup')
      const response = await groupService.lookupGroup(id)
      setLookupResult(response.data.group)
    } catch (err) {
      setLookupResult(null)
      emitFeedback({ kind: 'warning', title: 'Grupo no encontrado', message: getErrorMessage(err) })
    } finally {
      setBusy('')
    }
  }

  const requestJoin = async (groupId: string) => {
    const ok = await runAction('request-join', () => groupService.requestJoin(groupId), 'Solicitud enviada')
    if (ok) setLookupResult((current) => (current ? { ...current, has_pending_request: true } : current))
  }

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      emitFeedback({ kind: 'info', title: `${label} copiado` })
    } catch {
      emitFeedback({ kind: 'warning', title: 'Tu navegador ha bloqueado el portapapeles' })
    }
  }

  const visibleGroups = useMemo(() => {
    const query = groupQuery.trim().toLowerCase()
    if (!query) return groups
    return groups.filter((group) => group.name.toLowerCase().includes(query))
  }, [groups, groupQuery])

  const invitableFriends = useMemo(
    () => friends.filter((friend) => !members.some((member) => member.user_id === friend.friend_id)),
    [friends, members]
  )

  const isCreator = selectedGroup?.creator_id === currentUserId
  const hasGroups = groups.length > 0

  return (
    <>
      <Navbar />
      {confirmDialog}
      <main id="main-content" className="page-shell">
        <PageHeader
          icon={<Swords className="title-icon" />}
          title="Grupos"
          subtitle="Entrena en equipo, gestiona miembros y reta a otros grupos."
          actions={
            <button
              className="btn-soft btn-sm"
              onClick={() => {
                loadGroups()
                loadCompetitions()
              }}
              disabled={loadingGroups}
            >
              <RefreshCw size={14} className={loadingGroups ? 'animate-spin' : ''} />
              Actualizar
            </button>
          }
          meta={
            <>
              <span className="tiny-badge">Grupos: {groups.length}</span>
              <span className="tiny-badge">Competencias: {competitions.length}</span>
              {joinRequests.length > 0 && (
                <span className="tiny-badge tiny-badge-warning">Solicitudes: {joinRequests.length}</span>
              )}
            </>
          }
        />

        {error && (
          <div role="alert" className="status-error mb-4">
            {error}
          </div>
        )}

        {loadingGroups ? (
          <SkeletonList count={3} />
        ) : !hasGroups ? (
          <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <article className="panel space-y-3 p-5">
              <h2 className="inline-flex items-center gap-2 text-xl font-semibold">
                <PlusCircle size={19} />
                Crea tu primer grupo
              </h2>
              <p className="section-subtitle">Reúne a tus amigos y comparad el volumen que levantáis.</p>
              <form onSubmit={createGroup} className="space-y-3">
                <input
                  className="field"
                  placeholder="Nombre del grupo"
                  value={groupForm.name}
                  onChange={(event) => setGroupForm((state) => ({ ...state, name: event.target.value }))}
                  required
                  maxLength={100}
                  aria-label="Nombre del grupo"
                />
                <textarea
                  className="field"
                  placeholder="Descripción (opcional)"
                  value={groupForm.description}
                  onChange={(event) => setGroupForm((state) => ({ ...state, description: event.target.value }))}
                  aria-label="Descripción del grupo"
                />
                <button className="btn-primary w-full" disabled={busy === 'create'}>
                  <PlusCircle size={15} />
                  Crear grupo
                </button>
              </form>
            </article>

            <article className="panel space-y-3 p-5">
              <h2 className="inline-flex items-center gap-2 text-xl font-semibold">
                <Users size={19} />
                Unirte a uno existente
              </h2>
              <p className="section-subtitle">Si te han pasado el ID de un grupo, pídelo aquí.</p>
              <div className="flex gap-2">
                <input
                  className="field"
                  value={joinLookupId}
                  onChange={(event) => setJoinLookupId(event.target.value)}
                  placeholder="Pega el ID del grupo"
                  aria-label="ID del grupo"
                />
                <button className="btn-soft" onClick={lookupGroup} type="button" disabled={busy === 'lookup'}>
                  Buscar
                </button>
              </div>

              {lookupResult && (
                <div className="list-row space-y-2">
                  <div className="font-semibold">{lookupResult.name}</div>
                  <div className="soft-text text-sm">{lookupResult.members_count ?? 0} miembros</div>
                  {lookupResult.is_member ? (
                    <span className="tiny-badge tiny-badge-success">Ya eres miembro</span>
                  ) : lookupResult.has_pending_request ? (
                    <span className="tiny-badge tiny-badge-warning">Solicitud pendiente de aprobación</span>
                  ) : (
                    <button
                      className="btn-primary btn-sm"
                      type="button"
                      onClick={() => requestJoin(lookupResult.id)}
                      disabled={busy === 'request-join'}
                    >
                      Solicitar unirme
                    </button>
                  )}
                </div>
              )}
            </article>
          </section>
        ) : (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <section className="panel h-fit space-y-4 p-5 xl:col-span-4">
              <h2 className="inline-flex items-center gap-2 text-xl font-semibold">
                <Users size={19} />
                Mis grupos
              </h2>

              <div className="relative">
                <Search size={14} className="faint-text absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  className="field pl-8"
                  value={groupQuery}
                  onChange={(event) => setGroupQuery(event.target.value)}
                  placeholder="Filtrar grupos"
                  aria-label="Filtrar grupos"
                />
              </div>

              <div className="space-y-2">
                {visibleGroups.map((group) => (
                  <button
                    key={group.id}
                    onClick={() => setSelectedGroupId(group.id)}
                    className={`list-row clickable-row w-full text-left ${selectedGroupId === group.id ? 'is-selected' : ''}`}
                    aria-pressed={selectedGroupId === group.id}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold">{group.name}</span>
                      {group.is_creator && (
                        <span className="tiny-badge shrink-0">
                          <Crown size={11} />
                          Creador
                        </span>
                      )}
                    </div>
                    <div className="soft-text text-xs">
                      {group.members_count ?? 0} miembros
                      {group.routine_name ? ` · ${group.routine_name}` : ''}
                    </div>
                    {(group.pending_requests_count ?? 0) > 0 && (
                      <span className="tiny-badge tiny-badge-warning mt-1.5">
                        {group.pending_requests_count} solicitud(es)
                      </span>
                    )}
                  </button>
                ))}
                {visibleGroups.length === 0 && <div className="empty-state">Ningún grupo coincide.</div>}
              </div>

              <form onSubmit={createGroup} className="space-y-2 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
                <label className="field-label pt-2">Crear otro grupo</label>
                <input
                  className="field"
                  placeholder="Nombre del grupo"
                  value={groupForm.name}
                  onChange={(event) => setGroupForm((state) => ({ ...state, name: event.target.value }))}
                  required
                  maxLength={100}
                />
                <button className="btn-soft w-full" disabled={busy === 'create'}>
                  <PlusCircle size={14} />
                  Crear
                </button>
              </form>
            </section>

            <div className="space-y-6 xl:col-span-8">
              {selectedGroup && (
                <section className="panel space-y-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-xl font-semibold">{selectedGroup.name}</h2>
                      <p className="section-subtitle">{selectedGroup.description || 'Sin descripción'}</p>
                      <div className="kpi-strip mt-2">
                        <span className="tiny-badge">{selectedGroup.members_count ?? members.length} miembros</span>
                        <span className="tiny-badge">Creador: {selectedGroup.creator_username}</span>
                        {selectedGroup.routine_name && (
                          <span className="tiny-badge">Rutina: {selectedGroup.routine_name}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        className="btn-soft btn-sm"
                        type="button"
                        onClick={() => copyText(selectedGroup.id, 'ID del grupo')}
                      >
                        <Copy size={14} />
                        Copiar ID
                      </button>
                      {isCreator ? (
                        <button
                          className="btn-danger btn-sm"
                          type="button"
                          onClick={() => deleteGroup(selectedGroup)}
                          disabled={busy === selectedGroup.id}
                        >
                          <Trash2 size={14} />
                          Eliminar
                        </button>
                      ) : (
                        <button
                          className="btn-danger btn-sm"
                          type="button"
                          onClick={() =>
                            removeMember({ user_id: currentUserId ?? '', username: 'tú', joined_at: '' })
                          }
                        >
                          <LogOut size={14} />
                          Salir
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 font-semibold">Ranking del grupo</h3>
                    <div className="space-y-2">
                      {members.map((member, index) => (
                        <div key={member.user_id} className="list-row flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left"
                            onClick={() => navigate(`/users/${member.user_id}`)}
                          >
                            <span className="faint-text mr-1.5 tabular-nums">{index + 1}.</span>
                            <span className="font-semibold">{member.username}</span>
                            {member.is_creator && <Crown size={12} className="ml-1.5 inline" />}
                          </button>
                          <span className="shrink-0 font-semibold tabular-nums" style={{ color: 'var(--brand-strong)' }}>
                            {kg(member.total_volume ?? 0)}
                          </span>
                          {isCreator && member.user_id !== currentUserId && (
                            <button
                              className="btn-danger btn-xs shrink-0"
                              type="button"
                              onClick={() => removeMember(member)}
                              disabled={busy === member.user_id}
                              aria-label={`Expulsar a ${member.username}`}
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                      {members.length === 0 && <div className="empty-state">Sin miembros todavía.</div>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="field-label inline-flex items-center gap-1.5" htmlFor="inviteFriend">
                        <UserPlus size={13} />
                        Invitar a un amigo
                      </label>
                      <div className="flex gap-2">
                        <select
                          id="inviteFriend"
                          className="field"
                          value={inviteFriendId}
                          onChange={(event) => setInviteFriendId(event.target.value)}
                        >
                          <option value="">
                            {invitableFriends.length === 0 ? 'No hay amigos por invitar' : 'Elige un amigo'}
                          </option>
                          {invitableFriends.map((friend) => (
                            <option key={friend.friend_id} value={friend.friend_id}>
                              {friend.friend_username}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={inviteFriend}
                          className="btn-primary"
                          type="button"
                          disabled={!inviteFriendId || busy === 'invite'}
                        >
                          Invitar
                        </button>
                      </div>
                      {friends.length === 0 && (
                        <p className="soft-text text-xs">Necesitas amigos aceptados para poder invitarlos.</p>
                      )}
                    </div>

                    {isCreator && joinRequests.length > 0 && (
                      <div className="space-y-2">
                        <span className="field-label">Solicitudes pendientes</span>
                        {joinRequests.map((request) => (
                          <div key={request.id} className="list-row flex items-center justify-between gap-2">
                            <span className="truncate">{request.username}</span>
                            <div className="flex shrink-0 gap-1.5">
                              <button
                                type="button"
                                className="btn-primary btn-xs"
                                onClick={() => respondJoinRequest(request.id, 'accepted')}
                                disabled={busy === request.id}
                              >
                                Aceptar
                              </button>
                              <button
                                type="button"
                                className="btn-soft btn-xs"
                                onClick={() => respondJoinRequest(request.id, 'rejected')}
                                disabled={busy === request.id}
                              >
                                Rechazar
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              )}

              <section className="panel space-y-4 p-5">
                <div>
                  <h2 className="inline-flex items-center gap-2 text-xl font-semibold">
                    <Trophy size={19} />
                    Competencias
                  </h2>
                  <p className="section-subtitle">
                    Reta a otro grupo: gana el que más volumen acumule en el periodo.
                  </p>
                </div>

                <div className="space-y-2">
                  {competitions.map((competition) => {
                    const score = scores[competition.id]
                    const scoreOf = (groupId: string) => score?.find((row) => row.group_id === groupId)
                    return (
                      <article key={competition.id} className="list-row space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold">{competition.name}</div>
                            <div className="soft-text text-sm">
                              {competition.group_1_name} vs {competition.group_2_name}
                              {competition.start_date ? ` · desde ${competition.start_date}` : ''}
                              {competition.end_date ? ` hasta ${competition.end_date}` : ''}
                            </div>
                          </div>
                          <button
                            onClick={() => loadScore(competition.id)}
                            className="btn-soft btn-sm shrink-0"
                            disabled={busy === competition.id}
                          >
                            {score ? 'Actualizar marcador' : 'Ver marcador'}
                          </button>
                        </div>

                        {score && (
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { id: competition.group_id_1, name: competition.group_1_name },
                              { id: competition.group_id_2, name: competition.group_2_name },
                            ].map((side) => {
                              const row = scoreOf(side.id)
                              const rival = scoreOf(side.id === competition.group_id_1 ? competition.group_id_2 : competition.group_id_1)
                              const winning = (row?.total_volume ?? 0) > (rival?.total_volume ?? 0)
                              return (
                                <div
                                  key={side.id}
                                  className="panel-sunken p-3"
                                  style={
                                    winning
                                      ? { borderColor: 'color-mix(in srgb, var(--success) 45%, transparent)' }
                                      : undefined
                                  }
                                >
                                  <div className="soft-text truncate text-xs font-semibold uppercase">{side.name}</div>
                                  <div className="text-xl font-bold tabular-nums">{kg(row?.total_volume ?? 0)}</div>
                                  <div className="faint-text text-xs">
                                    {row?.members_count ?? 0} miembros · {row?.sessions ?? 0} registros
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </article>
                    )
                  })}
                  {competitions.length === 0 && (
                    <div className="empty-state">Todavía no hay competencias. Crea una abajo.</div>
                  )}
                </div>

                {selectedGroupId && (
                  <form onSubmit={createCompetition} className="space-y-3 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
                    <h3 className="pt-2 font-semibold">Crear competencia desde "{selectedGroup?.name}"</h3>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <input
                        className="field"
                        value={compForm.name}
                        onChange={(event) => setCompForm((state) => ({ ...state, name: event.target.value }))}
                        placeholder="Nombre de la competencia"
                        required
                        maxLength={100}
                        aria-label="Nombre de la competencia"
                      />
                      <select
                        className="field"
                        value={compForm.rivalGroupId}
                        onChange={(event) => setCompForm((state) => ({ ...state, rivalGroupId: event.target.value }))}
                        required
                        aria-label="Grupo rival"
                      >
                        <option value="">Selecciona el grupo rival</option>
                        {groups
                          .filter((group) => group.id !== selectedGroupId)
                          .map((group) => (
                            <option key={group.id} value={group.id}>
                              {group.name}
                            </option>
                          ))}
                      </select>
                      <div>
                        <label className="field-label" htmlFor="compStart">
                          Inicio (opcional)
                        </label>
                        <input
                          id="compStart"
                          type="date"
                          className="field"
                          value={compForm.startDate}
                          onChange={(event) => setCompForm((state) => ({ ...state, startDate: event.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="field-label" htmlFor="compEnd">
                          Fin (opcional)
                        </label>
                        <input
                          id="compEnd"
                          type="date"
                          className="field"
                          min={compForm.startDate || undefined}
                          value={compForm.endDate}
                          onChange={(event) => setCompForm((state) => ({ ...state, endDate: event.target.value }))}
                        />
                      </div>
                    </div>
                    {groups.length < 2 && (
                      <p className="soft-text text-sm">
                        Necesitas pertenecer a dos grupos para poder crear una competencia entre ellos.
                      </p>
                    )}
                    <button className="btn-primary" disabled={busy === 'competition' || groups.length < 2}>
                      <Swords size={15} />
                      Crear competencia
                    </button>
                  </form>
                )}
              </section>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
