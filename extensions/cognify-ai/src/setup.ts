/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// AI setup assessment (Sprint 2, S2-03). Pure: no `vscode` import, so it is
// unit tested with `node --test`; the extension formats it for the user.

/**
 * - `ready`: a Copilot model is available, so Chat dispatches `@cognify` requests.
 * - `needs-copilot`: other vendors have models (the router can use them), but
 *   Chat only dispatches participant requests once Copilot is signed in
 *   (AGENT_ROLES_AND_REUSE_MATRIX.md, finding 1).
 * - `no-models`: no language model is available at all.
 */
export type AiSetupReadiness = 'ready' | 'needs-copilot' | 'no-models';

export type VendorKind = 'copilot' | 'local' | 'byok';

export interface VendorSetup {
	readonly vendor: string;
	readonly kind: VendorKind;
	readonly models: number;
	/** Excluded by `cognify.ai.disabledVendors`. */
	readonly disabled: boolean;
	/** Cooling down after an error (epoch ms), if it is. */
	readonly cooldownUntil?: number;
}

export interface AiSetupAssessment {
	readonly readiness: AiSetupReadiness;
	/** Vendors with at least one model, sorted by vendor id. */
	readonly vendors: readonly VendorSetup[];
}

/**
 * Assess the AI setup from the models `vscode.lm` reports. A Copilot model
 * being available is the signal that Copilot is signed in: Copilot only
 * registers models once it has a token. Bring-your-own-key vendors appear only
 * when a key is configured, so their presence answers "is a key set" without
 * ever reading one.
 */
export function assessAiSetup(
	models: readonly { readonly vendor: string }[],
	options: {
		/** Which vendors run on this machine (the privacy gate's `isLocalVendor`). */
		readonly isLocalVendor: (vendor: string) => boolean;
		readonly disabledVendors?: ReadonlySet<string>;
		readonly cooldownUntil?: (vendor: string) => number | undefined;
	},
): AiSetupAssessment {
	const counts = new Map<string, number>();
	for (const model of models) {
		counts.set(model.vendor, (counts.get(model.vendor) ?? 0) + 1);
	}
	const vendors = [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([vendor, count]): VendorSetup => {
		const cooldownUntil = options.cooldownUntil?.(vendor);
		return {
			vendor,
			kind: vendor === 'copilot' ? 'copilot' : options.isLocalVendor(vendor) ? 'local' : 'byok',
			models: count,
			disabled: options.disabledVendors?.has(vendor) ?? false,
			...(cooldownUntil !== undefined ? { cooldownUntil } : {}),
		};
	});
	const readiness: AiSetupReadiness = counts.has('copilot') ? 'ready' : vendors.length > 0 ? 'needs-copilot' : 'no-models';
	return { readiness, vendors };
}
