/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Packaged-build checks (Sprint 6, S6-04): run on the folder a product build writes
// (`gulp vscode-<platform>-x64-min`, e.g. ../VSCode-linux-x64) by the `Cognify (package)` workflow.
//
//   node scripts/cognify/check-package.mts <package folder> [--launch]
//
// Checks the product identity (DevDocs/Governance/product-identity.json), that the NLS rebrand
// overrides are applied (nls-rebrand.mts --bundle), that cognify-ai is packaged as the product
// ships it (dist/, its agents, and its templates byte for byte), and that the bundled Dev
// Container CLI is outside the ASAR. With --launch, it also starts the packaged app and runs the
// shipped-build smoke test (extensions/cognify-ai/src/test-smoke) against the built-in
// extension; this needs cognify-ai's compiled out/test-smoke (its gulp task compile-extension:cognify-ai) and,
// on headless Linux, xvfb-run.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const packageFolder = resolve(args.find(arg => !arg.startsWith('--')) ?? '');
const launch = args.includes('--launch');

/**
 * The longest path a file may have relative to `resources/app` (S6-01). Windows installs into
 * `%LOCALAPPDATA%\Programs\Cognify IDE\resources\app\`, about 70 characters for a 20-character
 * user name, and paths over MAX_PATH (260) fail to install ("MoveFile failed; code 3").
 */
const MAX_APP_PATH = 150;

let failures = 0;
const pass = (message: string): void => console.log(`PASS  ${message}`);
const fail = (message: string): void => {
	console.error(`FAIL  ${message}`);
	failures++;
};
const check = (ok: boolean, message: string, detail = ''): void => ok ? pass(message) : fail(detail ? `${message}: ${detail}` : message);

/** Lists the files under a folder, relative to it, with forward slashes. */
function listFiles(folder: string): string[] {
	return readdirSync(folder, { recursive: true, withFileTypes: true })
		.filter(entry => entry.isFile())
		.map(entry => relative(folder, join(entry.parentPath, entry.name)).split(sep).join('/'))
		.sort();
}

/** `resources/app`, directly in the package or, with versioned updates on Windows, one folder down. */
function findAppFolder(folder: string): string | undefined {
	const candidates = [join(folder, 'resources', 'app'), ...readdirSync(folder, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => join(folder, entry.name, 'resources', 'app'))];
	return candidates.find(candidate => existsSync(join(candidate, 'product.json')));
}

const app = existsSync(packageFolder) ? findAppFolder(packageFolder) : undefined;
if (!app) {
	console.error(`FAIL  ${packageFolder}: no resources/app/product.json; is this a packaged build?`);
	process.exit(1);
}
console.log(`Package: ${packageFolder}\nApp:     ${app}\n`);

// 1. Product identity.
const manifest = JSON.parse(readFileSync(join(root, 'DevDocs/Governance/product-identity.json'), 'utf8'));
const product = JSON.parse(readFileSync(join(app, 'product.json'), 'utf8'));
const identityMismatches = Object.entries(manifest.productJson as Record<string, unknown>)
	.filter(([key, expected]) => JSON.stringify(product[key]) !== JSON.stringify(expected))
	.map(([key, expected]) => `${key}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(product[key])}`);
check(identityMismatches.length === 0, `product.json has the Cognify identity (${Object.keys(manifest.productJson).length} fields)`, identityMismatches.join('; '));
const executable = process.platform === 'win32' ? `${product.nameShort}.exe` : product.applicationName;
check(existsSync(join(packageFolder, executable)), `the app is named ${executable}`);

// 2. NLS rebrand overrides applied to the shipped messages.
const nls = spawnSync(process.execPath, [join(root, 'scripts/cognify/nls-rebrand.mts'), '--bundle', join(app, 'out')], { encoding: 'utf8' });
check(nls.status === 0, 'the NLS rebrand overrides are applied', (nls.stderr || nls.stdout).trim());

// 3. cognify-ai, as the product ships it.
const extension = join(app, 'extensions', 'cognify-ai');
const extensionJson = existsSync(join(extension, 'package.json')) ? JSON.parse(readFileSync(join(extension, 'package.json'), 'utf8')) : undefined;
check(extensionJson?.main === './dist/extension' && existsSync(join(extension, 'dist', 'extension.js')), 'cognify-ai is packaged with its bundle (dist/extension.js)');
check(!existsSync(join(extension, 'src')) && !existsSync(join(extension, 'out')), 'cognify-ai ships without src/ or out/');
const sourceTemplates = join(root, 'extensions/cognify-ai/templates');
const shippedTemplates = join(extension, 'templates');
const templateProblems = listFiles(sourceTemplates).filter(file => file.split('/')[1] === 'files').filter(file => {
	const shipped = join(shippedTemplates, file);
	return !existsSync(shipped) || !readFileSync(shipped).equals(readFileSync(join(sourceTemplates, file)));
});
check(templateProblems.length === 0, 'the project template files ship unchanged', `missing or changed: ${templateProblems.join(', ')}`);
check(existsSync(join(extension, 'agents')) && listFiles(join(extension, 'agents')).length > 0, 'the agent definitions ship');

// 4. The Dev Container CLI (S4-03): outside the ASAR, so the extension can run it with Node.
check(existsSync(join(app, 'node_modules.asar.unpacked', '@devcontainers', 'cli', 'devcontainer.js')), 'the Dev Container CLI is at node_modules.asar.unpacked/@devcontainers/cli');

// 5. Windows install paths: no file is too deep to install under a typical user profile.
const appFiles = listFiles(app);
const tooLong = appFiles.filter(file => file.length > MAX_APP_PATH);
const longest = appFiles.reduce((a, b) => b.length > a.length ? b : a, '');
check(tooLong.length === 0, `every path under resources/app is at most ${MAX_APP_PATH} characters (longest: ${longest.length})`, `${tooLong.length} longer, for example ${tooLong.slice(0, 3).join(', ')}`);

// 6. Launch: the packaged app starts and activates its built-in cognify-ai and Copilot.
if (launch) {
	const smokeTests = join(root, 'extensions/cognify-ai/out/test-smoke');
	if (!existsSync(smokeTests)) {
		fail(`launch: ${smokeTests} is missing; build cognify-ai first (gulp compile-extension:cognify-ai)`);
	} else {
		const work = mkdtempSync(join(tmpdir(), 'cognify-package-'));
		// Extension tests need a development extension. The packaged Copilot extension is used: a
		// fresh profile keeps the built-in one disabled until chat setup (sign-in) is done, and a
		// development extension is always enabled, so its packaged files are loaded and activated.
		const copilot = join(app, 'extensions', 'copilot');
		try {
			const run = spawnSync(join(packageFolder, executable), [
				join(work, 'workspace'),
				'--no-sandbox', '--disable-gpu', '--disable-telemetry', '--disable-experiments', '--skip-welcome', '--skip-release-notes',
				'--disable-updates', '--use-inmemory-secretstorage', '--disable-workspace-trust',
				`--user-data-dir=${join(work, 'user-data')}`, `--extensions-dir=${join(work, 'extensions')}`, `--logsPath=${join(work, 'logs')}`,
				`--extensionDevelopmentPath=${copilot}`,
				`--extensionTestsPath=${smokeTests}`,
			], {
				stdio: 'inherit',
				timeout: 300_000,
				env: { ...process.env, COGNIFY_SMOKE_LAYOUT: 'packaged', COGNIFY_SMOKE_EXTENSION_PATH: extension, COGNIFY_SMOKE_SOURCES: join(root, 'extensions/cognify-ai'), COGNIFY_SMOKE_APP_NAME: product.nameLong, COGNIFY_SMOKE_COPILOT: '1' },
			});
			check(run.status === 0, 'launch: the packaged app starts and activates cognify-ai and Copilot', `exit ${run.status}${run.error ? `, ${run.error.message}` : ''}`);
		} finally {
			rmSync(work, { recursive: true, force: true });
		}
	}
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll packaged-build checks passed.');
process.exit(failures ? 1 : 0);
