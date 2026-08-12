import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../database/connection.js';

const normalizeOptionalUrl = (value: unknown) => {
  if (typeof value !== 'string' || value.trim() === '') return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
};

const router = express.Router();

router.get('/competitions/my/list', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const result = await pool.query(
      `SELECT gc.*, g1.name AS group_1_name, g2.name AS group_2_name
       FROM group_competitions gc
       JOIN groups g1 ON g1.id = gc.group_id_1
       JOIN groups g2 ON g2.id = gc.group_id_2
       WHERE gc.group_id_1 IN (SELECT group_id FROM group_members WHERE user_id = $1)
          OR gc.group_id_2 IN (SELECT group_id FROM group_members WHERE user_id = $1)
       ORDER BY gc.created_at DESC`,
      [userId]
    );

    res.json({ competitions: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch competitions' });
  }
});

router.get('/competitions/:competitionId/score', authMiddleware, async (req, res) => {
  try {
    const competitionId = req.params.competitionId;

    const competition = await pool.query(`SELECT * FROM group_competitions WHERE id = $1`, [competitionId]);
    if (competition.rows.length === 0) {
      return res.status(404).json({ error: 'Competition not found' });
    }

    const c = competition.rows[0];

    const score = await pool.query(
      `WITH comp_users AS (
          SELECT $1::uuid AS group_id, gm.user_id FROM group_members gm WHERE gm.group_id = $1
          UNION ALL
          SELECT $2::uuid AS group_id, gm.user_id FROM group_members gm WHERE gm.group_id = $2
       )
       SELECT cu.group_id,
              COALESCE(SUM(ts.total_volume), 0) AS total_volume
       FROM comp_users cu
       LEFT JOIN training_sessions ts ON ts.user_id = cu.user_id
       WHERE ($3::date IS NULL OR ts.date >= $3::date)
         AND ($4::date IS NULL OR ts.date <= $4::date)
       GROUP BY cu.group_id`,
      [c.group_id_1, c.group_id_2, c.start_date, c.end_date]
    );

    res.json({ competition: c, score: score.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch competition score' });
  }
});

router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const result = await pool.query(
      `SELECT g.*, r.name AS routine_name, u.username AS creator_username,
              (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) AS members_count
       FROM groups g
       LEFT JOIN routines r ON r.id = g.routine_id
       JOIN group_members gm ON gm.group_id = g.id
       JOIN users u ON u.id = g.creator_id
       WHERE gm.user_id = $1
       ORDER BY g.created_at DESC`,
      [userId]
    );

    res.json({ groups: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { name, description, routineId, groupImageUrl } = req.body;

    const safeName = typeof name === 'string' ? name.trim().slice(0, 100) : '';
    const safeDescription = typeof description === 'string' ? description.trim().slice(0, 240) : null;
    const safeGroupImageUrl = normalizeOptionalUrl(groupImageUrl);

    if (!safeName) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const group = await pool.query(
      `INSERT INTO groups (name, description, group_image_url, routine_id, creator_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [safeName, safeDescription, safeGroupImageUrl, routineId || null, userId]
    );

    await pool.query(
      `INSERT INTO group_members (group_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (group_id, user_id) DO NOTHING`,
      [group.rows[0].id, userId]
    );

    res.status(201).json({ group: group.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create group' });
  }
});

router.post('/:groupId/invite', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const groupId = req.params.groupId;
    const { friendUserId } = req.body;

    if (!friendUserId) {
      return res.status(400).json({ error: 'friendUserId is required' });
    }

    const member = await pool.query(
      `SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId]
    );
    if (member.rows.length === 0) {
      return res.status(403).json({ error: 'Only group members can invite' });
    }

    const relation = await pool.query(
      `SELECT id, status FROM friendships
       WHERE user_id_1 = LEAST($1::uuid, $2::uuid)
         AND user_id_2 = GREATEST($1::uuid, $2::uuid)
       LIMIT 1`,
      [userId, friendUserId]
    );

    if (relation.rows.length === 0 || relation.rows[0].status !== 'accepted') {
      return res.status(400).json({ error: 'You can only invite accepted friends' });
    }

    await pool.query(
      `INSERT INTO group_members (group_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (group_id, user_id) DO NOTHING`,
      [groupId, friendUserId]
    );

    res.json({ message: 'Member added to group' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to invite member' });
  }
});

// Solicitar unirse: crea/reactiva una solicitud pendiente. NO une directamente.
router.post('/:groupId/request-join', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const groupId = req.params.groupId;

    const group = await pool.query(`SELECT id FROM groups WHERE id = $1`, [groupId]);
    if (group.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const alreadyMember = await pool.query(
      `SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId]
    );
    if (alreadyMember.rows.length > 0) {
      return res.status(409).json({ error: 'You are already a member of this group' });
    }

    const existing = await pool.query(
      `SELECT id, status FROM group_join_requests WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId]
    );

    if (existing.rows.length > 0) {
      if (existing.rows[0].status === 'pending') {
        return res.status(409).json({ error: 'You already have a pending request for this group' });
      }
      // Ya existía (rechazada antes) → se reactiva como pending
      await pool.query(
        `UPDATE group_join_requests SET status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [existing.rows[0].id]
      );
      return res.status(201).json({ message: 'Join request sent' });
    }

    await pool.query(
      `INSERT INTO group_join_requests (group_id, user_id, status) VALUES ($1, $2, 'pending')`,
      [groupId, userId]
    );

    res.status(201).json({ message: 'Join request sent' });
  } catch {
    res.status(500).json({ error: 'Failed to process join request' });
  }
});

// Solo el creador del grupo ve las solicitudes pendientes
router.get('/:groupId/join-requests', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const groupId = req.params.groupId;

    const group = await pool.query(`SELECT creator_id FROM groups WHERE id = $1`, [groupId]);
    if (group.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    if (group.rows[0].creator_id !== userId) {
      return res.status(403).json({ error: 'Only the group creator can view join requests' });
    }

    const result = await pool.query(
      `SELECT gjr.id, gjr.user_id, gjr.status, gjr.created_at, u.username
       FROM group_join_requests gjr
       JOIN users u ON u.id = gjr.user_id
       WHERE gjr.group_id = $1 AND gjr.status = 'pending'
       ORDER BY gjr.created_at ASC`,
      [groupId]
    );

    res.json({ requests: result.rows });
  } catch {
    res.status(500).json({ error: 'Failed to fetch join requests' });
  }
});

// Solo el creador acepta/rechaza
router.put('/:groupId/join-requests/:requestId', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { groupId, requestId } = req.params;
    const { action } = req.body as { action: 'accepted' | 'rejected' };

    if (!action || !['accepted', 'rejected'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const group = await pool.query(`SELECT creator_id FROM groups WHERE id = $1`, [groupId]);
    if (group.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    if (group.rows[0].creator_id !== userId) {
      return res.status(403).json({ error: 'Only the group creator can respond to join requests' });
    }

    const request = await pool.query(
      `SELECT * FROM group_join_requests WHERE id = $1 AND group_id = $2`,
      [requestId, groupId]
    );
    if (request.rows.length === 0) {
      return res.status(404).json({ error: 'Join request not found' });
    }
    if (request.rows[0].status !== 'pending') {
      return res.status(409).json({ error: `Request already ${request.rows[0].status}` });
    }

    await pool.query(
      `UPDATE group_join_requests SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [action, requestId]
    );

    if (action === 'accepted') {
      await pool.query(
        `INSERT INTO group_members (group_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (group_id, user_id) DO NOTHING`,
        [groupId, request.rows[0].user_id]
      );
    }

    res.json({ message: `Join request ${action}` });
  } catch {
    res.status(500).json({ error: 'Failed to respond to join request' });
  }
});

// Búsqueda ligera por ID: no exige ser miembro, solo confirma que el grupo existe
router.get('/:groupId/lookup', authMiddleware, async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const result = await pool.query(
      `SELECT g.id, g.name,
              (SELECT COUNT(*)::int FROM group_members gm WHERE gm.group_id = g.id) AS members_count
       FROM groups g
       WHERE g.id = $1`,
      [groupId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    res.json({ group: result.rows[0] });
  } catch {
    res.status(500).json({ error: 'Failed to look up group' });
  }
});

router.post('/:groupId/competitions', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const groupId = req.params.groupId;
    const { rivalGroupId, name, startDate, endDate } = req.body;

    if (!rivalGroupId || !name) {
      return res.status(400).json({ error: 'rivalGroupId and name are required' });
    }

    const membership = await pool.query(
      `SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId]
    );
    if (membership.rows.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    const comp = await pool.query(
      `INSERT INTO group_competitions (name, group_id_1, group_id_2, start_date, end_date, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       RETURNING *`,
      [name, groupId, rivalGroupId, startDate || null, endDate || null]
    );

    res.status(201).json({ competition: comp.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create competition' });
  }
});

router.get('/:groupId', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const groupId = req.params.groupId;

    const membership = await pool.query(
      `SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId]
    );

    if (membership.rows.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    const group = await pool.query(`SELECT * FROM groups WHERE id = $1`, [groupId]);
    const members = await pool.query(
      `SELECT gm.user_id, u.username, gm.joined_at
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = $1
       ORDER BY gm.joined_at ASC`,
      [groupId]
    );

    const routine = group.rows[0]?.routine_id
      ? await pool.query(`SELECT id, name FROM routines WHERE id = $1`, [group.rows[0].routine_id])
      : { rows: [] };

    res.json({
      group: {
        ...group.rows[0],
        routine_name: routine.rows[0]?.name || null,
      },
      members: members.rows,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch group' });
  }
});

export default router;