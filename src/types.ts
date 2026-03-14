/**
 * Core type definitions for @oxog/codemap.
 *
 * All types are readonly to enforce immutability in scan results.
 * Optional properties include `| undefined` for exactOptionalPropertyTypes compatibility.
 * @module
 */

// ─── Language & Format Identifiers ───────────────────────────────────

/** Supported language identifiers */
export type LanguageId =
  | 'typescript'
  | 'go'
  | 'python'
  | 'rust'
  | 'php'
  | 'java'
  | 'csharp';

/** Available output format types */
export type FormatType = 'compact' | 'json' | 'markdown' | 'llms-txt';

// ─── Configuration ───────────────────────────────────────────────────

/** Watch mode configuration */
export interface WatchConfig {
  readonly debounce?: number | undefined;
  readonly polling?: boolean | undefined;
  readonly interval?: number | undefined;
}

/** Configuration for codemap */
export interface CodemapConfig {
  readonly root: string;
  readonly output: string;
  readonly format: FormatType | readonly FormatType[];
  readonly languages?: readonly LanguageId[] | undefined;
  readonly ignore?: readonly string[] | undefined;
  readonly incremental?: boolean | undefined;
  readonly watch?: WatchConfig | boolean | undefined;
  readonly complexity?: boolean | undefined;
  readonly tokenCounts?: boolean | undefined;
  readonly monorepo?: boolean | undefined;
}

/** Scan options (subset of config for scan() API) */
export interface ScanOptions {
  readonly format?: FormatType | readonly FormatType[] | undefined;
  readonly incremental?: boolean | undefined;
  readonly complexity?: boolean | undefined;
  readonly tokenCounts?: boolean | undefined;
  readonly monorepo?: boolean | undefined;
  readonly ignore?: readonly string[] | undefined;
  readonly languages?: readonly LanguageId[] | undefined;
}

// ─── Analysis Results ────────────────────────────────────────────────

/** Parameter information */
export interface ParamInfo {
  readonly name: string;
  readonly type: string;
  readonly optional?: boolean | undefined;
  readonly defaultValue?: string | undefined;
}

/** Property information */
export interface PropertyInfo {
  readonly name: string;
  readonly type: string;
  readonly scope?: 'public' | 'protected' | 'private' | undefined;
  readonly static?: boolean | undefined;
  readonly readonly?: boolean | undefined;
  readonly optional?: boolean | undefined;
}

/** Function/method information */
export interface FunctionInfo {
  readonly name: string;
  readonly params: readonly ParamInfo[];
  readonly returnType: string;
  readonly exported: boolean;
  readonly async?: boolean | undefined;
  readonly generator?: boolean | undefined;
  readonly static?: boolean | undefined;
  readonly scope?: 'public' | 'protected' | 'private' | undefined;
  readonly complexity?: number | undefined;
  readonly loc: number;
  readonly decorators?: readonly string[] | undefined;
}

/** Class information */
export interface ClassInfo {
  readonly name: string;
  readonly extends?: string | undefined;
  readonly implements?: readonly string[] | undefined;
  readonly methods: readonly FunctionInfo[];
  readonly properties: readonly PropertyInfo[];
  readonly exported: boolean;
  readonly abstract?: boolean | undefined;
  readonly decorators?: readonly string[] | undefined;
  readonly loc: number;
}

/** Interface information */
export interface InterfaceInfo {
  readonly name: string;
  readonly extends?: readonly string[] | undefined;
  readonly properties: readonly PropertyInfo[];
  readonly methods?: readonly FunctionInfo[] | undefined;
  readonly exported: boolean;
  readonly generics?: readonly string[] | undefined;
}

/** Type alias information */
export interface TypeInfo {
  readonly name: string;
  readonly type: string;
  readonly exported: boolean;
  readonly generics?: readonly string[] | undefined;
}

/** Enum information */
export interface EnumInfo {
  readonly name: string;
  readonly members: readonly string[];
  readonly exported: boolean;
}

/** Constant information */
export interface ConstantInfo {
  readonly name: string;
  readonly type: string;
  readonly exported: boolean;
}

/** React component information */
export interface ComponentInfo extends FunctionInfo {
  readonly kind: 'component';
}

/** React hook information */
export interface HookInfo extends FunctionInfo {
  readonly kind: 'hook';
}

/** Struct information (Go, Rust, C#) */
export interface StructInfo {
  readonly name: string;
  readonly fields: readonly PropertyInfo[];
  readonly methods: readonly FunctionInfo[];
  readonly exported: boolean;
  readonly derives?: readonly string[] | undefined;
  readonly embeds?: readonly string[] | undefined;
}

/** Trait information (Rust, PHP) */
export interface TraitInfo {
  readonly name: string;
  readonly methods: readonly FunctionInfo[];
  readonly exported: boolean;
  readonly superTraits?: readonly string[] | undefined;
}

/** Import information */
export interface ImportInfo {
  readonly from: string;
  readonly names: readonly string[];
  readonly kind: 'internal' | 'external';
  readonly isTypeOnly?: boolean | undefined;
}

/** Export information */
export interface ExportInfo {
  readonly from?: string | undefined;
  readonly names: readonly string[];
  readonly isReExport: boolean;
}

/** Package/namespace information */
export interface PackageInfo {
  readonly name: string;
  readonly path: string;
}

/** Analysis result for a single file */
export interface FileAnalysis {
  readonly path: string;
  readonly language: LanguageId;
  readonly loc: number;
  readonly estimatedTokens: number;
  readonly complexity?: number | undefined;
  readonly imports: readonly ImportInfo[];
  readonly exports: readonly ExportInfo[];
  readonly functions: readonly FunctionInfo[];
  readonly classes: readonly ClassInfo[];
  readonly interfaces: readonly InterfaceInfo[];
  readonly types: readonly TypeInfo[];
  readonly enums: readonly EnumInfo[];
  readonly constants: readonly ConstantInfo[];
  readonly components?: readonly ComponentInfo[] | undefined;
  readonly hooks?: readonly HookInfo[] | undefined;
  readonly structs?: readonly StructInfo[] | undefined;
  readonly traits?: readonly TraitInfo[] | undefined;
  readonly packages?: readonly PackageInfo[] | undefined;
}

/** Scan statistics */
export interface ScanStats {
  readonly fileCount: number;
  readonly totalLoc: number;
  readonly totalTokens: number;
  readonly languageBreakdown: Readonly<Record<string, number>>;
  readonly scanDurationMs: number;
  readonly incremental: boolean;
  readonly changedFiles?: number | undefined;
}

/** Result of scanning a codebase */
export interface ScanResult {
  readonly root: string;
  readonly timestamp: string;
  readonly files: readonly FileAnalysis[];
  readonly dependencyGraph: Readonly<Record<string, readonly string[]>>;
  readonly externalDeps: Readonly<Record<string, readonly string[]>>;
  readonly stats: ScanStats;
  readonly output?: string | undefined;
  readonly workspaces?: Readonly<Record<string, ScanResult>> | undefined;
}

// ─── Plugin System ───────────────────────────────────────────────────

/** Shared scanning context */
export interface CodemapContext {
  readonly config: CodemapConfig;
  readonly files: FileAnalysis[];
  readonly dependencyGraph: Record<string, string[]>;
  readonly externalDeps: Record<string, string[]>;
}

export interface LanguageParser {
  readonly name: string;
  readonly extensions: readonly string[];
  parse: (content: string, filePath: string) => FileAnalysis;
}

export interface OutputFormatter {
  readonly name: string;
  readonly extension: string;
  format: (result: ScanResult, options?: Record<string, unknown>) => string;
}

export interface CodemapPlugin<TContext = CodemapContext> {
  readonly name: string;
  readonly version: string;
  readonly dependencies?: readonly string[] | undefined;
  install: (kernel: CodemapKernel<TContext>) => void;
  onInit?: ((context: TContext) => void | Promise<void>) | undefined;
  onScanComplete?: ((result: ScanResult) => void | Promise<void>) | undefined;
  onDestroy?: (() => void | Promise<void>) | undefined;
  onError?: ((error: Error) => void) | undefined;
}

export type KernelEvent =
  | 'plugin:registered'
  | 'plugin:unregistered'
  | 'scan:start'
  | 'scan:file'
  | 'scan:complete'
  | 'scan:error'
  | 'watch:change'
  | 'watch:error';

export type EventListener = (...args: unknown[]) => void;

export interface CodemapKernel<TContext = CodemapContext> {
  registerParser(parser: LanguageParser): void;
  registerFormatter(formatter: OutputFormatter): void;
  getParser(name: string): LanguageParser | undefined;
  getParserForExtension(ext: string): LanguageParser | undefined;
  getFormatter(name: string): OutputFormatter | undefined;
  listParsers(): readonly LanguageParser[];
  listFormatters(): readonly OutputFormatter[];
  emit(event: KernelEvent, ...args: unknown[]): void;
  on(event: KernelEvent, listener: EventListener): void;
  off(event: KernelEvent, listener: EventListener): void;
  getConfig(): CodemapConfig;
}

export interface WatchEvent {
  readonly changedFiles: readonly string[];
  readonly map: ScanResult;
  readonly timestamp: string;
}

export interface CodemapWatcher {
  on(event: 'change', listener: (event: WatchEvent) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
  close(): void;
}
