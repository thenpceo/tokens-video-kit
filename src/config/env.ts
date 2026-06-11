import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs';

// The team keeps keys in `env` / `env.local` (no leading dot). Load every
// variant that exists; earlier files win for duplicate keys per dotenv rules,
// so load the most specific (.local) first.
const root = process.cwd();
for (const file of ['.env.local', '.env', 'env.local', 'env']) {
  const p = path.join(root, file);
  if (fs.existsSync(p)) loadDotenv({ path: p });
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_PATH: z.string().default(path.join(root, 'data', 'tokens-postability.sqlite')),
  SOURCE_REGISTRY_PATH: z.string().default(path.join(root, 'config', 'source-registry.json')),
  PUBLIC_BASE_URL: z.string().url().optional(),

  // Slack: webhook is the v1 posting path; bot token + signing secret enable
  // interactive buttons once a Slack app exists.
  SLACK_WEBHOOK_URL: z.string().url().optional(),
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),
  SLACK_POST_CHANNEL_ID: z.string().optional(),
  SLACK_VERIFY_CHANNEL_ID: z.string().optional(),

  // Ingestion credentials. All optional: absence puts the connector in an
  // explicit degraded/disabled state rather than crashing the worker.
  SEC_USER_AGENT: z.string().default('TokensPostabilityEngine/0.1 (nicholas@smok3.io)'),
  X_BEARER_TOKEN: z.string().optional(),
  X_CONSUMER_KEY: z.string().optional(),
  X_CONSUMER_SECRET: z.string().optional(),
  TWITTERAPI_IO_KEY: z.string().optional(),
  CRYPTOPANIC_API_KEY: z.string().optional(),
  BENZINGA_API_KEY: z.string().optional(),
  FINNHUB_API_KEY: z.string().optional(),

  // Draft generation.
  TOKENS_ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (!cached) {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new Error(`Invalid environment: ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export interface ConnectorStatus {
  name: string;
  enabled: boolean;
  reason?: string;
}

/** Explicit degraded-mode report: which connectors can run with current env. */
export function connectorStatuses(env: Env = getEnv()): ConnectorStatus[] {
  return [
    { name: 'rss', enabled: true },
    { name: 'sec', enabled: true },
    {
      name: 'slack_post',
      enabled: Boolean(env.SLACK_WEBHOOK_URL || env.SLACK_BOT_TOKEN),
      reason: env.SLACK_WEBHOOK_URL || env.SLACK_BOT_TOKEN ? undefined : 'no SLACK_WEBHOOK_URL or SLACK_BOT_TOKEN',
    },
    {
      name: 'slack_interactive',
      enabled: Boolean(env.SLACK_BOT_TOKEN && env.SLACK_SIGNING_SECRET),
      reason:
        env.SLACK_BOT_TOKEN && env.SLACK_SIGNING_SECRET
          ? undefined
          : 'needs SLACK_BOT_TOKEN + SLACK_SIGNING_SECRET (create a Slack app)',
    },
    {
      name: 'x_ingestion',
      enabled: Boolean(env.X_BEARER_TOKEN || env.TWITTERAPI_IO_KEY),
      reason: env.X_BEARER_TOKEN || env.TWITTERAPI_IO_KEY ? undefined : 'x_ingestion_disabled: no X_BEARER_TOKEN or TWITTERAPI_IO_KEY',
    },
    {
      name: 'cryptopanic',
      enabled: Boolean(env.CRYPTOPANIC_API_KEY),
      reason: env.CRYPTOPANIC_API_KEY ? undefined : 'no CRYPTOPANIC_API_KEY',
    },
    {
      name: 'drafting',
      enabled: Boolean(env.TOKENS_ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY),
      reason: env.TOKENS_ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY ? undefined : 'no Anthropic API key',
    },
  ];
}
