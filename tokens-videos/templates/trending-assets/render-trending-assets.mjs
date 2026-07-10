#!/usr/bin/env node
/**
 * Cron-friendly Trending Assets pipeline:
 * 1. load local env files
 * 2. refresh top 4 non-crypto, non-stablecoin curated Tokens API assets into data.js
 * 3. generate a beat-forward ElevenLabs instrumental bed
 * 4. validate/lint and render the HyperFrames MP4
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const outDir = resolve(__dirname, "renders");
const assetsDir = resolve(__dirname, "assets");

const args = new Set(process.argv.slice(2));
const skipFetch = args.has("--skip-fetch");
const skipMusic = args.has("--skip-music");
const skipValidate = args.has("--skip-validate");
const skipRender = args.has("--skip-render");
const help = args.has("--help") || args.has("-h");

if (help) {
  console.log(`Usage: node render-trending-assets.mjs [options]

Options:
  --skip-fetch      Do not refresh Tokens API data.js/logos
  --skip-music      Do not call ElevenLabs; reuse assets/bgm-eleven-latest.wav
  --skip-validate   Skip hyperframes lint/validate
  --skip-render     Stop before rendering MP4

Required env:
  TOKENS_API_KEY or TOKENS_XYZ_API_KEY
  ELEVENLABS_API_KEY (unless --skip-music)
`);
  process.exit(0);
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function run(command, commandArgs, options = {}) {
  console.log(`$ ${command} ${commandArgs.join(" ")}`);
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd || __dirname,
    env: options.env || process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${command} exited with ${result.status}`);
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
}

loadEnvFile(resolve(repoRoot, "env"));
loadEnvFile(resolve(repoRoot, "env.local"));
loadEnvFile(resolve(__dirname, ".env"));
loadEnvFile(resolve(__dirname, ".env.local"));

mkdirSync(outDir, { recursive: true });
mkdirSync(assetsDir, { recursive: true });

if (!skipFetch) {
  const tokensKey = process.env.TOKENS_API_KEY || process.env.TOKENS_XYZ_API_KEY;
  if (!tokensKey) throw new Error("Set TOKENS_API_KEY or TOKENS_XYZ_API_KEY");
  run("node", ["fetch-trending.mjs", "4"], {
    env: { ...process.env, TOKENS_API_KEY: tokensKey },
  });
}

if (!skipMusic) {
  const elevenKey = process.env.ELEVENLABS_API_KEY;
  if (!elevenKey) throw new Error("Set ELEVENLABS_API_KEY or pass --skip-music");

  const prompt = [
    "Instrumental lofi hip hop track with an obvious beat from the very first second.",
    "No ambient intro. Start immediately with punchy kick drum, crisp snare on beats two and four, audible hi hat groove.",
    "Warm vinyl texture, mellow Rhodes chords, round bassline, sidechain bounce, premium tokenized equities fintech social video energy.",
    "Drums should be foreground and clearly audible, not background texture. No vocals, no vocal chops.",
  ].join(" ");

  const mp3Path = resolve(assetsDir, "bgm-eleven-latest.mp3");
  const wavPath = resolve(assetsDir, "bgm-eleven-latest.wav");
  console.log("Generating ElevenLabs beat-forward instrumental...");
  const response = await fetch("https://api.elevenlabs.io/v1/music/stream?output_format=mp3_48000_192", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": elevenKey,
    },
    body: JSON.stringify({
      model_id: "music_v2",
      music_length_ms: 12000,
      force_instrumental: true,
      prompt,
    }),
  });
  const body = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    throw new Error(`ElevenLabs error ${response.status}: ${body.toString("utf8").slice(0, 600)}`);
  }
  writeFileSync(mp3Path, body);
  writeFileSync(resolve(assetsDir, "bgm-eleven-latest.prompt.txt"), prompt + "\n");

  run("ffmpeg", [
    "-y",
    "-loglevel", "error",
    "-i", mp3Path,
    "-af", "atrim=0:8.5,asetpts=PTS-STARTPTS,apad=pad_dur=0.2,atrim=0:8.5,afade=t=out:st=8.0:d=0.5,loudnorm=I=-16:TP=-1.2,aformat=channel_layouts=stereo",
    "-ar", "48000",
    wavPath,
  ]);
}

if (!skipValidate) {
  run("npx", ["hyperframes", "lint"]);
  run("npx", ["hyperframes", "validate"]);
}

if (!skipRender) {
  const output = resolve(outDir, `trending-assets_${timestamp()}.mp4`);
  run("npx", ["hyperframes", "render", "--output", output]);
  console.log(`Rendered ${output}`);
}
