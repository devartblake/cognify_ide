#!/usr/bin/env bash
# ---------------------------------------------------------------------------------------------
#  Copyright (c) Cognify IDE contributors. All rights reserved.
#  Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------
# The shipped-build check (S6-16): builds cognify-ai the two ways Cognify ships it, and checks
# that each activates (src/test-smoke):
#   1. dev:      gulp compile-extension:cognify-ai -> out/ (pnpm run watch / compile)
#   2. packaged: the product build's packaging (esbuild -> dist/, vsce file list, minified JSON),
#                through build/cognify/packageExtension.ts
# Requires a transpiled client and the Electron binary, like test-integration.sh. On headless
# Linux, wrap with xvfb-run -a. Leaves out/ as the gulp build wrote it.
set -euo pipefail

EXT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$EXT/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cd "$ROOT"
node node_modules/gulp/bin/gulp.js --gulpfile build/gulpfile.extensions.ts compile-extension:cognify-ai
node build/cognify/packageExtension.ts cognify-ai "$WORK/package"

smoke() {
	local layout="$1" extension="$2" run="$WORK/$1"
	mkdir -p "$run/workspace" "$run/user-data" "$run/logs" "$run/crash"
	echo "Shipped-build check: $layout ($extension)"
	COGNIFY_SMOKE_LAYOUT="$layout" COGNIFY_SMOKE_EXTENSION_PATH="$extension" COGNIFY_SMOKE_SOURCES="$EXT" \
	VSCODE_SKIP_PRELAUNCH=1 VSCODE_CLI=1 ./scripts/code.sh "$run/workspace" \
		--no-sandbox --disable-gpu --disable-telemetry --disable-experiments --skip-welcome --skip-release-notes \
		--no-cached-data --disable-updates --use-inmemory-secretstorage --disable-workspace-trust \
		--disable-extensions \
		--crash-reporter-directory="$run/crash" --logsPath="$run/logs" --user-data-dir="$run/user-data" \
		--extensionDevelopmentPath="$extension" \
		--extensionTestsPath="$EXT/out/test-smoke"
}

smoke dev "$EXT"
smoke packaged "$WORK/package/extensions/cognify-ai"
