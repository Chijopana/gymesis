# Gymesis — API

Backend de Gymesis: Node 22, Express 5, TypeScript y PostgreSQL.

La documentacion general (arranque con Docker, decisiones de diseno, listado de
endpoints) esta en el [README raiz](../README.md). Aqui solo lo especifico del
backend.

## Arranque

```bash
npm install
cp .env.example .env   # ajusta DB_PASSWORD y JWT_SECRET
npm run dev
```

Necesitas una base de datos vacia llamada `gymesis`:

```sql
CREATE DATABASE gymesis;
```

Al arrancar, el proceso crea el esquema, aplica las migraciones idempotentes y
rellena la biblioteca de ejercicios si esta por debajo del umbral configurado.
No hay que ejecutar nada a mano.

## Comandos

| Comando              | Que hace                                    |
| -------------------- | ------------------------------------------- |
| `npm run dev`        | Servidor con recarga en caliente (tsx)      |
| `npm test`           | Tests unitarios con el runner de Node        |
| `npm run test:watch` | Tests en modo vigilancia                     |
| `npm run type-check` | Comprueba tipos sin generar `dist/`          |
| `npm run build`      | Compila TypeScript a `dist/`                 |
| `npm start`          | Ejecuta la build de produccion               |

## Variables de entorno

Estan todas documentadas en [`.env.example`](.env.example). Las tres que importan:

- `DB_*` — conexion a PostgreSQL.
- `JWT_SECRET` — obligatorio. En produccion debe tener 32+ caracteres aleatorios
  o el proceso se niega a arrancar.
- `CORS_ORIGINS` — lista de origenes permitidos separada por comas. Vacio significa
  "acepta cualquiera", util solo detras de un proxy en el mismo dominio.

## Estructura

```
src
├── config/env.ts        Configuracion validada al arrancar
├── database/
│   ├── connection.ts    Pool, esquema, migraciones e indices
│   └── exerciseSeeds.ts Generador del catalogo global
├── middleware/
│   ├── auth.ts          Verificacion del JWT
│   └── errorHandler.ts  Traduce errores (HttpError, PostgreSQL, framework)
├── routes/              Un router por recurso
├── controllers/         Auth y perfiles
└── utils/
    ├── validation.ts    Esquemas zod de todas las entradas
    ├── httpError.ts     Errores con codigo HTTP
    └── trainingInsights.ts  Racha, tendencia y prevision de volumen
```

## Notas

- Express 5 propaga solo los rechazos de promesas al middleware de errores, asi
  que los handlers `async` no necesitan try/catch salvo para liberar recursos.
- Las escrituras que tocan varias tablas (aceptar invitacion, clonar rutina,
  crear grupo) van dentro de una transaccion.
- Los handlers nunca construyen SQL concatenando entrada del usuario.
