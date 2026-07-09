# Setup

An agent needs the repository, Node.js 22+, FFmpeg, the HyperFrames skill, the Tokens video-kit skill, and two local API keys. The public repository includes all template and runtime source; it intentionally does not include credentials.

## One Command After Cloning

```bash
bash scripts/bootstrap-video-kit.sh
```

The bootstrap checks Node, installs FFmpeg when Homebrew or apt is available, and installs both agent skills:

```bash
npx skills add heygen-com/hyperframes
npx skills add thenpceo/tokens-video-kit
```

## If Node Is Missing Or Too Old

Install Node.js 22 or later, then rerun the bootstrap.

```bash
# macOS
brew install node@22

# Any OS with nvm
nvm install 22
nvm use 22
```

## Credentials

```bash
cp tokens-videos/env.example env
```

Set these values in the new root `env` file:

```dotenv
TOKENS_XYZ_API_KEY=your_tokens_api_key
ELEVENLABS_API_KEY=your_elevenlabs_api_key
```

Do not put keys in prompts, source files, commits, or the public repository.

## Verify The Environment

```bash
npx hyperframes doctor
```

Node.js, FFmpeg, and Chrome are the required checks for this kit. Docker, Kokoro TTS, and MusicGen are optional HyperFrames integrations and do not block these templates; the Trending Assets workflow uses ElevenLabs Music instead.

## First Render

```bash
cd tokens-videos/templates/trending-assets
node render-trending-assets.mjs
```

This fetches the current top four tokenized stocks only, generates a new ElevenLabs instrumental, validates the composition, and writes a timestamped MP4 to `renders/`.

For a milestone render that does not require a live Tokens API fetch, start with `tokens-videos/templates/breaking-ath-square/` and use HyperFrames variables as documented in `tokens-videos/references/templates.md`.
