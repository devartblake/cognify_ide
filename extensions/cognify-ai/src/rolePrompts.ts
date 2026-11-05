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
export type RoleCommandName = 'review' | 'explain' | 'guide' | 'fix';

export interface RoleCommandSpec {
	readonly command: RoleCommandName;
	/** `CognifyRoleId` in router.ts; kept as a string so this module stays import-free. */
	readonly role: 'reviewer' | 'tutor' | 'coder';
	/** `CognifyTask` in router.ts. */
	readonly task: 'review' | 'explain' | 'edit';
	/** Whether the command needs attached or selected code to be useful. */
	readonly requiresMaterial: boolean;
	/** Whether the prompt includes what Project Cognition knows about running and testing the project (S5-07, S5-08). */
	readonly usesProjectContext?: boolean;
	readonly buildPrompt: (userPrompt: string, material: readonly ContextMaterial[], projectContext?: string) => string;
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

function projectSection(projectContext: string | undefined): string {
	return projectContext?.trim() ? `### What Cognify knows about this project\n${projectContext.trim()}` : '';
}

/** Guide Me (S5-07): small numbered steps toward the user's goal; commands are shown, never run. */
export function buildGuidePrompt(userPrompt: string, material: readonly ContextMaterial[], projectContext?: string): string {
	const goal = userPrompt.trim();
	return [
		'You are the Tutor role in Cognify IDE, guiding a beginner step by step toward a goal. Give numbered steps, each small enough to do in a minute or two, and say exactly where to click or what to type.',
		'Show commands in code blocks and say that the user runs them; never claim to have run, changed or checked anything yourself. Prefer the project\'s own commands from the project context, and say whether they run on this machine or in the Dev Container.',
		'Explain each new term in a few words the first time it appears. End with one line saying what the user should see when it worked. If the goal is unclear, ask one short question instead of guessing.',
		goal ? `The user's goal: ${goal}` : '',
		materialSections(material),
		projectSection(projectContext),
	].filter(Boolean).join('\n\n');
}

/** Fix It (S5-08, decision D3): explain the error, then propose the smallest fix for the user to review and apply. */
export function buildFixPrompt(userPrompt: string, material: readonly ContextMaterial[], projectContext?: string): string {
	const problem = userPrompt.trim();
	return [
		'You are the Coder role in Cognify IDE, helping a beginner fix a problem. First explain in one or two plain sentences what the error means and why it happened.',
		'Then propose the smallest change that fixes it, as a code block for the affected file with the file name above it, so the user can review it and apply it themselves. Do not change unrelated code and do not claim to have applied anything.',
		'If a command is needed (for example to install a package), show it in a code block and say why; the user runs it. If the information isn\'t enough to find the cause, say exactly what you need, such as the full error from the terminal.',
		problem ? `The problem: ${problem}` : '',
		materialSections(material),
		projectSection(projectContext),
	].filter(Boolean).join('\n\n');
}

/** Every role command the participant handles. */
export const ROLE_COMMANDS: readonly RoleCommandSpec[] = [
	{ command: 'review', role: 'reviewer', task: 'review', requiresMaterial: true, buildPrompt: buildReviewPrompt },
	{ command: 'explain', role: 'tutor', task: 'explain', requiresMaterial: false, buildPrompt: buildExplainPrompt },
	{ command: 'guide', role: 'tutor', task: 'explain', requiresMaterial: false, usesProjectContext: true, buildPrompt: buildGuidePrompt },
	{ command: 'fix', role: 'coder', task: 'edit', requiresMaterial: false, usesProjectContext: true, buildPrompt: buildFixPrompt },
];

export function getRoleCommand(command: string | undefined): RoleCommandSpec | undefined {
	return ROLE_COMMANDS.find(spec => spec.command === command);
}
