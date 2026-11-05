/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Run with: pnpm test (node --test, TypeScript type stripping)
import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { type NewProjectStep, type NewProjectUi, PROJECT_FILE, type ProjectEnvironment, runNewProject } from '../environments/newProject.ts';
import type { RuntimeId, RuntimeStatus } from '../environments/runtimes.ts';
import { loadTemplates, type Template } from '../environments/templates.ts';

const TEMPLATES_DIR = join(import.meta.dirname, '..', '..', 'templates');

/** Answers each question as scripted; `cancelAt` answers `undefined` from that step on. */
function scriptedUi(answers: { template: string; name: string; parent: string; environment?: ProjectEnvironment; cancelAt?: NewProjectStep }): { ui: NewProjectUi; asked: string[] } {
	const asked: string[] = [];
	const answer = <T>(step: NewProjectStep, value: T) => {
		asked.push(step);
		return Promise.resolve(answers.cancelAt === step ? undefined : value);
	};
	return {
		asked,
		ui: {
			pickTemplate: choices => {
				asked.push(`choices: ${choices.map(c => `${c.template.manifest.id}${c.host.met ? '' : ' (needs tools)'}`).join(', ')}`);
				return answer('template', choices.find(c => c.template.manifest.id === answers.template)?.template);
			},
			inputName: validate => {
				asked.push(`'bad/name' is rejected: ${validate('bad/name')}`);
				return answer('name', answers.name);
			},
			pickParentFolder: () => answer('location', answers.parent),
			pickEnvironment: host => {
				asked.push(`host ready: ${host.met}`);
				return answer('environment', answers.environment);
			},
		},
	};
}

function runtimes(found: Partial<Record<RuntimeId, string>>): Map<RuntimeId, RuntimeStatus> {
	return new Map(Object.entries(found).map(([id, version]) => [id as RuntimeId, { id: id as RuntimeId, state: 'found', version }]));
}

describe('New Project flow (S4-05)', () => {
	let dir: string;
	let templates: Template[];
	beforeEach(async () => {
		dir = mkdtempSync(join(tmpdir(), 'cognify-new-project-'));
		templates = await loadTemplates(TEMPLATES_DIR);
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	test('on the host: Docker is absent, so the environment isn\'t asked and the project records "host"', async () => {
		const { ui, asked } = scriptedUi({ template: 'fastapi', name: 'Demo App', parent: dir });
		const result = await runNewProject({ templates, runtimes: runtimes({ python: '3.13.1', pip: '25.3' }), container: false, ui });
		const folder = join(dir, 'demo-app');
		assert.deepStrictEqual({ result, asked, project: JSON.parse(readFileSync(join(folder, PROJECT_FILE), 'utf8')), files: readdirSync(folder).sort() }, {
			result: { outcome: 'created', folder, template: 'fastapi', environment: 'host', host: { met: true, missing: [], outdated: [] } },
			asked: ['choices: aspnetcore (needs tools), fastapi, flutter-web (needs tools), nextjs (needs tools)', 'template', '\'bad/name\' is rejected: characters', 'name', 'location'],
			project: { version: 1, template: 'fastapi', environment: 'host', commands: { install: ['pip', 'install', '-e', '.[dev]'], test: ['pytest'], run: ['uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', '8000'] }, ports: [8000] },
			files: ['.cognify', '.devcontainer', '.gitignore', 'README.md', 'app', 'pyproject.toml', 'tests'],
		});
	});

	test('in a Dev Container: asked when Docker is available, and recorded with the template\'s commands', async () => {
		const { ui, asked } = scriptedUi({ template: 'aspnetcore', name: 'Demo App', parent: dir, environment: 'container' });
		const result = await runNewProject({ templates, runtimes: runtimes({ docker: '29.9.2' }), container: true, ui });
		const project = JSON.parse(readFileSync(join(dir, 'demo-app', PROJECT_FILE), 'utf8'));
		assert.deepStrictEqual({ outcome: result.outcome, asked: asked.slice(-2), environment: project.environment, run: project.commands.run }, {
			outcome: 'created',
			asked: ['host ready: false', 'environment'],
			environment: 'container',
			run: ['dotnet', 'run', '--project', 'src/DemoApp', '--urls', 'http://0.0.0.0:5000'],
		});
	});

	test('cancelling at any step writes nothing', async () => {
		const outcomes = [];
		for (const cancelAt of ['template', 'name', 'location', 'environment'] as const) {
			const { ui } = scriptedUi({ template: 'nextjs', name: 'Demo App', parent: dir, environment: 'host', cancelAt });
			outcomes.push(await runNewProject({ templates, runtimes: runtimes({ docker: '29.9.2' }), container: true, ui }));
		}
		assert.deepStrictEqual({ outcomes, written: readdirSync(dir) }, {
			outcomes: [{ outcome: 'cancelled', step: 'template' }, { outcome: 'cancelled', step: 'name' }, { outcome: 'cancelled', step: 'location' }, { outcome: 'cancelled', step: 'environment' }],
			written: [],
		});
	});

	test('refuses a project folder that already has files, before asking anything else', async () => {
		const folder = join(dir, 'demo-app');
		mkdirSync(folder);
		writeFileSync(join(folder, 'notes.txt'), 'mine');
		const { ui, asked } = scriptedUi({ template: 'flutter-web', name: 'Demo App', parent: dir, environment: 'container' });
		const result = await runNewProject({ templates, runtimes: runtimes({ docker: '29.9.2' }), container: true, ui });
		assert.deepStrictEqual({ result, lastAsked: asked.at(-1), folder: readdirSync(folder) }, { result: { outcome: 'notEmpty', folder }, lastAsked: 'location', folder: ['notes.txt'] });
	});
});
