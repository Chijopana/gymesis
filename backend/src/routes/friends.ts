import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { pool } from '../database/connection.js';

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  const userId = req.user?.userId;
  pool
    .query(
      `SELECT f.id, f.user_id_1, f.user_id_2, f.status, f.created_at,
              CASE WHEN f.user_id_1 = $1 THEN u2.id ELSE u1.id END AS friend_id,
              CASE WHEN f.user_id_1 = $1 THEN u2.username ELSE u1.username END AS friend_username,
              CASE WHEN f.requested_by = $1 THEN 'outgoing' ELSE 'incoming' END AS direction
       FROM friendships f
       JOIN users u1 ON u1.id = f.user_id_1
       JOIN users u2 ON u2.id = f.user_id_2
       WHERE f.user_id_1 = $1 OR f.user_id_2 = $1
       ORDER BY f.created_at DESC`,
      [userId]
    )
    .then((result: any) => res.json({ friendships: result.rows }))
    .catch(() => res.status(500).json({ error: 'Failed to fetch friendships' }));
});

router.post('/:userId/request', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user?.userId;
    const otherUserId = req.params.userId;

    if (currentUserId === otherUserId) {
      return res.status(400).json({ error: 'You cannot add yourself' });
    }

    const userExists = await pool.query(`SELECT id FROM users WHERE id = $1`, [otherUserId]);
    if (userExists.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId1 = [currentUserId, otherUserId].sort()[0];
    const userId2 = [currentUserId, otherUserId].sort()[1];

    const existing = await pool.query(
      `SELECT id, status FROM friendships WHERE user_id_1 = $1 AND user_id_2 = $2`,
      [userId1, userId2]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: `Friendship already ${existing.rows[0].status}` });
    }

    const result = await pool.query(
      `INSERT INTO friendships (user_id_1, user_id_2, status, requested_by)
       VALUES ($1, $2, 'pending', $3)
       RETURNING *`,
      [userId1, userId2, currentUserId]
    );

    res.status(201).json({ friendship: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send friend request' });
  }
});

router.put('/:requestId/accept', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const requestId = req.params.requestId;

    const request = await pool.query(
      `SELECT * FROM friendships WHERE id = $1`,
      [requestId]
    );

    if (request.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const row = request.rows[0];

    const isParty = row.user_id_1 === userId || row.user_id_2 === userId;
    if (!isParty) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // requested_by NULL = fila legacy sin dato; se permite aceptar a cualquiera de las dos partes.
    // requested_by definido = solo quien NO la envió puede aceptarla.
    if (row.requested_by && row.requested_by === userId) {
      return res.status(403).json({ error: 'Only the receiver can accept the request' });
    }

    if (row.status !== 'pending') {
      return res.status(409).json({ error: `Friendship already ${row.status}` });
    }

    await pool.query(
      `UPDATE friendships
       SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [requestId]
    );

    res.json({ message: 'Friend request accepted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to accept request' });
  }
});

router.put('/:requestId/reject', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.userId;
    const requestId = req.params.requestId;

    const request = await pool.query(`SELECT * FROM friendships WHERE id = $1`, [requestId]);
    if (request.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const row = request.rows[0];
    if (row.user_id_1 !== userId && row.user_id_2 !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await pool.query(`DELETE FROM friendships WHERE id = $1`, [requestId]);
    res.json({ message: 'Friend request rejected' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject request' });
  }
});

router.delete('/:userId', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user?.userId;
    const otherUserId = req.params.userId;

    const userId1 = [currentUserId, otherUserId].sort()[0];
    const userId2 = [currentUserId, otherUserId].sort()[1];

    const result = await pool.query(
      `DELETE FROM friendships
       WHERE user_id_1 = $1 AND user_id_2 = $2
       RETURNING id`,
      [userId1, userId2]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Friendship not found' });
    }

    res.json({ message: 'Friend removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

export default router;