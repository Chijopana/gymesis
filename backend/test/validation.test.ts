import { strict as assert } from 'node:assert'
import test from 'node:test'
import { HttpError } from '../src/utils/httpError.js'
import {
  isoDateSchema,
  libraryExerciseSchema,
  loginSchema,
  optionalHttpUrl,
  parse,
  passwordSchema,
  registerSchema,
  trainingLogSchema,
  usernameSchema,
} from '../src/utils/validation.js'

const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'

test('parse lanza HttpError 400 con el primer mensaje legible', () => {
  assert.throws(
    () => parse(usernameSchema, 'a'),
    (err: unknown) => err instanceof HttpError && err.status === 400
  )
})

test('el username rechaza símbolos y espacios', () => {
  assert.throws(() => parse(usernameSchema, 'jose blondel'))
  assert.throws(() => parse(usernameSchema, 'jose<script>'))
  assert.equal(parse(usernameSchema, '  jose_blondel-7  '), 'jose_blondel-7')
})

test('la contraseña exige longitud, letra y número', () => {
  assert.throws(() => parse(passwordSchema, 'corta1'))
  assert.throws(() => parse(passwordSchema, 'solamenteletras'))
  assert.throws(() => parse(passwordSchema, '1234567890'))
  assert.equal(parse(passwordSchema, 'Password123'), 'Password123')
})

test('el email se normaliza a minúsculas', () => {
  const result = parse(registerSchema, {
    username: 'atleta',
    email: '  JOSE@Example.COM ',
    password: 'Password123',
  })
  assert.equal(result.email, 'jose@example.com')
  assert.equal(result.firstName, null)
})

test('el login no impone reglas de fuerza a la contraseña existente', () => {
  // Una cuenta antigua puede tener una contraseña que hoy no pasaría el registro:
  // debe poder seguir entrando para luego cambiarla.
  const result = parse(loginSchema, { email: 'a@b.com', password: 'vieja' })
  assert.equal(result.password, 'vieja')
})

test('optionalHttpUrl bloquea esquemas peligrosos', () => {
  assert.throws(() => parse(optionalHttpUrl, 'javascript:alert(1)'))
  assert.throws(() => parse(optionalHttpUrl, 'data:text/html;base64,PHN2Zz4='))
  assert.throws(() => parse(optionalHttpUrl, 'file:///etc/passwd'))
  assert.equal(parse(optionalHttpUrl, 'https://cdn.dev/a.png'), 'https://cdn.dev/a.png')
  assert.equal(parse(optionalHttpUrl, ''), null)
  assert.equal(parse(optionalHttpUrl, undefined), null)
})

test('las fechas inexistentes se rechazan', () => {
  assert.throws(() => parse(isoDateSchema, '2024-02-31'))
  assert.throws(() => parse(isoDateSchema, '2024-13-01'))
  assert.throws(() => parse(isoDateSchema, '01/02/2024'))
  assert.equal(parse(isoDateSchema, '2024-02-29'), '2024-02-29')
})

test('el registro de entreno exige series y pesos del mismo tamaño', () => {
  const base = { routineId: UUID_A, exerciseId: UUID_B, date: '2026-01-05' }
  assert.throws(() => parse(trainingLogSchema, { ...base, repsPerSet: [10, 8], weightsPerSet: [50] }))
  assert.throws(() => parse(trainingLogSchema, { ...base, repsPerSet: [], weightsPerSet: [] }))
  assert.throws(() => parse(trainingLogSchema, { ...base, repsPerSet: [-1], weightsPerSet: [50] }))
  assert.throws(() => parse(trainingLogSchema, { ...base, repsPerSet: [10], weightsPerSet: [5000] }))
  assert.throws(() =>
    parse(trainingLogSchema, { ...base, repsPerSet: Array(60).fill(10), weightsPerSet: Array(60).fill(50) })
  )

  const ok = parse(trainingLogSchema, { ...base, repsPerSet: [10, 8], weightsPerSet: [50, 55] })
  assert.deepEqual(ok.repsPerSet, [10, 8])
  // El peso corporal (0 kg) es válido.
  assert.doesNotThrow(() => parse(trainingLogSchema, { ...base, repsPerSet: [10], weightsPerSet: [0] }))
})

test('los números llegan coercionados desde strings de formulario', () => {
  const result = parse(trainingLogSchema, {
    routineId: UUID_A,
    exerciseId: UUID_B,
    date: '2026-01-05',
    repsPerSet: ['10', '8'],
    weightsPerSet: ['50.5', '55'],
  })
  assert.deepEqual(result.repsPerSet, [10, 8])
  assert.deepEqual(result.weightsPerSet, [50.5, 55])
})

test('la biblioteca aplica valores por defecto coherentes', () => {
  const result = parse(libraryExerciseSchema, { name: 'Press banca', muscleGroup: 'Pecho' })
  assert.equal(result.trainingEnvironment, 'gym')
  assert.equal(result.difficultyLevel, 'intermediate')
  assert.equal(result.defaultSets, 3)
  assert.equal(result.defaultRestSeconds, 90)
  assert.equal(result.imageUrl, null)
})

test('los enums rechazan valores fuera de catálogo', () => {
  assert.throws(() => parse(libraryExerciseSchema, { name: 'X', muscleGroup: 'Y', trainingEnvironment: 'luna' }))
  assert.throws(() => parse(libraryExerciseSchema, { name: 'X', muscleGroup: 'Y', difficultyLevel: 'imposible' }))
})
