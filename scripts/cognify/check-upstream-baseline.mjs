#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const manifestPath = resolve(root, 'DevDocs/Governance/upstream-baseline.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function pass(message) {
  console.log(`PASS  ${message}`);
}

function warn(message) {
  console.warn(`WARN  ${message}`);
}

function fail(message) {
  console.error(`FAIL  ${message}`);
  process.exitCode = 1;
}

const nodeVersion = readFileSync(resolve(root, '.nvmrc'), 'utf8').trim();
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

if (nodeVersion === manifest.runtime.nodeVersion) {
  pass(`Node baseline matches .nvmrc (${nodeVersion})`);
} else {
  fail(`Node baseline drift: manifest=${manifest.runtime.nodeVersion}, .nvmrc=${nodeVersion}`);
}

if (pkg.version === manifest.runtime.codeOssVersion) {
  pass(`Code OSS package version matches baseline (${pkg.version})`);
} else {
  fail(`Code OSS version drift: manifest=${manifest.runtime.codeOssVersion}, package.json=${pkg.version}`);
}

try {
  execFileSync('git', ['merge-base', '--is-ancestor', manifest.upstream.importedCommit, 'HEAD'], {
    cwd: root,
    stdio: 'ignore'
  });
  pass(`Accepted upstream commit is present in current history (${manifest.upstream.importedCommit})`);
} catch {
  fail(`Accepted upstream commit is not an ancestor of HEAD: ${manifest.upstream.importedCommit}`);
}

try {
  const current = git(['rev-parse', 'HEAD']);
  pass(`Current HEAD: ${current}`);
} catch (error) {
  fail(`Unable to resolve current git HEAD: ${error instanceof Error ? error.message : String(error)}`);
}

try {
  const upstreamMain = git(['rev-parse', 'upstream/main']);
  if (upstreamMain === manifest.upstream.observedMainCommit) {
    pass(`upstream/main matches the manifest observation (${upstreamMain})`);
  } else {
    warn(`upstream/main has moved since the manifest was recorded: recorded=${manifest.upstream.observedMainCommit}, local=${upstreamMain}`);
  }
} catch {
  warn('No local upstream/main ref is available. Run git fetch upstream before an upstream-sync review.');
}

if (process.exitCode) {
  console.error('\nCognify upstream baseline check failed. Reconcile the drift before merging an upstream sync or update the manifest only after validation.');
} else {
  console.log('\nCognify upstream baseline check passed.');
}
