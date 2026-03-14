# @oxog/codemap — Task List

## Phase 1: Project Setup
- [x] 1.1 Create SPECIFICATION.md
- [x] 1.2 Create IMPLEMENTATION.md
- [x] 1.3 Create TASKS.md
- [ ] 1.4 Create package.json
- [ ] 1.5 Create tsconfig.json
- [ ] 1.6 Create tsup.config.ts
- [ ] 1.7 Create vitest.config.ts
- [ ] 1.8 Create .gitignore
- [ ] 1.9 Run npm install

## Phase 2: Core Infrastructure
- [ ] 2.1 Implement src/types.ts (all type definitions)
- [ ] 2.2 Implement src/errors.ts (error classes)
- [ ] 2.3 Implement src/utils/comment-stripper.ts
- [ ] 2.4 Implement src/utils/brace-counter.ts
- [ ] 2.5 Implement src/utils/type-truncator.ts
- [ ] 2.6 Implement src/utils/glob-matcher.ts
- [ ] 2.7 Implement src/utils/git.ts
- [ ] 2.8 Implement src/utils/index.ts
- [ ] 2.9 Implement src/token-estimator.ts
- [ ] 2.10 Implement src/scanner.ts
- [ ] 2.11 Implement src/config.ts

## Phase 3: Kernel & Plugin System
- [ ] 3.1 Implement src/kernel.ts
- [ ] 3.2 Implement src/plugins/registry.ts
- [ ] 3.3 Implement src/plugins/core/index.ts
- [ ] 3.4 Implement src/plugins/optional/index.ts
- [ ] 3.5 Implement src/plugins/index.ts

## Phase 4: Language Parsers
- [ ] 4.1 Implement src/plugins/core/typescript-parser.ts
- [ ] 4.2 Implement src/plugins/optional/go-parser.ts
- [ ] 4.3 Implement src/plugins/optional/python-parser.ts
- [ ] 4.4 Implement src/plugins/optional/rust-parser.ts
- [ ] 4.5 Implement src/plugins/optional/php-parser.ts
- [ ] 4.6 Implement src/plugins/optional/java-parser.ts
- [ ] 4.7 Implement src/plugins/optional/csharp-parser.ts

## Phase 5: Output Formatters
- [ ] 5.1 Implement src/plugins/core/compact-formatter.ts
- [ ] 5.2 Implement src/plugins/optional/json-formatter.ts
- [ ] 5.3 Implement src/plugins/optional/markdown-formatter.ts
- [ ] 5.4 Implement src/plugins/optional/llms-txt-formatter.ts

## Phase 6: Feature Plugins
- [ ] 6.1 Implement src/plugins/optional/complexity.ts
- [ ] 6.2 Implement src/plugins/optional/ignore.ts
- [ ] 6.3 Implement src/plugins/optional/incremental.ts
- [ ] 6.4 Implement src/plugins/optional/git-hooks.ts
- [ ] 6.5 Implement src/plugins/optional/claude-md.ts
- [ ] 6.6 Implement src/plugins/optional/monorepo.ts

## Phase 7: High-Level APIs
- [ ] 7.1 Implement src/builder.ts
- [ ] 7.2 Implement src/watcher.ts
- [ ] 7.3 Implement src/cli.ts
- [ ] 7.4 Implement src/index.ts (public API exports)

## Phase 8: Test Fixtures
- [ ] 8.1 Create tests/fixtures/typescript-project/
- [ ] 8.2 Create tests/fixtures/go-project/
- [ ] 8.3 Create tests/fixtures/python-project/
- [ ] 8.4 Create tests/fixtures/rust-project/
- [ ] 8.5 Create tests/fixtures/php-project/
- [ ] 8.6 Create tests/fixtures/java-project/
- [ ] 8.7 Create tests/fixtures/csharp-project/
- [ ] 8.8 Create tests/fixtures/mixed-project/
- [ ] 8.9 Create tests/fixtures/monorepo-project/

## Phase 9: Unit Tests
- [ ] 9.1 Write tests/unit/kernel.test.ts
- [ ] 9.2 Write tests/unit/builder.test.ts
- [ ] 9.3 Write tests/unit/scanner.test.ts
- [ ] 9.4 Write tests/unit/watcher.test.ts
- [ ] 9.5 Write tests/unit/config.test.ts
- [ ] 9.6 Write tests/unit/token-estimator.test.ts
- [ ] 9.7 Write tests/unit/cli.test.ts
- [ ] 9.8 Write tests/unit/utils/ (all utils tests)
- [ ] 9.9 Write tests/unit/plugins/ (all plugin tests)

## Phase 10: Integration Tests
- [ ] 10.1 Write tests/integration/full-scan.test.ts
- [ ] 10.2 Write tests/integration/multi-language.test.ts
- [ ] 10.3 Write tests/integration/incremental-scan.test.ts
- [ ] 10.4 Write tests/integration/watch-mode.test.ts
- [ ] 10.5 Write tests/integration/cli.test.ts

## Phase 11: Documentation & Examples
- [ ] 11.1 Create README.md
- [ ] 11.2 Create llms.txt
- [ ] 11.3 Create CHANGELOG.md
- [ ] 11.4 Create LICENSE
- [ ] 11.5 Create examples/ (15+ examples)

## Phase 12: Final Verification
- [ ] 12.1 npm run build succeeds
- [ ] 12.2 npm run test:coverage shows 100%
- [ ] 12.3 npm run typecheck passes
- [ ] 12.4 All examples run correctly
