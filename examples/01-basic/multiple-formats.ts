// Generate multiple output formats from a single scan
import { scan } from '@oxog/codemap';

// Compact format — token-efficient, ideal for LLM context windows
const compact = await scan('./src', { format: 'compact' });
console.log('=== Compact ===');
console.log(compact.output);

// JSON format — machine-readable, ideal for tooling integration
const json = await scan('./src', { format: 'json' });
console.log('\n=== JSON ===');
console.log(json.output);

// Markdown format — human-readable, ideal for documentation
const markdown = await scan('./src', { format: 'markdown' });
console.log('\n=== Markdown ===');
console.log(markdown.output);

// You can also request multiple formats via the builder API:
// import { codemap } from '@oxog/codemap';
// const result = await codemap().format(['compact', 'json']).scan();
