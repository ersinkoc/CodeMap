// Error handling patterns with CodemapError
import { scan, CodemapError, ConfigError, ScanError } from '@oxog/codemap';

// All codemap errors extend CodemapError with a machine-readable `code` field
try {
  await scan('./nonexistent-directory');
} catch (err) {
  if (err instanceof CodemapError) {
    console.error(`Error [${err.code}]: ${err.message}`);
    // err.code is a string like 'ROOT_NOT_FOUND', 'CONFIG_ERROR', etc.
    // err.context has additional details as Record<string, unknown>
    console.error('Context:', err.context);
  }
}

// Catch specific error types
try {
  await scan('./src', { format: 'invalid' as any });
} catch (err) {
  if (err instanceof ConfigError) {
    console.error('Bad config:', err.message);
  } else if (err instanceof ScanError) {
    console.error('Scan failed:', err.message);
  } else if (err instanceof CodemapError) {
    console.error('Codemap error:', err.code, err.message);
  } else {
    throw err; // Re-throw unexpected errors
  }
}
