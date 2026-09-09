import express from 'express';
import { authMiddleware, currentUserId } from '../middleware/auth.js';
import { pool } from '../database/connection.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/httpError.js';
import { parse, uuidSchema } from '../utils/validation.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/', async (req, res) => {
  const userId = currentUserId(req);

  const result = await pool.query(
    `SELECT f.id, f.user_id_1, f.user_id_2, f.status, f.created_at,
            CASE WHEN f.user_id_1 = $1 THEN u2.id ELSE u1.id END AS friend_id,
            CASE WHEN f.user_id_1 = $1 THEN u2.username ELSE u1.username END AS friend_username,
            CASE WHEN f.user_id_1 = $1 THEN u2.profile_image_url ELSE u1.profile_image_url END AS friend_image_url,
            CASE WHEN f.requested_by = $1 THEN 'outgoing' ELSE 'incoming' END AS direction
     FROM friendships f
     JOIN users u1 ON u1.id = f.user_id_1
     JOIN users u2 ON u2.id = f.user_id_2
     WHERE f.user_id_1 = $1 OR f.user_id_2 = $1
     ORDER BY (f.status = 'pending') DESC, f.created_at DESC`,
    [userId]
  );

  res.json({ friendships: result.rows });
});

router.post('/:userId/request', async (req, res) => {
  const currentUser = currentUserId(req);
  const otherUserId = parse(uuidSchema, req.params.userId);

  if (currentUser === otherUserId) {
    throw badRequest('No puedes agregarte a ti mismo');
  }

  const userExists = await pool.query('SELECT id FROM users WHERE id = $1', [otherUserId]);
  if (userExists.rows.length === 0) {
    throw notFound('Usuario no encontrado');
  }

  // La tabla exige user_id_1 < user_id_2; el orden lo decide Postgres con
  // LEAST/GREATEST para que coincida con su propia comparación de UUID.
  const result = await pool.query(
    `INSERT INTO friendships (user_id_1, user_id_2, status, requested_by)
     VALUES (LEAST($1::uuid, $2::uuid), GREATEST($1::uuid, $2::uuid), 'pending', $1)
     ON CONFLICT (user_id_1, user_id_2) DO NOTHING
     RETURNING *`,
    [currentUser, otherUserId]
  );

  if (result.rows.length === 0) {
    const existing = await pool.query(
      `SELECT status FROM friendships
       WHERE user_id_1 = LEAST($1::uuid, $2::uuid) AND user_id_2 = GREATEST($1::uuid, $2::uuid)`,
      [currentUser, otherUserId]
    );
    const status = existing.rows[0]?.status;
    throw conflict(status === 'accepted' ? 'Ya sois amigos' : 'Ya existe una solicitud entre vosotros');
  }

  res.status(201).json({ friendship: result.rows[0] });
});

router.put('/:requestId/accept', async (req, res) => {
  const userId = currentUserId(req);
  const requestId = parse(uuidSchema, req.params.requestId);

  const request = await pool.query('SELECT * FROM friendships WHERE id = $1', [requestId]);
  if (request.rows.length === 0) {
    throw notFound('Solicitud no encontrada');
  }

  const row = request.rows[0];

  if (row.user_id_1 !== userId && row.user_id_2 !== userId) {
    throw forbidden('Esta solicitud no es tuya');
  }

  // requested_by NULL = fila antigua sin ese dato; se permite aceptar a cualquiera
  // de las dos partes. Si está definido, sólo puede aceptar quien la recibió.
  if (row.requested_by && row.requested_by === userId) {
    throw forbidden('Solo quien recibe la solicitud puede aceptarla');
  }

  if (row.status !== 'pending') {
    throw conflict(row.status === 'accepted' ? 'Ya sois amigos' : `La solicitud ya está ${row.status}`);
  }

  await pool.query(`UPDATE friendships SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [
    requestId,
  ]);

  res.json({ message: 'Solicitud de amistad aceptada' });
});

router.put('/:requestId/reject', async (req, res) => {
  const userId = currentUserId(req);
  const requestId = parse(uuidSchema, req.params.requestId);

  const deleted = await pool.query(
    `DELETE FROM friendships
     WHERE id = $1 AND (user_id_1 = $2 OR user_id_2 = $2) AND status = 'pending'
     RETURNING id`,
    [requestId, userId]
  );

  if (deleted.rows.length === 0) {
    throw notFound('Solicitud pendiente no encontrada');
  }

  res.json({ message: 'Solicitud rechazada' });
});

router.delete('/:userId', async (req, res) => {
  const currentUser = currentUserId(req);
  const otherUserId = parse(uuidSchema, req.params.userId);

  const result = await pool.query(
    `DELETE FROM friendships
     WHERE user_id_1 = LEAST($1::uuid, $2::uuid) AND user_id_2 = GREATEST($1::uuid, $2::uuid)
     RETURNING id`,
    [currentUser, otherUserId]
  );

  if (result.rows.length === 0) {
    throw notFound('No existe esa amistad');
  }

  res.json({ message: 'Amigo eliminado' });
});

export default router;
