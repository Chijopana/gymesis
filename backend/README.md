# Gymesis Backend API

Backend Node.js + Express API for Gymesis - Competitive gym workout tracker.

## Setup

```bash
npm install
cp .env.example .env

# Update .env with your database credentials
```

## Database Setup

Make sure PostgreSQL is running and create the database:

```sql
CREATE DATABASE gymesis;
```

## Running

```bash
npm run dev    # Development with watch
npm run build  # Build for production
npm start      # Run production build
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

### Users
- `GET /api/users/profile` - Get current user profile (auth required)
- `PUT /api/users/profile` - Update profile (auth required)
- `GET /api/users/:userId` - Get user by ID

### Routines
- `GET /api/routines` - List user's routines
- `POST /api/routines` - Create routine
- `GET /api/routines/:id` - Get routine details
- `PUT /api/routines/:id` - Update routine
- `DELETE /api/routines/:id` - Delete routine
- `POST /api/routines/:id/invite` - Invite friend to routine

### Friends
- `GET /api/friends` - List friends
- `POST /api/friends/:userId/request` - Send friend request
- `PUT /api/friends/:requestId/accept` - Accept friend request
- `DELETE /api/friends/:userId` - Remove friend

### Exercises
- `GET /api/exercises/:routineId` - List exercises
- `POST /api/exercises` - Add exercise
- `PUT /api/exercises/:id` - Update exercise
- `DELETE /api/exercises/:id` - Delete exercise

### Trainings
- `POST /api/trainings` - Log training session
- `GET /api/trainings/:userId/history` - Get training history
- `GET /api/trainings/:routineId/progress` - Get progress
