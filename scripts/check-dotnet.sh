#!/usr/bin/env bash
# Compile-check the .NET projects without a local SDK.
# Builds a private snapshot of the tree in the SDK container (NuGet cache kept in a docker volume),
# so concurrent edits elsewhere never leave files half-written inside the build.
# Usage: scripts/check-dotnet.sh   -> prints errors (if any) and exits non-zero on failure.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SNAP="$(mktemp -d "${TMPDIR:-/tmp}/netipam-snap.XXXXXX")"
trap 'docker run --rm -v "$SNAP":/s alpine rm -rf /s/obj-out >/dev/null 2>&1; rm -rf "$SNAP"' EXIT

tar -C "$ROOT" --exclude=bin --exclude=obj --exclude=node_modules --exclude=.git --exclude='Netipam/wwwroot/app' -cf - Netipam Netipam.Postgres Netipam.slnx 2>/dev/null | tar -C "$SNAP" -xf -

docker volume create netipam-nuget >/dev/null
out="$(docker run --rm -v "$SNAP":/src -v netipam-nuget:/root/.nuget/packages -w /src \
  mcr.microsoft.com/dotnet/sdk:10.0 \
  sh -c 'dotnet build Netipam.Postgres/Netipam.Postgres.csproj -c Release -o /tmp/o -nologo -v q -clp:NoSummary 2>&1')"
rc=$?
echo "$out" | grep -E "error |Build succeeded|Build FAILED|Netipam/Api/.*warning" | sed "s|/src/||" | sort -u | head -80
if echo "$out" | grep -q "error "; then exit 1; fi
exit $rc
