import { getEnv } from '../config/env.js';
import type { CandidateInput, RoutingDecision } from './types.js';

/**
 * Draft a Tokens-style post. Uses Claude when a key is configured
 * (P0/P1 only, to control cost); otherwise a wire-style template.
 */
export async function draftCopy(
  input: CandidateInput,
  decision: RoutingDecision,
): Promise<string> {
  const env = getEnv();
  const key = env.TOKENS_ANTHROPIC_API_KEY ?? env.ANTHROPIC_API_KEY;
  const useModel = key && (decision.queue === 'P0_POST_NOW' || decision.queue === 'P1_VERIFY');

  if (useModel) {
    try {
      return await draftWithClaude(key, input, decision);
    } catch {
      // fall through to template on any API failure
    }
  }
  return templateDraft(input, decision);
}

function templateDraft(input: CandidateInput, decision: RoutingDecision): string {
  const tickers = decision.matchedAssets
    .filter((m) => m.matchType === 'direct' || m.matchType === 'source_default')
    .slice(0, 2)
    .map((m) => `$${m.symbol}`)
    .join(' ');
  const headline = input.headline.replace(/\s+/g, ' ').trim();
  return tickers ? `${tickers}: ${headline}` : headline;
}

async function draftWithClaude(
  apiKey: string,
  input: CandidateInput,
  decision: RoutingDecision,
): Promise<string> {
  const assets = decision.matchedAssets.map((m) => m.symbol).join(', ');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system:
        'You write X posts for @tokens, a market-news account about assets tradable on Solana and tokenized market structure. ' +
        'Style: market-wire headline. Factual, specific, numbers first, no hype, no emojis, no hashtags, under 280 characters. ' +
        'If the story connects to tokenized assets or Solana, add one short bridge line. Output ONLY the post text.',
      messages: [
        {
          role: 'user',
          content: `Headline: ${input.headline}\nDetail: ${(input.body ?? '').slice(0, 800)}\nSource: ${input.sourceName} (${input.url ?? 'no url'})\nMatched assets: ${assets || 'none'}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
  const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
  const text = data.content?.find((c) => c.type === 'text')?.text?.trim();
  if (!text) throw new Error('empty draft');
  return text.slice(0, 280);
}
