import pkg, { type PoolClient } from 'pg';
import { config } from '../config/env.js';
import { buildExerciseLibrarySeeds } from './exerciseSeeds.js';

const { Pool } = pkg;

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  ssl: config.db.ssl,
  max: config.db.maxConnections,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

// Un error en un cliente inactivo (corte de red, reinicio de Postgres) no debe
// tumbar el proceso: el pool descarta ese cliente y sigue.
pool.on('error', (err) => {
  console.error('Error inesperado en un cliente inactivo de PostgreSQL:', err.message);
});

export async function initializeDatabase() {
  const client = await pool.connect();
  try {
    console.log('✓ Conectado a PostgreSQL');
    await createSchema(client);
    await seedExerciseLibrary(client);
    console.log('✓ Esquema verificado');
  } finally {
    client.release();
  }
}

const TABLE_DEFINITIONS = [
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    favorite_muscle VARCHAR(50),
    profile_image_url VARCHAR(2048),
    bio TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS routines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    duration_weeks INT,
    difficulty_level VARCHAR(20),
    is_public BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,

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
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
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
    image_url VARCHAR(2048),
    video_url VARCHAR(2048),
    default_sets INT DEFAULT 3,
    default_reps INT DEFAULT 8,
    default_rest_seconds INT DEFAULT 90,
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id_1 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_id_2 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    requested_by UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CHECK (user_id_1 < user_id_2),
    UNIQUE (user_id_1, user_id_2)
  )`,

  `CREATE TABLE IF NOT EXISTS user_follows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (follower_user_id, following_user_id),
    CHECK (follower_user_id <> following_user_id)
  )`,

  `CREATE TABLE IF NOT EXISTS user_progress_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    image_url VARCHAR(2048) NOT NULL,
    caption VARCHAR(180),
    taken_at DATE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS workout_meetups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invited_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    meetup_date DATE NOT NULL,
    meetup_time TIME,
    title VARCHAR(120) NOT NULL,
    notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CHECK (organizer_user_id <> invited_user_id)
  )`,

  `CREATE TABLE IF NOT EXISTS routine_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    routine_id UUID NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
    from_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    message TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CHECK (from_user_id <> to_user_id)
  )`,

  `CREATE TABLE IF NOT EXISTS routine_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    routine_id UUID NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    start_date DATE,
    end_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    joined_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (routine_id, user_id)
  )`,

  `CREATE TABLE IF NOT EXISTS training_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    routine_id UUID NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
    exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    sets_completed INT,
    reps_per_set INT[],
    weights_per_set DECIMAL(6,2)[],
    total_volume DECIMAL(12,2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    group_image_url VARCHAR(2048),
    routine_id UUID REFERENCES routines(id) ON DELETE SET NULL,
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (group_id, user_id)
  )`,

  `CREATE TABLE IF NOT EXISTS group_join_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (group_id, user_id)
  )`,

  `CREATE TABLE IF NOT EXISTS group_competitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    group_id_1 UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    group_id_2 UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    start_date DATE,
    end_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    winner_group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CHECK (group_id_1 <> group_id_2)
  )`,
] as const;

/**
 * Migraciones idempotentes para bases que ya existían antes de que estas
 * columnas/índices formaran parte del esquema.
 */
const MIGRATIONS = [
  `ALTER TABLE groups ADD COLUMN IF NOT EXISTS group_image_url VARCHAR(2048)`,
  `ALTER TABLE exercise_library ADD COLUMN IF NOT EXISTS primary_muscle VARCHAR(50)`,
  `ALTER TABLE exercise_library ADD COLUMN IF NOT EXISTS secondary_muscles TEXT`,
  `ALTER TABLE exercise_library ADD COLUMN IF NOT EXISTS equipment VARCHAR(50)`,
  `ALTER TABLE exercise_library ADD COLUMN IF NOT EXISTS training_environment VARCHAR(20)`,
  `ALTER TABLE exercise_library ADD COLUMN IF NOT EXISTS difficulty_level VARCHAR(20)`,
  `ALTER TABLE exercise_library ADD COLUMN IF NOT EXISTS image_url VARCHAR(2048)`,
  `ALTER TABLE exercise_library ADD COLUMN IF NOT EXISTS video_url VARCHAR(2048)`,
  `ALTER TABLE exercise_library ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL`,
  `ALTER TABLE friendships ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES users(id) ON DELETE CASCADE`,
  // Las URLs largas (placeholders con querystring) no caben en VARCHAR(255).
  `ALTER TABLE users ALTER COLUMN profile_image_url TYPE VARCHAR(2048)`,
  `ALTER TABLE user_progress_photos ALTER COLUMN image_url TYPE VARCHAR(2048)`,
  `ALTER TABLE exercise_library ALTER COLUMN image_url TYPE VARCHAR(2048)`,
  `ALTER TABLE exercise_library ALTER COLUMN video_url TYPE VARCHAR(2048)`,
  // El volumen total de una sesión pesada supera con facilidad los 8 dígitos.
  `ALTER TABLE training_sessions ALTER COLUMN total_volume TYPE DECIMAL(12,2)`,
] as const;

/** Índices que sostienen las consultas más frecuentes de la app. */
const INDEXES = [
  `CREATE INDEX IF NOT EXISTS idx_exercise_library_primary_muscle ON exercise_library (primary_muscle)`,
  `CREATE INDEX IF NOT EXISTS idx_exercise_library_environment ON exercise_library (training_environment)`,
  `CREATE INDEX IF NOT EXISTS idx_exercise_library_equipment ON exercise_library (equipment)`,
  `CREATE INDEX IF NOT EXISTS idx_exercise_library_name_trgm ON exercise_library USING GIN (name gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS idx_user_follows_following ON user_follows (following_user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON user_follows (follower_user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_progress_photos_user_date ON user_progress_photos (user_id, taken_at DESC, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_workout_meetups_organizer_date ON workout_meetups (organizer_user_id, meetup_date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_workout_meetups_invited_date ON workout_meetups (invited_user_id, meetup_date DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_group_join_requests_group ON group_join_requests (group_id, status)`,
  // Añadidos: cubren el dashboard, el historial y todas las pantallas sociales.
  `CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username))`,
  `CREATE INDEX IF NOT EXISTS idx_routines_user ON routines (user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_routines_public ON routines (is_public) WHERE is_public`,
  `CREATE INDEX IF NOT EXISTS idx_exercises_routine ON exercises (routine_id, order_index, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_training_sessions_user_date ON training_sessions (user_id, date DESC, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_training_sessions_routine ON training_sessions (routine_id, exercise_id)`,
  `CREATE INDEX IF NOT EXISTS idx_routine_participants_user ON routine_participants (user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_routine_invitations_to_user ON routine_invitations (to_user_id, status, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members (user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_friendships_user_2 ON friendships (user_id_2)`,
  // Una única relación por pareja. Es además el índice sobre el que se apoya el
  // ON CONFLICT al enviar solicitudes: en bases creadas antes de esta versión la
  // tabla no traía la restricción y el INSERT fallaba.
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_friendships_pair ON friendships (user_id_1, user_id_2)`,
  `CREATE INDEX IF NOT EXISTS idx_group_competitions_groups ON group_competitions (group_id_1, group_id_2)`,
  // Una sola invitación pendiente por rutina y destinatario.
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_routine_invitations_unique_pending
     ON routine_invitations (routine_id, to_user_id) WHERE status = 'pending'`,
] as const;

async function createSchema(client: PoolClient) {
  await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');

  // Sin try/catch: si una tabla no se puede crear queremos enterarnos al arrancar,
  // no descubrirlo con un 500 la primera vez que un usuario toca esa pantalla.
  for (const sql of TABLE_DEFINITIONS) {
    await client.query(sql);
  }

  for (const sql of MIGRATIONS) {
    try {
      await client.query(sql);
    } catch (err) {
      // Las migraciones sí pueden fallar de forma benigna (columna ya migrada,
      // tipo ya correcto). Se avisa pero no se detiene el arranque.
      console.warn('Migración omitida:', (err as Error).message);
    }
  }

  for (const sql of INDEXES) {
    try {
      await client.query(sql);
    } catch (err) {
      console.warn('Índice omitido:', (err as Error).message);
    }
  }
}

const SEED_BATCH_SIZE = 200;

function makeImageUrl(name: string, muscle: string) {
  return `https://placehold.co/800x450/0f172a/e2e8f0?text=${encodeURIComponent(name)}%0A${encodeURIComponent(muscle)}`;
}

function makeVideoUrl(name: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} exercise tutorial`)}`;
}

/**
 * Carga la biblioteca global. Antes se hacía con ~4.000 INSERT sueltos
 * (varios minutos de arranque); ahora va en lotes de 200 filas por sentencia.
 */
async function seedExerciseLibrary(client: PoolClient) {
  const { rows } = await client.query<{ count: number }>('SELECT COUNT(*)::int AS count FROM exercise_library');
  if ((rows[0]?.count ?? 0) >= config.exerciseLibraryTarget) return;

  const seeds = buildExerciseLibrarySeeds();
  console.log(`→ Cargando biblioteca de ejercicios (${seeds.length} entradas)...`);
  const startedAt = Date.now();

  for (let start = 0; start < seeds.length; start += SEED_BATCH_SIZE) {
    const batch = seeds.slice(start, start + SEED_BATCH_SIZE);
    const values: unknown[] = [];
    const placeholders = batch.map((exercise, index) => {
      const base = index * 13;
      values.push(
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
        exercise.notes
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13})`;
    });

    await client.query(
      `INSERT INTO exercise_library
         (name, muscle_group, primary_muscle, secondary_muscles, equipment, training_environment,
          difficulty_level, image_url, video_url, default_sets, default_reps, default_rest_seconds, notes)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (name) DO NOTHING`,
      values
    );
  }

  console.log(`✓ Biblioteca lista en ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

export async function closeDatabase() {
  await pool.end();
}

export { pool };
