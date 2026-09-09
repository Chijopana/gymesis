# Gymesis

Aplicación web para registrar entrenamientos de gimnasio, medir el progreso y competir con amigos y grupos.

- **Backend**: Node 22, Express 5, TypeScript, PostgreSQL, JWT
- **Frontend**: React 18, TypeScript, Vite 7, Tailwind CSS, Zustand
- **Infra**: Docker Compose (PostgreSQL + API + nginx)

---

## Puesta en marcha

### Opción A — Docker (todo en uno)

```bash
cp .env.example .env
# Genera un secreto y pégalo en JWT_SECRET:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

docker compose up --build
```

La app queda en <http://localhost:8080>. nginx sirve el frontend y hace de proxy de `/api`
hacia el backend, así que todo va por el mismo origen y no hace falta abrir CORS.

### Opción B — En local

Necesitas PostgreSQL corriendo y una base de datos vacía llamada `gymesis`.

```bash
# Backend
cd backend
npm install
cp .env.example .env      # ajusta DB_PASSWORD y JWT_SECRET
npm run dev               # http://localhost:3000

# Frontend (en otra terminal)
cd frontend
npm install
npm run dev               # http://localhost:5173
```

El backend crea el esquema y rellena la biblioteca de ejercicios (~4.000 entradas)
la primera vez que arranca. No hace falta ejecutar migraciones a mano.

---

## Comandos

| Carpeta    | Comando              | Qué hace                                        |
| ---------- | -------------------- | ----------------------------------------------- |
| `backend`  | `npm run dev`        | API con recarga en caliente                     |
| `backend`  | `npm test`           | Tests unitarios (validación, métricas)          |
| `backend`  | `npm run type-check` | Comprueba tipos sin compilar                    |
| `backend`  | `npm run build`      | Compila a `dist/`                               |
| `frontend` | `npm run dev`        | Servidor de desarrollo con proxy a la API       |
| `frontend` | `npm run build`      | Comprueba tipos y genera el bundle de producción |
| `frontend` | `npm run lint`       | ESLint                                          |

---

## Cómo está organizado

```
backend/src
├── config/env.ts        Configuración validada; falla al arrancar si falta algo
├── database/            Pool, esquema, migraciones idempotentes y semillas
├── middleware/          Autenticación JWT y manejador central de errores
├── routes/              Un router por recurso
├── controllers/         Lógica de auth y perfiles
└── utils/               Esquemas de validación (zod), errores HTTP, métricas

frontend/src
├── components/          Piezas reutilizables (Modal, Skeleton, gráficas...)
├── pages/               Una pantalla por archivo, cargadas bajo demanda
├── services/api.ts      Cliente axios y traducción de errores a mensajes
├── store/               Sesión (Zustand), hidratada de forma síncrona
├── utils/               Caché local, tema, ajustes y analítica de entrenamiento
└── index.css            Tokens de diseño y capa de componentes
```

---

## Decisiones que conviene conocer

**La validación vive en el servidor.** Todo lo que entra por `req.body` o `req.query`
pasa por un esquema de zod (`backend/src/utils/validation.ts`) antes de tocar SQL. El
frontend valida en paralelo para dar feedback inmediato, pero nunca es la única barrera.

**El volumen se calcula en el backend.** El cliente envía series y pesos; el total lo
computa el servidor, así que nadie puede inflar su posición en el ranking.

**Los pesos se guardan siempre en kilogramos.** La preferencia kg/lb es sólo de
presentación y se convierte al entrar y al salir.

**Las fechas de entrenamiento son `DATE`, no marcas de tiempo.** El frontend las
interpreta como medianoche local (`parseLocalDate`); usar `new Date('2024-01-29')`
las trataría como UTC y desplazaría los entrenos un día en husos negativos.

**Caché optimista en el navegador.** `getCachedOrFetch` sirve datos recientes de
`localStorage` y, si el servidor no responde, cae a la última copia buena avisando
en pantalla. Se invalida por prefijo tras cada escritura.

---

## Seguridad

- Contraseñas con bcrypt (12 rondas por defecto) y comparación de tiempo constante:
  un email inexistente cuesta lo mismo que una contraseña incorrecta.
- JWT firmado con HS256. En producción el proceso no arranca si `JWT_SECRET` tiene
  menos de 32 caracteres o es el de desarrollo.
- Límite de peticiones por IP: estricto en `/api/auth` (sólo cuentan los intentos
  fallidos) y holgado en el resto. Ajustable por variables de entorno.
- CORS con lista de orígenes permitidos, cabeceras de `helmet` y CSP en nginx.
- Cuerpo JSON limitado a 100 kB.
- Las URLs que pegan los usuarios (fotos, avatares) se validan: sólo `http` y `https`,
  nunca `javascript:` ni `data:`.
- Toda consulta usa parámetros; los comodines `%` y `_` de las búsquedas se escapan.
- Los errores de PostgreSQL se traducen a mensajes genéricos: no se filtra la
  estructura de la base de datos.

---

## Estado de las funcionalidades

| Funcionalidad                        | Estado |
| ------------------------------------ | ------ |
| Registro, login y sesión persistente | ✅     |
| Perfil, galería de progreso, seguir  | ✅     |
| Rutinas: CRUD, clonado, público      | ✅     |
| Biblioteca global de ejercicios      | ✅     |
| Registro de sesiones y temporizador  | ✅     |
| Historial, analítica y export CSV    | ✅     |
| Amigos e invitaciones a rutinas      | ✅     |
| Calendario y quedadas                | ✅     |
| Grupos, solicitudes y expulsiones    | ✅     |
| Competencias entre grupos            | ✅     |
| App móvil nativa                     | ⏳     |

---

## API

Todas las rutas cuelgan de `/api` y, salvo `auth` y `health`, requieren la cabecera
`Authorization: Bearer <token>`.

| Método | Ruta                                   | Descripción                        |
| ------ | -------------------------------------- | ---------------------------------- |
| GET    | `/health`                              | Estado del servicio y de la base   |
| POST   | `/auth/register` · `/auth/login`       | Alta y acceso                      |
| GET    | `/users/profile` · `/users/:id`        | Perfil propio y público            |
| GET    | `/users/search?q=`                     | Buscar atletas                     |
| GET    | `/routines` · POST · PUT · DELETE      | Rutinas                            |
| POST   | `/routines/:id/clone` · `/invite`      | Clonar e invitar                   |
| GET    | `/exercises/library`                   | Biblioteca global (con filtros)    |
| POST   | `/trainings`                           | Registrar una serie                |
| GET    | `/trainings/history` · `/insights`     | Historial y métricas               |
| GET    | `/trainings/calendar?month=YYYY-MM`    | Días entrenados y quedadas         |
| GET    | `/friends` · POST · PUT · DELETE       | Amistades                          |
| GET    | `/groups` · POST · DELETE              | Grupos                             |
| POST   | `/groups/:id/competitions`             | Crear competencia                  |

---

Hecho con 💪 por amantes del gym.
