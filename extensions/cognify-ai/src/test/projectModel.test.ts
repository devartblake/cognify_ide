/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Run with: pnpm test (node --test, TypeScript type stripping)
import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, test } from 'node:test';
import { assembleModel, buildIndex, buildProjectModel, refreshIndex } from '../projectModel/indexer.ts';
import { parseCargoToml, parseConvention, parseGithubWorkflow, parseGoMod, parsePackageJson, parsePyproject, parserFor } from '../projectModel/parsers.ts';
import { answer, answerRecentChanges, globToRegExp, packageFor, pipelineRunsFor } from '../projectModel/queries.ts';
import { parseTomlSubset } from '../projectModel/toml.ts';

/** An in-memory workspace for the indexer. */
function source(files: Record<string, string>, options: { trusted?: boolean; now?: () => number } = {}) {
	return {
		files: Object.keys(files).map(path => ({ path, size: files[path].length })),
		read: async (path: string) => files[path],
		trusted: options.trusted ?? true,
		now: options.now,
	};
}

/** Every indexer input in this repository, found the way the extension's `findFiles` does (minus build output). */
function thisRepository(): { root: string; files: { path: string; size: number }[] } {
	const root = join(import.meta.dirname, '..', '..', '..', '..');
	const files: { path: string; size: number }[] = [];
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				if (!['node_modules', '.git', 'out', '.build', 'dist', 'out-build'].includes(entry.name)) {
					walk(join(dir, entry.name));
				}
			} else {
				const path = relative(root, join(dir, entry.name)).split(sep).join('/');
				if (parserFor(path)) {
					files.push({ path, size: statSync(join(dir, entry.name)).size });
				}
			}
		}
	};
	walk(root);
	return { root, files };
}

// Assembled at runtime so no token-shaped literal is committed.
const FAKE_KEY = `sk-${'A1b2C3d4'.repeat(5)}`;

describe('Project Cognition parsers (S3-07)', () => {
	test('package.json: package, scripts, dependencies, entry points and test suites', () => {
		const fragment = parsePackageJson('extensions/demo/package.json', JSON.stringify({
			name: 'demo', main: './out/extension', engines: { vscode: '^1.100.0' },
			scripts: { test: 'node --test "src/test/**/*.test.ts"', 'test-integration': './run.sh', build: 'tsc' },
			dependencies: { yaml: '^2.8.3', shared: 'workspace:*' }, devDependencies: { '@types/node': '24.x' },
		}));
		assert.deepStrictEqual({
			pkg: fragment.packages?.map(p => [p.id, p.name, p.path, p.scripts.build]),
			deps: fragment.dependencies?.map(d => [d.to, d.kind, d.scope]),
			entry: fragment.entryPoints?.map(e => [e.kind, e.target]),
			tests: fragment.tests?.map(t => [t.framework, t.command, t.confidence]),
		}, {
			pkg: [['npm:extensions/demo', 'demo', 'extensions/demo', 'tsc']],
			deps: [['external:npm:yaml', 'external', 'runtime'], ['npm-name:shared', 'internal', 'runtime'], ['external:npm:@types/node', 'external', 'dev']],
			entry: [['extension-activation', './out/extension']],
			tests: [['node:test', 'npm test', 'inferred'], ['unknown', 'npm run test-integration', 'declared']],
		});
	});

	test('pyproject.toml, go.mod and Cargo.toml', () => {
		const py = parsePyproject('svc/pyproject.toml', '[project]\nname = "svc"\ndependencies = [\n  "fastapi>=0.110",\n  "pydantic",\n]\n[project.scripts]\nsvc = "svc.main:run"\n[tool.pytest.ini_options]\ntestpaths = ["tests"]\n');
		const go = parseGoMod('api/go.mod', 'module example.com/api\n\ngo 1.22\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.10.0\n\tgolang.org/x/text v0.14.0 // indirect\n)\n');
		const cargo = parseCargoToml('core/Cargo.toml', '[package]\nname = "core"\n[dependencies]\nserde = { version = "1", features = ["derive"] }\nutil = { path = "../util" }\n[dev-dependencies]\nproptest = "1"\n');
		assert.deepStrictEqual({
			py: [py.packages?.[0].name, py.dependencies?.map(d => d.to), py.entryPoints?.map(e => e.target), py.tests?.map(t => [t.framework, t.globs])],
			go: [go.packages?.[0].name, go.dependencies?.map(d => [d.to, d.versionSpec]), go.tests?.[0].command],
			cargo: [cargo.packages?.[0].name, cargo.dependencies?.map(d => [d.to, d.kind, d.scope])],
		}, {
			py: ['svc', ['external:python:fastapi', 'external:python:pydantic'], ['svc.main:run'], [['pytest', ['tests']]]],
			go: ['example.com/api', [['external:go:github.com/gin-gonic/gin', 'v1.10.0']], 'go test ./...'],
			cargo: ['core', [['external:cargo:serde', 'external', 'runtime'], ['cargo-name:util', 'internal', 'runtime'], ['external:cargo:proptest', 'external', 'dev']]],
		});
	});

	test('GitHub workflow: triggers, jobs and steps, with env values left out and credentials redacted', () => {
		const fragment = parseGithubWorkflow('.github/workflows/ci.yml', [
			'name: CI',
			'on:',
			'  pull_request:',
			'    branches: [dev, main]',
			'  push:',
			'    branches: [dev]',
			'    paths: [\'src/**\']',
			'env:',
			`  API_KEY: ${FAKE_KEY}`,
			'jobs:',
			'  validate:',
			'    name: Typecheck & Tests',
			'    runs-on: ubuntu-latest',
			'    steps:',
			'      - uses: actions/checkout@v4',
			'      - name: Install',
			'        run: pnpm install --frozen-lockfile',
			`      - run: 'curl -H "Authorization: Bearer ${FAKE_KEY}" https://example.com'`,
		].join('\n'));
		const ci = fragment.ci![0];
		assert.deepStrictEqual(
			{ name: ci.name, triggers: ci.triggers, jobs: ci.jobs, keyStored: JSON.stringify(fragment).includes(FAKE_KEY) },
			{
				name: 'CI',
				triggers: [{ event: 'pull_request', branches: ['dev', 'main'], paths: undefined }, { event: 'push', branches: ['dev'], paths: ['src/**'] }],
				jobs: [{ id: 'validate', name: 'Typecheck & Tests', runsOn: 'ubuntu-latest', steps: ['actions/checkout@v4', 'Install', 'curl -H "Authorization: Bearer [redacted]" https://example.com'] }],
				keyStored: false,
			},
		);
	});

	test('conventions keep a summary, never the text', () => {
		const agent = parseConvention('.github/copilot-instructions.md', '# Project\nSecret detail in the body.\n## Style\nUse tabs.\n');
		const editor = parseConvention('.editorconfig', 'root = true\n[*]\nindent_style = tab\n');
		assert.deepStrictEqual(
			[agent.conventions?.map(c => [c.kind, c.summary]), editor.conventions?.map(c => [c.kind, c.summary])],
			[[['agent-instructions', 'Agent instructions (copilot-instructions.md): Project; Style']], [['formatting', 'EditorConfig: indent tab']]],
		);
	});

	test('the TOML subset reads tables, strings, numbers, booleans and arrays, and skips comments', () => {
		const toml = parseTomlSubset('top = 1 # comment\n[a.b]\nname = "x # not a comment"\nlist = [\n  "one", # first\n  \'two\',\n]\nflag = false\n');
		assert.deepStrictEqual([toml.get('')?.get('top'), toml.get('a.b')?.get('name'), toml.get('a.b')?.get('list'), toml.get('a.b')?.get('flag')], [1, 'x # not a comment', ['one', 'two'], false]);
	});

	test('inputs: which paths have a parser', () => {
		assert.deepStrictEqual(
			['package.json', 'a/b/pyproject.toml', '.github/workflows/ci.yml', 'docs/config.yml', 'AGENTS.md', 'src/index.ts'].map(path => !!parserFor(path)),
			[true, true, true, false, true, false],
		);
	});
});

describe('Project Cognition indexer (S3-07)', () => {
	test('a pnpm monorepo: internal dependencies resolve to package ids', async () => {
		const model = await buildProjectModel(source({
			'package.json': JSON.stringify({ name: 'root', scripts: { test: 'vitest' } }),
			'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
			'packages/app/package.json': JSON.stringify({ name: 'app', dependencies: { lib: 'workspace:*', missing: 'workspace:*' } }),
			'packages/lib/package.json': JSON.stringify({ name: 'lib' }),
			'.github/workflows/ci.yml': 'on: push\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - run: pnpm test\n',
		}));
		assert.deepStrictEqual({
			packages: model.packages.map(p => p.id),
			deps: model.dependencies.map(d => [d.from, d.to, d.kind]),
			ci: model.ci.map(c => [c.name, c.triggers.map(t => t.event)]),
			coverage: [model.coverage.filesScanned, model.coverage.truncated, model.coverage.skipped],
		}, {
			packages: ['npm:.', 'npm:packages/app', 'npm:packages/lib'],
			deps: [['npm:packages/app', 'external:npm:missing', 'external'], ['npm:packages/app', 'npm:packages/lib', 'internal']],
			ci: [['ci.yml', ['push']]],
			coverage: [5, false, []],
		});
	});

	test('untrusted workspaces read manifests and workflows only; secret-risk and oversized files are skipped', async () => {
		const files = {
			'package.json': JSON.stringify({ name: 'root' }),
			'AGENTS.md': '# Agents',
			'config/secrets.yaml': 'token: x',
			'.github/workflows/big.yml': 'x'.repeat(50),
		};
		const untrusted = await buildProjectModel(source(files, { trusted: false }), { maxFiles: 100, maxFileBytes: 40, maxDurationMs: 10_000 });
		assert.deepStrictEqual(
			{ conventions: untrusted.conventions.length, skipped: untrusted.coverage.skipped },
			{ conventions: 0, skipped: [{ path: '.github/workflows/big.yml', reason: 'too-large' }] },
		);
		const trusted = await buildProjectModel(source(files), { maxFiles: 100, maxFileBytes: 40, maxDurationMs: 10_000 });
		assert.deepStrictEqual(trusted.coverage.skipped, [{ path: '.github/workflows/big.yml', reason: 'too-large' }]);
		// `secrets.yaml` outside .github/workflows has no parser, so it is never read at all.
	});

	test('budgets truncate, keeping the shallowest files and marking the model', async () => {
		let clock = 0;
		const model = await buildProjectModel(
			source({ 'package.json': '{"name":"root"}', 'a/package.json': '{"name":"a"}', 'a/b/package.json': '{"name":"b"}' }, { now: () => clock += 4 }),
			{ maxFiles: 2, maxFileBytes: 1_000, maxDurationMs: 1_000 },
		);
		assert.deepStrictEqual([model.packages.map(p => p.id), model.coverage.truncated, model.coverage.skipped], [['npm:.', 'npm:a'], true, [{ path: 'a/b/package.json', reason: 'budget' }]]);
	});

	test('this repository (more than 100 package.json files) indexes within budget', async () => {
		const { root, files } = thisRepository();
		const model = await buildProjectModel({ files, read: async path => readFileSync(join(root, path), 'utf8'), trusted: true });
		const cognify = model.packages.find(p => p.path === 'extensions/cognify-ai');
		const devWorkflow = model.ci.find(c => c.file === '.github/workflows/cognify-dev.yml');
		assert.deepStrictEqual({
			truncated: model.coverage.truncated,
			manyPackages: model.packages.length > 100,
			cognify: cognify && [cognify.name, cognify.scripts.test],
			devTriggers: devWorkflow?.triggers.map(t => [t.event, t.branches]),
		}, {
			truncated: false,
			manyPackages: true,
			cognify: ['cognify-ai', 'node --test "src/test/**/*.test.ts"'],
			devTriggers: [['pull_request', ['dev', 'main']], ['push', ['dev', 'main']], ['workflow_dispatch', undefined]],
		});
	});
});

describe('Project Cognition queries (S3-09)', () => {
	async function fixtureModel() {
		return buildProjectModel(source({
			'package.json': JSON.stringify({ name: 'root', packageManager: 'pnpm@12.16.0', scripts: { test: 'vitest run' } }),
			'packages/api/package.json': JSON.stringify({ name: 'api', main: 'dist/index.js', scripts: { build: 'tsc -p .', test: 'mocha "test/**/*.js"' }, dependencies: { lib: 'workspace:*' } }),
			'packages/lib/package.json': JSON.stringify({ name: 'lib' }),
			'.github/workflows/api.yml': 'name: API\non:\n  pull_request:\n    branches: [main]\n    paths: [\'packages/api/**\']\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Test API\n        run: pnpm --filter api test\n',
			'.github/workflows/docs.yml': 'name: Docs\non:\n  push:\n    paths: [\'docs/**\']\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo docs\n',
		}));
	}

	test('globs and path filters decide which pipelines run for a file', async () => {
		const model = await fixtureModel();
		assert.deepStrictEqual({
			globs: [globToRegExp('packages/**').test('packages/api/src/a.ts'), globToRegExp('**/*.md').test('README.md'), globToRegExp('src/*.ts').test('src/a/b.ts')],
			apiFile: model.ci.map(c => [c.name, pipelineRunsFor(c, 'packages/api/src/index.ts')]),
			deepest: [packageFor(model, 'packages/api/src/index.ts')?.name, packageFor(model, 'README.md')?.name],
		}, {
			globs: [true, true, false],
			apiFile: [['API', true], ['Docs', false]],
			deepest: ['api', 'root'],
		});
	});

	test('howToTest names the package, its build and test commands with the workspace\'s package manager, and the CI that runs', async () => {
		const result = answer(await fixtureModel(), { operation: 'howToTest', path: 'packages/api/src/index.ts' });
		assert.deepStrictEqual({ lines: result.text.split('\n'), packagesTouched: result.packagesTouched, redacted: result.redacted }, {
			lines: [
				'The file packages/api/src/index.ts belongs to package api (packages/api). Evidence: packages/api/package.json.',
				'Build: `pnpm run build` (runs: tsc -p .).',
				'Test: `pnpm test` (mocha, framework inferred).',
				'CI that runs for packages/api/src/index.ts:',
				'- API (.github/workflows/api.yml), on pull_request → main',
				'  - job test on ubuntu-latest: **Test API**',
				'1 other pipeline doesn\'t run on a change like this (manual or scheduled only, or their path filters don\'t match).',
				'Branch filters were not applied; pass `branch` to check a specific target branch.',
			],
			packagesTouched: ['npm:packages/api'],
			redacted: false,
		});
	});

	test('answers are redacted, and recent changes map uncommitted files to packages', async () => {
		const model = await fixtureModel();
		const changes = answerRecentChanges(model, {
			since: 'the merge base with main (abc1234567)',
			commits: [{ sha: 'abcdef1234567890', subject: `rotate key ${FAKE_KEY}`, date: '2026-11-04T10:00:00Z' }],
			workingTree: [{ path: 'packages/lib/index.ts', status: 'modified' }],
		});
		assert.deepStrictEqual({ keyShown: changes.text.includes(FAKE_KEY), redacted: changes.redacted, touched: changes.packagesTouched, uncommitted: changes.text.includes('- modified packages/lib/index.ts (package lib)') }, { keyShown: false, redacted: true, touched: ['npm:packages/lib'], uncommitted: true });
	});

	test('on this repository: how to build and test the package containing extensions/cognify-ai/src/router.ts', async () => {
		const { root, files } = thisRepository();
		const model = await buildProjectModel({ files, read: async path => readFileSync(join(root, path), 'utf8'), trusted: true });
		const text = answer(model, { operation: 'howToTest', path: 'extensions/cognify-ai/src/router.ts', branch: 'dev' }).text;
		assert.deepStrictEqual({
			pkg: text.includes('belongs to package cognify-ai (extensions/cognify-ai)'),
			build: text.includes('`pnpm run vscode:prepublish`') && text.includes('compile-extension:cognify-ai'),
			test: text.includes('`pnpm test` (node:test'),
			ci: text.includes('- Cognify (dev) (.github/workflows/cognify-dev.yml), on pull_request → dev, main; push → dev, main'),
			// Upstream workflows trigger on main and release branches only, and manual ones never run on a change.
			upstreamListed: /pr\.yml|CodeQL|Chat Performance/.test(text.split('Not run for dev')[0]),
		}, { pkg: true, build: true, test: true, ci: true, upstreamListed: false });
	});
});

describe('Project Cognition validation scenario on this repository (S3-10, PROJECT_COGNITION_MVP.md section 7)', () => {
	// "How do I build and test the package that contains the file I'm editing, and which
	// CI workflow runs on my change?" Active file extensions/cognify-ai/src/router.ts,
	// on a branch targeting dev.
	const ACTIVE_FILE = 'extensions/cognify-ai/src/router.ts';

	async function ask(override?: { path: string; text: string }) {
		const { root, files } = thisRepository();
		const read = async (path: string) => path === override?.path ? override.text : readFileSync(join(root, path), 'utf8');
		const model = await buildProjectModel({ files, read, trusted: true });
		return { model, answer: answer(model, { operation: 'howToTest', path: ACTIVE_FILE, branch: 'dev' }) };
	}

	test('acceptance 1: the five facts the model can state are correct, each with its evidence file', async () => {
		const { answer: result } = await ask();
		const text = result.text;
		assert.deepStrictEqual({
			package: text.includes('belongs to package cognify-ai (extensions/cognify-ai). Evidence: extensions/cognify-ai/package.json.'),
			build: text.includes('`pnpm run vscode:prepublish`') && text.includes('compile-extension:cognify-ai'),
			test: text.includes('`pnpm test` (node:test') && text.includes('`pnpm run test-integration`'),
			ci: text.includes('- Cognify (dev) (.github/workflows/cognify-dev.yml), on pull_request → dev, main; push → dev, main')
				&& text.includes('job validate "Typecheck, Unit Tests & Baseline"')
				&& text.includes('**Cognify AI extension unit tests**'),
			notCi: text.includes('- Code OSS (.github/workflows/pr.yml): only main, release/*'),
			packagesTouched: result.packagesTouched,
		}, { package: true, build: true, test: true, ci: true, notCi: true, packagesTouched: ['npm:extensions/cognify-ai'] });
		// Fact 6 (recent changes touching the package) comes from the Git extension at query time:
		// `recentChanges` with `path`. Its formatting is unit tested above; the Git call is checked by hand (S3-02).
	});

	test('acceptance 2: the index of this repository is complete within the 10 s budget', async () => {
		const { model } = await ask();
		assert.deepStrictEqual([model.coverage.truncated, model.coverage.durationMs < 10_000], [false, true]);
	});

	test('acceptance 3: no file contents beyond manifest fields, and a seeded key in a workflow is redacted', async () => {
		const workflow = readFileSync(join(thisRepository().root, '.github/workflows/cognify-dev.yml'), 'utf8')
			.replace(/^env:\n/m, `env:\n  OPENAI_API_KEY: ${FAKE_KEY}\n`)
			.replace(/^(\s+)- name: Cognify AI extension unit tests$/m, `$1- name: Leak check\n$1  run: 'curl -H "Authorization: Bearer ${FAKE_KEY}" https://example.com'\n$1- name: Cognify AI extension unit tests`);
		const { model, answer: result } = await ask({ path: '.github/workflows/cognify-dev.yml', text: workflow });
		const ciAnswer = answer(model, { operation: 'ciFor', paths: [ACTIVE_FILE], branch: 'dev' });
		const routerSource = readFileSync(join(thisRepository().root, ACTIVE_FILE), 'utf8');
		assert.deepStrictEqual({
			// The seeded workflow must still parse, or this test would prove nothing.
			parsed: model.ci.some(c => c.file === '.github/workflows/cognify-dev.yml') && !model.coverage.skipped.some(s => s.path === '.github/workflows/cognify-dev.yml'),
			keyInModel: JSON.stringify(model).includes(FAKE_KEY),
			keyInAnswers: result.text.includes(FAKE_KEY) || ciAnswer.text.includes(FAKE_KEY),
			// The seeded step is in the job; its command shows only as redacted text.
			stepVisible: JSON.stringify(model.ci).includes('Leak check'),
			sourceInAnswer: routerSource.split('\n').filter(line => line.trim().length > 30).some(line => result.text.includes(line.trim())),
			small: result.text.length <= 4_000,
		}, { parsed: true, keyInModel: false, keyInAnswers: false, stepVisible: true, sourceInAnswer: false, small: true });
	});
});

describe('Project Cognition refresh (S3-08, PROJECT_COGNITION_MVP.md section 4)', () => {
	const WORKSPACE = {
		'package.json': JSON.stringify({ name: 'root', scripts: { test: 'vitest' } }),
		'packages/api/package.json': JSON.stringify({ name: 'api' }),
		'.github/workflows/ci.yml': 'name: CI\non: push\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n      - run: pnpm test\n',
	};

	test('editing a workflow re-derives the ci domain only, reading just that file', async () => {
		const files: Record<string, string> = { ...WORKSPACE };
		const reads: string[] = [];
		const read = async (path: string) => {
			reads.push(path);
			return files[path];
		};
		const initial = await buildIndex({ files: Object.keys(files).map(path => ({ path })), read, trusted: true });
		const before = assembleModel(initial);
		reads.length = 0;
		files['.github/workflows/ci.yml'] = files['.github/workflows/ci.yml'].replace('name: CI', 'name: Renamed');
		const { state, report } = await refreshIndex(initial, [{ path: '.github/workflows/ci.yml', kind: 'changed' }], { read, trusted: true });
		const after = assembleModel(state);
		assert.deepStrictEqual({
			report,
			reads,
			ci: [before.ci[0].name, after.ci[0].name],
			packagesUnchanged: JSON.stringify(after.packages) === JSON.stringify(before.packages),
		}, {
			report: { changedPaths: ['.github/workflows/ci.yml'], domains: ['ci'], filesRead: 1 },
			reads: ['.github/workflows/ci.yml'],
			ci: ['CI', 'Renamed'],
			packagesUnchanged: true,
		});
	});

	test('unchanged content, deletions, new files and irrelevant paths', async () => {
		const files: Record<string, string> = { ...WORKSPACE };
		const source = { read: async (path: string) => files[path], trusted: true };
		const initial = await buildIndex({ ...source, files: Object.keys(files).map(path => ({ path })) });
		// A save with the same content is not a change.
		const same = await refreshIndex(initial, [{ path: 'package.json', kind: 'changed' }], source);
		// Deleting a manifest removes its package; a new convention file is picked up; other files are ignored.
		delete files['packages/api/package.json'];
		files['AGENTS.md'] = '# Agents\n## Rules\n';
		const mixed = await refreshIndex(same.state, [
			{ path: 'packages/api/package.json', kind: 'deleted' },
			{ path: 'AGENTS.md', kind: 'created' },
			{ path: 'src/index.ts', kind: 'changed' },
			{ path: 'node_modules/x/package.json', kind: 'changed' },
		], source);
		const model = assembleModel(mixed.state);
		assert.deepStrictEqual({
			same: same.report,
			mixed: mixed.report,
			packages: model.packages.map(p => p.id),
			conventions: model.conventions.map(c => c.kind),
		}, {
			same: { changedPaths: [], domains: [], filesRead: 1 },
			mixed: { changedPaths: ['packages/api/package.json', 'AGENTS.md'], domains: ['conventions', 'packages'], filesRead: 1 },
			packages: ['npm:.'],
			conventions: ['agent-instructions'],
		});
	});
});

