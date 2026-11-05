/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import type { CognifyAiApi } from '../routing';

/** An in-memory `Memento`, so the test doesn't depend on what an earlier run stored. */
class MemoryState implements vscode.Memento {
	private readonly values = new Map<string, unknown>();
	keys(): readonly string[] {
		return [...this.values.keys()];
	}
	get<T>(key: string, defaultValue?: T): T | undefined {
		return this.values.has(key) ? this.values.get(key) as T : defaultValue;
	}
	async update(key: string, value: unknown): Promise<void> {
		this.values.set(key, value);
	}
}

suite('Onboarding and project context (S5-11, S5-12)', () => {
	test('the walkthrough opens on the first run only, and has the Run and Ask Cognify steps', async () => {
		const extension = vscode.extensions.getExtension<CognifyAiApi>('vscode.cognify-ai')!;
		const api = await extension.activate();
		const state = new MemoryState();
		const first = await api.showFirstRunWalkthrough(state);
		const second = await api.showFirstRunWalkthrough(state);
		await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		const steps = (extension.packageJSON.contributes.walkthroughs[0].steps as { id: string; completionEvents: string[] }[]).map(step => [step.id, step.completionEvents[0]]);
		assert.deepStrictEqual({ first, second, steps, activation: extension.packageJSON.activationEvents }, {
			first: 'opened',
			second: 'alreadyShown',
			steps: [
				['newProject', 'onCommand:cognify.newProject'],
				['checkEnvironment', 'onCommand:cognify.environment.check'],
				['checkAiSetup', 'onCommand:cognify.ai.checkSetup'],
				['runProject', 'onCommand:cognify.project.run'],
				['askCognify', 'onCommand:cognify.guideMe'],
			],
			activation: ['onStartupFinished'],
		});
	});

	test('a trusted folder is indexed on open, unless the setting turns it off', async () => {
		const api = await vscode.extensions.getExtension<CognifyAiApi>('vscode.cognify-ai')!.activate();
		const config = vscode.workspace.getConfiguration('cognify.projectModel');
		const built = await api.indexOnOpen();
		await config.update('indexOnOpen', false, vscode.ConfigurationTarget.Global);
		try {
			assert.deepStrictEqual({ built, disabled: await api.indexOnOpen() }, { built: 'built', disabled: 'disabled' });
		} finally {
			await config.update('indexOnOpen', undefined, vscode.ConfigurationTarget.Global);
		}
	});
});
