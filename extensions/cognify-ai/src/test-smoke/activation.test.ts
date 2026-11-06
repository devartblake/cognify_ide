/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The shipped-build check (S6-16), run by test-shipped-build.sh against the extension as the
// development build compiles it (out/) and as the product packages it (dist/). The dev build
// once shipped an extension that failed to activate while CI passed (B1,
// DevDocs/Quality/DEV_BUILD_VERIFICATION_2026-11-05.md), because CI compiled it differently.

import * as assert from 'assert';
import { readdirSync, readFileSync } from 'fs';
import 'mocha';
import { join, relative, sep } from 'path';
import * as vscode from 'vscode';

/** Lists the files under a folder, relative to it, with forward slashes; none if it's missing. */
function listFiles(folder: string): string[] {
	try {
		return readdirSync(folder, { recursive: true, withFileTypes: true })
			.filter(entry => entry.isFile())
			.map(entry => relative(folder, join(entry.parentPath, entry.name)).split(sep).join('/'))
			.sort();
	} catch {
		return [];
	}
}

/** Activates the built-in Copilot extension; a module missing from its package fails here. */
async function copilotActivates(): Promise<string> {
	const copilot = vscode.extensions.getExtension('GitHub.copilot-chat');
	if (!copilot) {
		return 'missing';
	}
	try {
		await copilot.activate();
		return copilot.isActive ? 'active' : 'inactive';
	} catch (error) {
		return `failed: ${error instanceof Error ? error.message : String(error)}`;
	}
}

suite('Shipped build (S6-16)', () => {
	test('the extension activates from the built output, registers its commands, and carries its files', async () => {
		const layout = process.env.COGNIFY_SMOKE_LAYOUT === 'packaged' ? 'packaged' : 'dev';
		const sources = process.env.COGNIFY_SMOKE_SOURCES!;
		const extension = vscode.extensions.getExtension('vscode.cognify-ai')!;
		const api = await extension.activate();
		const registered = new Set(await vscode.commands.getCommands(true));
		const contributed = (extension.packageJSON.contributes.commands as { command: string }[]).map(c => c.command);
		const built = layout === 'packaged' ? 'dist' : 'out';
		const templates = (folder: string) => listFiles(join(folder, 'templates')).filter(file => file.split('/')[1] === 'files');
		const changedTemplateFiles = templates(sources).filter(file => readFileSync(join(sources, 'templates', file), 'utf8') !== readFileSync(join(extension.extensionPath, 'templates', file), 'utf8'));
		assert.deepStrictEqual({
			extensionPath: extension.extensionPath,
			main: extension.packageJSON.main,
			active: extension.isActive,
			api: typeof api?.indexOnOpen,
			unregisteredCommands: contributed.filter(command => !registered.has(command)),
			// B1: a package.json in the output decides how Node loads the compiled code.
			packageJsonInOutput: listFiles(join(extension.extensionPath, built)).filter(file => file.split('/').at(-1) === 'package.json'),
			templateFiles: templates(extension.extensionPath).length === templates(sources).length,
			changedTemplateFiles,
			agents: listFiles(join(extension.extensionPath, 'agents')).length > 0,
			sources: layout === 'packaged' ? ['src', 'out'].filter(folder => listFiles(join(extension.extensionPath, folder)).length > 0) : [],
			// Set when the installed product is launched (scripts/cognify/check-package.mts).
			appName: process.env.COGNIFY_SMOKE_APP_NAME ? vscode.env.appName : undefined,
			// The built-in Copilot extension loads with only the node_modules its VSIX ships (S6-01).
			copilot: process.env.COGNIFY_SMOKE_COPILOT ? await copilotActivates() : undefined,
		}, {
			extensionPath: process.env.COGNIFY_SMOKE_EXTENSION_PATH,
			main: `./${built}/extension`,
			active: true,
			api: 'function',
			unregisteredCommands: [],
			packageJsonInOutput: [],
			templateFiles: true,
			changedTemplateFiles: [],
			agents: true,
			sources: [],
			appName: process.env.COGNIFY_SMOKE_APP_NAME,
			copilot: process.env.COGNIFY_SMOKE_COPILOT ? 'active' : undefined,
		});
	});
});
