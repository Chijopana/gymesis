/**
 * Tipos compartidos del dominio.
 *
 * Ojo: las respuestas de la API llegan en snake_case (tal cual salen de SQL)
 * salvo el objeto `user`, que el backend si convierte a camelCase. Cada pagina
 * declara el tipo exacto de lo que consume; aqui viven solo los comunes.
 */

export interface User {
  id: string
  username: string
  email: string
  firstName?: string | null
  lastName?: string | null
  favoriteMuscle?: string | null
  profileImageUrl?: string | null
  bio?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface Routine {
  id: string
  user_id: string
  name: string
  description?: string | null
  duration_weeks?: number | null
  difficulty_level?: 'beginner' | 'intermediate' | 'advanced' | null
  is_public: boolean
  is_owner?: boolean
  owner_username?: string
  exercises_count?: number
  created_at: string
  updated_at: string
}

export interface Exercise {
  id: string
  routine_id: string
  name: string
  muscle_group: string
  sets: number
  reps: number
  rest_seconds: number
  notes?: string | null
  order_index?: number | null
}

export interface TrainingSession {
  id: string
  user_id: string
  routine_id: string
  exercise_id: string
  date: string
  sets_completed: number
  reps_per_set: number[]
  weights_per_set: string[]
  total_volume: string
  notes?: string | null
}

export interface Group {
  id: string
  name: string
  description?: string | null
  group_image_url?: string | null
  routine_id?: string | null
  routine_name?: string | null
  creator_id: string
  creator_username?: string
  is_creator?: boolean
  members_count?: number
  created_at: string
}

export interface GroupCompetition {
  id: string
  name: string
  group_id_1: string
  group_id_2: string
  group_1_name?: string
  group_2_name?: string
  start_date?: string | null
  end_date?: string | null
  status: 'pending' | 'active' | 'completed'
  winner_group_id?: string | null
}
