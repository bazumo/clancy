#!/bin/bash
set -e

cd "$(dirname "$0")"

OUTDIR="../tls-binaries"
mkdir -p "$OUTDIR"

PLATFORMS=(
  "linux/amd64"
  "linux/arm64"
  "darwin/amd64"
  "darwin/arm64"
)

for platform in "${PLATFORMS[@]}"; do
  GOOS="${platform%/*}"
  GOARCH="${platform#*/}"
  output="$OUTDIR/tls-proxy-${GOOS}-${GOARCH}"

  echo "Building $GOOS/$GOARCH..."
  GOOS=$GOOS GOARCH=$GOARCH go build -ldflags="-s -w" -o "$output" .
done

echo ""
echo "Built binaries:"
ls -lh "$OUTDIR"/
