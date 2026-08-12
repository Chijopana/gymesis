# Gymesis - Competitive Gym Tracker

Una aplicación minimalista para competir con amigos en el gym. Mide tu progreso, crea rutinas personalizadas, invita amigos a desafíos y compite en grupos.

## 📋 Características (MVP)

- ✅ Autenticación (registro/login)
- ✅ Gestión de perfil personal
- ✅ Creación de rutinas personalizadas
- ✅ Sistema de amigos
- ✅ Registro de entrenamientos
- 🔄 Grupos de entrenamiento
- 🔄 Competencias entre grupos

## 🏗️ Estructura del Proyecto

```
Gymesis/
├── backend/          # API Node.js + Express + PostgreSQL
│   ├── src/
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── database/
│   │   └── types/
│   └── package.json
│
├── frontend/         # Web React + TypeScript + Tailwind
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── services/
│   │   ├── store/
│   │   └── types/
│   └── package.json
│
└── mobile/           # App móvil (Flutter/React Native) - TODO
```

## 🚀 Instalación

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Editar .env con tus credenciales de PostgreSQL
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Accede a `http://localhost:5173`

## 📱 Endpoints principales

### Auth
- `POST /api/auth/register` - Registrarse
- `POST /api/auth/login` - Iniciar sesión

### Usuarios
- `GET /api/users/profile` - Mi perfil
- `PUT /api/users/profile` - Actualizar perfil
- `GET /api/users/:userId` - Ver perfil de otro usuario

### Rutinas (TODO)
- `GET /api/routines` - Mis rutinas
- `POST /api/routines` - Crear rutina
- `POST /api/routines/:id/invite` - Invitar amigo

### Entrenamientos (TODO)
- `POST /api/trainings` - Registrar sesión
- `GET /api/trainings/:userId/history` - Historial

## 🎯 Próximos pasos

1. Implementar CRUD completo de rutinas
2. Sistema de invitaciones y aceptación de retos
3. Página de entrenamiento con logging de pesos/reps
4. Cálculo de volumen total
5. Crear grupos
6. Competencias entre grupos
7. App móvil

## 🔧 Tech Stack

- **Backend**: Node.js, Express, TypeScript, PostgreSQL, JWT
- **Frontend**: React, TypeScript, Tailwind CSS, Zustand, Axios
- **Mobile**: Flutter (próximamente)

## 📝 Notas de Desarrollo

Editar archivos en `/src` y los cambios se reflejarán automáticamente en desarrollo.

Asegúrate de que PostgreSQL está corriendo antes de iniciar el backend.

---

¡Hecho con 💪 por amantes del gym!
