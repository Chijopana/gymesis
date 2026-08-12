# Gymesis Web Frontend

React + TypeScript + Tailwind CSS frontend for Gymesis.

## Setup

```bash
npm install
```

## Running

```bash
npm run dev    # Development server on http://localhost:5173
npm run build  # Build for production
npm run preview # Preview production build
```

## Environment Variables

Create a `.env.local` file:

```
VITE_API_URL=http://localhost:3000/api
```

## Project Structure

- `src/pages/` - Page components
- `src/components/` - Reusable components
- `src/services/` - API services
- `src/store/` - Zustand stores (state management)
- `src/types/` - TypeScript type definitions
