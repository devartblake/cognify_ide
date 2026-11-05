/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Previewing a running app (Sprint 5, decision D1): upstream's integrated browser on desktop,
// then Simple Browser, then the system browser. Cognify doesn't build its own preview.

import * as vscode from 'vscode';

/** Upstream's integrated browser (`src/vs/workbench/contrib/browserView`, desktop only). */
const INTEGRATED_BROWSER_COMMAND = 'workbench.action.browser.open';
/** The Simple Browser extension's API; it delegates to the integrated browser when that exists. */
const SIMPLE_BROWSER_COMMAND = 'simpleBrowser.api.open';

export type PreviewSurface = 'integratedBrowser' | 'simpleBrowser' | 'external';

/** The arguments upstream's `workbench.action.browser.open` accepts (`IOpenBrowserOptions`). */
interface IntegratedBrowserOptions {
	readonly url: string;
	readonly openToSide?: boolean;
	/** Reuse and focus the first browser tab whose URL matches this glob, instead of opening another. */
	readonly reuseUrlFilter?: string;
}

/**
 * Opens `url` beside the editor. A second call for the same origin focuses the existing tab
 * and navigates it, so running a project again doesn't pile up tabs.
 */
export async function openPreview(url: vscode.Uri): Promise<PreviewSurface> {
	const commands = await vscode.commands.getCommands(true);
	if (commands.includes(INTEGRATED_BROWSER_COMMAND)) {
		const options: IntegratedBrowserOptions = { url: url.toString(true), openToSide: true, reuseUrlFilter: `${url.scheme}://${url.authority}/**` };
		await vscode.commands.executeCommand(INTEGRATED_BROWSER_COMMAND, options);
		return 'integratedBrowser';
	}
	if (commands.includes(SIMPLE_BROWSER_COMMAND)) {
		await vscode.commands.executeCommand(SIMPLE_BROWSER_COMMAND, url, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true });
		return 'simpleBrowser';
	}
	await vscode.env.openExternal(url);
	return 'external';
}
