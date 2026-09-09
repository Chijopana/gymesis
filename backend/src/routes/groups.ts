import express from 'express';
import { authMiddleware, currentUserId } from '../middleware/auth.js';
import { pool } from '../database/connection.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/httpError.js';
import {
  competitionSchema,
  groupInviteSchema,
  groupSchema,
  joinRequestAnswerSchema,
  parse,
  uuidSchema,
} from '../utils/validation.js';

const router = express.Router();

router.use(authMiddleware);

async function assertMember(groupId: string, userId: string) {
  const member = await pool.query('SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2', [
    groupId,
    userId,
  ]);
  if (member.rows.length === 0) {
    throw forbidden('No eres miembro de este grupo');
  }
}

async function assertCreator(groupId: string, userId: string) {
  const group = await pool.query('SELECT creator_id FROM groups WHERE id = $1', [groupId]);
  if (group.rows.length === 0) {
    throw notFound('Grupo no encontrado');
  }
  if (group.rows[0].creator_id !== userId) {
    throw forbidden('Solo el creador del grupo puede hacer esto');
  }
}

// --- Competencias ------------------------------------------------------------
// Estas rutas van antes que `/:groupId` para que "competitions" no se lea como id.

router.get('/competitions/my/list', async (req, res) => {
  const userId = currentUserId(req);

  const result = await pool.query(
    `SELECT gc.*, g1.name AS group_1_name, g2.name AS group_2_name
     FROM group_competitions gc
     JOIN groups g1 ON g1.id = gc.group_id_1
     JOIN groups g2 ON g2.id = gc.group_id_2
     WHERE EXISTS (
       SELECT 1 FROM group_members gm
       WHERE gm.user_id = $1 AND gm.group_id IN (gc.group_id_1, gc.group_id_2)
     )
     ORDER BY gc.created_at DESC`,
    [userId]
  );

  res.json({ competitions: result.rows });
});

router.get('/competitions/:competitionId/score', async (req, res) => {
  const userId = currentUserId(req);
  const competitionId = parse(uuidSchema, req.params.competitionId);

  const competition = await pool.query('SELECT * FROM group_competitions WHERE id = $1', [competitionId]);
  if (competition.rows.length === 0) {
    throw notFound('Competencia no encontrada');
  }

  const c = competition.rows[0];

  // El marcador es privado a los dos grupos implicados.
  const isParticipant = await pool.query(
    'SELECT 1 FROM group_members WHERE user_id = $1 AND group_id IN ($2, $3) LIMIT 1',
    [userId, c.group_id_1, c.group_id_2]
  );
  if (isParticipant.rows.length === 0) {
    throw forbidden('Solo los miembros de los grupos en liza pueden ver el marcador');
  }

  /*
   * Las condiciones de fecha van en el ON del LEFT JOIN, no en el WHERE.
   * En el WHERE, un grupo sin sesiones registradas tenía ts.date = NULL, la
   * comparación daba NULL y la fila desaparecía: el grupo sin entrenos no
   * aparecía en el marcador en vez de aparecer con 0.
   */
  const score = await pool.query(
    `WITH comp_groups AS (
        SELECT $1::uuid AS group_id
        UNION ALL
        SELECT $2::uuid
     )
     SELECT cg.group_id,
            COALESCE(SUM(ts.total_volume), 0)::float AS total_volume,
            COUNT(DISTINCT gm.user_id)::int AS members_count,
            COUNT(ts.id)::int AS sessions
     FROM comp_groups cg
     LEFT JOIN group_members gm ON gm.group_id = cg.group_id
     LEFT JOIN training_sessions ts
       ON ts.user_id = gm.user_id
      AND ($3::date IS NULL OR ts.date >= $3::date)
      AND ($4::date IS NULL OR ts.date <= $4::date)
     GROUP BY cg.group_id
     ORDER BY total_volume DESC`,
    [c.group_id_1, c.group_id_2, c.start_date, c.end_date]
  );

  res.json({ competition: c, score: score.rows });
});

// --- Grupos ------------------------------------------------------------------

router.get('/', async (req, res) => {
  const userId = currentUserId(req);

  const result = await pool.query(
    `SELECT g.*, r.name AS routine_name, u.username AS creator_username,
            (g.creator_id = $1) AS is_creator,
            (SELECT COUNT(*)::int FROM group_members gm2 WHERE gm2.group_id = g.id) AS members_count,
            (SELECT COUNT(*)::int FROM group_join_requests gjr
             WHERE gjr.group_id = g.id AND gjr.status = 'pending') AS pending_requests_count
     FROM groups g
     LEFT JOIN routines r ON r.id = g.routine_id
     JOIN group_members gm ON gm.group_id = g.id
     JOIN users u ON u.id = g.creator_id
     WHERE gm.user_id = $1
     ORDER BY g.created_at DESC`,
    [userId]
  );

  res.json({ groups: result.rows });
});

router.post('/', async (req, res) => {
  const userId = currentUserId(req);
  const data = parse(groupSchema, req.body);

  // Solo se puede vincular una rutina a la que tengas acceso.
  if (data.routineId) {
    const routine = await pool.query(
      `SELECT id FROM routines
       WHERE id = $1
         AND (user_id = $2 OR EXISTS (
           SELECT 1 FROM routine_participants rp WHERE rp.routine_id = routines.id AND rp.user_id = $2
         ))`,
      [data.routineId, userId]
    );
    if (routine.rows.length === 0) {
      throw badRequest('No tienes acceso a esa rutina');
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const group = await client.query(
      `INSERT INTO groups (name, description, group_image_url, routine_id, creator_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.name, data.description, data.groupImageUrl, data.routineId, userId]
    );

    await client.query(
      `INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)
       ON CONFLICT (group_id, user_id) DO NOTHING`,
      [group.rows[0].id, userId]
    );
    await client.query('COMMIT');

    res.status(201).json({ group: { ...group.rows[0], members_count: 1, is_creator: true } });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

router.post('/:groupId/invite', async (req, res) => {
  const userId = currentUserId(req);
  const groupId = parse(uuidSchema, req.params.groupId);
  const { friendUserId } = parse(groupInviteSchema, req.body);

  await assertMember(groupId, userId);

  if (friendUserId === userId) {
    throw badRequest('Ya eres miembro de este grupo');
  }

  const relation = await pool.query(
    `SELECT status FROM friendships
     WHERE user_id_1 = LEAST($1::uuid, $2::uuid) AND user_id_2 = GREATEST($1::uuid, $2::uuid)
     LIMIT 1`,
    [userId, friendUserId]
  );

  if (relation.rows.length === 0 || relation.rows[0].status !== 'accepted') {
    throw badRequest('Solo puedes invitar a amigos aceptados');
  }

  const inserted = await pool.query(
    `INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)
     ON CONFLICT (group_id, user_id) DO NOTHING
     RETURNING id`,
    [groupId, friendUserId]
  );

  if (inserted.rows.length === 0) {
    throw conflict('Ese usuario ya pertenece al grupo');
  }

  // Si tenía una solicitud pendiente, la invitación la resuelve.
  await pool.query(
    `UPDATE group_join_requests SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
     WHERE group_id = $1 AND user_id = $2 AND status = 'pending'`,
    [groupId, friendUserId]
  );

  res.json({ message: 'Miembro añadido al grupo' });
});

/** Solicitar unirse: crea o reactiva una solicitud pendiente. No une directamente. */
router.post('/:groupId/request-join', async (req, res) => {
  const userId = currentUserId(req);
  const groupId = parse(uuidSchema, req.params.groupId);

  const group = await pool.query('SELECT id FROM groups WHERE id = $1', [groupId]);
  if (group.rows.length === 0) {
    throw notFound('Grupo no encontrado');
  }

  const alreadyMember = await pool.query('SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2', [
    groupId,
    userId,
  ]);
  if (alreadyMember.rows.length > 0) {
    throw conflict('Ya eres miembro de este grupo');
  }

  const result = await pool.query(
    `INSERT INTO group_join_requests (group_id, user_id, status)
     VALUES ($1, $2, 'pending')
     ON CONFLICT (group_id, user_id) DO UPDATE
       SET status = 'pending', updated_at = CURRENT_TIMESTAMP
       WHERE group_join_requests.status <> 'pending'
     RETURNING id`,
    [groupId, userId]
  );

  if (result.rows.length === 0) {
    throw conflict('Ya tienes una solicitud pendiente para este grupo');
  }

  res.status(201).json({ message: 'Solicitud enviada' });
});

router.get('/:groupId/join-requests', async (req, res) => {
  const userId = currentUserId(req);
  const groupId = parse(uuidSchema, req.params.groupId);

  await assertCreator(groupId, userId);

  const result = await pool.query(
    `SELECT gjr.id, gjr.user_id, gjr.status, gjr.created_at, u.username, u.profile_image_url
     FROM group_join_requests gjr
     JOIN users u ON u.id = gjr.user_id
     WHERE gjr.group_id = $1 AND gjr.status = 'pending'
     ORDER BY gjr.created_at ASC`,
    [groupId]
  );

  res.json({ requests: result.rows });
});

router.put('/:groupId/join-requests/:requestId', async (req, res) => {
  const userId = currentUserId(req);
  const groupId = parse(uuidSchema, req.params.groupId);
  const requestId = parse(uuidSchema, req.params.requestId);
  const { action } = parse(joinRequestAnswerSchema, req.body);

  await assertCreator(groupId, userId);

  const request = await pool.query('SELECT * FROM group_join_requests WHERE id = $1 AND group_id = $2', [
    requestId,
    groupId,
  ]);
  if (request.rows.length === 0) {
    throw notFound('Solicitud no encontrada');
  }
  if (request.rows[0].status !== 'pending') {
    throw conflict(`La solicitud ya está ${request.rows[0].status}`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE group_join_requests SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [
      action,
      requestId,
    ]);

    if (action === 'accepted') {
      await client.query(
        `INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)
         ON CONFLICT (group_id, user_id) DO NOTHING`,
        [groupId, request.rows[0].user_id]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  res.json({ message: action === 'accepted' ? 'Solicitud aceptada' : 'Solicitud rechazada' });
});

/** Búsqueda ligera por ID: sólo confirma que el grupo existe, no exige ser miembro. */
router.get('/:groupId/lookup', async (req, res) => {
  const userId = currentUserId(req);
  const groupId = parse(uuidSchema, req.params.groupId);

  const result = await pool.query(
    `SELECT g.id, g.name, g.description, g.group_image_url,
            (SELECT COUNT(*)::int FROM group_members gm WHERE gm.group_id = g.id) AS members_count,
            EXISTS (SELECT 1 FROM group_members gm2 WHERE gm2.group_id = g.id AND gm2.user_id = $2) AS is_member,
            EXISTS (
              SELECT 1 FROM group_join_requests gjr
              WHERE gjr.group_id = g.id AND gjr.user_id = $2 AND gjr.status = 'pending'
            ) AS has_pending_request
     FROM groups g
     WHERE g.id = $1`,
    [groupId, userId]
  );

  if (result.rows.length === 0) {
    throw notFound('Grupo no encontrado');
  }

  res.json({ group: result.rows[0] });
});

router.post('/:groupId/competitions', async (req, res) => {
  const userId = currentUserId(req);
  const groupId = parse(uuidSchema, req.params.groupId);
  const data = parse(competitionSchema, req.body);

  if (data.rivalGroupId === groupId) {
    throw badRequest('Un grupo no puede competir contra sí mismo');
  }

  await assertMember(groupId, userId);

  const rival = await pool.query('SELECT id FROM groups WHERE id = $1', [data.rivalGroupId]);
  if (rival.rows.length === 0) {
    throw notFound('El grupo rival no existe');
  }

  const duplicate = await pool.query(
    `SELECT id FROM group_competitions
     WHERE status = 'active'
       AND ((group_id_1 = $1 AND group_id_2 = $2) OR (group_id_1 = $2 AND group_id_2 = $1))`,
    [groupId, data.rivalGroupId]
  );
  if (duplicate.rows.length > 0) {
    throw conflict('Ya hay una competencia activa entre esos dos grupos');
  }

  const comp = await pool.query(
    `INSERT INTO group_competitions (name, group_id_1, group_id_2, start_date, end_date, status)
     VALUES ($1, $2, $3, $4, $5, 'active')
     RETURNING *`,
    [data.name, groupId, data.rivalGroupId, data.startDate, data.endDate]
  );

  res.status(201).json({ competition: comp.rows[0] });
});

router.get('/:groupId', async (req, res) => {
  const userId = currentUserId(req);
  const groupId = parse(uuidSchema, req.params.groupId);

  await assertMember(groupId, userId);

  const [group, members] = await Promise.all([
    pool.query(
      `SELECT g.*, r.name AS routine_name, u.username AS creator_username,
              (g.creator_id = $2) AS is_creator,
              (SELECT COUNT(*)::int FROM group_members gm WHERE gm.group_id = g.id) AS members_count
       FROM groups g
       LEFT JOIN routines r ON r.id = g.routine_id
       JOIN users u ON u.id = g.creator_id
       WHERE g.id = $1`,
      [groupId, userId]
    ),
    pool.query(
      `SELECT gm.user_id, u.username, u.profile_image_url, gm.joined_at,
              (gm.user_id = g.creator_id) AS is_creator,
              COALESCE((
                SELECT SUM(ts.total_volume) FROM training_sessions ts WHERE ts.user_id = gm.user_id
              ), 0)::float AS total_volume
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       JOIN groups g ON g.id = gm.group_id
       WHERE gm.group_id = $1
       ORDER BY total_volume DESC, gm.joined_at ASC`,
      [groupId]
    ),
  ]);

  res.json({ group: group.rows[0], members: members.rows });
});

router.delete('/:groupId/members/:userId', async (req, res) => {
  const actingUserId = currentUserId(req);
  const groupId = parse(uuidSchema, req.params.groupId);
  const targetUserId = parse(uuidSchema, req.params.userId);

  const group = await pool.query('SELECT creator_id FROM groups WHERE id = $1', [groupId]);
  if (group.rows.length === 0) {
    throw notFound('Grupo no encontrado');
  }

  const isCreator = group.rows[0].creator_id === actingUserId;
  const isSelf = targetUserId === actingUserId;

  if (!isCreator && !isSelf) {
    throw forbidden('Solo el creador puede expulsar a otros miembros');
  }
  if (isSelf && isCreator) {
    throw badRequest('El creador no puede abandonar su propio grupo. Elimínalo en su lugar.');
  }

  const removed = await pool.query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2 RETURNING id', [
    groupId,
    targetUserId,
  ]);

  if (removed.rows.length === 0) {
    throw notFound('Ese usuario no es miembro del grupo');
  }

  res.json({ message: isSelf ? 'Has salido del grupo' : 'Miembro expulsado' });
});

router.delete('/:groupId', async (req, res) => {
  const userId = currentUserId(req);
  const groupId = parse(uuidSchema, req.params.groupId);

  const deleted = await pool.query('DELETE FROM groups WHERE id = $1 AND creator_id = $2 RETURNING id', [
    groupId,
    userId,
  ]);

  if (deleted.rows.length === 0) {
    throw forbidden('Solo el creador puede eliminar el grupo');
  }

  res.json({ message: 'Grupo eliminado' });
});

export default router;
