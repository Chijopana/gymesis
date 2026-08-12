import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../database/connection.js';

const router = express.Router();

router.get('/invitations/received', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const result = await pool.query(
      `SELECT ri.id, ri.routine_id, ri.status, ri.message, ri.created_at,
              r.name AS routine_name, u.username AS from_username, u.id AS from_user_id
       FROM routine_invitations ri
       JOIN routines r ON r.id = ri.routine_id
       JOIN users u ON u.id = ri.from_user_id
       WHERE ri.to_user_id = $1
       ORDER BY ri.created_at DESC`,
      [userId]
    );

    res.json({ invitations: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch invitations' });
  }
});

router.put('/invitations/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const invitationId = req.params.id;
    const { action, startDate, endDate } = req.body as {
      action: 'accepted' | 'rejected';
      startDate?: string;
      endDate?: string;
    };

    if (!action || !['accepted', 'rejected'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const invitation = await pool.query(
      `SELECT id, routine_id, to_user_id, status
       FROM routine_invitations
       WHERE id = $1`,
      [invitationId]
    );

    if (invitation.rows.length === 0) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    const row = invitation.rows[0];
    if (row.to_user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await pool.query(
      `UPDATE routine_invitations
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [action, invitationId]
    );

    if (action === 'accepted') {
      await pool.query(
        `INSERT INTO routine_participants (routine_id, user_id, start_date, end_date, status)
         VALUES ($1, $2, $3, $4, 'active')
         ON CONFLICT (routine_id, user_id) DO NOTHING`,
        [row.routine_id, userId, startDate || null, endDate || null]
      );
    }

    res.json({ message: `Invitation ${action}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update invitation' });
  }
});

router.get('/', authMiddleware, (req, res) => {
  const userId = req.user?.userId;
  pool
    .query(
      `SELECT DISTINCT r.id, r.user_id, r.name, r.description, r.duration_weeks,
              r.difficulty_level, r.is_public, r.created_at, r.updated_at,
              u.username AS owner_username,
              (SELECT COUNT(*) FROM exercises e WHERE e.routine_id = r.id) AS exercises_count
       FROM routines r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN routine_participants rp ON rp.routine_id = r.id
       WHERE r.user_id = $1 OR rp.user_id = $1
       ORDER BY r.created_at DESC`,
      [userId]
    )
    .then((result: any) => res.json({ routines: result.rows }))
    .catch(() => res.status(500).json({ error: 'Failed to fetch routines' }));
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { name, description, durationWeeks, difficultyLevel, isPublic } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Routine name is required' });
    }

    const result = await pool.query(
      `INSERT INTO routines (user_id, name, description, duration_weeks, difficulty_level, is_public)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, name, description || null, durationWeeks || null, difficultyLevel || null, !!isPublic]
    );

    await pool.query(
      `INSERT INTO routine_participants (routine_id, user_id, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (routine_id, user_id) DO NOTHING`,
      [result.rows[0].id, userId]
    );

    res.status(201).json({ routine: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create routine' });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const routineId = req.params.id;

    const access = await pool.query(
      `SELECT r.*, u.username AS owner_username
       FROM routines r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN routine_participants rp ON rp.routine_id = r.id
       WHERE r.id = $1 AND (r.user_id = $2 OR rp.user_id = $2)
       LIMIT 1`,
      [routineId, userId]
    );

    if (access.rows.length === 0) {
      return res.status(404).json({ error: 'Routine not found or no access' });
    }

    const exercises = await pool.query(
      `SELECT * FROM exercises WHERE routine_id = $1 ORDER BY order_index ASC, created_at ASC`,
      [routineId]
    );

    const participants = await pool.query(
      `SELECT rp.user_id, rp.status, rp.start_date, rp.end_date, u.username
       FROM routine_participants rp
       JOIN users u ON u.id = rp.user_id
       WHERE rp.routine_id = $1`,
      [routineId]
    );

    res.json({ routine: access.rows[0], exercises: exercises.rows, participants: participants.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch routine' });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const routineId = req.params.id;
    const { name, description, durationWeeks, difficultyLevel, isPublic } = req.body;

    const ownerCheck = await pool.query(`SELECT id FROM routines WHERE id = $1 AND user_id = $2`, [routineId, userId]);
    if (ownerCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Only owner can update routine' });
    }

    const result = await pool.query(
      `UPDATE routines
       SET name = $1, description = $2, duration_weeks = $3, difficulty_level = $4, is_public = $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [name, description || null, durationWeeks || null, difficultyLevel || null, !!isPublic, routineId]
    );

    res.json({ routine: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update routine' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const routineId = req.params.id;

    const result = await pool.query(
      `DELETE FROM routines WHERE id = $1 AND user_id = $2 RETURNING id`,
      [routineId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Routine not found or no permission' });
    }

    res.json({ message: 'Routine deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete routine' });
  }
});

router.post('/:id/invite', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const routineId = req.params.id;
    const { toUserId, message } = req.body;

    if (!toUserId) {
      return res.status(400).json({ error: 'toUserId is required' });
    }

    const routine = await pool.query(`SELECT id FROM routines WHERE id = $1 AND user_id = $2`, [routineId, userId]);
    if (routine.rows.length === 0) {
      return res.status(403).json({ error: 'Only owner can invite to this routine' });
    }

    const relation = await pool.query(
      `SELECT id, status FROM friendships
       WHERE user_id_1 = LEAST($1::uuid, $2::uuid)
         AND user_id_2 = GREATEST($1::uuid, $2::uuid)
       LIMIT 1`,
      [userId, toUserId]
    );

    if (relation.rows.length === 0 || relation.rows[0].status !== 'accepted') {
      return res.status(400).json({ error: 'Only accepted friends can be invited' });
    }

    await pool.query(
      `INSERT INTO routine_invitations (routine_id, from_user_id, to_user_id, status, message)
       VALUES ($1, $2, $3, 'pending', $4)`,
      [routineId, userId, toUserId, message || null]
    );

    res.status(201).json({ message: 'Invitation sent' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to invite user' });
  }
});

router.post('/:id/clone', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const sourceRoutineId = req.params.id;
    const { name } = req.body as { name?: string };

    const sourceRoutineResult = await pool.query(
      `SELECT r.*
       FROM routines r
       LEFT JOIN routine_participants rp ON rp.routine_id = r.id AND rp.user_id = $2
       WHERE r.id = $1
         AND (r.user_id = $2 OR r.is_public = true OR rp.user_id IS NOT NULL)
       LIMIT 1`,
      [sourceRoutineId, userId]
    );

    if (sourceRoutineResult.rows.length === 0) {
      return res.status(404).json({ error: 'Routine not found or no access' });
    }

    const sourceRoutine = sourceRoutineResult.rows[0];
    const sourceExercises = await pool.query(
      `SELECT name, muscle_group, sets, reps, rest_seconds, notes, order_index
       FROM exercises
       WHERE routine_id = $1
       ORDER BY order_index ASC, created_at ASC`,
      [sourceRoutineId]
    );

    const clonedRoutine = await pool.query(
      `INSERT INTO routines (user_id, name, description, duration_weeks, difficulty_level, is_public)
       VALUES ($1, $2, $3, $4, $5, false)
       RETURNING *`,
      [
        userId,
        (typeof name === 'string' && name.trim()) ? name.trim().slice(0, 100) : `${sourceRoutine.name} (copia)`,
        sourceRoutine.description,
        sourceRoutine.duration_weeks,
        sourceRoutine.difficulty_level,
      ]
    );

    await pool.query(
      `INSERT INTO routine_participants (routine_id, user_id, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (routine_id, user_id) DO NOTHING`,
      [clonedRoutine.rows[0].id, userId]
    );

    for (const exercise of sourceExercises.rows) {
      await pool.query(
        `INSERT INTO exercises (routine_id, name, muscle_group, sets, reps, rest_seconds, notes, order_index)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          clonedRoutine.rows[0].id,
          exercise.name,
          exercise.muscle_group,
          exercise.sets,
          exercise.reps,
          exercise.rest_seconds,
          exercise.notes,
          exercise.order_index,
        ]
      );
    }

    res.status(201).json({ routine: clonedRoutine.rows[0], copiedExercises: sourceExercises.rows.length });
  } catch {
    res.status(500).json({ error: 'Failed to clone routine' });
  }
});

export default router;
