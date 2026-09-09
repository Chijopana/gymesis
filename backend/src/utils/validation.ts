import { z } from 'zod';
import { badRequest } from './httpError.js';

/**
 * Esquemas compartidos. Todo lo que entra por `req.body` / `req.query`
 * pasa por aquí antes de llegar a una consulta SQL.
 */

export const uuidSchema = z.string().uuid('Debe ser un identificador válido');

/** Fecha ISO `YYYY-MM-DD` que además existe en el calendario. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'La fecha no existe');

export const isoTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'La hora debe tener formato HH:MM');

/** Texto opcional: recorta espacios y convierte la cadena vacía en `null`. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `No puede superar los ${max} caracteres`)
    .nullish()
    .transform((value) => (value == null || value === '' ? null : value));

export const requiredText = (max: number, label: string) =>
  z
    .string({ required_error: `${label} es obligatorio` })
    .trim()
    .min(1, `${label} es obligatorio`)
    .max(max, `${label} no puede superar los ${max} caracteres`);

/** URL http(s) opcional; cualquier otro esquema (javascript:, data:) se rechaza. */
export const optionalHttpUrl = z
  .string()
  .trim()
  .max(2048, 'La URL es demasiado larga')
  .nullish()
  .transform((value) => (value == null || value === '' ? null : value))
  .refine((value) => {
    if (value === null) return true;
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'La URL debe empezar por http:// o https://');

export const difficultySchema = z.enum(['beginner', 'intermediate', 'advanced']);
export const environmentSchema = z.enum(['gym', 'home', 'calisthenics']);

/** Entero acotado que acepta también strings numéricas (formularios, query params). */
export const boundedInt = (min: number, max: number, label: string) =>
  z.coerce
    .number({ invalid_type_error: `${label} debe ser un número` })
    .int(`${label} debe ser un número entero`)
    .min(min, `${label} no puede ser menor que ${min}`)
    .max(max, `${label} no puede ser mayor que ${max}`);

export const boundedNumber = (min: number, max: number, label: string) =>
  z.coerce
    .number({ invalid_type_error: `${label} debe ser un número` })
    .finite(`${label} debe ser un número válido`)
    .min(min, `${label} no puede ser menor que ${min}`)
    .max(max, `${label} no puede ser mayor que ${max}`);

// --- Autenticación -----------------------------------------------------------

/** Letras, números, guion y guion bajo: evita nombres que rompan URLs o menciones. */
export const usernameSchema = z
  .string({ required_error: 'El nombre de usuario es obligatorio' })
  .trim()
  .min(3, 'El nombre de usuario debe tener al menos 3 caracteres')
  .max(30, 'El nombre de usuario no puede superar los 30 caracteres')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Solo se permiten letras, números, guion y guion bajo');

export const emailSchema = z
  .string({ required_error: 'El email es obligatorio' })
  .trim()
  .toLowerCase()
  .email('Introduce un email válido')
  .max(100, 'El email es demasiado largo');

/**
 * Mínimo 8 caracteres con al menos una letra y un número.
 * bcrypt sólo usa los primeros 72 bytes, así que cortamos ahí de forma explícita.
 */
export const passwordSchema = z
  .string({ required_error: 'La contraseña es obligatoria' })
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(72, 'La contraseña no puede superar los 72 caracteres')
  .regex(/[a-zA-Z]/, 'La contraseña debe incluir al menos una letra')
  .regex(/[0-9]/, 'La contraseña debe incluir al menos un número');

export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  firstName: optionalText(100),
  lastName: optionalText(100),
});

export const loginSchema = z.object({
  email: z.string({ required_error: 'El email es obligatorio' }).trim().toLowerCase().max(100),
  password: z.string({ required_error: 'La contraseña es obligatoria' }).max(72),
});

// --- Perfil ------------------------------------------------------------------

export const updateProfileSchema = z.object({
  firstName: optionalText(100),
  lastName: optionalText(100),
  favoriteMuscle: optionalText(50),
  bio: optionalText(240),
  profileImageUrl: optionalHttpUrl,
});

export const progressPhotoSchema = z.object({
  imageUrl: optionalHttpUrl.refine((value) => value !== null, 'Necesitas una URL de imagen válida'),
  caption: optionalText(180),
  takenAt: isoDateSchema.nullish().transform((value) => value ?? null),
});

export const userSearchSchema = z.object({
  q: z.string({ required_error: 'Escribe algo para buscar' }).trim().min(2, 'Escribe al menos 2 caracteres para buscar').max(50),
  limit: boundedInt(1, 50, 'El límite').default(20),
});

// --- Rutinas -----------------------------------------------------------------

export const routineSchema = z.object({
  name: requiredText(100, 'El nombre de la rutina'),
  description: optionalText(1000),
  durationWeeks: boundedInt(1, 260, 'La duración en semanas').nullish().transform((value) => value ?? null),
  difficultyLevel: difficultySchema.nullish().transform((value) => value ?? null),
  isPublic: z.coerce.boolean().default(false),
});

export const routineInviteSchema = z.object({
  toUserId: uuidSchema,
  message: optionalText(280),
});

export const invitationAnswerSchema = z.object({
  action: z.enum(['accepted', 'rejected'], { errorMap: () => ({ message: 'La acción debe ser accepted o rejected' }) }),
  startDate: isoDateSchema.nullish().transform((value) => value ?? null),
  endDate: isoDateSchema.nullish().transform((value) => value ?? null),
});

export const cloneRoutineSchema = z.object({
  name: optionalText(100),
});

// --- Ejercicios --------------------------------------------------------------

const exerciseCore = {
  name: requiredText(100, 'El nombre del ejercicio'),
  muscleGroup: requiredText(50, 'El grupo muscular'),
  sets: boundedInt(1, 50, 'Las series').default(3),
  reps: boundedInt(1, 999, 'Las repeticiones').default(8),
  restSeconds: boundedInt(0, 3600, 'El descanso').default(90),
  notes: optionalText(500),
  orderIndex: boundedInt(0, 9999, 'El orden').nullish().transform((value) => value ?? null),
};

export const createExerciseSchema = z.object({ routineId: uuidSchema, ...exerciseCore });
export const updateExerciseSchema = z.object(exerciseCore);

export const libraryExerciseSchema = z.object({
  name: requiredText(100, 'El nombre del ejercicio'),
  muscleGroup: requiredText(50, 'El grupo muscular'),
  primaryMuscle: optionalText(50),
  secondaryMuscles: optionalText(160),
  equipment: optionalText(50),
  trainingEnvironment: environmentSchema.default('gym'),
  difficultyLevel: difficultySchema.default('intermediate'),
  imageUrl: optionalHttpUrl,
  videoUrl: optionalHttpUrl,
  defaultSets: boundedInt(1, 50, 'Las series').default(3),
  defaultReps: boundedInt(1, 999, 'Las repeticiones').default(8),
  defaultRestSeconds: boundedInt(0, 3600, 'El descanso').default(90),
  notes: optionalText(240),
});

export const librarySearchSchema = z.object({
  q: z.string().trim().max(80).default(''),
  muscle: z.string().trim().max(50).default(''),
  environment: z.string().trim().max(20).default(''),
  equipment: z.string().trim().max(50).default(''),
  limit: boundedInt(1, 100, 'El límite').default(40),
  offset: boundedInt(0, 100000, 'El desplazamiento').default(0),
});

// --- Entrenamientos ----------------------------------------------------------

const MAX_SETS_PER_LOG = 50;

export const trainingLogSchema = z
  .object({
    routineId: uuidSchema,
    exerciseId: uuidSchema,
    date: isoDateSchema,
    setsCompleted: boundedInt(1, MAX_SETS_PER_LOG, 'Las series completadas').nullish(),
    repsPerSet: z
      .array(boundedInt(1, 999, 'Las repeticiones'))
      .min(1, 'Necesitas al menos una serie')
      .max(MAX_SETS_PER_LOG, `No puedes registrar más de ${MAX_SETS_PER_LOG} series en un ejercicio`),
    weightsPerSet: z
      .array(boundedNumber(0, 1000, 'El peso'))
      .min(1, 'Necesitas al menos un peso')
      .max(MAX_SETS_PER_LOG, `No puedes registrar más de ${MAX_SETS_PER_LOG} series en un ejercicio`),
    notes: optionalText(1000),
  })
  .refine((value) => value.repsPerSet.length === value.weightsPerSet.length, {
    message: 'Debe haber el mismo número de repeticiones que de pesos',
    path: ['weightsPerSet'],
  });

export const calendarQuerySchema = z.object({
  month: z
    .string()
    .trim()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'El mes debe tener formato YYYY-MM')
    .optional(),
});

export const meetupSchema = z.object({
  invitedUserId: uuidSchema,
  meetupDate: isoDateSchema,
  meetupTime: isoTimeSchema.nullish().transform((value) => value ?? null),
  title: requiredText(120, 'El título'),
  notes: optionalText(280),
});

export const meetupResponseSchema = z.object({
  action: z.enum(['accepted', 'rejected', 'cancelled'], {
    errorMap: () => ({ message: 'La acción debe ser accepted, rejected o cancelled' }),
  }),
});

// --- Grupos ------------------------------------------------------------------

export const groupSchema = z.object({
  name: requiredText(100, 'El nombre del grupo'),
  description: optionalText(240),
  groupImageUrl: optionalHttpUrl,
  routineId: uuidSchema.nullish().transform((value) => value ?? null),
});

export const groupInviteSchema = z.object({ friendUserId: uuidSchema });

export const joinRequestAnswerSchema = z.object({
  action: z.enum(['accepted', 'rejected'], { errorMap: () => ({ message: 'La acción debe ser accepted o rejected' }) }),
});

export const competitionSchema = z
  .object({
    rivalGroupId: uuidSchema,
    name: requiredText(100, 'El nombre de la competencia'),
    startDate: isoDateSchema.nullish().transform((value) => value ?? null),
    endDate: isoDateSchema.nullish().transform((value) => value ?? null),
  })
  .refine((value) => !value.startDate || !value.endDate || value.endDate >= value.startDate, {
    message: 'La fecha de fin no puede ser anterior a la de inicio',
    path: ['endDate'],
  });

// --- Runner ------------------------------------------------------------------

/**
 * Valida `data` contra `schema` y lanza un 400 con el primer mensaje legible.
 * Devuelve el valor ya normalizado (trim, lowercase, defaults aplicados).
 */
export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      field: issue.path.join('.') || undefined,
      message: issue.message,
    }));
    throw badRequest(issues[0]?.message ?? 'Datos inválidos', issues);
  }
  return result.data;
}
