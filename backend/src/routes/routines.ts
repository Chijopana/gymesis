import express from 'express';
import { authMiddleware, currentUserId } from '../middleware/auth.js';
import { pool } from '../database/connection.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/httpError.js';
import {
  cloneRoutineSchema,
  invitationAnswerSchema,
  parse,
  routineInviteSchema,
  routineSchema,
  uuidSchema,
} from '../utils/validation.js';

const router = express.Router();

router.use(authMiddleware);

/** ¿Puede este usuario ver la rutina? Dueño o participante aceptado. */
async function assertRoutineAccess(routineId: string, userId: string) {
  const access = await pool.query(
    `SELECT r.*, u.username AS owner_username, (r.user_id = $2) AS is_owner
     FROM routines r
     JOIN users u ON u.id = r.user_id
     WHERE r.id = $1
       AND (r.user_id = $2 OR EXISTS (
         SELECT 1 FROM routine_participants rp WHERE rp.routine_id = r.id AND rp.user_id = $2
       ))
     LIMIT 1`,
    [routineId, userId]
  );

  if (access.rows.length === 0) {
    throw notFound('Rutina no encontrada o sin acceso');
  }

  return access.rows[0];
}

async function assertRoutineOwner(routineId: string, userId: string) {
  const owner = await pool.query('SELECT id, name FROM routines WHERE id = $1 AND user_id = $2', [routineId, userId]);
  if (owner.rows.length === 0) {
    throw forbidden('Solo el propietario puede modificar esta rutina');
  }
  return owner.rows[0];
}

router.get('/invitations/received', async (req, res) => {
  const userId = currentUserId(req);

  const result = await pool.query(
    `SELECT ri.id, ri.routine_id, ri.status, ri.message, ri.created_at,
            r.name AS routine_name, u.username AS from_username, u.id AS from_user_id
     FROM routine_invitations ri
     JOIN routines r ON r.id = ri.routine_id
     JOIN users u ON u.id = ri.from_user_id
     WHERE ri.to_user_id = $1
     ORDER BY (ri.status = 'pending') DESC, ri.created_at DESC
     LIMIT 200`,
    [userId]
  );

  res.json({ invitations: result.rows });
});

router.put('/invitations/:id', async (req, res) => {
  const userId = currentUserId(req);
  const invitationId = parse(uuidSchema, req.params.id);
  const { action, startDate, endDate } = parse(invitationAnswerSchema, req.body);

  const invitation = await pool.query(
    'SELECT id, routine_id, to_user_id, status FROM routine_invitations WHERE id = $1',
    [invitationId]
  );

  if (invitation.rows.length === 0) {
    throw notFound('Invitación no encontrada');
  }

  const row = invitation.rows[0];
  if (row.to_user_id !== userId) {
    throw forbidden('Esta invitación no es tuya');
  }
  if (row.status !== 'pending') {
    throw conflict(`Esta invitación ya está ${row.status === 'accepted' ? 'aceptada' : 'rechazada'}`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE routine_invitations SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [
      action,
      invitationId,
    ]);

    if (action === 'accepted') {
      await client.query(
        `INSERT INTO routine_participants (routine_id, user_id, start_date, end_date, status)
         VALUES ($1, $2, $3, $4, 'active')
         ON CONFLICT (routine_id, user_id) DO NOTHING`,
        [row.routine_id, userId, startDate, endDate]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  res.json({ message: action === 'accepted' ? 'Invitación aceptada' : 'Invitación rechazada' });
});

router.get('/', async (req, res) => {
  const userId = currentUserId(req);

  const result = await pool.query(
    `SELECT r.id, r.user_id, r.name, r.description, r.duration_weeks,
            r.difficulty_level, r.is_public, r.created_at, r.updated_at,
            u.username AS owner_username,
            (r.user_id = $1) AS is_owner,
            (SELECT COUNT(*)::int FROM exercises e WHERE e.routine_id = r.id) AS exercises_count,
            (SELECT COUNT(*)::int FROM routine_participants rp2 WHERE rp2.routine_id = r.id) AS participants_count
     FROM routines r
     JOIN users u ON u.id = r.user_id
     WHERE r.user_id = $1
        OR EXISTS (SELECT 1 FROM routine_participants rp WHERE rp.routine_id = r.id AND rp.user_id = $1)
     ORDER BY r.created_at DESC`,
    [userId]
  );

  res.json({ routines: result.rows });
});

router.post('/', async (req, res) => {
  const userId = currentUserId(req);
  const data = parse(routineSchema, req.body);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO routines (user_id, name, description, duration_weeks, difficulty_level, is_public)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, data.name, data.description, data.durationWeeks, data.difficultyLevel, data.isPublic]
    );

    await client.query(
      `INSERT INTO routine_participants (routine_id, user_id, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (routine_id, user_id) DO NOTHING`,
      [result.rows[0].id, userId]
    );
    await client.query('COMMIT');

    res.status(201).json({ routine: { ...result.rows[0], is_owner: true, exercises_count: 0 } });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.get('/:id', async (req, res) => {
  const userId = currentUserId(req);
  const routineId = parse(uuidSchema, req.params.id);

  const routine = await assertRoutineAccess(routineId, userId);

  const [exercises, participants] = await Promise.all([
    pool.query('SELECT * FROM exercises WHERE routine_id = $1 ORDER BY order_index ASC NULLS LAST, created_at ASC', [
      routineId,
    ]),
    pool.query(
      `SELECT rp.user_id, rp.status, rp.start_date, rp.end_date, u.username, u.profile_image_url
       FROM routine_participants rp
       JOIN users u ON u.id = rp.user_id
       WHERE rp.routine_id = $1
       ORDER BY rp.joined_at ASC`,
      [routineId]
    ),
  ]);

  res.json({ routine, exercises: exercises.rows, participants: participants.rows });
});

router.put('/:id', async (req, res) => {
  const userId = currentUserId(req);
  const routineId = parse(uuidSchema, req.params.id);
  const data = parse(routineSchema, req.body);

  await assertRoutineOwner(routineId, userId);

  const result = await pool.query(
    `UPDATE routines
     SET name = $1, description = $2, duration_weeks = $3, difficulty_level = $4, is_public = $5,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $6
     RETURNING *`,
    [data.name, data.description, data.durationWeeks, data.difficultyLevel, data.isPublic, routineId]
  );

  res.json({ routine: result.rows[0] });
});

router.delete('/:id', async (req, res) => {
  const userId = currentUserId(req);
  const routineId = parse(uuidSchema, req.params.id);

  const result = await pool.query('DELETE FROM routines WHERE id = $1 AND user_id = $2 RETURNING id', [
    routineId,
    userId,
  ]);

  if (result.rows.length === 0) {
    // Un participante que no es dueño puede abandonar la rutina en vez de borrarla.
    const left = await pool.query('DELETE FROM routine_participants WHERE routine_id = $1 AND user_id = $2 RETURNING id', [
      routineId,
      userId,
    ]);
    if (left.rows.length > 0) {
      return res.json({ message: 'Has salido de la rutina compartida' });
    }
    throw notFound('Rutina no encontrada o sin permiso');
  }

  res.json({ message: 'Rutina eliminada' });
});

router.post('/:id/invite', async (req, res) => {
  const userId = currentUserId(req);
  const routineId = parse(uuidSchema, req.params.id);
  const { toUserId, message } = parse(routineInviteSchema, req.body);

  if (toUserId === userId) {
    throw badRequest('No puedes invitarte a ti mismo');
  }

  await assertRoutineOwner(routineId, userId);

  const relation = await pool.query(
    `SELECT status FROM friendships
     WHERE user_id_1 = LEAST($1::uuid, $2::uuid)
       AND user_id_2 = GREATEST($1::uuid, $2::uuid)
     LIMIT 1`,
    [userId, toUserId]
  );

  if (relation.rows.length === 0 || relation.rows[0].status !== 'accepted') {
    throw badRequest('Solo puedes invitar a amigos aceptados');
  }

  const alreadyParticipant = await pool.query(
    'SELECT 1 FROM routine_participants WHERE routine_id = $1 AND user_id = $2',
    [routineId, toUserId]
  );
  if (alreadyParticipant.rows.length > 0) {
    throw conflict('Ese usuario ya participa en esta rutina');
  }

  // El índice único parcial impide dos invitaciones pendientes a la vez;
  // aquí se comprueba antes para devolver un mensaje claro en vez de un 409 genérico.
  const pending = await pool.query(
    `SELECT 1 FROM routine_invitations WHERE routine_id = $1 AND to_user_id = $2 AND status = 'pending'`,
    [routineId, toUserId]
  );
  if (pending.rows.length > 0) {
    throw conflict('Ya hay una invitación pendiente para ese usuario');
  }

  await pool.query(
    `INSERT INTO routine_invitations (routine_id, from_user_id, to_user_id, status, message)
     VALUES ($1, $2, $3, 'pending', $4)`,
    [routineId, userId, toUserId, message]
  );

  res.status(201).json({ message: 'Invitación enviada' });
});

router.post('/:id/clone', async (req, res) => {
  const userId = currentUserId(req);
  const sourceRoutineId = parse(uuidSchema, req.params.id);
  const { name } = parse(cloneRoutineSchema, req.body);

  const sourceRoutineResult = await pool.query(
    `SELECT r.*
     FROM routines r
     WHERE r.id = $1
       AND (
         r.user_id = $2
         OR r.is_public = true
         OR EXISTS (SELECT 1 FROM routine_participants rp WHERE rp.routine_id = r.id AND rp.user_id = $2)
       )
     LIMIT 1`,
    [sourceRoutineId, userId]
  );

  if (sourceRoutineResult.rows.length === 0) {
    throw notFound('Rutina no encontrada o sin acceso');
  }

  const source = sourceRoutineResult.rows[0];

  // Todo el clonado en una transacción: o se copia la rutina con sus ejercicios,
  // o no queda una rutina vacía a medias.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cloned = await client.query(
      `INSERT INTO routines (user_id, name, description, duration_weeks, difficulty_level, is_public)
       VALUES ($1, $2, $3, $4, $5, false)
       RETURNING *`,
      [userId, name ?? `${source.name} (copia)`.slice(0, 100), source.description, source.duration_weeks, source.difficulty_level]
    );

    const clonedId = cloned.rows[0].id;

    await client.query(
      `INSERT INTO routine_participants (routine_id, user_id, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (routine_id, user_id) DO NOTHING`,
      [clonedId, userId]
    );

    // Una sola sentencia copia todos los ejercicios manteniendo el orden.
    const copied = await client.query(
      `INSERT INTO exercises (routine_id, name, muscle_group, sets, reps, rest_seconds, notes, order_index)
       SELECT $1, name, muscle_group, sets, reps, rest_seconds, notes, order_index
       FROM exercises
       WHERE routine_id = $2
       RETURNING id`,
      [clonedId, sourceRoutineId]
    );

    await client.query('COMMIT');
    res.status(201).json({ routine: cloned.rows[0], copiedExercises: copied.rowCount ?? 0 });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

export default router;
