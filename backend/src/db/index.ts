import { Pool, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config/env';

const poolConfig: PoolConfig = config.database.connectionString
  ? { connectionString: config.database.connectionString }
  : {
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.user,
      password: config.database.password,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };

export const pool = new Pool(poolConfig);

// Pool error handling for idle clients
pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

export const query = async <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> => {
  const start = Date.now();
  const res = await pool.query<T>(text, params);
  const duration = Date.now() - start;
  if (!config.isProduction) {
    console.debug('Executed query', { text, duration, rows: res.rowCount });
  }
  return res;
};

export const checkDatabaseConnection = async (): Promise<boolean> => {
  try {
    const res = await pool.query('SELECT 1 AS check');
    return res.rowCount === 1;
  } catch (err) {
    return false;
  }
};
