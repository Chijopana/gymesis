import axios, { AxiosError } from 'axios'
import { forceLogout } from '../store/authStore'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error?: string }>) => {
    const status = error.response?.status
    const isAuthCall = (error.config?.url ?? '').includes('/auth/')

    // Un 401 fuera del propio login significa sesión caducada: se limpia el
    // estado y se vuelve al login con react-router, sin recargar la página
    // entera (antes un window.location.href tiraba toda la SPA).
    if (status === 401 && !isAuthCall) {
      forceLogout()
      if (!window.location.pathname.startsWith('/login')) {
        window.dispatchEvent(new CustomEvent('gymesis-session-expired'))
      }
    }

    return Promise.reject(error)
  }
)

/** Convierte cualquier fallo de red o de la API en un mensaje que se pueda enseñar. */
export function getErrorMessage(error: unknown, fallback = 'Algo ha salido mal. Inténtalo de nuevo.'): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error && error.message ? error.message : fallback
  }

  if (error.code === 'ECONNABORTED') {
    return 'La solicitud ha tardado demasiado. Comprueba tu conexión y reinténtalo.'
  }

  if (!error.response) {
    return 'No hay conexión con el servidor. Comprueba que el backend esté arrancado.'
  }

  const apiMessage = error.response.data?.error
  if (typeof apiMessage === 'string' && apiMessage.trim()) {
    return apiMessage
  }

  switch (error.response.status) {
    case 401:
      return 'Tu sesión ha caducado. Vuelve a iniciar sesión.'
    case 403:
      return 'No tienes permiso para hacer esto.'
    case 404:
      return 'No hemos encontrado lo que buscabas.'
    case 409:
      return 'Ese registro ya existe.'
    case 413:
      return 'El contenido enviado es demasiado grande.'
    case 429:
      return 'Demasiadas peticiones seguidas. Espera un momento.'
    default:
      return fallback
  }
}

export const authService = {
  register: (data: { username: string; email: string; password: string; firstName?: string; lastName?: string }) =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string }) => api.post('/auth/login', data),
}

export const userService = {
  getProfile: () => api.get('/users/profile'),
  updateProfile: (data: object) => api.put('/users/profile', data),
  addProgressPhoto: (data: { imageUrl: string; caption?: string; takenAt?: string }) =>
    api.post('/users/profile/photos', data),
  deleteProgressPhoto: (photoId: string) => api.delete(`/users/profile/photos/${photoId}`),
  getUserById: (userId: string) => api.get(`/users/${userId}`),
  followUser: (userId: string) => api.post(`/users/${userId}/follow`, {}),
  unfollowUser: (userId: string) => api.delete(`/users/${userId}/follow`),
  searchUsers: (query: string) => api.get('/users/search', { params: { q: query } }),
}

export const routineService = {
  getRoutines: () => api.get('/routines'),
  createRoutine: (data: object) => api.post('/routines', data),
  getRoutineById: (id: string) => api.get(`/routines/${id}`),
  cloneRoutine: (id: string, data?: { name?: string }) => api.post(`/routines/${id}/clone`, data || {}),
  updateRoutine: (id: string, data: object) => api.put(`/routines/${id}`, data),
  deleteRoutine: (id: string) => api.delete(`/routines/${id}`),
  inviteToRoutine: (id: string, data: object) => api.post(`/routines/${id}/invite`, data),
  getInvitations: () => api.get('/routines/invitations/received'),
  answerInvitation: (invitationId: string, data: object) => api.put(`/routines/invitations/${invitationId}`, data),
}

export type LibraryQuery = {
  q?: string
  muscle?: string
  environment?: string
  equipment?: string
  limit?: number
  offset?: number
}

export const exerciseService = {
  getByRoutine: (routineId: string) => api.get(`/exercises/${routineId}`),
  getLibrary: (query: LibraryQuery = {}) => {
    // Sólo se envían los filtros con valor: así el backend aplica sus defaults.
    const params: Record<string, string | number> = {}
    if (query.q?.trim()) params.q = query.q.trim()
    if (query.muscle?.trim()) params.muscle = query.muscle.trim()
    if (query.environment?.trim()) params.environment = query.environment.trim()
    if (query.equipment?.trim()) params.equipment = query.equipment.trim()
    if (typeof query.limit === 'number') params.limit = query.limit
    if (typeof query.offset === 'number') params.offset = query.offset
    return api.get('/exercises/library', { params })
  },
  getLibraryMeta: () => api.get('/exercises/library/meta'),
  createLibrary: (data: object) => api.post('/exercises/library', data),
  create: (data: object) => api.post('/exercises', data),
  update: (exerciseId: string, data: object) => api.put(`/exercises/${exerciseId}`, data),
  remove: (exerciseId: string) => api.delete(`/exercises/${exerciseId}`),
}

export const friendService = {
  getFriends: () => api.get('/friends'),
  sendRequest: (userId: string) => api.post(`/friends/${userId}/request`, {}),
  acceptRequest: (requestId: string) => api.put(`/friends/${requestId}/accept`, {}),
  rejectRequest: (requestId: string) => api.put(`/friends/${requestId}/reject`, {}),
  removeFriend: (userId: string) => api.delete(`/friends/${userId}`),
}

export const trainingService = {
  logSession: (data: object) => api.post('/trainings', data),
  getHistory: () => api.get('/trainings/history'),
  getInsights: () => api.get('/trainings/insights'),
  getProgress: (routineId: string) => api.get(`/trainings/progress/${routineId}`),
  getCalendar: (month?: string) => api.get('/trainings/calendar', { params: month ? { month } : {} }),
  createMeetup: (data: {
    invitedUserId: string
    meetupDate: string
    meetupTime?: string
    title: string
    notes?: string
  }) => api.post('/trainings/meetups', data),
  respondMeetup: (id: string, action: 'accepted' | 'rejected' | 'cancelled') =>
    api.put(`/trainings/meetups/${id}/respond`, { action }),
}

export const groupService = {
  getGroups: () => api.get('/groups'),
  createGroup: (data: object) => api.post('/groups', data),
  getGroupById: (groupId: string) => api.get(`/groups/${groupId}`),
  deleteGroup: (groupId: string) => api.delete(`/groups/${groupId}`),
  lookupGroup: (groupId: string) => api.get(`/groups/${groupId}/lookup`),
  inviteMember: (groupId: string, friendUserId: string) => api.post(`/groups/${groupId}/invite`, { friendUserId }),
  removeMember: (groupId: string, userId: string) => api.delete(`/groups/${groupId}/members/${userId}`),
  requestJoin: (groupId: string) => api.post(`/groups/${groupId}/request-join`, {}),
  listJoinRequests: (groupId: string) => api.get(`/groups/${groupId}/join-requests`),
  respondJoinRequest: (groupId: string, requestId: string, action: 'accepted' | 'rejected') =>
    api.put(`/groups/${groupId}/join-requests/${requestId}`, { action }),
  listMyCompetitions: () => api.get('/groups/competitions/my/list'),
  createCompetition: (groupId: string, data: object) => api.post(`/groups/${groupId}/competitions`, data),
  getCompetitionScore: (competitionId: string) => api.get(`/groups/competitions/${competitionId}/score`),
}

export default api
