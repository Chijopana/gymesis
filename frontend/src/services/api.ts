import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 12000,
})

// Add token to headers
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    if (error?.code === 'ECONNABORTED' && !error?.response) {
      return Promise.reject(new Error('La solicitud tardó demasiado. Reintenta.'))
    }
    if (!error?.response) {
      return Promise.reject(new Error('No hay conexión con el servidor.'))
    }
    return Promise.reject(error)
  }
)

export const authService = {
  register: (data: {
    username: string
    email: string
    password: string
    firstName?: string
    lastName?: string
  }) =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
}

export const userService = {
  getProfile: () => api.get('/users/profile'),
  updateProfile: (data: object) => api.put('/users/profile', data),
  addProgressPhoto: (data: { imageUrl: string; caption?: string; takenAt?: string }) => api.post('/users/profile/photos', data),
  deleteProgressPhoto: (photoId: string) => api.delete(`/users/profile/photos/${photoId}`),
  getUserById: (userId: string) => api.get(`/users/${userId}`),
  followUser: (userId: string) => api.post(`/users/${userId}/follow`, {}),
  unfollowUser: (userId: string) => api.delete(`/users/${userId}/follow`),
  searchUsers: (query: string) => api.get(`/users/search?q=${encodeURIComponent(query)}`),
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
  answerInvitation: (invitationId: string, data: object) =>
    api.put(`/routines/invitations/${invitationId}`, data),
}

export const exerciseService = {
  getByRoutine: (routineId: string) => api.get(`/exercises/${routineId}`),
  getLibrary: (
    query:
      | string
      | {
          q?: string
          muscle?: string
          environment?: string
          equipment?: string
          limit?: number
          offset?: number
        } = ''
  ) => {
    if (typeof query === 'string') {
      return api.get(`/exercises/library${query ? `?q=${encodeURIComponent(query)}` : ''}`)
    }

    const params = new URLSearchParams()
    if (query.q?.trim()) params.set('q', query.q.trim())
    if (query.muscle?.trim()) params.set('muscle', query.muscle.trim())
    if (query.environment?.trim()) params.set('environment', query.environment.trim())
    if (query.equipment?.trim()) params.set('equipment', query.equipment.trim())
    if (typeof query.limit === 'number' && query.limit > 0) params.set('limit', String(query.limit))
    if (typeof query.offset === 'number' && query.offset >= 0) params.set('offset', String(query.offset))

    const qs = params.toString()
    return api.get(`/exercises/library${qs ? `?${qs}` : ''}`)
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
  getCalendar: (month?: string) => api.get(`/trainings/calendar${month ? `?month=${encodeURIComponent(month)}` : ''}`),
  createMeetup: (data: { invitedUserId: string; meetupDate: string; meetupTime?: string; title: string; notes?: string }) => api.post('/trainings/meetups', data),
  respondMeetup: (id: string, action: 'accepted' | 'rejected' | 'cancelled') => api.put(`/trainings/meetups/${id}/respond`, { action }),
}

export const groupService = {
  getGroups: () => api.get('/groups'),
  createGroup: (data: object) => api.post('/groups', data),
  getGroupById: (groupId: string) => api.get(`/groups/${groupId}`),
  lookupGroup: (groupId: string) => api.get(`/groups/${groupId}/lookup`),
  inviteMember: (groupId: string, friendUserId: string) =>
    api.post(`/groups/${groupId}/invite`, { friendUserId }),
  requestJoin: (groupId: string) => api.post(`/groups/${groupId}/request-join`, {}),
  listJoinRequests: (groupId: string) => api.get(`/groups/${groupId}/join-requests`),
  respondJoinRequest: (groupId: string, requestId: string, action: 'accepted' | 'rejected') =>
    api.put(`/groups/${groupId}/join-requests/${requestId}`, { action }),
  listMyCompetitions: () => api.get('/groups/competitions/my/list'),
  createCompetition: (groupId: string, data: object) =>
    api.post(`/groups/${groupId}/competitions`, data),
  getCompetitionScore: (competitionId: string) =>
    api.get(`/groups/competitions/${competitionId}/score`),
}

export default api
