import { XmlPrompt } from './xml-prompt';

export type StyleTweet = {
  id: number;
  tweet: string;
};

export interface StyleProfile {
  prefersMultiline: boolean;
  prefersBlankLineBlocks: boolean;
  preferredListMarkers: string[];
  minLinesPerTweet: number;
}

export const USER_STYLE_SAMPLE: StyleTweet[] = [
  {
    id: 1,
    tweet: `vibe coding is really just

"I can't explain what my code does"

→ AI writes 400 lines
→ you don't review it
→ tests pass
→ you deploy
→ 3am outage hits
→ you're lost on where to start
→ tell AI to fix it
→ AI breaks 3 other features

we're not building quicker

we're just breaking stuff
faster than before

and calling it innovation`
  },
  {
    id: 2,
    tweet: `Thanks to all the OG programmers who hand-wrote millions of lines of code for:

→ Operating systems
→ Programming languages
→ Version control
→ The internet stack
→ Databases

So I can vibe code at 20 with AI doing the typing`
  },
  {
    id: 3,
    tweet: `Vibe coding is best for people who already know how to code.`
  },
  {
    id: 4,
    tweet: `With vibe coding, you accidentally learn:

- how APIs connect everything.
- why your .env file matters.
- what localhost really means.
- why deployments break but local works.
- how auth actually works.
- what really happens after npm install.
- how backend logic flows.
- how your database is structured.
- why rate limits exist.`
  },
  {
    id: 5,
    tweet: `"learn to code"

> The code: AI generated
> The debugging: AI generated
> The PR review: AI generated
> The engineer: reading logs`
  },
  {
    id: 6,
    tweet: `Progress updates of "Wryte"

- Connected Agent with editor
- Create Page & Autosaving done
- Agent chat saving done
- Created Agent Tools for editor

Next goal is to :-

- Work on agent to work as expected
- Track and manage agent usage for each user
- Some bug fixes needed`
  },
  {
    id: 7,
    tweet: `This is the solo startup cheat sheet :-

- n8n — automation
- Supabase — backend
- Cursor — code
- Claude — thinking
- Vercel — deploy
- Stripe — payments
- Resend — emails
- Framer — landing page
- PostHog — analytics
- Cloudflare — security`
  },
  {
    id: 8,
    tweet: `Today's update of "Wryte"

- AutoComplete Functionality ✅
- All Editor Tools are working✅ 
- Added some Typograph style on editor✅

The Ai part is started in the project, so my next goal in editor is -

+ Shorten functionality
+ Expand Functionality
+ Summarize Functionality`
  },
  {
    id: 9,
    tweet:`Self note:

Stop thinking your interests are too scattered.

You’re drawn to many things for a reason.

One day you’re coding, another day you’re learning music, and the next you’re writing ideas that don’t seem connected.

It looks messy from the outside.
But that mix is where your edge comes from.

Each interest feeds the others.
Over time they start forming patterns that only you can see.

What feels random right now is actually your style forming.

The goal isn’t to narrow yourself down to one thing.
The goal is to use the mix and create something only you could make.`
    }
];

const PROHIBITED_WORDS = [
  'meticulous',
  'seamless',
  'dive',
  'headache',
  'headaches',
  'deep dive',
  'testament to',
  'foster',
  'beacon',
  'journey',
  'elevate',
  'massive',
  'wild',
  'absolutely',
  'flawless',
  'streamline',
  'navigating',
  'delve into',
  'complexities',
  'a breeze',
  'hit(s) different',
  'realm',
  'bespoke',
  'tailored',
  'towards',
  'redefine',
  'underpins',
  'embrace',
  'to navigate xyz',
  'game-changing',
  'game changer',
  'empower',
  'the xzy landscape',
  'ensure',
  'comphrehensive',
  'supercharge',
  'ever-changing',
  'ever-evolving',
  'nightmare',
  'the world of',
  'not only',
  'seeking more than just',
  'designed to enhance',
  'no ..., just ...',
  "it's not merely",
  'our suite',
  'hell',
  'it is advisable',
  'no more ...',
  'daunting',
  'in the heart of',
  'when it comes to',
  'in the realm of',
  'amongst',
  'unlock the secrets',
  'harness power',
  'unveil the secrets',
  'transforms',
  'robust',
] as const;

export function normalizeStyleSample(styleSample?: StyleTweet[]): StyleTweet[] {
  if (!styleSample || !Array.isArray(styleSample) || styleSample.length === 0) {
    return USER_STYLE_SAMPLE;
  }
  return styleSample;
}

const LIST_MARKERS = ['->', '→', '-', '+', '>', '•'] as const;
const LIST_MARKER_LINE_REGEX = /^\s*(->|→|-|\+|>|•)\s+/;
const INLINE_LIST_MARKER_REGEX = /\s(->|→|-|\+|>|•)\s/g;

function nonEmptyLines(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function inferStyleProfile(styleSample: StyleTweet[]): StyleProfile {
  const safeSample = styleSample.length > 0 ? styleSample : USER_STYLE_SAMPLE;
  const markerCounts = new Map<string, number>();

  let multilineTweets = 0;
  let blankLineTweets = 0;

  safeSample.forEach(({ tweet }) => {
    const normalized = tweet.replace(/\r\n/g, '\n').trim();
    const lines = nonEmptyLines(normalized);

    if (lines.length >= 3) {
      multilineTweets += 1;
    }

    if (/\n\s*\n/.test(normalized)) {
      blankLineTweets += 1;
    }

    lines.forEach((line) => {
      const marker = line.match(LIST_MARKER_LINE_REGEX)?.[1];
      if (marker) {
        markerCounts.set(marker, (markerCounts.get(marker) ?? 0) + 1);
      }
    });
  });

  const sampleCount = safeSample.length;
  const preferredListMarkers = [...markerCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([marker]) => marker)
    .filter((marker) => LIST_MARKERS.includes(marker as (typeof LIST_MARKERS)[number]))
    .slice(0, 2);

  return {
    prefersMultiline: multilineTweets >= Math.ceil(sampleCount / 2),
    prefersBlankLineBlocks: blankLineTweets >= Math.ceil(sampleCount / 3),
    preferredListMarkers,
    minLinesPerTweet: multilineTweets >= Math.ceil(sampleCount / 2) ? 3 : 1,
  };
}

export function repairTweetFormatting(tweetText: string, styleProfile: StyleProfile): string {
  const normalized = tweetText.replace(/\r\n/g, '\n').trim();

  if (normalized.includes('\n')) {
    return normalized;
  }

  const inlineMarkers = [...normalized.matchAll(INLINE_LIST_MARKER_REGEX)];

  if (inlineMarkers.length >= 2) {
    let repaired = normalized.replace(INLINE_LIST_MARKER_REGEX, '\n$1 ').trim();

    if (styleProfile.prefersBlankLineBlocks) {
      repaired = repaired.replace(
        /^([^\n]+)\n(?=(?:->|→|-|\+|>|•)\s)/,
        '$1\n\n',
      );
    }

    return repaired.trim();
  }

  if (styleProfile.prefersMultiline && normalized.length >= 120) {
    return normalized.replace(/\. (?=[A-Z])/g, '.\n').trim();
  }

  return normalized;
}

export function validateTweetStyleFormat(
  tweets: string[],
  styleProfile: StyleProfile,
): string | undefined {
  if (tweets.length !== 3) {
    return 'Exactly three tweets are required.';
  }

  const normalizedTweets = tweets.map((tweet) => tweet.replace(/\r\n/g, '\n').trim());
  const multilineCount = normalizedTweets.filter(
    (tweet) => nonEmptyLines(tweet).length >= styleProfile.minLinesPerTweet,
  ).length;

  if (styleProfile.prefersMultiline && multilineCount < 2) {
    return 'At least 2 drafts must be multi-line with short, skimmable lines.';
  }

  const blankLineCount = normalizedTweets.filter((tweet) => /\n\s*\n/.test(tweet)).length;
  if (styleProfile.prefersBlankLineBlocks && blankLineCount < 1) {
    return 'Use blank lines between thought blocks in at least one draft.';
  }

  if (styleProfile.preferredListMarkers.length > 0) {
    const allowedMarkers = new Set(styleProfile.preferredListMarkers);
    const listLikeDrafts = normalizedTweets.filter((tweet) =>
      nonEmptyLines(tweet).some((line) => {
        const marker = line.match(LIST_MARKER_LINE_REGEX)?.[1];
        return marker ? allowedMarkers.has(marker) : false;
      }),
    ).length;

    if (listLikeDrafts < 1) {
      return `At least one draft should use the user's list-marker style (${styleProfile.preferredListMarkers.join(', ')}).`;
    }
  }

  return undefined;
}

interface TweetPromptInput {
  request: string;
  styleSample: StyleTweet[];
  attempt: number;
  previousFailureReason?: string;
}

export function buildTweetPrompt({
  request,
  styleSample,
  attempt,
  previousFailureReason,
}: TweetPromptInput): string {
  const styleProfile = inferStyleProfile(styleSample);
  const markerHint =
    styleProfile.preferredListMarkers.length > 0
      ? styleProfile.preferredListMarkers.join(', ')
      : 'none observed';

  const prompt = new XmlPrompt();

  prompt.text(`You are an expert Twitter/X copywriter.

Generate exactly 3 distinct tweet drafts for the user's request.
Match the user's natural tone based on their style sample.`);

  prompt.tag('general_rules', `
- MATCH THE VISUAL FORMATTING of the style sample EXACTLY. If the sample uses single-line spacing with blank lines between them, you MUST use single-line spacing with blank lines between them. If it uses lists, use lists.
- Use a 6th-grade reading level phrasing.
- Keep each tweet at or below 280 characters.
- Keep the language natural and human, not polished ad copy. NEVER write like a tech influencer or marketer.
- NEVER use ANY hashtags, links, or mentions UNLESS explicitly asked.
- In your drafts, favor short and direct sentences.
  `.trim());

  prompt.tag('output_formatting', `
You are writing structured output where each draft goes into tweets[].text.
- Keep line breaks as real newline characters.
- Never collapse a list into one paragraph.
- Make each draft easy to skim visually.
- If list markers are used, place each item on its own line.
- Most reference tweets are ${styleProfile.prefersMultiline ? 'multi-line' : 'single block'}.
- Blank-line block style is ${styleProfile.prefersBlankLineBlocks ? 'common and should be used' : 'optional'}.
- Observed list markers: ${markerHint}.
- Minimum non-empty lines per draft target: ${styleProfile.minLinesPerTweet}.
  `.trim());

  prompt.tag('anti_hype_rule', `
NEVER write like a tech influencer or marketer. Be understated and factual.
BANNED PATTERNS:
- "This is huge/massive/insane/brilliant/wild"
- "Game changer"
- "Performance monster/beast"
- "Must-upgrade/must-have"
- "The biggest/best/fastest yet"
- Any superlatives about performance
- Acting like improvements are shocking or revolutionary

INSTEAD:
- State the numbers plainly
- Describe what changed without evaluation
- Let readers decide if it matters to them
- Write like you're noting observations, not selling
  `.trim());

  prompt.tag('no_more_pattern_rule', `
NEVER use the "no more..." pattern when describing improvements or solutions. This includes phrases like:
- "No more waiting for..."
- "No more guessing..."
- "No more struggling with..."

Instead, describe the positive outcome directly:
BAD: "No more waiting 30 seconds for your app to build"
GOOD: "Your app builds in under 3 seconds now"
  `.trim());

  prompt.tag('assertive_contrast_pattern_rule', `
NEVER use the "setup? punchline." structure.
For example:
- Their entire code? Copied.
- He did the entire thing by himself? Wrong.
- The engineer who seems confident? They struggled too.
Write full, natural sentences instead.
  `.trim());

  prompt.tag('concrete_language_rule', `
Be specific and direct, avoid vague descriptions.
BAD: "recursive objects that actually work"
GOOD: "with the new error handling, we know exactly where and why an error happened"
  `.trim());

  prompt.tag('observer_first_person', `
A tone that uses first-person voice (I/me/we) to react, comment, or reflect — without implying authorship or ownership of the content being referenced.
Allowed if sounding natural: "Really curious to try this" "Love how clean the API looks"
Banned unless asked to assume authorship: "Just shipped this!" "We launched!"
  `.trim());

  prompt.tag('prohibited_words', `
NEVER under ANY CIRCUMSTANCES use any of the following words or language:
${PROHIBITED_WORDS.join(', ')}
These words are PROHIBITED and you CANNOT use ANY of them.
  `.trim());

  prompt.tag('variation_requirements', `
Provide exactly 3 distinct tweet drafts.
- Draft 1: direct and simple.
- Draft 2: insight-focused with one concrete takeaway.
- Draft 3: slightly bolder angle, still natural and believable.
  `.trim());

  prompt.tag('style_fidelity_check', `
Before finalizing, silently verify:
1) Each draft looks like the user's tweet layout style.
2) At least one draft uses the user's list-marker pattern when appropriate.
3) Draft text is skimmable (short lines, deliberate spacing, not a wall of text).
If any check fails, rewrite before returning output.
  `.trim());

  prompt.open('desired_tweet_style');
  prompt.text(`The following is a style sample from the user. Your output should sound EXACTLY like it was written by the user. Match casing, rhythm, sentence length, and directness perfectly. Pay special attention to how information is visually organized (lists, paragraphs, line breaks, line-by-line formatting) and REPLICATE IT EXACTLY.

<example_tweets>`);

  styleSample.forEach((s) => {
    prompt.tag('tweet', s.tweet.trim(), { id: s.id });
  });

  prompt.text(`</example_tweets>`);
  prompt.close('desired_tweet_style');

  prompt.tag('user_request', request.trim());

  prompt.text(`\nAttempt: ${attempt}`);
  if (previousFailureReason?.trim()) {
    prompt.text(`\nRetry note: previous attempt failed validation. Keep each tweet <= 280 chars and follow the schema exactly.\nFailure context: ${previousFailureReason.trim()}`);
  }

  prompt.text(`\nReturn only what the output schema expects.`);

  return prompt.toString();
}
