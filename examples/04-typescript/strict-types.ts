// Full type usage with ScanResult, FileAnalysis, and related types
import { scan } from '@oxog/codemap';
import type {
  ScanResult,
  ScanStats,
  FileAnalysis,
  FunctionInfo,
  ClassInfo,
  InterfaceInfo,
  TypeInfo,
  ImportInfo,
  FormatType,
  LanguageId,
  ScanOptions,
} from '@oxog/codemap';

// All options are fully typed
const options: ScanOptions = {
  format: 'compact' satisfies FormatType,
  complexity: true,
  languages: ['typescript', 'python'] satisfies readonly LanguageId[],
};

const result: ScanResult = await scan('./src', options);

// ScanResult properties are readonly
const stats: ScanStats = result.stats;
console.log(`Files: ${stats.fileCount}, LOC: ${stats.totalLoc}`);

// Iterate over FileAnalysis with full type safety
for (const file of result.files) {
  const analysis: FileAnalysis = file;
  const fns: readonly FunctionInfo[] = analysis.functions;
  const classes: readonly ClassInfo[] = analysis.classes;
  const ifaces: readonly InterfaceInfo[] = analysis.interfaces;
  const types: readonly TypeInfo[] = analysis.types;
  const imports: readonly ImportInfo[] = analysis.imports;

  console.log(`${file.path}: ${fns.length}ƒ ${classes.length}◆ ${ifaces.length}◇ ${types.length}τ`);
  console.log(`  Imports: ${imports.filter((i) => i.kind === 'external').length} external`);
}
