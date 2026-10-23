import { query } from '../../db';

/**
 * Clears the monitoring tables so verification suites can be executed
 * repeatedly against a persistent database.
 *
 * The suites assert on first-write semantics (for example, that a webhook
 * delivery ID is not treated as a duplicate on its very first arrival), which
 * only holds when the tables start empty. Rows are scoped to the monitoring
 * domain so application data such as projects is never touched.
 */
export const resetMonitoringState = async (): Promise<boolean> => {
  try {
    await query(
      `TRUNCATE TABLE
         failure_occurrences,
         incidents,
         workflow_runs,
         webhook_events,
         application_errors,
         monitoring_state
       CASCADE;`
    );
    return true;
  } catch (error) {
    // The database may be unavailable in offline runs; the suites fall back to
    // their in-memory stores, which are reset by the caller.
    console.warn(
      '⚠️  Could not reset monitoring state in the database; continuing with in-memory stores.',
      (error as Error).message
    );
    return false;
  }
};
