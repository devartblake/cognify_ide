#!/usr/bin/env bash
# ---------------------------------------------------------------------------------------------
#  Copyright (c) Cognify IDE contributors. All rights reserved.
#  Licensed under the MIT License. See License.txt in the project root for license information.
# ---------------------------------------------------------------------------------------------
# Runs the cognify-ai extension-host integration tests against the fake language model
# vendors in test-fixtures/fake-lm. Requires a transpiled client (pnpm run transpile-client)
# and the Electron binary (pnpm run electron). On headless Linux, wrap with xvfb-run -a.
set -euo pipefail

EXT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$EXT/../.." && pwd)"
TSC="node $ROOT/node_modules/@typescript/native/lib/tsc.js"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

$TSC --project "$EXT/tsconfig.json"
$TSC --project "$EXT/test-fixtures/fake-lm/tsconfig.json"

mkdir -p "$WORK/workspace" "$WORK/user-data" "$WORK/logs" "$WORK/crash"
cd "$ROOT"
VSCODE_SKIP_PRELAUNCH=1 VSCODE_CLI=1 ./scripts/code.sh "$WORK/workspace" \
	--no-sandbox --disable-gpu --disable-telemetry --disable-experiments --skip-welcome --skip-release-notes \
	--no-cached-data --disable-updates --use-inmemory-secretstorage --disable-workspace-trust \
	--disable-extensions \
	--crash-reporter-directory="$WORK/crash" --logsPath="$WORK/logs" --user-data-dir="$WORK/user-data" \
	--extensionDevelopmentPath="$EXT" \
	--extensionDevelopmentPath="$EXT/test-fixtures/fake-lm" \
	--extensionTestsPath="$EXT/out/test-integration"
