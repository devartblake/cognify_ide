/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Cognify IDE contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Packages one built-in extension the way the product build does (S6-16): the same
// `fromLocal` and `minifyExtensionResources` steps as `doPackageLocalExtensionsStream` in
// build/lib/extensions.ts, for one extension, so CI can check the shipped layout without
// building the product.
//
// Usage: node build/cognify/packageExtension.ts <extension folder name> <destination>
// The extension is written to <destination>/extensions/<name>.

import path from 'path';
import { gulp, rename } from '../lib/gulp/facade.ts';
import { fromLocal, minifyExtensionResources } from '../lib/extensions.ts';

const root = path.dirname(path.dirname(import.meta.dirname));

/**
 * Packages `extensions/<name>` for the desktop product into `destination`.
 */
export function packageExtension(name: string, destination: string): Promise<void> {
	return new Promise((resolve, reject) => {
		minifyExtensionResources(
			fromLocal(path.join(root, 'extensions', name), false)
				.pipe(rename(p => { p.dirname = `extensions/${name}/${p.dirname}`; }))
		)
			.pipe(gulp.dest(destination))
			.on('end', () => resolve())
			.on('finish', () => resolve())
			.on('error', reject);
	});
}

if (import.meta.main) {
	const [name, destination] = process.argv.slice(2);
	if (!name || !destination) {
		console.error('Usage: node build/cognify/packageExtension.ts <extension folder name> <destination>');
		process.exit(2);
	}
	await packageExtension(name, path.resolve(destination));
}
