import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { config } from '../config/env.js';
import { pool } from '../database/connection.js';
import { generateToken } from '../middleware/auth.js';
import { conflict, unauthorized } from '../utils/httpError.js';
import { loginSchema, parse, registerSchema } from '../utils/validation.js';

/**
 * Hash de referencia para gastar el mismo tiempo cuando el email no existe.
 * Sin esto, un atacante distingue "usuario inexistente" de "contraseña incorrecta"
 * midiendo el tiempo de respuesta.
 */
const DUMMY_HASH = bcrypt.hashSync('gymesis-timing-equalizer', config.security.bcryptRounds);

export async function register(req: Request, res: Response) {
  const { username, email, password, firstName, lastName } = parse(registerSchema, req.body);

  const existingUser = await pool.query('SELECT id FROM users WHERE email = $1 OR LOWER(username) = LOWER($2)', [
    email,
    username,
  ]);

  if (existingUser.rows.length > 0) {
    throw conflict('Ya existe una cuenta con ese email o nombre de usuario');
  }

  const passwordHash = await bcrypt.hash(password, config.security.bcryptRounds);

  const created = await pool.query(
    `INSERT INTO users (username, email, password_hash, first_name, last_name)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, username, email, first_name, last_name, created_at`,
    [username, email, passwordHash, firstName, lastName]
  );

  const user = created.rows[0];
  const token = generateToken(user.id, user.email);

  res.status(201).json({
    message: 'Cuenta creada correctamente',
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      createdAt: user.created_at,
    },
  });
}

export async function login(req: Request, res: Response) {
  const { email, password } = parse(loginSchema, req.body);

  const result = await pool.query(
    'SELECT id, username, email, password_hash, first_name, last_name FROM users WHERE email = $1',
    [email]
  );

  const user = result.rows[0];

  // Siempre se compara contra un hash, exista el usuario o no: mismo coste.
  const isValid = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);

  if (!user || !isValid) {
    throw unauthorized('Email o contraseña incorrectos');
  }

  const token = generateToken(user.id, user.email);

  res.json({
    message: 'Sesión iniciada',
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
    },
  });
}
