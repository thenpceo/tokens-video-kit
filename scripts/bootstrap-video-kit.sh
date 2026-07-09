#!/usr/bin/env bash
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22+ is required. Install it, then rerun this script."
  exit 1
fi

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt 22 ]; then
  echo "Node.js 22+ is required; found $(node --version)."
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    brew install ffmpeg
  elif command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y ffmpeg
  else
    echo "FFmpeg is required. Install it, then rerun this script."
    exit 1
  fi
fi

npx skills add heygen-com/hyperframes
npx skills add thenpceo/tokens-video-kit

echo "Setup complete. Copy tokens-videos/env.example to env, add both API keys, then run the Trending Assets renderer."
