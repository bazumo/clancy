#!/bin/bash
set -e

cd "$(dirname "$0")"

# Output directories for each platform package
declare -A OUTDIRS=(
  ["linux/amd64"]="../platforms/linux-x64/bin"
  ["linux/arm64"]="../platforms/linux-arm64/bin"
  ["darwin/amd64"]="../platforms/darwin-x64/bin"
  ["darwin/arm64"]="../platforms/darwin-arm64/bin"
)

PLATFORMS=(
  "linux/amd64"
  "linux/arm64"
  "darwin/amd64"
  "darwin/arm64"
)

for platform in "${PLATFORMS[@]}"; do
  GOOS="${platform%/*}"
  GOARCH="${platform#*/}"
  outdir="${OUTDIRS[$platform]}"
  output="$outdir/tls-proxy"

  mkdir -p "$outdir"

  echo "Building $GOOS/$GOARCH -> $output"
  GOOS=$GOOS GOARCH=$GOARCH go build -ldflags="-s -w" -o "$output" .
done

echo ""
echo "Built binaries:"
for platform in "${PLATFORMS[@]}"; do
  outdir="${OUTDIRS[$platform]}"
  ls -lh "$outdir"/tls-proxy 2>/dev/null || echo "  $outdir/tls-proxy (not found)"
done
