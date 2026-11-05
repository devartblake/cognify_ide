/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Run with: pnpm test (node --test, TypeScript type stripping)
// Set COGNIFY_UPDATE_SNAPSHOTS=1 to rewrite the snapshot after a deliberate template change.
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { PROJECT_FILE } from '../environments/newProject.ts';
import { deriveNames, loadTemplates, renderCommands, renderTemplate, validateManifest, validateProjectName, writeProject } from '../environments/templates.ts';
import { buildProjectModel } from '../projectModel/indexer.ts';
import { answer } from '../projectModel/queries.ts';

const EXTENSION_ROOT = join(import.meta.dirname, '..', '..');
const TEMPLATES_DIR = join(EXTENSION_ROOT, 'templates');
const SNAPSHOT = join(import.meta.dirname, 'fixtures', 'templates.snapshot.json');

describe('project templates (S4-04)', () => {
	test('names: validation and the forms each ecosystem needs', () => {
		assert.deepStrictEqual({
			names: deriveNames('My cool-App 2'),
			valid: validateProjectName('My cool-App 2'),
			invalid: ['', '2fast', 'bad/name', 'trailing-', 'x'.repeat(65)].map(validateProjectName),
		}, {
			names: { projectName: 'My cool-App 2', packageName: 'my-cool-app-2', dotnetName: 'MyCoolApp2', dartPackage: 'my_cool_app_2' },
			valid: undefined,
			invalid: ['characters', 'characters', 'characters', 'ending', 'characters'],
		});
	});

	test('the four bundled templates load with valid manifests (D1: Flutter, web only)', async () => {
		const templates = await loadTemplates(TEMPLATES_DIR);
		assert.deepStrictEqual(templates.map(t => ({ id: t.manifest.id, problems: validateManifest(t.manifest, t.manifest.id), devcontainer: t.files.some(f => f.path === '.devcontainer/devcontainer.json') })), [
			{ id: 'aspnetcore', problems: [], devcontainer: true },
			{ id: 'fastapi', problems: [], devcontainer: true },
			{ id: 'flutter-web', problems: [], devcontainer: true },
			{ id: 'nextjs', problems: [], devcontainer: true },
		]);
	});

	test('rendering is deterministic and matches the snapshot (paths and content hashes)', async () => {
		const names = deriveNames('Demo App');
		const rendered = Object.fromEntries((await loadTemplates(TEMPLATES_DIR)).map(t => [t.manifest.id, Object.fromEntries(renderTemplate(t, names).map(f => [f.path, createHash('sha256').update(f.content).digest('hex').slice(0, 16)]))]));
		if (process.env['COGNIFY_UPDATE_SNAPSHOTS'] === '1') {
			writeFileSync(SNAPSHOT, JSON.stringify(rendered, null, '\t') + '\n');
		}
		assert.deepStrictEqual(rendered, JSON.parse(readFileSync(SNAPSHOT, 'utf8')));
		assert.ok(!JSON.stringify(rendered).includes('{{'), 'no placeholder survives in a path');
	});

	test('commands render with the project names, and unknown placeholders fail', async () => {
		const [aspnetcore] = await loadTemplates(TEMPLATES_DIR);
		assert.deepStrictEqual(renderCommands(aspnetcore.manifest, deriveNames('Demo App')).run, ['dotnet', 'run', '--project', 'src/DemoApp', '--urls', 'http://0.0.0.0:5000']);
		assert.throws(() => renderTemplate({ manifest: aspnetcore.manifest, files: [{ path: 'a.txt', content: '{{nope}}' }] }, deriveNames('Demo')), /unknown placeholder \{\{nope\}\} in a\.txt/);
	});

	test('writing refuses a folder that isn\'t empty and paths that escape it', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'cognify-template-'));
		try {
			await writeProject(join(dir, 'new'), [{ path: 'a/b.txt', content: 'x' }]);
			await assert.rejects(writeProject(join(dir, 'new'), [{ path: 'c.txt', content: 'y' }]), /isn't empty/);
			await assert.rejects(writeProject(join(dir, 'other'), [{ path: '../escape.txt', content: 'z' }]), /outside the project folder/);
			// Nothing was written for the rejected template, not even its folder.
			assert.deepStrictEqual(readdirSync(dir).sort(), ['new']);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('Project Cognition knows how to test every template\'s project, from its manifests or its .cognify/project.json (S4-09)', async () => {
		const names = deriveNames('Demo App');
		const results: Record<string, boolean> = {};
		for (const template of await loadTemplates(TEMPLATES_DIR)) {
			const project = { version: 1, template: template.manifest.id, environment: 'container', commands: renderCommands(template.manifest, names) };
			const files = [...renderTemplate(template, names), { path: PROJECT_FILE, content: JSON.stringify(project) }];
			const byPath = new Map(files.map(f => [f.path, f.content]));
			const model = await buildProjectModel({ files: files.map(f => ({ path: f.path })), read: async path => byPath.get(path) ?? '', trusted: true, now: () => 0 });
			const text = answer(model, { operation: 'howToTest', path: '.' }).text;
			results[template.manifest.id] = template.manifest.commands.test.every(arg => text.includes(arg));
		}
		assert.deepStrictEqual(results, { aspnetcore: true, fastapi: true, 'flutter-web': true, nextjs: true });
	});
});
