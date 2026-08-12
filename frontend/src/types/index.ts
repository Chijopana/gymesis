export interface User {
  id: string
  username: string
  email: string
  firstName?: string
  lastName?: string
  favoriteMuscle?: string
  profileImageUrl?: string
  bio?: string
  createdAt: Date
  updatedAt: Date
}

export interface Routine {
  id: string
  userId: string
  name: string
  description?: string
  durationWeeks?: number
  difficultyLevel?: 'beginner' | 'intermediate' | 'advanced'
  isPublic: boolean
  createdAt: Date
  updatedAt: Date
}

export interface Exercise {
  id: string
  routineId: string
  name: string
  muscleGroup: string
  sets: number
  reps: number
  restSeconds: number
  notes?: string
  orderIndex: number
}

export interface TrainingSession {
  id: string
  userId: string
  routineId: string
  exerciseId: string
  date: Date
  setsCompleted: number
  repsPerSet: number[]
  weightsPerSet: number[]
  totalVolume: number
  notes?: string
}

export interface Group {
  id: string
  name: string
  description?: string
  routineId?: string
  creatorId: string
  createdAt: Date
}

export interface GroupCompetition {
  id: string
  name: string
  groupId1: string
  groupId2: string
  startDate?: Date
  endDate?: Date
  status: 'pending' | 'active' | 'completed'
  winnerGroupId?: string
}
