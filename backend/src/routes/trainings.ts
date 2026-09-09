import express from 'express';
import { authMiddleware, currentUserId } from '../middleware/auth.js';
import { pool } from '../database/connection.js';
import { buildTrainingInsights } from '../utils/trainingInsights.js';
import { badRequest, forbidden, notFound } from '../utils/httpError.js';
import {
  calendarQuerySchema,
  meetupResponseSchema,
  meetupSchema,
  parse,
  trainingLogSchema,
  uuidSchema,
} from '../utils/validation.js';

const router = express.Router();

router.use(authMiddleware);

async function assertRoutineAccess(routineId: string, userId: string) {
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
}

router.post('/', async (req, res) => {
  const userId = currentUserId(req);
  const data = parse(trainingLogSchema, req.body);

  await assertRoutineAccess(data.routineId, userId);

  const exerciseCheck = await pool.query('SELECT id FROM exercises WHERE id = $1 AND routine_id = $2', [
    data.exerciseId,
    data.routineId,
  ]);

  if (exerciseCheck.rows.length === 0) {
    throw badRequest('El ejercicio no pertenece a esa rutina');
  }

  // El volumen se calcula en el servidor: el cliente sólo envía series y pesos,
  // así que no puede inflar su propio total en el ranking.
  const totalVolume = data.repsPerSet.reduce((acc, reps, index) => acc + reps * (data.weightsPerSet[index] ?? 0), 0);

  const result = await pool.query(
    `INSERT INTO training_sessions
       (user_id, routine_id, exercise_id, date, sets_completed, reps_per_set, weights_per_set, total_volume, notes)
     VALUES ($1, $2, $3, $4, $5, $6::int[], $7::decimal[], $8, $9)
     RETURNING *`,
    [
      userId,
      data.routineId,
      data.exerciseId,
      data.date,
      data.setsCompleted ?? data.repsPerSet.length,
      data.repsPerSet,
      data.weightsPerSet,
      Number(totalVolume.toFixed(2)),
      data.notes,
    ]
  );

  res.status(201).json({ training: result.rows[0] });
});

router.get('/history', async (req, res) => {
  const userId = currentUserId(req);

  const result = await pool.query(
    `SELECT ts.id, ts.date::text AS date, ts.sets_completed, ts.reps_per_set, ts.weights_per_set,
            ts.total_volume, ts.notes, ts.created_at,
            r.id AS routine_id, r.name AS routine_name,
            e.id AS exercise_id, e.name AS exercise_name, e.muscle_group
     FROM training_sessions ts
     JOIN routines r ON r.id = ts.routine_id
     JOIN exercises e ON e.id = ts.exercise_id
     WHERE ts.user_id = $1
     ORDER BY ts.date DESC, ts.created_at DESC
     LIMIT 1000`,
    [userId]
  );

  res.json({ history: result.rows });
});

router.get('/insights', async (req, res) => {
  const userId = currentUserId(req);

  const result = await pool.query(
    `SELECT ts.date::text AS date, ts.total_volume, e.name AS exercise_name, r.name AS routine_name
     FROM training_sessions ts
     JOIN routines r ON r.id = ts.routine_id
     JOIN exercises e ON e.id = ts.exercise_id
     WHERE ts.user_id = $1
     ORDER BY ts.date ASC, ts.created_at ASC`,
    [userId]
  );

  res.json({ insights: buildTrainingInsights(result.rows) });
});

router.get('/calendar', async (req, res) => {
  const userId = currentUserId(req);
  const { month } = parse(calendarQuerySchema, req.query);

  let fromDate: string | null = null;
  let toDate: string | null = null;
  if (month) {
    const [year, monthNumber] = month.split('-').map(Number);
    fromDate = `${month}-01`;
    // Primer día del mes siguiente, en UTC para no saltar de mes por zona horaria.
    toDate = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
  }

  const [trainingDays, meetups] = await Promise.all([
    pool.query(
      `SELECT date::text AS day, COUNT(*)::int AS logs_count,
              COALESCE(SUM(total_volume), 0)::float AS total_volume,
              COUNT(DISTINCT exercise_id)::int AS exercises_count
       FROM training_sessions
       WHERE user_id = $1
         AND ($2::date IS NULL OR date >= $2::date)
         AND ($3::date IS NULL OR date < $3::date)
       GROUP BY date
       ORDER BY date ASC`,
      [userId, fromDate, toDate]
    ),
    pool.query(
      `SELECT wm.id, wm.organizer_user_id, wm.invited_user_id, wm.meetup_date::text AS meetup_date,
              wm.meetup_time::text AS meetup_time, wm.title, wm.notes, wm.status,
              ou.username AS organizer_username, iu.username AS invited_username
       FROM workout_meetups wm
       JOIN users ou ON ou.id = wm.organizer_user_id
       JOIN users iu ON iu.id = wm.invited_user_id
       WHERE (wm.organizer_user_id = $1 OR wm.invited_user_id = $1)
         AND ($2::date IS NULL OR wm.meetup_date >= $2::date)
         AND ($3::date IS NULL OR wm.meetup_date < $3::date)
       ORDER BY wm.meetup_date ASC, wm.meetup_time ASC NULLS LAST`,
      [userId, fromDate, toDate]
    ),
  ]);

  res.json({ trainingDays: trainingDays.rows, meetups: meetups.rows });
});

router.get('/progress/:routineId', async (req, res) => {
  const userId = currentUserId(req);
  const routineId = parse(uuidSchema, req.params.routineId);

  await assertRoutineAccess(routineId, userId);

  const [byExercise, leaderboard] = await Promise.all([
    pool.query(
      `SELECT e.id AS exercise_id, e.name AS exercise_name, e.muscle_group,
              COUNT(ts.id)::int AS sessions,
              COALESCE(SUM(ts.total_volume), 0)::float AS total_volume,
              COALESCE(MAX(ts.total_volume), 0)::float AS best_volume
       FROM exercises e
       LEFT JOIN training_sessions ts
         ON ts.exercise_id = e.id AND ts.routine_id = $1 AND ts.user_id = $2
       WHERE e.routine_id = $1
       GROUP BY e.id, e.name, e.muscle_group
       ORDER BY e.name`,
      [routineId, userId]
    ),
    pool.query(
      `SELECT u.id AS user_id, u.username, u.profile_image_url,
              COALESCE(SUM(ts.total_volume), 0)::float AS total_volume,
              COUNT(ts.id)::int AS sessions
       FROM routine_participants rp
       JOIN users u ON u.id = rp.user_id
       LEFT JOIN training_sessions ts
         ON ts.user_id = rp.user_id AND ts.routine_id = rp.routine_id
       WHERE rp.routine_id = $1
       GROUP BY u.id, u.username, u.profile_image_url
       ORDER BY total_volume DESC, u.username ASC`,
      [routineId]
    ),
  ]);

  res.json({ byExercise: byExercise.rows, leaderboard: leaderboard.rows });
});

// --- Quedadas ----------------------------------------------------------------

router.post('/meetups', async (req, res) => {
  const organizerUserId = currentUserId(req);
  const data = parse(meetupSchema, req.body);

  if (data.invitedUserId === organizerUserId) {
    throw badRequest('No puedes quedar contigo mismo');
  }

  const relation = await pool.query(
    `SELECT id FROM friendships
     WHERE status = 'accepted'
       AND user_id_1 = LEAST($1::uuid, $2::uuid)
       AND user_id_2 = GREATEST($1::uuid, $2::uuid)
     LIMIT 1`,
    [organizerUserId, data.invitedUserId]
  );

  if (relation.rows.length === 0) {
    throw badRequest('Solo puedes agendar quedadas con amigos aceptados');
  }

  const created = await pool.query(
    `INSERT INTO workout_meetups (organizer_user_id, invited_user_id, meetup_date, meetup_time, title, notes, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING *`,
    [organizerUserId, data.invitedUserId, data.meetupDate, data.meetupTime, data.title, data.notes]
  );

  res.status(201).json({ meetup: created.rows[0] });
});

router.put('/meetups/:id/respond', async (req, res) => {
  const userId = currentUserId(req);
  const meetupId = parse(uuidSchema, req.params.id);
  const { action } = parse(meetupResponseSchema, req.body);

  const current = await pool.query('SELECT * FROM workout_meetups WHERE id = $1', [meetupId]);
  if (current.rows.length === 0) {
    throw notFound('Quedada no encontrada');
  }

  const meetup = current.rows[0];
  const isOrganizer = meetup.organizer_user_id === userId;
  const isInvited = meetup.invited_user_id === userId;

  if (!isOrganizer && !isInvited) {
    throw forbidden('Esta quedada no es tuya');
  }

  // Quien organiza puede cancelar la suya; quien la recibe puede aceptar o rechazar.
  if (isOrganizer && !isInvited && action !== 'cancelled') {
    throw forbidden('Como organizador solo puedes cancelar la quedada');
  }
  if (isInvited && action === 'cancelled') {
    throw forbidden('Solo quien organiza puede cancelar la quedada');
  }

  const updated = await pool.query(
    `UPDATE workout_meetups SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
    [action, meetupId]
  );

  res.json({ meetup: updated.rows[0] });
});

export default router;
