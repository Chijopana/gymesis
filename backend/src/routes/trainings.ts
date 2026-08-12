import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../database/connection.js';
import { buildTrainingInsights } from '../utils/trainingInsights.js';

const router = express.Router();

router.post('/', authMiddleware, (req, res) => {
  const userId = req.user?.userId;
  const {
    routineId,
    exerciseId,
    date,
    setsCompleted,
    repsPerSet,
    weightsPerSet,
    notes,
  } = req.body as {
    routineId: string;
    exerciseId: string;
    date: string;
    setsCompleted: number;
    repsPerSet: number[];
    weightsPerSet: number[];
    notes?: string;
  };

  if (!routineId || !exerciseId || !date || !Array.isArray(repsPerSet) || !Array.isArray(weightsPerSet)) {
    return res.status(400).json({ error: 'Missing required training fields' });
  }

  const totalVolume = repsPerSet.reduce((acc, reps, i) => acc + reps * (Number(weightsPerSet[i] || 0)), 0);

  pool
    .query(
      `SELECT r.id
       FROM routines r
       LEFT JOIN routine_participants rp ON rp.routine_id = r.id
       WHERE r.id = $1 AND (r.user_id = $2 OR rp.user_id = $2)
       LIMIT 1`,
      [routineId, userId]
    )
    .then(async (access: any) => {
      if (access.rows.length === 0) {
        return res.status(403).json({ error: 'No access to routine' });
      }

      const exerciseCheck = await pool.query(
        `SELECT id FROM exercises WHERE id = $1 AND routine_id = $2`,
        [exerciseId, routineId]
      );

      if (exerciseCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Exercise does not belong to routine' });
      }

      const result = await pool.query(
        `INSERT INTO training_sessions
         (user_id, routine_id, exercise_id, date, sets_completed, reps_per_set, weights_per_set, total_volume, notes)
         VALUES ($1, $2, $3, $4, $5, $6::int[], $7::decimal[], $8, $9)
         RETURNING *`,
        [userId, routineId, exerciseId, date, setsCompleted || repsPerSet.length, repsPerSet, weightsPerSet, totalVolume, notes || null]
      );

      return res.status(201).json({ training: result.rows[0] });
    })
    .catch(() => res.status(500).json({ error: 'Failed to log training' }));
});

router.get('/history', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const result = await pool.query(
      `SELECT ts.*, r.name AS routine_name, e.name AS exercise_name, e.muscle_group
       FROM training_sessions ts
       JOIN routines r ON r.id = ts.routine_id
       JOIN exercises e ON e.id = ts.exercise_id
       WHERE ts.user_id = $1
       ORDER BY ts.date DESC, ts.created_at DESC`,
      [userId]
    );

    res.json({ history: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

router.get('/insights', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const result = await pool.query(
      `SELECT ts.date::text AS date, ts.total_volume, e.name AS exercise_name, r.name AS routine_name
       FROM training_sessions ts
       JOIN routines r ON r.id = ts.routine_id
       JOIN exercises e ON e.id = ts.exercise_id
       WHERE ts.user_id = $1
       ORDER BY ts.date ASC, ts.created_at ASC`,
      [userId]
    );

    const insights = buildTrainingInsights(result.rows);
    res.json({ insights });
  } catch {
    res.status(500).json({ error: 'Failed to fetch training insights' });
  }
});

router.get('/progress/:routineId', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const routineId = req.params.routineId;

    const access = await pool.query(
      `SELECT r.id
       FROM routines r
       LEFT JOIN routine_participants rp ON rp.routine_id = r.id
       WHERE r.id = $1 AND (r.user_id = $2 OR rp.user_id = $2)
       LIMIT 1`,
      [routineId, userId]
    );

    if (access.rows.length === 0) {
      return res.status(403).json({ error: 'No access to routine' });
    }

    const byExercise = await pool.query(
      `SELECT e.id AS exercise_id, e.name AS exercise_name,
              COUNT(ts.id) AS sessions,
              COALESCE(SUM(ts.total_volume), 0) AS total_volume,
              COALESCE(MAX(ts.total_volume), 0) AS best_volume
       FROM exercises e
       LEFT JOIN training_sessions ts
         ON ts.exercise_id = e.id AND ts.routine_id = $1
       WHERE e.routine_id = $1
       GROUP BY e.id, e.name
       ORDER BY e.name`,
      [routineId]
    );

    const leaderboard = await pool.query(
      `SELECT u.id AS user_id, u.username,
              COALESCE(SUM(ts.total_volume), 0) AS total_volume
       FROM routine_participants rp
       JOIN users u ON u.id = rp.user_id
       LEFT JOIN training_sessions ts
         ON ts.user_id = rp.user_id AND ts.routine_id = rp.routine_id
       WHERE rp.routine_id = $1
       GROUP BY u.id, u.username
       ORDER BY total_volume DESC`,
      [routineId]
    );

    res.json({ byExercise: byExercise.rows, leaderboard: leaderboard.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

router.get('/calendar', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const month = String(req.query.month || '').trim();

    let fromDate: string | null = null;
    let toDate: string | null = null;
    if (/^\d{4}-\d{2}$/.test(month)) {
      fromDate = `${month}-01`;
      const [year, m] = month.split('-').map(Number);
      const next = new Date(year, m, 1);
      toDate = next.toISOString().slice(0, 10);
    }

    const trainingDays = await pool.query(
      `SELECT date::text AS day, COUNT(*)::int AS logs_count, COALESCE(SUM(total_volume), 0) AS total_volume
       FROM training_sessions
       WHERE user_id = $1
         AND ($2::date IS NULL OR date >= $2::date)
         AND ($3::date IS NULL OR date < $3::date)
       GROUP BY date
       ORDER BY date ASC`,
      [userId, fromDate, toDate]
    );

    const meetups = await pool.query(
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
    );

    res.json({ trainingDays: trainingDays.rows, meetups: meetups.rows });
  } catch {
    res.status(500).json({ error: 'Failed to load calendar data' });
  }
});

router.post('/meetups', authMiddleware, async (req, res) => {
  try {
    const organizerUserId = req.user?.userId;
    const { invitedUserId, meetupDate, meetupTime, title, notes } = req.body as {
      invitedUserId: string;
      meetupDate: string;
      meetupTime?: string;
      title: string;
      notes?: string;
    };

    if (!organizerUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!invitedUserId || !meetupDate || !title) {
      return res.status(400).json({ error: 'invitedUserId, meetupDate and title are required' });
    }

    const relation = await pool.query(
      `SELECT id FROM friendships
       WHERE status = 'accepted'
         AND user_id_1 = LEAST($1::uuid, $2::uuid)
         AND user_id_2 = GREATEST($1::uuid, $2::uuid)
       LIMIT 1`,
      [organizerUserId, invitedUserId]
    );

    if (relation.rows.length === 0) {
      return res.status(400).json({ error: 'Solo puedes agendar quedadas con amigos aceptados' });
    }

    const created = await pool.query(
      `INSERT INTO workout_meetups (organizer_user_id, invited_user_id, meetup_date, meetup_time, title, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [
        organizerUserId,
        invitedUserId,
        meetupDate,
        meetupTime || null,
        String(title).trim().slice(0, 120),
        typeof notes === 'string' ? notes.trim().slice(0, 280) : null,
      ]
    );

    res.status(201).json({ meetup: created.rows[0] });
  } catch {
    res.status(500).json({ error: 'Failed to schedule meetup' });
  }
});

router.put('/meetups/:id/respond', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const meetupId = req.params.id;
    const { action } = req.body as { action: 'accepted' | 'rejected' | 'cancelled' };

    if (!action || !['accepted', 'rejected', 'cancelled'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const current = await pool.query(
      `SELECT * FROM workout_meetups WHERE id = $1`,
      [meetupId]
    );

    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Meetup not found' });
    }

    const meetup = current.rows[0];
    const canRespond = meetup.invited_user_id === userId || meetup.organizer_user_id === userId;
    if (!canRespond) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updated = await pool.query(
      `UPDATE workout_meetups
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [action, meetupId]
    );

    res.json({ meetup: updated.rows[0] });
  } catch {
    res.status(500).json({ error: 'Failed to update meetup' });
  }
});

export default router;
