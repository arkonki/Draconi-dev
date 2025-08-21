import { supabase } from '../supabase';

interface ConnectionTestResult {
  success: boolean;
  error?: string;
  metrics: {
    connectionTime: number;
    queryTime: number;
    writeTime: number;
    totalTime: number;
  };
  details: {
    tablesAccessible: boolean;
    readPermission: boolean;
    writePermission: boolean;
    tables: string[];
  };
}

export async function testDatabaseConnection(): Promise<ConnectionTestResult> {
  const startTime = performance.now();
  const result: ConnectionTestResult = {
    success: false,
    metrics: {
      connectionTime: 0,
      queryTime: 0,
      writeTime: 0,
      totalTime: 0
    },
    details: {
      tablesAccessible: false,
      readPermission: false,
      writePermission: false,
      tables: []
    }
  };

  try {
    // 1. Test basic connection with retry
    const connectionStart = performance.now();
    let retries = 3;
    let connected = false;

    while (retries > 0 && !connected) {
      try {
        // Use rpc call instead of direct table access
        const { data: connectionTest, error: connectionError } = await supabase
          .rpc('test_connection');

        if (!connectionError) {
          connected = true;
        } else {
          retries--;
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      } catch (err) {
        retries--;
        if (retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    if (!connected) {
      throw new Error('Failed to establish database connection after retries');
    }

    result.metrics.connectionTime = performance.now() - connectionStart;

    // 2. Test schema access
    const queryStart = performance.now();
    const { data: schemaTest, error: schemaError } = await supabase
      .from('users')
      .select('id, email, role')
      .limit(1);

    if (schemaError) throw new Error(`Schema access failed: ${schemaError.message}`);
    result.metrics.queryTime = performance.now() - queryStart;
    result.details.tablesAccessible = true;
    result.details.readPermission = true;

    // 3. Test auth schema
    const { data: authTest, error: authError } = await supabase.auth.getSession();
    if (authError) throw new Error(`Auth schema access failed: ${authError.message}`);

    // All tests passed
    result.success = true;
    result.details.tables = ['users', 'characters', 'parties', 'notes'];

  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error occurred';
    result.success = false;
  } finally {
    result.metrics.totalTime = performance.now() - startTime;
  }

  return result;
}

export async function validateDatabaseSchema(): Promise<boolean> {
  try {
    // Test each required table with retry logic
    const tables = [
      { name: 'users', requiredColumns: ['id', 'email', 'username', 'role'] },
      { name: 'characters', requiredColumns: ['id', 'user_id', 'name', 'kin', 'profession'] },
      { name: 'parties', requiredColumns: ['id', 'name', 'created_by'] },
      { name: 'notes', requiredColumns: ['id', 'user_id', 'title', 'content'] }
    ];

    for (const table of tables) {
      let retries = 3;
      let validated = false;

      while (retries > 0 && !validated) {
        try {
          const { data, error } = await supabase
            .from(table.name)
            .select()
            .limit(1);

          if (error) throw error;

          // Verify the columns exist
          if (data && data[0]) {
            const missingColumns = table.requiredColumns.filter(col => !(col in data[0]));
            if (missingColumns.length > 0) {
              throw new Error(`Missing columns in ${table.name}: ${missingColumns.join(', ')}`);
            }
          }
          validated = true;
        } catch (err) {
          retries--;
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            console.error(`Failed to validate ${table.name} after retries:`, err);
            return false;
          }
        }
      }
    }

    return true;
  } catch (error) {
    console.error('Schema validation failed:', error);
    return false;
  }
}
