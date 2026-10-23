import bcrypt from 'bcryptjs';
import { query } from '../db';
import { AppError } from '../middleware/errorHandler';
import { PublicUser, UserRecord } from '../types/auth';

const BCRYPT_SALT_ROUNDS = 12;

export interface RegisterUserInput {
  name: string;
  username?: string;
  email: string;
  password: string;
  skills?: string[];
  weeklyCapacityHours?: number;
  isAvailable?: boolean;
}

export const sanitizeUser = (user: UserRecord | PublicUser): PublicUser => {
  return {
    id: user.id,
    name: user.name,
    username: user.username || user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, ''),
    email: user.email,
    skills: user.skills || [],
    weekly_capacity_hours: user.weekly_capacity_hours ?? 40,
    is_available: user.is_available ?? true,
    github_user_id: user.github_user_id ? String(user.github_user_id) : null,
    github_username: user.github_username || null,
    github_linked_at: user.github_linked_at || null,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
};

export const registerUser = async (input: RegisterUserInput): Promise<PublicUser> => {
  const normalizedEmail = input.email.trim().toLowerCase();
  const trimmedName = input.name.trim();

  // Clean and derive username if not provided
  let normalizedUsername = (input.username || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!normalizedUsername) {
    normalizedUsername = normalizedEmail.split('@')[0].replace(/[^a-z0-9_]/g, '');
  }
  if (normalizedUsername.length < 3) {
    normalizedUsername = `${normalizedUsername}_${Math.floor(100 + Math.random() * 900)}`;
  }

  // Check if email already exists
  const existingEmailRes = await query<UserRecord>(
    `SELECT id, name, username, email, password_hash, skills, weekly_capacity_hours, is_available, created_at, updated_at
     FROM users
     WHERE LOWER(email) = $1`,
    [normalizedEmail]
  );
  const existingUser = existingEmailRes.rows[0];

  if (existingUser && existingUser.password_hash) {
    throw new AppError('An account with this email already exists', 409);
  }

  // Check if username is already taken by another registered user
  const existingUsernameRes = await query<{ id: string; password_hash: string | null }>(
    `SELECT id, password_hash FROM users WHERE LOWER(username) = $1`,
    [normalizedUsername]
  );
  if (
    existingUsernameRes.rows.length > 0 &&
    (!existingUser || existingUsernameRes.rows[0].id !== existingUser.id)
  ) {
    // If username explicitly provided by user, error 409; else append suffix
    if (input.username) {
      throw new AppError('This username is already taken. Please choose another username.', 409);
    } else {
      normalizedUsername = `${normalizedUsername}_${Math.floor(1000 + Math.random() * 9000)}`;
    }
  }

  // Hash password
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);

  if (existingUser && !existingUser.password_hash) {
    // Legacy user account exists (e.g. invited or assigned to projects prior to auth)
    // Activate the account, preserve existing user ID and all project/task associations
    const updatedRes = await query<UserRecord>(
      `UPDATE users
       SET name = COALESCE(NULLIF($1, ''), name),
           username = COALESCE(username, $2),
           password_hash = $3,
           skills = COALESCE($4, skills),
           weekly_capacity_hours = COALESCE($5, weekly_capacity_hours),
           is_available = COALESCE($6, is_available),
           updated_at = NOW()
       WHERE id = $7
       RETURNING id, name, username, email, skills, weekly_capacity_hours, is_available, created_at, updated_at`,
      [
        trimmedName,
        normalizedUsername,
        passwordHash,
        input.skills && input.skills.length > 0 ? input.skills : null,
        input.weeklyCapacityHours || null,
        input.isAvailable !== undefined ? input.isAvailable : null,
        existingUser.id,
      ]
    );

    return sanitizeUser(updatedRes.rows[0]);
  }

  // Fresh user registration
  const insertRes = await query<UserRecord>(
    `INSERT INTO users (name, username, email, password_hash, skills, weekly_capacity_hours, is_available)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, name, username, email, skills, weekly_capacity_hours, is_available, created_at, updated_at`,
    [
      trimmedName,
      normalizedUsername,
      normalizedEmail,
      passwordHash,
      input.skills || [],
      input.weeklyCapacityHours || 40,
      input.isAvailable !== undefined ? input.isAvailable : true,
    ]
  );

  return sanitizeUser(insertRes.rows[0]);
};

export const loginUser = async (identifier: string, password: string): Promise<PublicUser> => {
  const cleanIdentifier = identifier.trim().toLowerCase();

  const userRes = await query<UserRecord>(
    `SELECT id, name, username, email, password_hash, skills, weekly_capacity_hours, is_available, created_at, updated_at
     FROM users
     WHERE LOWER(email) = $1 OR LOWER(username) = $1`,
    [cleanIdentifier]
  );

  const user = userRes.rows[0];

  // Generic invalid credentials error to prevent user enumeration
  if (!user || !user.password_hash) {
    throw new AppError('Invalid email or password', 401);
  }

  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  if (!isPasswordValid) {
    throw new AppError('Invalid email or password', 401);
  }

  return sanitizeUser(user);
};

export const findUserById = async (id: string): Promise<PublicUser | null> => {
  const userRes = await query<UserRecord>(
    `SELECT id, name, username, email, password_hash, skills, weekly_capacity_hours, is_available,
            github_user_id, github_username, github_linked_at, created_at, updated_at
     FROM users
     WHERE id = $1`,
    [id]
  );

  if (userRes.rows.length === 0) {
    return null;
  }

  return sanitizeUser(userRes.rows[0]);
};
