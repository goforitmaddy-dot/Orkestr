import fs from 'fs';
import path from 'path';
import { pool } from './index';

export const runMigrations = async () => {
  const client = await pool.connect();
  try {
    console.log('Connecting to PostgreSQL to run migrations...');

    await client.query('BEGIN');

    // Create migrations tracker table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Get executed migrations
    const { rows: executedRows } = await client.query<{ name: string }>(
      'SELECT name FROM schema_migrations ORDER BY id ASC'
    );
    const executedMigrations = new Set(executedRows.map((r) => r.name));

    // Read migrations directory
    const migrationsDir = path.resolve(__dirname, '../../migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('No migrations directory found at', migrationsDir);
      await client.query('COMMIT');
      return;
    }

    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    let appliedCount = 0;
    for (const file of migrationFiles) {
      if (!executedMigrations.has(file)) {
        console.log(`Applying migration: ${file}...`);
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf-8');

        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        appliedCount++;
        console.log(`✓ Applied migration: ${file}`);
      } else {
        console.log(`- Skipping already applied migration: ${file}`);
      }
    }

    await client.query('COMMIT');
    console.log(`Migration complete. ${appliedCount} new migration(s) applied.`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed. Rolled back changes.', error);
    process.exitCode = 1;
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

// If run directly from CLI
if (require.main === module) {
  runMigrations().catch((err) => {
    console.error('Fatal error during migration:', err.message || err);
    process.exit(1);
  });
}
