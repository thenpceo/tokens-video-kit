import type { CandidateInput, RoutingDecision } from '../pipeline/types.js';

const QUEUE_EMOJI: Record<string, string> = {
  P0_POST_NOW: '🟢',
  P1_VERIFY: '🟡',
  P2_ROUNDUP: '🔵',
  MONITORING: '⚪',
  REJECTED: '🔴',
};

/**
 * Block Kit card for a candidate. Interactive buttons are included only when
 * `interactive` is true (requires a Slack app with bot token); webhook
 * delivery renders the same card without actions.
 */
export function renderCandidateCard(
  candidateId: number,
  input: CandidateInput,
  decision: RoutingDecision,
  draftCopy: string | null,
  interactive: boolean,
): { text: string; blocks: unknown[] } {
  const emoji = QUEUE_EMOJI[decision.queue] ?? '⚪';
  const gates = Object.entries(decision.gateResults)
    .map(([name, g]) => `${g.pass ? '✓' : '✗'} ${name}`)
    .join('  ');
  const assets = decision.matchedAssets.length
    ? decision.matchedAssets.map((m) => `$${m.symbol} (${m.matchType})`).join(', ')
    : 'none';
  const s = decision.score;
  const scoreLine = `*${s.total}/10* — relevance ${s.asset_relevance}/3, movement ${s.market_movement}/2, specificity ${s.specificity}/2, timeliness ${s.timeliness}/1, thesis ${s.thesis_fit}/2`;

  const blocks: unknown[] = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `${emoji} *[${decision.queue}]* ${input.headline}` },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: [
            `*Source:* ${input.sourceName} (tier ${input.sourceTier})`,
            input.url ? `<${input.url}|link>` : null,
            `*Age:* ${decision.ttl.ageMinutes}m`,
            `*Category:* ${decision.ttl.category}`,
          ].filter(Boolean).join(' · '),
        },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Assets:* ${assets}\n*Score:* ${scoreLine}\n*Gates:* ${gates}${
          decision.reasonCodes.length ? `\n*Reasons:* ${decision.reasonCodes.join(', ')}` : ''
        }`,
      },
    },
  ];

  if (draftCopy) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Draft:*\n>${draftCopy.replace(/\n/g, '\n>')}` },
    });
  }

  if (interactive) {
    blocks.push(
      {
        type: 'actions',
        block_id: `feedback:${candidateId}`,
        elements: [
          btn('post_worthy', '👍 Post-worthy', candidateId),
          btn('useful', 'Useful', candidateId),
          btn('who_cares', 'Who cares', candidateId),
          btn('duplicate', 'Duplicate', candidateId),
          btn('stale', 'Stale', candidateId),
        ],
      },
      {
        type: 'actions',
        block_id: `feedback2:${candidateId}`,
        elements: [
          btn('bad_source', 'Bad source', candidateId),
          btn('wrong_fit', 'Wrong fit', candidateId),
          btn('approve', '✅ Approve', candidateId, 'primary'),
          btn('mark_posted', 'Mark posted', candidateId),
          btn('skip', 'Skip', candidateId, 'danger'),
        ],
      },
    );
  }

  return { text: `[${decision.queue}] ${input.headline}`, blocks };
}

function btn(action: string, label: string, candidateId: number, style?: string) {
  const b: Record<string, unknown> = {
    type: 'button',
    action_id: action,
    text: { type: 'plain_text', text: label },
    value: String(candidateId),
  };
  if (style) b.style = style;
  return b;
}
