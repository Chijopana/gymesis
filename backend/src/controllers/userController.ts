import { Request, Response } from 'express';
import { pool } from '../database/connection.js';
import { currentUserId } from '../middleware/auth.js';
import { badRequest, notFound } from '../utils/httpError.js';
import { parse, progressPhotoSchema, updateProfileSchema, userSearchSchema, uuidSchema } from '../utils/validation.js';

const MAX_PHOTOS = 80;

export async function getProfile(req: Request, res: Response) {
  const userId = currentUserId(req);

  const result = await pool.query(
    `SELECT id, username, email, first_name, last_name, favorite_muscle,
            profile_image_url, bio, created_at, updated_at
     FROM users WHERE id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    throw notFound('Usuario no encontrado');
  }

  const user = result.rows[0];

  const [routines, groups, photos, followCounts, stats] = await Promise.all([
    // En tu propio perfil se listan todas tus rutinas, no sólo las públicas:
    // filtrar por is_public aquí hacía que tus rutinas privadas no aparecieran
    // nunca en "Rutinas activas".
    pool.query(
      `SELECT r.id, r.name, r.description, r.is_public,
              (SELECT COUNT(*)::int FROM exercises e WHERE e.routine_id = r.id) AS exercises_count
       FROM routines r
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [userId]
    ),
    pool.query(
      `SELECT g.id, g.name, g.description, g.group_image_url, g.routine_id,
              r.name AS routine_name, g.creator_id, u.username AS creator_username,
              (SELECT COUNT(*)::int FROM group_members gm2 WHERE gm2.group_id = g.id) AS members_count
       FROM groups g
       JOIN group_members gm ON g.id = gm.group_id
       LEFT JOIN routines r ON r.id = g.routine_id
       JOIN users u ON u.id = g.creator_id
       WHERE gm.user_id = $1
       ORDER BY g.created_at DESC`,
      [userId]
    ),
    pool.query(
      `SELECT id, image_url, caption, taken_at, created_at
       FROM user_progress_photos
       WHERE user_id = $1
       ORDER BY COALESCE(taken_at, created_at::date) DESC, created_at DESC
       LIMIT ${MAX_PHOTOS}`,
      [userId]
    ),
    pool.query(
      `SELECT
          (SELECT COUNT(*)::int FROM user_follows WHERE following_user_id = $1) AS followers_count,
          (SELECT COUNT(*)::int FROM user_follows WHERE follower_user_id = $1) AS following_count`,
      [userId]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total_logs,
              COUNT(DISTINCT date)::int AS training_days,
              COALESCE(SUM(total_volume), 0)::float AS total_volume
       FROM training_sessions
       WHERE user_id = $1`,
      [userId]
    ),
  ]);

  res.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      favoriteMuscle: user.favorite_muscle,
      profileImageUrl: user.profile_image_url,
      bio: user.bio,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    },
    routines: routines.rows,
    groups: groups.rows,
    photos: photos.rows,
    social: {
      followersCount: followCounts.rows[0]?.followers_count ?? 0,
      followingCount: followCounts.rows[0]?.following_count ?? 0,
    },
    stats: {
      completedTrainings: stats.rows[0]?.total_logs ?? 0,
      trainingDays: stats.rows[0]?.training_days ?? 0,
      totalVolumeKg: stats.rows[0]?.total_volume ?? 0,
    },
  });
}

export async function updateProfile(req: Request, res: Response) {
  const userId = currentUserId(req);
  const data = parse(updateProfileSchema, req.body);

  const updated = await pool.query(
    `UPDATE users
     SET first_name = $1, last_name = $2, favorite_muscle = $3,
         bio = $4, profile_image_url = $5, updated_at = CURRENT_TIMESTAMP
     WHERE id = $6
     RETURNING id, username, email, first_name, last_name, favorite_muscle, profile_image_url, bio`,
    [data.firstName, data.lastName, data.favoriteMuscle, data.bio, data.profileImageUrl, userId]
  );

  if (updated.rows.length === 0) {
    throw notFound('Usuario no encontrado');
  }

  const user = updated.rows[0];
  res.json({
    message: 'Perfil actualizado correctamente',
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      favoriteMuscle: user.favorite_muscle,
      profileImageUrl: user.profile_image_url,
      bio: user.bio,
    },
  });
}

export async function getUserById(req: Request, res: Response) {
  const viewerId = currentUserId(req);
  const userId = parse(uuidSchema, req.params.userId);

  const result = await pool.query(
    `SELECT id, username, first_name, last_name, favorite_muscle,
            profile_image_url, bio, created_at
     FROM users WHERE id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    throw notFound('Usuario no encontrado');
  }

  const isSelf = viewerId === userId;

  const [routines, groups, photos, followCounts, followCheck, stats] = await Promise.all([
    // Perfil ajeno: sólo lo que su dueño marcó como público.
    pool.query(
      `SELECT r.id, r.name, r.description,
              (SELECT COUNT(*)::int FROM exercises e WHERE e.routine_id = r.id) AS exercises_count
       FROM routines r
       WHERE r.user_id = $1 AND (r.is_public = true OR $2::boolean)
       ORDER BY r.created_at DESC`,
      [userId, isSelf]
    ),
    pool.query(
      `SELECT g.id, g.name, g.description, g.group_image_url,
              (SELECT COUNT(*)::int FROM group_members gm2 WHERE gm2.group_id = g.id) AS members_count
       FROM groups g
       WHERE EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = g.id AND gm.user_id = $1)
       ORDER BY g.created_at DESC`,
      [userId]
    ),
    pool.query(
      `SELECT id, image_url, caption, taken_at, created_at
       FROM user_progress_photos
       WHERE user_id = $1
       ORDER BY COALESCE(taken_at, created_at::date) DESC, created_at DESC
       LIMIT ${MAX_PHOTOS}`,
      [userId]
    ),
    pool.query(
      `SELECT
          (SELECT COUNT(*)::int FROM user_follows WHERE following_user_id = $1) AS followers_count,
          (SELECT COUNT(*)::int FROM user_follows WHERE follower_user_id = $1) AS following_count`,
      [userId]
    ),
    isSelf
      ? Promise.resolve({ rows: [] as unknown[] })
      : pool.query('SELECT 1 FROM user_follows WHERE follower_user_id = $1 AND following_user_id = $2 LIMIT 1', [
          viewerId,
          userId,
        ]),
    pool.query(
      `SELECT COUNT(*)::int AS total_logs,
              COUNT(DISTINCT date)::int AS training_days,
              COALESCE(SUM(total_volume), 0)::float AS total_volume
       FROM training_sessions
       WHERE user_id = $1`,
      [userId]
    ),
  ]);

  const friendship = isSelf
    ? null
    : (
        await pool.query(
          `SELECT status, requested_by FROM friendships
           WHERE user_id_1 = LEAST($1::uuid, $2::uuid) AND user_id_2 = GREATEST($1::uuid, $2::uuid)
           LIMIT 1`,
          [viewerId, userId]
        )
      ).rows[0] ?? null;

  res.json({
    user: result.rows[0],
    routines: routines.rows,
    groups: groups.rows,
    photos: photos.rows,
    social: {
      isSelf,
      isFollowing: followCheck.rows.length > 0,
      followersCount: followCounts.rows[0]?.followers_count ?? 0,
      followingCount: followCounts.rows[0]?.following_count ?? 0,
      friendshipStatus: friendship?.status ?? 'none',
      friendRequestSentByMe: friendship ? friendship.requested_by === viewerId : false,
    },
    stats: {
      completedTrainings: stats.rows[0]?.total_logs ?? 0,
      trainingDays: stats.rows[0]?.training_days ?? 0,
      totalVolumeKg: stats.rows[0]?.total_volume ?? 0,
    },
  });
}

export async function searchUsers(req: Request, res: Response) {
  const viewerId = currentUserId(req);
  const { q, limit } = parse(userSearchSchema, req.query);

  // ESCAPE evita que un `%` o `_` escritos por el usuario actúen como comodines.
  const pattern = `%${q.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;

  const result = await pool.query(
    `SELECT u.id, u.username, u.first_name, u.last_name, u.profile_image_url,
            COALESCE(f.status, 'none') AS friendship_status,
            EXISTS (
              SELECT 1 FROM user_follows uf
              WHERE uf.follower_user_id = $2 AND uf.following_user_id = u.id
            ) AS is_following
     FROM users u
     LEFT JOIN friendships f
       ON f.user_id_1 = LEAST(u.id, $2::uuid) AND f.user_id_2 = GREATEST(u.id, $2::uuid)
     WHERE u.username ILIKE $1 ESCAPE '\\'
       AND u.id <> $2
     ORDER BY
       CASE WHEN LOWER(u.username) = LOWER($3) THEN 0 ELSE 1 END,
       LENGTH(u.username),
       u.username ASC
     LIMIT $4`,
    [pattern, viewerId, q, limit]
  );

  res.json({ users: result.rows });
}

export async function followUser(req: Request, res: Response) {
  const followerUserId = currentUserId(req);
  const followingUserId = parse(uuidSchema, req.params.userId);

  if (followerUserId === followingUserId) {
    throw badRequest('No puedes seguirte a ti mismo');
  }

  const target = await pool.query('SELECT id FROM users WHERE id = $1', [followingUserId]);
  if (target.rows.length === 0) {
    throw notFound('Usuario no encontrado');
  }

  await pool.query(
    `INSERT INTO user_follows (follower_user_id, following_user_id)
     VALUES ($1, $2)
     ON CONFLICT (follower_user_id, following_user_id) DO NOTHING`,
    [followerUserId, followingUserId]
  );

  res.json({ message: 'Ahora sigues a este usuario' });
}

export async function unfollowUser(req: Request, res: Response) {
  const followerUserId = currentUserId(req);
  const followingUserId = parse(uuidSchema, req.params.userId);

  await pool.query('DELETE FROM user_follows WHERE follower_user_id = $1 AND following_user_id = $2', [
    followerUserId,
    followingUserId,
  ]);

  res.json({ message: 'Has dejado de seguir a este usuario' });
}

export async function addProgressPhoto(req: Request, res: Response) {
  const userId = currentUserId(req);
  const { imageUrl, caption, takenAt } = parse(progressPhotoSchema, req.body);

  const created = await pool.query(
    `INSERT INTO user_progress_photos (user_id, image_url, caption, taken_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id, image_url, caption, taken_at, created_at`,
    [userId, imageUrl, caption, takenAt]
  );

  res.status(201).json({ photo: created.rows[0] });
}

export async function deleteProgressPhoto(req: Request, res: Response) {
  const userId = currentUserId(req);
  const photoId = parse(uuidSchema, req.params.photoId);

  const deleted = await pool.query(
    `DELETE FROM user_progress_photos
     WHERE id = $1 AND user_id = $2
     RETURNING id`,
    [photoId, userId]
  );

  if (deleted.rows.length === 0) {
    throw notFound('Foto no encontrada');
  }

  res.json({ message: 'Foto eliminada' });
}
