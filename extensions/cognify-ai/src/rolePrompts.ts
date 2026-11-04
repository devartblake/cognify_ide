/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Role commands and their prompts. Pure: no `vscode` import, so it is unit tested
// with `node --test`. The participant (roles.ts) routes every command through the
// same router, footer and audit trail; only the role, task and prompt differ.

/** Code or text the user attached or selected. */
export interface ContextMaterial {
	readonly label: string;
	readonly text: string;
	/** Workspace-relative path of the source file, for the privacy gate. */
	readonly path?: string;
}

/** The `@cognify` slash commands. */
export type RoleCommandName = 'review' | 'explain';

export interface RoleCommandSpec {
	readonly command: RoleCommandName;
	/** `CognifyRoleId` in router.ts; kept as a string so this module stays import-free. */
	readonly role: 'reviewer' | 'tutor';
	/** `CognifyTask` in router.ts. */
	readonly task: 'review' | 'explain';
	/** Whether the command needs attached or selected code to be useful. */
	readonly requiresMaterial: boolean;
	readonly buildPrompt: (userPrompt: string, material: readonly ContextMaterial[]) => string;
}

function materialSections(material: readonly ContextMaterial[]): string {
	return material.map(m => `### ${m.label}\n\`\`\`\n${m.text}\n\`\`\``).join('\n\n');
}

export function buildReviewPrompt(userPrompt: string, material: readonly ContextMaterial[]): string {
	return [
		'You are the Reviewer role in Cognify IDE. Review the code below for correctness bugs, security problems, and missing edge cases first; style only if it hides a defect.',
		'Report each finding with the file/line, why it is a problem, and a concrete fix. If you find nothing significant, say so plainly.',
		userPrompt.trim() ? `Reviewer focus from the user: ${userPrompt.trim()}` : '',
		materialSections(material) || 'No code was attached or selected. Ask the user to attach files with # or select code.',
	].filter(Boolean).join('\n\n');
}

export function buildExplainPrompt(userPrompt: string, material: readonly ContextMaterial[]): string {
	const question = userPrompt.trim();
	const sections = materialSections(material);
	return [
		'You are the Tutor role in Cognify IDE. Explain clearly for a developer who is learning: start with what the code or concept does and why, then walk through how it works step by step, in plain language.',
		'Point out the one or two ideas worth remembering and any common pitfalls. Do not rewrite or refactor the code unless asked; if a change would help understanding, describe it briefly.',
		question ? `What the user wants explained: ${question}` : (sections ? 'Explain the code below.' : ''),
		sections || (question ? 'No code was attached; answer the question directly, with a short example if it helps.' : 'No code or question was given. Ask the user what they would like explained, or to attach files with # or select code.'),
	].filter(Boolean).join('\n\n');
}

/** Every role command the participant handles. */
export const ROLE_COMMANDS: readonly RoleCommandSpec[] = [
	{ command: 'review', role: 'reviewer', task: 'review', requiresMaterial: true, buildPrompt: buildReviewPrompt },
	{ command: 'explain', role: 'tutor', task: 'explain', requiresMaterial: false, buildPrompt: buildExplainPrompt },
];

export function getRoleCommand(command: string | undefined): RoleCommandSpec | undefined {
	return ROLE_COMMANDS.find(spec => spec.command === command);
}
