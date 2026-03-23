import * as dotenv from 'dotenv';
dotenv.config();

// Bridge REMOTE_NEON_DB_* variables to DATABASE_URL for pg client compatibility
if (!process.env.DATABASE_URL && process.env.REMOTE_NEON_DB_HOST) {
  const {
    REMOTE_NEON_DB_USER,
    REMOTE_NEON_DB_PASSWORD,
    REMOTE_NEON_DB_HOST,
    REMOTE_NEON_DB_PORT,
    REMOTE_NEON_DB_DATABASE
  } = process.env;
  
  process.env.DATABASE_URL = `postgresql://${REMOTE_NEON_DB_USER}:${REMOTE_NEON_DB_PASSWORD}@${REMOTE_NEON_DB_HOST}:${REMOTE_NEON_DB_PORT}/${REMOTE_NEON_DB_DATABASE}?sslmode=require`;
}

// Ensure SEED_AUTH_TOKEN is mapped from .env if missing in process.env
if (!process.env.SEED_AUTH_TOKEN && process.env.SEED_AUTH_TOKEN_ENV) {
  // Check if it's already in process.env (it should be after dotenv.config())
}
// Note: dotenv.config() already populates process.env. 
// The manual check above is only if the variable names differ.
