import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'gymesis',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

type SeedExercise = {
  name: string;
  muscleGroup: string;
  primaryMuscle: string;
  secondaryMuscles: string;
  equipment: string;
  trainingEnvironment: 'gym' | 'home' | 'calisthenics';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  sets: number;
  reps: number;
  restSeconds: number;
  notes: string;
};

const MASSIVE_LIBRARY_TARGET = 1400;

function buildExerciseLibrarySeeds(): SeedExercise[] {
  const profiles = [
    {
      muscle: 'Pecho',
      group: 'Pecho',
      secondary: 'Triceps, Deltoides anteriores',
      baseSets: 4,
      baseReps: 8,
      baseRest: 110,
      movements: ['Press horizontal', 'Press inclinado', 'Aperturas', 'Fondos', 'Push up'],
    },
    {
      muscle: 'Espalda',
      group: 'Espalda',
      secondary: 'Biceps, Deltoides posteriores',
      baseSets: 4,
      baseReps: 10,
      baseRest: 100,
      movements: ['Remo', 'Jalon vertical', 'Dominada', 'Pull over', 'Remo invertido'],
    },
    {
      muscle: 'Hombros',
      group: 'Hombros',
      secondary: 'Trapecio, Triceps',
      baseSets: 4,
      baseReps: 12,
      baseRest: 80,
      movements: ['Press vertical', 'Elevacion lateral', 'Elevacion frontal', 'Face pull', 'Pike press'],
    },
    {
      muscle: 'Biceps',
      group: 'Biceps',
      secondary: 'Antebrazos',
      baseSets: 3,
      baseReps: 12,
      baseRest: 70,
      movements: ['Curl supino', 'Curl martillo', 'Curl concentrado', 'Curl alterno', 'Chin up asistida'],
    },
    {
      muscle: 'Triceps',
      group: 'Triceps',
      secondary: 'Pecho, Deltoides anteriores',
      baseSets: 3,
      baseReps: 12,
      baseRest: 70,
      movements: ['Extension por encima', 'Press cerrado', 'Fondos de triceps', 'Jalon de triceps', 'Patada de triceps'],
    },
    {
      muscle: 'Pierna',
      group: 'Pierna',
      secondary: 'Gluteos, Core',
      baseSets: 4,
      baseReps: 10,
      baseRest: 120,
      movements: ['Sentadilla', 'Prensa', 'Zancada', 'Step up', 'Sentadilla frontal'],
    },
    {
      muscle: 'Isquios',
      group: 'Isquios',
      secondary: 'Gluteos, Core',
      baseSets: 4,
      baseReps: 9,
      baseRest: 120,
      movements: ['Peso muerto rumano', 'Curl femoral', 'Buenos dias', 'Puente femoral', 'Nordic curl'],
    },
    {
      muscle: 'Gluteos',
      group: 'Gluteos',
      secondary: 'Isquios, Core',
      baseSets: 4,
      baseReps: 10,
      baseRest: 100,
      movements: ['Hip thrust', 'Patada de gluteo', 'Abduccion', 'Sentadilla sumo', 'Puente de gluteo'],
    },
    {
      muscle: 'Core',
      group: 'Core',
      secondary: 'Lumbares, Oblicuos',
      baseSets: 3,
      baseReps: 15,
      baseRest: 50,
      movements: ['Plancha', 'Crunch', 'Elevacion de piernas', 'Ab wheel', 'Hollow hold'],
    },
    {
      muscle: 'Cardio',
      group: 'Cardio',
      secondary: 'Pierna, Core',
      baseSets: 1,
      baseReps: 20,
      baseRest: 30,
      movements: ['Cinta', 'Remo ergometro', 'Bicicleta', 'Sprints', 'Comba'],
    },
    {
      muscle: 'Full body',
      group: 'Full body',
      secondary: 'Core, Pierna, Hombros',
      baseSets: 4,
      baseReps: 12,
      baseRest: 90,
      movements: ['Burpee', 'Thruster', 'Clean and press', 'Bear crawl', 'Man maker'],
    },
  ];

  const variants = ['clasico', 'pausado', 'tempo', 'explosivo', 'unilateral', 'con isometria'];
  const equipmentsByEnv: Record<'gym' | 'home' | 'calisthenics', string[]> = {
    gym: ['barra', 'mancuernas', 'polea', 'maquina', 'kettlebell'],
    home: ['mancuernas', 'banda', 'mochila lastrada', 'peso corporal', 'silla'],
    calisthenics: ['barra de dominadas', 'anillas', 'paralelas', 'peso corporal', 'banda'],
  };
  const difficultyByVariant: Record<string, 'beginner' | 'intermediate' | 'advanced'> = {
    clasico: 'beginner',
    pausado: 'intermediate',
    tempo: 'intermediate',
    explosivo: 'advanced',
    unilateral: 'advanced',
    'con isometria': 'intermediate',
  };

  const generated: SeedExercise[] = [];
  const seen = new Set<string>();

  for (const profile of profiles) {
    for (const movement of profile.movements) {
      for (const environment of ['gym', 'home', 'calisthenics'] as const) {
        for (const equipment of equipmentsByEnv[environment]) {
          for (const variant of variants) {
            const name = `${movement} ${equipment} ${variant}`;
            const key = name.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            generated.push({
              name,
              muscleGroup: profile.group,
              primaryMuscle: profile.muscle,
              secondaryMuscles: profile.secondary,
              equipment,
              trainingEnvironment: environment,
              difficulty: difficultyByVariant[variant],
              sets: profile.baseSets,
              reps: profile.baseReps,
              restSeconds: profile.baseRest,
              notes: `${movement} orientado a ${environment}. Variacion ${variant}.`,
            });
          }
        }
      }
    }
  }

  return generated;
}

export async function initializeDatabase() {
  try {
    const client = await pool.connect();
    console.log('✓ Database connected successfully');
    
    // Create tables
    await createTables(client);
    
    client.release();
  } catch (err) {
    console.error('Database connection failed:', err);
    throw err;
  }
}

async function createTables(client: any) {
  await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await client.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

  const tableDefinitions = [
    // Users table
    `CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      favorite_muscle VARCHAR(50),
      profile_image_url VARCHAR(255),
      bio TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Routines table
    `CREATE TABLE IF NOT EXISTS routines (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      duration_weeks INT,
      difficulty_level VARCHAR(20),
      is_public BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Exercises table (exercise types: push, pull, legs, cardio, etc)
    `CREATE TABLE IF NOT EXISTS exercises (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      routine_id UUID NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      muscle_group VARCHAR(50) NOT NULL,
      sets INT DEFAULT 3,
      reps INT DEFAULT 8,
      rest_seconds INT DEFAULT 90,
      notes TEXT,
      order_index INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS exercise_library (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL UNIQUE,
      muscle_group VARCHAR(50) NOT NULL,
      primary_muscle VARCHAR(50),
      secondary_muscles TEXT,
      equipment VARCHAR(50),
      training_environment VARCHAR(20),
      difficulty_level VARCHAR(20),
      image_url VARCHAR(255),
      video_url VARCHAR(255),
      default_sets INT DEFAULT 3,
      default_reps INT DEFAULT 8,
      default_rest_seconds INT DEFAULT 90,
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Friends table
    `CREATE TABLE IF NOT EXISTS friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id_1 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id_2 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending',
  requested_by UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (user_id_1 < user_id_2)
)`,

    `CREATE TABLE IF NOT EXISTS user_follows (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      follower_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      following_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(follower_user_id, following_user_id),
      CHECK (follower_user_id <> following_user_id)
    )`,

    `CREATE TABLE IF NOT EXISTS user_progress_photos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      image_url VARCHAR(255) NOT NULL,
      caption VARCHAR(180),
      taken_at DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    `CREATE TABLE IF NOT EXISTS workout_meetups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organizer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invited_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      meetup_date DATE NOT NULL,
      meetup_time TIME,
      title VARCHAR(120) NOT NULL,
      notes TEXT,
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CHECK (organizer_user_id <> invited_user_id)
    )`,

    // Routine sharing (routine invitations)
    `CREATE TABLE IF NOT EXISTS routine_invitations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      routine_id UUID NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
      from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(20) DEFAULT 'pending',
      message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Routine participants (users doing a routine together)
    `CREATE TABLE IF NOT EXISTS routine_participants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      routine_id UUID NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      start_date DATE,
      end_date DATE,
      status VARCHAR(20) DEFAULT 'active',
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(routine_id, user_id)
    )`,

    // Training sessions (user's workout logs)
    `CREATE TABLE IF NOT EXISTS training_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      routine_id UUID NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
      exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      sets_completed INT,
      reps_per_set INT[],
      weights_per_set DECIMAL(6,2)[],
      total_volume DECIMAL(10,2),
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Groups
    `CREATE TABLE IF NOT EXISTS groups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      description TEXT,
      group_image_url VARCHAR(255),
      routine_id UUID REFERENCES routines(id) ON DELETE CASCADE,
      creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Group members
    `CREATE TABLE IF NOT EXISTS group_members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(group_id, user_id)
    )`,

    `CREATE TABLE IF NOT EXISTS group_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(group_id, user_id)
)`,

    // Group competitions
    `CREATE TABLE IF NOT EXISTS group_competitions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      group_id_1 UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      group_id_2 UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      start_date DATE,
      end_date DATE,
      status VARCHAR(20) DEFAULT 'pending',
      winner_group_id UUID REFERENCES groups(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  for (const sql of tableDefinitions) {
    try {
      await client.query(sql);
    } catch (err) {
      console.warn('Table already exists or error in SQL:', err);
    }
  }

  await client.query(`ALTER TABLE groups ADD COLUMN IF NOT EXISTS group_image_url VARCHAR(255)`);
  await client.query(`ALTER TABLE exercise_library ADD COLUMN IF NOT EXISTS primary_muscle VARCHAR(50)`);
  await client.query(`ALTER TABLE exercise_library ADD COLUMN IF NOT EXISTS secondary_muscles TEXT`);
  await client.query(`ALTER TABLE exercise_library ADD COLUMN IF NOT EXISTS equipment VARCHAR(50)`);
  await client.query(`ALTER TABLE exercise_library ADD COLUMN IF NOT EXISTS training_environment VARCHAR(20)`);
  await client.query(`ALTER TABLE exercise_library ADD COLUMN IF NOT EXISTS difficulty_level VARCHAR(20)`);
  await client.query(`ALTER TABLE exercise_library ADD COLUMN IF NOT EXISTS image_url VARCHAR(255)`);
  await client.query(`ALTER TABLE exercise_library ADD COLUMN IF NOT EXISTS video_url VARCHAR(255)`);
  await client.query(`ALTER TABLE friendships ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES users(id)`);

  await client.query(`CREATE INDEX IF NOT EXISTS idx_exercise_library_primary_muscle ON exercise_library (primary_muscle)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_exercise_library_environment ON exercise_library (training_environment)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_exercise_library_equipment ON exercise_library (equipment)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_exercise_library_name_trgm ON exercise_library USING GIN (name gin_trgm_ops)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_user_follows_following ON user_follows (following_user_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON user_follows (follower_user_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_progress_photos_user_date ON user_progress_photos (user_id, taken_at DESC, created_at DESC)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_workout_meetups_users_date ON workout_meetups (organizer_user_id, invited_user_id, meetup_date DESC)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_group_join_requests_group ON group_join_requests (group_id, status)`);

  const libraryCount = await client.query(`SELECT COUNT(*)::int AS count FROM exercise_library`);
  if ((libraryCount.rows[0]?.count || 0) < MASSIVE_LIBRARY_TARGET) {
    const makeImageUrl = (name: string, muscle: string) => `https://placehold.co/800x450/0f172a/e2e8f0?text=${encodeURIComponent(name)}%0A${encodeURIComponent(muscle)}`;
    const makeVideoUrl = (name: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} exercise tutorial`)}`;
    const seedExercises = buildExerciseLibrarySeeds();

    for (const exercise of seedExercises) {
      await client.query(
        `INSERT INTO exercise_library (name, muscle_group, primary_muscle, secondary_muscles, equipment, training_environment, difficulty_level, image_url, video_url, default_sets, default_reps, default_rest_seconds, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (name) DO NOTHING`,
        [
          exercise.name,
          exercise.muscleGroup,
          exercise.primaryMuscle,
          exercise.secondaryMuscles,
          exercise.equipment,
          exercise.trainingEnvironment,
          exercise.difficulty,
          makeImageUrl(exercise.name, exercise.primaryMuscle),
          makeVideoUrl(exercise.name),
          exercise.sets,
          exercise.reps,
          exercise.restSeconds,
          exercise.notes,
        ]
      )
    }
  }
  
  console.log('✓ All tables created/verified');
}

export { pool };
