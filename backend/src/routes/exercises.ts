import express from 'express';
import { authMiddleware, currentUserId } from '../middleware/auth.js';
import { pool } from '../database/connection.js';
import { conflict, forbidden, notFound } from '../utils/httpError.js';
import {
  createExerciseSchema,
  libraryExerciseSchema,
  librarySearchSchema,
  parse,
  updateExerciseSchema,
  uuidSchema,
} from '../utils/validation.js';

const router = express.Router();

router.use(authMiddleware);

async function assertRoutineOwner(routineId: string, userId: string) {
  const owner = await pool.query('SELECT id FROM routines WHERE id = $1 AND user_id = $2', [routineId, userId]);
  if (owner.rows.length === 0) {
    throw forbidden('Solo el propietario de la rutina puede modificar sus ejercicios');
  }
}

// --- Biblioteca global -------------------------------------------------------

router.get('/library', async (req, res) => {
  const { q, muscle, environment, equipment, limit, offset } = parse(librarySearchSchema, req.query);

  const params: unknown[] = [];
  const where: string[] = [];

  if (q) {
    // ESCAPE para que `%` y `_` escritos por el usuario no actúen como comodines.
    params.push(`%${q.toLowerCase().replace(/[\\%_]/g, (match) => `\\${match}`)}%`);
    const index = params.length;
    where.push(`(
      LOWER(name) LIKE $${index} ESCAPE '\\'
      OR LOWER(muscle_group) LIKE $${index} ESCAPE '\\'
      OR LOWER(COALESCE(primary_muscle, '')) LIKE $${index} ESCAPE '\\'
      OR LOWER(COALESCE(secondary_muscles, '')) LIKE $${index} ESCAPE '\\'
      OR LOWER(COALESCE(equipment, '')) LIKE $${index} ESCAPE '\\'
    )`);
  }

  if (muscle) {
    params.push(muscle.toLowerCase());
    where.push(`LOWER(COALESCE(primary_muscle, muscle_group)) = $${params.length}`);
  }

  if (environment) {
    params.push(environment.toLowerCase());
    where.push(`LOWER(COALESCE(training_environment, 'gym')) = $${params.length}`);
  }

  if (equipment) {
    params.push(`%${equipment.toLowerCase().replace(/[\\%_]/g, (match) => `\\${match}`)}%`);
    where.push(`LOWER(COALESCE(equipment, '')) LIKE $${params.length} ESCAPE '\\'`);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const filterParams = [...params];

  params.push(limit, offset);

  const [result, totalResult] = await Promise.all([
    pool.query(
      `SELECT id, name, muscle_group, primary_muscle, secondary_muscles, equipment, training_environment,
              difficulty_level, image_url, video_url, default_sets, default_reps, default_rest_seconds, notes
       FROM exercise_library
       ${whereSql}
       ORDER BY name ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    ),
    pool.query(`SELECT COUNT(*)::int AS total FROM exercise_library ${whereSql}`, filterParams),
  ]);

  const total = totalResult.rows[0]?.total ?? 0;

  res.json({
    exercises: result.rows,
    paging: { limit, offset, total, hasMore: offset + result.rows.length < total },
  });
});

router.get('/library/meta', async (_req, res) => {
  const [muscles, environments, equipments] = await Promise.all([
    pool.query(
      `SELECT DISTINCT COALESCE(primary_muscle, muscle_group) AS value FROM exercise_library ORDER BY value ASC`
    ),
    pool.query(`SELECT DISTINCT COALESCE(training_environment, 'gym') AS value FROM exercise_library ORDER BY value ASC`),
    pool.query(
      `SELECT DISTINCT equipment AS value FROM exercise_library
       WHERE equipment IS NOT NULL AND equipment <> '' ORDER BY value ASC`
    ),
  ]);

  res.json({
    muscles: muscles.rows.map((row) => row.value).filter(Boolean),
    environments: environments.rows.map((row) => row.value).filter(Boolean),
    equipments: equipments.rows.map((row) => row.value).filter(Boolean),
  });
});

/**
 * Alta en la biblioteca compartida.
 *
 * Antes esto hacía `ON CONFLICT (name) DO UPDATE`, así que cualquier usuario
 * podía reescribir (o vaciar) una entrada existente del catálogo global que ven
 * todos los demás. Ahora sólo se puede crear entradas nuevas, y sólo su autor
 * puede editarlas después.
 */
router.post('/library', async (req, res) => {
  const userId = currentUserId(req);
  const data = parse(libraryExerciseSchema, req.body);

  const existing = await pool.query('SELECT id, created_by FROM exercise_library WHERE LOWER(name) = LOWER($1)', [
    data.name,
  ]);

  if (existing.rows.length > 0 && existing.rows[0].created_by !== userId) {
    throw conflict('Ya existe un ejercicio con ese nombre en la biblioteca global');
  }

  const values = [
    data.name,
    data.muscleGroup,
    data.primaryMuscle ?? data.muscleGroup,
    data.secondaryMuscles,
    data.equipment,
    data.trainingEnvironment,
    data.difficultyLevel,
    data.imageUrl,
    data.videoUrl,
    data.defaultSets,
    data.defaultReps,
    data.defaultRestSeconds,
    data.notes,
    userId,
  ];

  if (existing.rows.length > 0) {
    const updated = await pool.query(
      `UPDATE exercise_library
       SET name = $1, muscle_group = $2, primary_muscle = $3, secondary_muscles = $4, equipment = $5,
           training_environment = $6, difficulty_level = $7, image_url = $8, video_url = $9,
           default_sets = $10, default_reps = $11, default_rest_seconds = $12, notes = $13,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $15 AND created_by = $14
       RETURNING *`,
      [...values, existing.rows[0].id]
    );
    return res.json({ exercise: updated.rows[0] });
  }

  const created = await pool.query(
    `INSERT INTO exercise_library
       (name, muscle_group, primary_muscle, secondary_muscles, equipment, training_environment, difficulty_level,
        image_url, video_url, default_sets, default_reps, default_rest_seconds, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    values
  );

  res.status(201).json({ exercise: created.rows[0] });
});

// --- Ejercicios de una rutina ------------------------------------------------

router.get('/:routineId', async (req, res) => {
  const userId = currentUserId(req);
  const routineId = parse(uuidSchema, req.params.routineId);

  const access = await pool.query(
    `SELECT r.id FROM routines r
     WHERE r.id = $1
       AND (r.user_id = $2 OR EXISTS (
         SELECT 1 FROM routine_participants rp WHERE rp.routine_id = r.id AND rp.user_id = $2
       ))
     LIMIT 1`,
    [routineId, userId]
  );

  if (access.rows.length === 0) {
    throw forbidden('No tienes acceso a esta rutina');
  }

  const result = await pool.query(
    'SELECT * FROM exercises WHERE routine_id = $1 ORDER BY order_index ASC NULLS LAST, created_at ASC',
    [routineId]
  );

  res.json({ exercises: result.rows });
});

router.post('/', async (req, res) => {
  const userId = currentUserId(req);
  const { routineId, ...data } = parse(createExerciseSchema, req.body);

  await assertRoutineOwner(routineId, userId);

  // Sin orden explícito, el ejercicio se coloca al final de la rutina.
  const result = await pool.query(
    `INSERT INTO exercises (routine_id, name, muscle_group, sets, reps, rest_seconds, notes, order_index)
     VALUES ($1, $2, $3, $4, $5, $6, $7,
             COALESCE($8, (SELECT COALESCE(MAX(order_index), -1) + 1 FROM exercises WHERE routine_id = $1)))
     RETURNING *`,
    [routineId, data.name, data.muscleGroup, data.sets, data.reps, data.restSeconds, data.notes, data.orderIndex]
  );

  res.status(201).json({ exercise: result.rows[0] });
});

router.put('/:id', async (req, res) => {
  const userId = currentUserId(req);
  const exerciseId = parse(uuidSchema, req.params.id);
  const data = parse(updateExerciseSchema, req.body);

  const result = await pool.query(
    `UPDATE exercises e
     SET name = $1, muscle_group = $2, sets = $3, reps = $4,
         rest_seconds = $5, notes = $6, order_index = COALESCE($7, e.order_index)
     FROM routines r
     WHERE e.routine_id = r.id AND e.id = $8 AND r.user_id = $9
     RETURNING e.*`,
    [data.name, data.muscleGroup, data.sets, data.reps, data.restSeconds, data.notes, data.orderIndex, exerciseId, userId]
  );

  if (result.rows.length === 0) {
    throw forbidden('Solo el propietario puede editar este ejercicio');
  }

  res.json({ exercise: result.rows[0] });
});

router.delete('/:id', async (req, res) => {
  const userId = currentUserId(req);
  const exerciseId = parse(uuidSchema, req.params.id);

  const result = await pool.query(
    `DELETE FROM exercises e
     USING routines r
     WHERE e.routine_id = r.id AND e.id = $1 AND r.user_id = $2
     RETURNING e.id`,
    [exerciseId, userId]
  );

  if (result.rows.length === 0) {
    throw notFound('Ejercicio no encontrado o sin permiso');
  }

  res.json({ message: 'Ejercicio eliminado' });
});

export default router;
