import express from 'express';
import {
  addProgressPhoto,
  deleteProgressPhoto,
  followUser,
  getProfile,
  getUserById,
  searchUsers,
  unfollowUser,
  updateProfile,
} from '../controllers/userController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.use(authMiddleware);

// Las rutas literales van antes que `/:userId` para que "search" no se
// interprete como un identificador de usuario.
router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.post('/profile/photos', addProgressPhoto);
router.delete('/profile/photos/:photoId', deleteProgressPhoto);
router.get('/search', searchUsers);
router.post('/:userId/follow', followUser);
router.delete('/:userId/follow', unfollowUser);
router.get('/:userId', getUserById);

export default router;
