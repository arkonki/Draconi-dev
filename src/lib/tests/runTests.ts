import { testDatabaseConnection, validateDatabaseSchema } from './databaseTest';

export async function runDatabaseTests() {
  console.log('Starting database connection tests...');

  // Run connection tests
  const connectionResult = await testDatabaseConnection();
  console.log('\nConnection Test Results:');
  console.log('------------------------');
  console.log(`Success: ${connectionResult.success}`);
  if (connectionResult.error) {
    console.error(`Error: ${connectionResult.error}`);
  }

  console.log('\nMetrics:');
  console.log(`Connection Time: ${connectionResult.metrics.connectionTime.toFixed(2)}ms`);
  console.log(`Query Time: ${connectionResult.metrics.queryTime.toFixed(2)}ms`);
  console.log(`Write Time: ${connectionResult.metrics.writeTime.toFixed(2)}ms`);
  console.log(`Total Time: ${connectionResult.metrics.totalTime.toFixed(2)}ms`);

  console.log('\nDetails:');
  console.log(`Tables Accessible: ${connectionResult.details.tablesAccessible}`);
  console.log(`Read Permission: ${connectionResult.details.readPermission}`);
  console.log(`Write Permission: ${connectionResult.details.writePermission}`);
  console.log('Available Tables:', connectionResult.details.tables);

  // Run schema validation
  console.log('\nValidating database schema...');
  const schemaValid = await validateDatabaseSchema();
  console.log(`Schema Validation: ${schemaValid ? 'Passed' : 'Failed'}`);

  return {
    connectionTest: connectionResult,
    schemaValid
  };
}
