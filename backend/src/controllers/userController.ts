import { Request, Response } from 'express';
import { pool } from '../database/connection.js';

const MAX_TEXT_LENGTH = 240;

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

export async function getProfile(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await pool.query(
      `SELECT id, username, email, first_name, last_name, favorite_muscle, 
              profile_image_url, bio, created_at, updated_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    
    // Get user's routines and groups
    const routines = await pool.query(
  `SELECT r.id, r.name, r.description,
          (SELECT COUNT(*)::int FROM exercises e WHERE e.routine_id = r.id) AS exercises_count
   FROM routines r
   WHERE r.user_id = $1 AND r.is_public = true
   ORDER BY r.created_at DESC`,
  [userId]
);

    const groups = await pool.query(
      `SELECT g.id, g.name, g.description, g.group_image_url, g.routine_id, r.name AS routine_name, g.creator_id, u.username AS creator_username
       FROM groups g 
       JOIN group_members gm ON g.id = gm.group_id 
       LEFT JOIN routines r ON r.id = g.routine_id
       JOIN users u ON u.id = g.creator_id
       WHERE gm.user_id = $1`,
      [userId]
    );

    const photos = await pool.query(
      `SELECT id, image_url, caption, taken_at, created_at
       FROM user_progress_photos
       WHERE user_id = $1
       ORDER BY COALESCE(taken_at, CURRENT_DATE) DESC, created_at DESC
       LIMIT 80`,
      [userId]
    );

    const followCounts = await pool.query(
      `SELECT
          (SELECT COUNT(*)::int FROM user_follows WHERE following_user_id = $1) AS followers_count,
          (SELECT COUNT(*)::int FROM user_follows WHERE follower_user_id = $1) AS following_count`,
      [userId]
    );

    const completedTrainings = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM training_sessions
       WHERE user_id = $1`,
      [userId]
    );

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
        followersCount: followCounts.rows[0]?.followers_count || 0,
        followingCount: followCounts.rows[0]?.following_count || 0,
      },
      stats: {
        completedTrainings: completedTrainings.rows[0]?.total || 0,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get profile' });
  }
}

export async function updateProfile(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    const { firstName, lastName, favoriteMuscle, bio, profileImageUrl } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const safeFirstName = typeof firstName === 'string' ? firstName.trim().slice(0, 100) : null;
    const safeLastName = typeof lastName === 'string' ? lastName.trim().slice(0, 100) : null;
    const safeMuscle = typeof favoriteMuscle === 'string' ? favoriteMuscle.trim().slice(0, 50) : null;
    const safeBio = typeof bio === 'string' ? bio.trim().slice(0, MAX_TEXT_LENGTH) : null;
    const safeProfileImageUrl = normalizeOptionalUrl(profileImageUrl);

    await pool.query(
      `UPDATE users 
       SET first_name = $1, last_name = $2, favorite_muscle = $3, 
           bio = $4, profile_image_url = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6`,
      [safeFirstName, safeLastName, safeMuscle, safeBio, safeProfileImageUrl, userId]
    );

    res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
}

export async function getUserById(req: Request, res: Response) {
  try {
    const viewerId = req.user?.userId;
    const { userId } = req.params;

    const result = await pool.query(
      `SELECT id, username, first_name, last_name, favorite_muscle, 
              profile_image_url, bio, created_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const routines = await pool.query(
  `SELECT r.id, r.name, r.description,
          (SELECT COUNT(*)::int FROM exercises e WHERE e.routine_id = r.id) AS exercises_count
   FROM routines r
   WHERE r.user_id = $1 AND r.is_public = true
   ORDER BY r.created_at DESC`,
  [userId]
);

    const groups = await pool.query(
      `SELECT DISTINCT g.id, g.name, g.description, g.group_image_url,
              (SELECT COUNT(*)::int FROM group_members gm2 WHERE gm2.group_id = g.id) AS members_count
       FROM groups g
       LEFT JOIN group_members gm ON gm.group_id = g.id
       WHERE g.creator_id = $1 OR gm.user_id = $1
       ORDER BY g.created_at DESC`,
      [userId]
    );

    const photos = await pool.query(
      `SELECT id, image_url, caption, taken_at, created_at
       FROM user_progress_photos
       WHERE user_id = $1
       ORDER BY COALESCE(taken_at, CURRENT_DATE) DESC, created_at DESC
       LIMIT 80`,
      [userId]
    );

    const followCounts = await pool.query(
      `SELECT
          (SELECT COUNT(*)::int FROM user_follows WHERE following_user_id = $1) AS followers_count,
          (SELECT COUNT(*)::int FROM user_follows WHERE follower_user_id = $1) AS following_count`,
      [userId]
    );

    let isFollowing = false;
    if (viewerId && viewerId !== userId) {
      const followCheck = await pool.query(
        `SELECT 1 FROM user_follows WHERE follower_user_id = $1 AND following_user_id = $2 LIMIT 1`,
        [viewerId, userId]
      );
      isFollowing = followCheck.rows.length > 0;
    }

    res.json({
      user: result.rows[0],
      routines: routines.rows,
      groups: groups.rows,
      photos: photos.rows,
      social: {
        isSelf: viewerId === userId,
        isFollowing,
        followersCount: followCounts.rows[0]?.followers_count || 0,
        followingCount: followCounts.rows[0]?.following_count || 0,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get user' });
  }
}

export async function searchUsers(req: Request, res: Response) {
  try {
    const q = String(req.query.q || '').trim();

    if (q.length < 2) {
      return res.status(400).json({ error: 'Query must have at least 2 characters' });
    }

    const result = await pool.query(
      `SELECT id, username, first_name, last_name
       FROM users
       WHERE username ILIKE $1
       ORDER BY username ASC
       LIMIT 20`,
      [`%${q}%`]
    );

    res.json({ users: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to search users' });
  }
}

export async function followUser(req: Request, res: Response) {
  try {
    const followerUserId = req.user?.userId;
    const followingUserId = req.params.userId;

    if (!followerUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (followerUserId === followingUserId) {
      return res.status(400).json({ error: 'You cannot follow yourself' });
    }

    await pool.query(
      `INSERT INTO user_follows (follower_user_id, following_user_id)
       VALUES ($1, $2)
       ON CONFLICT (follower_user_id, following_user_id) DO NOTHING`,
      [followerUserId, followingUserId]
    );

    res.json({ message: 'Now following user' });
  } catch {
    res.status(500).json({ error: 'Failed to follow user' });
  }
}

export async function unfollowUser(req: Request, res: Response) {
  try {
    const followerUserId = req.user?.userId;
    const followingUserId = req.params.userId;

    if (!followerUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    await pool.query(
      `DELETE FROM user_follows WHERE follower_user_id = $1 AND following_user_id = $2`,
      [followerUserId, followingUserId]
    );

    res.json({ message: 'Unfollowed user' });
  } catch {
    res.status(500).json({ error: 'Failed to unfollow user' });
  }
}

export async function addProgressPhoto(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    const { imageUrl, caption, takenAt } = req.body;
    const safeImageUrl = normalizeOptionalUrl(imageUrl);
    const safeCaption = typeof caption === 'string' ? caption.trim().slice(0, 180) : null;
    const safeTakenAt = typeof takenAt === 'string' && takenAt.trim() ? takenAt : null;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!safeImageUrl) {
      return res.status(400).json({ error: 'A valid image URL is required' });
    }

    const created = await pool.query(
      `INSERT INTO user_progress_photos (user_id, image_url, caption, taken_at)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, safeImageUrl, safeCaption, safeTakenAt]
    );

    res.status(201).json({ photo: created.rows[0] });
  } catch {
    res.status(500).json({ error: 'Failed to add progress photo' });
  }
}

export async function deleteProgressPhoto(req: Request, res: Response) {
  try {
    const userId = req.user?.userId;
    const photoId = req.params.photoId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const deleted = await pool.query(
      `DELETE FROM user_progress_photos
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [photoId, userId]
    );

    if (deleted.rows.length === 0) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    res.json({ message: 'Photo deleted' });
  } catch {
    res.status(500).json({ error: 'Failed to delete progress photo' });
  }
}
