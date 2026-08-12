import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../database/connection.js';

const router = express.Router();

router.get('/library', authMiddleware, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const muscle = String(req.query.muscle || '').trim().toLowerCase();
    const environment = String(req.query.environment || '').trim().toLowerCase();
    const equipment = String(req.query.equipment || '').trim().toLowerCase();
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const params: any[] = [];
    const where: string[] = [];

    if (q) {
      params.push(`%${q}%`);
      const index = params.length;
      where.push(`(
        LOWER(name) LIKE $${index}
        OR LOWER(muscle_group) LIKE $${index}
        OR LOWER(COALESCE(primary_muscle, '')) LIKE $${index}
        OR LOWER(COALESCE(secondary_muscles, '')) LIKE $${index}
        OR LOWER(COALESCE(equipment, '')) LIKE $${index}
      )`);
    }

    if (muscle) {
      params.push(muscle);
      const index = params.length;
      where.push(`LOWER(COALESCE(primary_muscle, muscle_group)) = $${index}`);
    }

    if (environment) {
      params.push(environment);
      const index = params.length;
      where.push(`LOWER(COALESCE(training_environment, 'gym')) = $${index}`);
    }

    if (equipment) {
      params.push(`%${equipment}%`);
      const index = params.length;
      where.push(`LOWER(COALESCE(equipment, '')) LIKE $${index}`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    params.push(limit);
    const limitIndex = params.length;
    params.push(offset);
    const offsetIndex = params.length;

    const result = await pool.query(
      `SELECT id, name, muscle_group, primary_muscle, secondary_muscles, equipment, training_environment, difficulty_level, image_url, video_url, default_sets, default_reps, default_rest_seconds, notes
       FROM exercise_library
       ${whereSql}
       ORDER BY name ASC
       LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      params
    );

    const totalParams = params.slice(0, Math.max(0, params.length - 2));
    const totalResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM exercise_library
       ${whereSql}`,
      totalParams
    );

    res.json({
      exercises: result.rows,
      paging: {
        limit,
        offset,
        total: totalResult.rows[0]?.total || 0,
        hasMore: offset + result.rows.length < (totalResult.rows[0]?.total || 0),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch exercise library' });
  }
});

router.get('/library/meta', authMiddleware, async (_req, res) => {
  try {
    const [muscles, environments, equipments] = await Promise.all([
      pool.query(
        `SELECT DISTINCT COALESCE(primary_muscle, muscle_group) AS value
         FROM exercise_library
         ORDER BY value ASC`
      ),
      pool.query(
        `SELECT DISTINCT COALESCE(training_environment, 'gym') AS value
         FROM exercise_library
         ORDER BY value ASC`
      ),
      pool.query(
        `SELECT DISTINCT equipment AS value
         FROM exercise_library
         WHERE equipment IS NOT NULL AND equipment <> ''
         ORDER BY value ASC`
      ),
    ]);

    res.json({
      muscles: muscles.rows.map((row) => row.value).filter(Boolean),
      environments: environments.rows.map((row) => row.value).filter(Boolean),
      equipments: equipments.rows.map((row) => row.value).filter(Boolean),
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch library metadata' });
  }
});

router.get('/:routineId', authMiddleware, async (req, res) => {
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

    const result = await pool.query(
      `SELECT * FROM exercises WHERE routine_id = $1 ORDER BY order_index ASC, created_at ASC`,
      [routineId]
    );

    res.json({ exercises: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch exercises' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { routineId, name, muscleGroup, sets, reps, restSeconds, notes, orderIndex } = req.body;

    if (!routineId || !name || !muscleGroup) {
      return res.status(400).json({ error: 'routineId, name and muscleGroup are required' });
    }

    const owner = await pool.query(`SELECT id FROM routines WHERE id = $1 AND user_id = $2`, [routineId, userId]);
    if (owner.rows.length === 0) {
      return res.status(403).json({ error: 'Only owner can add exercises' });
    }

    const result = await pool.query(
      `INSERT INTO exercises (routine_id, name, muscle_group, sets, reps, rest_seconds, notes, order_index)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 999))
       RETURNING *`,
      [routineId, name, muscleGroup, sets || 3, reps || 8, restSeconds || 90, notes || null, orderIndex || null]
    );

    res.status(201).json({ exercise: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add exercise' });
  }
});

router.post('/library', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const {
      name,
      muscleGroup,
      primaryMuscle,
      secondaryMuscles,
      equipment,
      trainingEnvironment,
      difficultyLevel,
      imageUrl,
      videoUrl,
      defaultSets,
      defaultReps,
      defaultRestSeconds,
      notes,
    } = req.body;

    const safeName = typeof name === 'string' ? name.trim().slice(0, 100) : '';
    const safeMuscleGroup = typeof muscleGroup === 'string' ? muscleGroup.trim().slice(0, 50) : '';

    if (!safeName || !safeMuscleGroup) {
      return res.status(400).json({ error: 'name and muscleGroup are required' });
    }

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const normalizedEnvironment = typeof trainingEnvironment === 'string' ? trainingEnvironment.trim().toLowerCase().slice(0, 20) : 'gym';
    const normalizedDifficulty = typeof difficultyLevel === 'string' ? difficultyLevel.trim().toLowerCase().slice(0, 20) : 'intermediate';

    const result = await pool.query(
      `INSERT INTO exercise_library (name, muscle_group, primary_muscle, secondary_muscles, equipment, training_environment, difficulty_level, image_url, video_url, default_sets, default_reps, default_rest_seconds, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (name) DO UPDATE
       SET muscle_group = EXCLUDED.muscle_group,
           primary_muscle = EXCLUDED.primary_muscle,
           secondary_muscles = EXCLUDED.secondary_muscles,
           equipment = EXCLUDED.equipment,
           training_environment = EXCLUDED.training_environment,
           difficulty_level = EXCLUDED.difficulty_level,
           image_url = EXCLUDED.image_url,
           video_url = EXCLUDED.video_url,
           default_sets = EXCLUDED.default_sets,
           default_reps = EXCLUDED.default_reps,
           default_rest_seconds = EXCLUDED.default_rest_seconds,
           notes = EXCLUDED.notes,
           updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        safeName,
        safeMuscleGroup,
        typeof primaryMuscle === 'string' ? primaryMuscle.trim().slice(0, 50) : safeMuscleGroup,
        typeof secondaryMuscles === 'string' ? secondaryMuscles.trim().slice(0, 160) : null,
        typeof equipment === 'string' ? equipment.trim().slice(0, 50) : null,
        normalizedEnvironment,
        normalizedDifficulty,
        typeof imageUrl === 'string' ? imageUrl.trim().slice(0, 255) : null,
        typeof videoUrl === 'string' ? videoUrl.trim().slice(0, 255) : null,
        Number(defaultSets) || 3,
        Number(defaultReps) || 8,
        Number(defaultRestSeconds) || 90,
        typeof notes === 'string' ? notes.trim().slice(0, 240) : null,
      ]
    );

    res.status(201).json({ exercise: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save exercise library item' });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const exerciseId = req.params.id;
    const { name, muscleGroup, sets, reps, restSeconds, notes, orderIndex } = req.body;

    const owner = await pool.query(
      `SELECT e.id
       FROM exercises e
       JOIN routines r ON r.id = e.routine_id
       WHERE e.id = $1 AND r.user_id = $2`,
      [exerciseId, userId]
    );

    if (owner.rows.length === 0) {
      return res.status(403).json({ error: 'Only owner can update exercise' });
    }

    const result = await pool.query(
      `UPDATE exercises
       SET name = $1, muscle_group = $2, sets = $3, reps = $4,
           rest_seconds = $5, notes = $6, order_index = $7
       WHERE id = $8
       RETURNING *`,
      [name, muscleGroup, sets, reps, restSeconds, notes || null, orderIndex || null, exerciseId]
    );

    res.json({ exercise: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update exercise' });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const exerciseId = req.params.id;

    const result = await pool.query(
      `DELETE FROM exercises e
       USING routines r
       WHERE e.routine_id = r.id
         AND e.id = $1
         AND r.user_id = $2
       RETURNING e.id`,
      [exerciseId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Exercise not found or no permission' });
    }

    res.json({ message: 'Exercise deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete exercise' });
  }
});

export default router;
