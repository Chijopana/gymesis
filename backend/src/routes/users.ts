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

router.get('/profile', authMiddleware, getProfile);
router.put('/profile', authMiddleware, updateProfile);
router.post('/profile/photos', authMiddleware, addProgressPhoto);
router.delete('/profile/photos/:photoId', authMiddleware, deleteProgressPhoto);
router.get('/search', authMiddleware, searchUsers);
router.post('/:userId/follow', authMiddleware, followUser);
router.delete('/:userId/follow', authMiddleware, unfollowUser);
router.get('/:userId', authMiddleware, getUserById);

export default router;
