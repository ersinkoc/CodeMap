// Minimal scan example - 5 lines
import { scan } from '@oxog/codemap';

const result = await scan('./src');
console.log(result.output);
console.log(`Files: ${result.stats.fileCount} | Tokens: ~${result.stats.totalTokens}`);
