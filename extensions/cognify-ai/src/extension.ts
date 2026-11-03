/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CognifyErrorKind, CognifyRoleId, CognifyTask, getRole, RouteResult } from './router';
import { CognifyAiApi, CognifyRouter, createRequestId } from './routing';
import type { CognifyPrivacyClass } from './privacy';
import { checkAiSetup, registerAiSetup } from './aiSetup';

const PARTICIPANT_ID = 'cognify.roles';
const MAX_REFERENCE_CHARS = 60_000;
const MAX_TOTAL_CHARS = 150_000;

/** Traceability metadata returned in `ChatResult.metadata` and written to the audit log. */
interface CognifyTraceMetadata {
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

export function activate(context: vscode.ExtensionContext): CognifyAiApi {
	const log = vscode.window.createOutputChannel('Cognify AI', { log: true });
	// Cooldowns are per user (globalState); the audit trail is per workspace (workspaceState).
	const router = new CognifyRouter(context.globalState, context.workspaceState);

	const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, async (request, _chatContext, stream, token) => {
		if (request.command !== 'review') {
			stream.markdown(vscode.l10n.t('Cognify roles in this preview: `/review` (Reviewer). Attach files with `#` or select code, then run `@cognify /review`.'));
			return {};
		}

		const role = getRole('reviewer');
		const task: CognifyTask = 'review';
		const requestId = createRequestId();
		const material = await collectReviewMaterial(request.references, token);
		const prompt = buildReviewPrompt(request.prompt, material);

		stream.progress(vscode.l10n.t('Reviewer: routing review request…'));
		const { route, selection, inputTokens, privacy } = await router.route({
			task,
			requestId,
			role: role.id,
			contextPaths: material.flatMap(m => m.path ? [m.path] : []),
			messages: [vscode.LanguageModelChatMessage.User(prompt)],
			justification: vscode.l10n.t('Cognify Reviewer role sends the selected code to a language model for review.'),
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
			stream.markdown(vscode.l10n.t('**Cognify could not complete the review.** {0}', route.reason));
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
		stream.markdown(formatTraceFooter(metadata.cognify, handoffRole?.name));

		// Metadata only: no prompt text, file contents, or responses are logged.
		log.info(JSON.stringify({ timestamp: new Date().toISOString(), ...metadata.cognify }));

		return { metadata };
	});
	participant.iconPath = new vscode.ThemeIcon('sparkle');

	context.subscriptions.push(
		log,
		participant,
		vscode.commands.registerCommand('cognify.ai.showAuditLog', () => log.show()),
		vscode.commands.registerCommand('cognify.ai.exportAuditLog', () => exportAuditLog(router)),
		vscode.commands.registerCommand('cognify.ai.clearAuditLog', async () => {
			const clear = vscode.l10n.t('Clear');
			if (await vscode.window.showWarningMessage(vscode.l10n.t('Clear the Cognify AI routing log for this workspace?'), { modal: true }, clear) === clear) {
				await router.audit.clear();
			}
		}),
		registerAiSetup(context, router, log),
	);

	return { router, checkSetup: () => checkAiSetup(router) };
}

function formatTraceFooter(trace: CognifyTraceMetadata['cognify'], handoffName: string | undefined): string {
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
	return `*${parts.join(' · ')}*`;
}

interface ReviewMaterial {
	readonly label: string;
	readonly text: string;
	/** Workspace-relative path of the source file, for the privacy gate. */
	readonly path?: string;
}

async function collectReviewMaterial(references: readonly vscode.ChatPromptReference[], token: vscode.CancellationToken): Promise<ReviewMaterial[]> {
	const material: ReviewMaterial[] = [];
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

function buildReviewPrompt(userPrompt: string, material: readonly ReviewMaterial[]): string {
	const sections = material.map(m => `### ${m.label}\n\`\`\`\n${m.text}\n\`\`\``).join('\n\n');
	return [
		'You are the Reviewer role in Cognify IDE. Review the code below for correctness bugs, security problems, and missing edge cases first; style only if it hides a defect.',
		'Report each finding with the file/line, why it is a problem, and a concrete fix. If you find nothing significant, say so plainly.',
		userPrompt.trim() ? `Reviewer focus from the user: ${userPrompt.trim()}` : '',
		sections || 'No code was attached or selected. Ask the user to attach files with # or select code.',
	].filter(Boolean).join('\n\n');
}

/**
 * Save the workspace's routing audit trail as JSON (contract section 9). The
 * records are metadata only, so the file holds no prompts, code or responses.
 */
async function exportAuditLog(router: CognifyRouter): Promise<void> {
	const records = router.audit.all();
	if (records.length === 0) {
		vscode.window.showInformationMessage(vscode.l10n.t('The Cognify AI routing log for this workspace is empty.'));
		return;
	}
	const fileName = `cognify-ai-routing-log-${new Date().toISOString().slice(0, 10)}.json`;
	const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
	const target = await vscode.window.showSaveDialog({
		title: vscode.l10n.t('Export AI Routing Log'),
		defaultUri: folder ? vscode.Uri.joinPath(folder, fileName) : undefined,
		filters: { [vscode.l10n.t('JSON')]: ['json'] },
	});
	if (!target) {
		return;
	}
	await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(JSON.stringify(router.audit.export(), undefined, '\t')));
	vscode.window.showInformationMessage(vscode.l10n.t('Exported {0} routing record(s) to {1}.', records.length, vscode.workspace.asRelativePath(target)));
}
