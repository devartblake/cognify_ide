/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CognifyErrorKind, CognifyRoleId, CognifyTask, getRole, RouteResult } from './router';
import { CognifyRouter, createRequestId } from './routing';
import type { CognifyPrivacyClass } from './privacy';
import { EXPLAIN_ROUTE_COMMAND, explainRouteLink } from './routeExplanation';
import { ContextMaterial, getRoleCommand, RoleCommandName } from './rolePrompts';

const MAX_REFERENCE_CHARS = 60_000;
const MAX_TOTAL_CHARS = 150_000;

/** Traceability metadata returned in `ChatResult.metadata` and written to the audit log. */
export interface CognifyTraceMetadata {
	readonly cognify: {
		readonly requestId: string;
		readonly role: CognifyRoleId;
		readonly task: CognifyTask;
		readonly outcome: RouteResult<unknown>['outcome'] | 'stream-error';
		readonly servedBy?: { readonly vendor: string; readonly modelId: string; readonly modelName: string };
		readonly attempts: readonly { readonly vendor: string; readonly modelId: string; readonly durationMs: number; readonly errorKind?: CognifyErrorKind }[];
		readonly reason: string;
		readonly inputTokens: number;
		readonly excluded: readonly { readonly vendor: string; readonly modelId: string; readonly reason: string }[];
		/** Privacy gate decision; reasons name detectors and file paths, never secret values or content. */
		readonly privacy: { readonly class: CognifyPrivacyClass; readonly reasons: readonly string[] };
		readonly handoff?: { readonly toRole: CognifyRoleId; readonly task: CognifyTask };
	};
}

/** The parts of a chat request a role command uses. */
export type RoleRequest = Pick<vscode.ChatRequest, 'command' | 'prompt' | 'references'>;
/** The parts of a response stream a role command writes to. */
export type RoleResponseStream = Pick<vscode.ChatResponseStream, 'markdown' | 'progress'>;
export type RoleLog = Pick<vscode.LogOutputChannel, 'info' | 'warn'>;

/** Localized, per-command strings (kept out of rolePrompts.ts, which has no `vscode` import). */
function commandText(command: RoleCommandName): { readonly progress: string; readonly justification: string; readonly failed: string; readonly empty?: string } {
	switch (command) {
		case 'review':
			return {
				progress: vscode.l10n.t('Reviewer: routing review request…'),
				justification: vscode.l10n.t('Cognify Reviewer role sends the selected code to a language model for review.'),
				failed: vscode.l10n.t('**Cognify could not complete the review.**'),
			};
		case 'explain':
			return {
				progress: vscode.l10n.t('Tutor: routing explanation request…'),
				justification: vscode.l10n.t('Cognify Tutor role sends your question and any selected code to a language model for an explanation.'),
				failed: vscode.l10n.t('**Cognify could not complete the explanation.**'),
				empty: vscode.l10n.t('What should the Tutor explain? Ask a question, for example `@cognify /explain what is a closure?`, or select code or attach a file with `#` first.'),
			};
		case 'guide':
			return {
				progress: vscode.l10n.t('Tutor: preparing a step-by-step guide…'),
				justification: vscode.l10n.t('Cognify Tutor role sends your goal, any selected code, and how this project runs and tests to a language model for step-by-step guidance.'),
				failed: vscode.l10n.t('**Cognify could not prepare the guide.**'),
				empty: vscode.l10n.t('What would you like to do? For example `@cognify /guide add a page that lists users` or `@cognify /guide run the tests`.'),
			};
		case 'fix':
			return {
				progress: vscode.l10n.t('Coder: looking at the problem…'),
				justification: vscode.l10n.t('Cognify Coder role sends the error, the code around it, and how this project runs and tests to a language model to propose a fix.'),
				failed: vscode.l10n.t('**Cognify could not propose a fix.**'),
				empty: vscode.l10n.t('What should Cognify fix? Describe the problem or paste the error, for example `@cognify /fix TypeError: x is undefined`, or use **Fix with Cognify** on an error in the editor.'),
			};
	}
}

/**
 * The `@cognify` request handler. Every role command goes through the same
 * path: collect context, route by task (privacy gate, settings, fallback),
 * stream the answer, then write the trace footer and the metadata-only log line.
 * The router records the audit trail.
 */
/** What Project Cognition knows about running and testing the project, for Guide Me and Fix It; `undefined` when unknown. */
export type ProjectContextProvider = (token: vscode.CancellationToken) => Promise<string | undefined>;

export function createRoleHandler(router: CognifyRouter, log: RoleLog, projectContext?: ProjectContextProvider) {
	return async (request: RoleRequest, stream: RoleResponseStream, token: vscode.CancellationToken): Promise<vscode.ChatResult> => {
		const spec = getRoleCommand(request.command);
		if (!spec) {
			stream.markdown(vscode.l10n.t('Cognify roles: `/explain` and `/guide` (Tutor), `/fix` (Coder) and `/review` (Reviewer). Attach files with `#` or select code, then run for example `@cognify /explain how does this work?` or `@cognify /guide run the tests`.'));
			return {};
		}

		const material = await collectContextMaterial(request.references, token);
		const text = commandText(spec.command);
		if (!spec.requiresMaterial && material.length === 0 && !request.prompt.trim()) {
			stream.markdown(text.empty ?? '');
			return {};
		}

		const role = getRole(spec.role);
		const task: CognifyTask = spec.task;
		const requestId = createRequestId();
		const context = spec.usesProjectContext && projectContext ? await projectContext(token).catch(() => undefined) : undefined;
		const prompt = spec.buildPrompt(request.prompt, material, context);

		stream.progress(text.progress);
		const { route, selection, inputTokens, privacy } = await router.route({
			task,
			requestId,
			role: role.id,
			contextPaths: material.flatMap(m => m.path ? [m.path] : []),
			messages: [vscode.LanguageModelChatMessage.User(prompt)],
			justification: text.justification,
		}, token);

		let outcome: CognifyTraceMetadata['cognify']['outcome'] = route.outcome;
		let reason = route.reason;
		if (route.value) {
			try {
				for await (const fragment of route.value.text) {
					stream.markdown(fragment);
				}
			} catch (error) {
				// Never switch providers mid-stream (contract section 6, step 7): surface it instead.
				outcome = 'stream-error';
				reason = `${reason} The response stream failed after it started; retry to route again.`;
				await router.audit.amend(requestId, { outcome, reason });
				log.warn(`[${requestId}] stream error: ${error instanceof Error ? error.message : String(error)}`);
			}
		} else if (route.outcome === 'failed') {
			stream.markdown(`${text.failed} ${route.reason}`);
		}

		const servedModel = route.servedBy ? selection.route.find(c => c.id === route.servedBy?.modelId && c.vendor === route.servedBy?.vendor) : undefined;
		const inputTokenCount = (servedModel && inputTokens.get(servedModel.id)) ?? Math.max(0, ...inputTokens.values());
		const handoffRole = role.handoffTo ? getRole(role.handoffTo) : undefined;
		const metadata: CognifyTraceMetadata = {
			cognify: {
				requestId,
				role: role.id,
				task,
				outcome,
				servedBy: route.servedBy && { ...route.servedBy, modelName: servedModel?.name ?? route.servedBy.modelId },
				attempts: route.attempts.map(a => ({ vendor: a.vendor, modelId: a.modelId, durationMs: a.durationMs, errorKind: a.error?.kind })),
				reason,
				inputTokens: inputTokenCount,
				excluded: selection.excluded,
				privacy: { class: privacy.privacy, reasons: privacy.reasons },
				handoff: handoffRole && { toRole: handoffRole.id, task: handoffRole.tasks[0] },
			}
		};

		stream.markdown('\n\n---\n');
		// Trusted for the route-explanation command only, so the "Why this provider?" link works.
		const footer = new vscode.MarkdownString(formatTraceFooter(metadata.cognify, handoffRole?.name));
		footer.isTrusted = { enabledCommands: [EXPLAIN_ROUTE_COMMAND] };
		stream.markdown(footer);

		// Metadata only: no prompt text, file contents, or responses are logged.
		log.info(JSON.stringify({ timestamp: new Date().toISOString(), ...metadata.cognify }));

		return { metadata };
	};
}

export function formatTraceFooter(trace: CognifyTraceMetadata['cognify'], handoffName: string | undefined): string {
	const served = trace.servedBy
		? vscode.l10n.t('served by **{0}** (`{1}`)', trace.servedBy.modelName, trace.servedBy.vendor)
		: vscode.l10n.t('not served');
	const fallbacks = trace.attempts.filter(a => a.errorKind).map(a => `${a.vendor}: ${a.errorKind}`);
	const parts = [
		vscode.l10n.t('Cognify · role **{0}** · task `{1}` · {2} · outcome `{3}`', getRole(trace.role).name, trace.task, served, trace.outcome),
	];
	if (trace.privacy.class !== 'cloud') {
		parts.push(vscode.l10n.t('Privacy: `{0}` ({1})', trace.privacy.class, trace.privacy.reasons.join('; ')));
	}
	if (fallbacks.length > 0) {
		parts.push(vscode.l10n.t('Fallbacks: {0}', fallbacks.join(', ')));
	}
	if (trace.excluded.length > 0) {
		parts.push(vscode.l10n.t('Skipped: {0}', trace.excluded.map(e => `${e.vendor} (${e.reason})`).join(', ')));
	}
	if (handoffName) {
		parts.push(vscode.l10n.t('Suggested handoff: **{0}**', handoffName));
	}
	return `*${parts.join(' · ')}* · ${explainRouteLink(trace.requestId)}`;
}

/** Attached references, else the active editor's selection (or whole document). */
async function collectContextMaterial(references: readonly vscode.ChatPromptReference[], token: vscode.CancellationToken): Promise<ContextMaterial[]> {
	const material: ContextMaterial[] = [];
	let total = 0;
	const add = (label: string, text: string, path?: string) => {
		const clipped = text.slice(0, Math.min(MAX_REFERENCE_CHARS, MAX_TOTAL_CHARS - total));
		if (clipped.length > 0) {
			material.push({ label, text: clipped, path });
			total += clipped.length;
		}
	};

	for (const reference of references) {
		if (token.isCancellationRequested || total >= MAX_TOTAL_CHARS) {
			break;
		}
		const value = reference.value;
		if (value instanceof vscode.Uri) {
			try {
				const document = await vscode.workspace.openTextDocument(value);
				add(vscode.workspace.asRelativePath(value), document.getText(), vscode.workspace.asRelativePath(value));
			} catch {
				// Not a text document (folder, binary); skip it.
			}
		} else if (value instanceof vscode.Location) {
			const document = await vscode.workspace.openTextDocument(value.uri);
			add(`${vscode.workspace.asRelativePath(value.uri)}:${value.range.start.line + 1}-${value.range.end.line + 1}`, document.getText(value.range), vscode.workspace.asRelativePath(value.uri));
		} else if (typeof value === 'string') {
			add(reference.id, value);
		}
	}

	if (material.length === 0) {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			const range = editor.selection.isEmpty ? undefined : editor.selection;
			const label = vscode.workspace.asRelativePath(editor.document.uri) + (range ? `:${range.start.line + 1}-${range.end.line + 1}` : '');
			add(label, editor.document.getText(range), vscode.workspace.asRelativePath(editor.document.uri));
		}
	}
	return material;
}
