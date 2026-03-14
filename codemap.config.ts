import { defineConfig } from '@oxog/codemap';

export default defineConfig({
  root: './src',
  output: '.codemap',
  format: ['compact'],
  complexity: true,
  tokenCounts: true,
});
