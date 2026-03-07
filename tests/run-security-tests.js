#!/usr/bin/env -S npx tsx

import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testDir = __dirname;

// Find all security test files
const testFiles = [
  'security-rate-limiter.test.ts',
  'identity-rate-limiter.test.ts',
  'security-validation.test.ts',
  'security-pow.test.ts',
  'security-logger.test.ts',
  'security-utils.test.ts'
].map(file => join(testDir, file));

// Run tests
run({ files: testFiles })
  .compose(new spec())
  .pipe(process.stdout)
  .on('end', () => process.exit(0));