/**
 * Loads Adi's and the chef's prompts and turns a WhatsApp message into a
 * reply. The prompts are the actual safety layer (allergy handling, the
 * health boundary, "don't invent"); this file is transport, not policy.
 */
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { calculateDailyTarget } = require('./nutrition-calculator');
const { listFoods, calculateForItems } = require('./food-calculator');

// Vendored into YAHEALTHYbackend/docs/bot/ (copied from the repo-root
// docs/bot/, which stays the source of truth for editing) because Vercel's
// project root is set to YAHEALTHYbackend/ -- anything outside it isn't part
// of the deploy bundle.
//
// The 'adi' key is the persona identifier (matches whapi_conversations
// .active_bot -- see migrations/003). The .md filename under it was left as
// nuri-bot-prompt.md: a file path has no runtime meaning the way the key
// does, and renaming it is pure churn for the same reason evals/ still says
// "nuri" in its own file names.
const PROMPT_PATHS = {
  adi: path.join(__dirname, '..', 'docs', 'bot', 'nuri-bot-prompt.md'),
  chef: path.join(__dirname, '..', 'docs', 'bot', 'chef-bot-prompt.md')
};

function loadPrompt(bot) {
  try {
    return fs.readFileSync(PROMPT_PATHS[bot], 'utf8');
  } catch (err) {
    throw new Error(
      `Could not read the ${bot} prompt at ${PROMPT_PATHS[bot]}. Original error: ${err.message}`
    );
  }
}

const SYSTEM_PROMPTS = {
  adi: loadPrompt('adi'),
  chef: loadPrompt('chef')
};

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  // Required when ANTHROPIC_API_KEY is an org-level key not scoped to one
  // workspace -- Anthropic rejects requests from such a key with a 400
  // (invalid_request_error) unless this header names which workspace to use.
  defaultHeaders: process.env.ANTHROPIC_WORKSPACE_ID
    ? { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID }
    : undefined
});

// --- Tools available to generateReply (not enabled on the live path) -------
//
// Anthropic tool specs (Messages API tool-use format). snake_case input to
// match how models name JSON fields; mapped to the calculators' camelCase.
//
// generateReply() below takes a `tools` list and defaults it to [] --
// routes/whapi.js, the only real caller, never passes one, so the live bot
// sends none of this to the model today. The live prompts (docs/bot/
// nuri-bot-prompt.md and the chef prompt) still explicitly forbid Adi from
// giving exact numeric nutrition targets. Wiring calculate_daily_target (or
// any tool here) into what a real customer sees is a separate, deliberate
// product decision nobody has made yet -- not a side effect of this file's
// structure. generateReplyWithTools, below, is the only thing that passes
// this list, so a caller has to opt in by name.
const TOOLS = [
  {
    name: 'calculate_daily_target',
    description:
      'Calculate a daily calorie target and macro ranges (protein/fat/carbs) for a person, using the Mifflin-St Jeor formula. Always call this instead of estimating or guessing a calorie or macro number yourself. May return needsProfessional: true when the goal-adjusted target falls below a safe floor -- in that case do not state a number, refer the person to a professional instead.',
    input_schema: {
      type: 'object',
      properties: {
        sex: { type: 'string', enum: ['male', 'female'], description: 'Biological sex, used by the BMR formula.' },
        weight_kg: { type: 'number', description: 'Body weight in kilograms.' },
        height_cm: { type: 'number', description: 'Height in centimeters.' },
        age: { type: 'number', description: 'Age in years.' },
        activity_level: {
          type: 'string',
          enum: ['sedentary', 'light', 'moderate', 'active', 'very_active'],
          description:
            'sedentary = desk job/little exercise, light = 1-3 days/week, moderate = 3-5 days/week, active = hard exercise 6-7 days/week, very_active = very hard exercise or physical job.'
        },
        goal: { type: 'string', enum: ['lose', 'gain', 'maintain'], description: 'Weight-change goal.' }
      },
      required: ['sex', 'weight_kg', 'height_cm', 'age', 'activity_level', 'goal']
    }
  },
  {
    name: 'calculate_meal_nutrition',
    description:
      'Calculate exact calories and macros (protein/carbs/fat/fiber) for a list of foods and amounts. Always call this instead of estimating nutrition numbers yourself. Every food_id must be a real id from the database -- call list_known_foods first if you are not certain of the exact id.',
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'The foods and amounts eaten.',
          items: {
            type: 'object',
            properties: {
              food_id: { type: 'string', description: 'Exact food id, e.g. one returned by list_known_foods.' },
              grams: { type: 'number', description: 'Amount eaten, in grams.' }
            },
            required: ['food_id', 'grams']
          }
        }
      },
      required: ['items']
    }
  },
  {
    name: 'list_known_foods',
    description:
      'List every food in the nutrition database (id, Hebrew/English name, category, default serving size). Use this to find the correct food_id before calling calculate_meal_nutrition -- never guess a food_id that might not exist.',
    input_schema: { type: 'object', properties: {}, required: [] }
  }
];

/** Runs one tool_use block against the real calculator it names. Throws on bad input/unknown ids -- the caller wraps this in try/catch per call. */
function executeTool(name, input) {
  switch (name) {
    case 'calculate_daily_target':
      return calculateDailyTarget({
        sex: input.sex,
        weightKg: input.weight_kg,
        heightCm: input.height_cm,
        age: input.age,
        activityLevel: input.activity_level,
        goal: input.goal
      });
    case 'calculate_meal_nutrition':
      return calculateForItems(
        (input.items || []).map((item) => ({ foodId: item.food_id, grams: item.grams }))
      );
    case 'list_known_foods':
      return listFoods();
    default:
      throw new Error(`Unknown tool: "${name}"`);
  }
}

const MAX_TOOL_ROUNDS = 5;

/**
 * Turns one incoming message into a reply. One code path for both the live
 * bot and the tool-use experiment -- previously these were two separate,
 * near-duplicate implementations (generateReply and generateReplyWithTools),
 * which meant a fix to one (message shape, error handling, model config)
 * had to be remembered a second time for the other. The only thing that
 * changes behavior now is `tools`:
 *
 *   - tools: [] (the default -- and what routes/whapi.js always passes,
 *     since it never sets `tools`) sends no `tools` field to the API at
 *     all, identical to the old standalone generateReply(). With nothing
 *     to call, the model can never return stop_reason: 'tool_use', so the
 *     loop below always runs exactly once and returns -- this is a
 *     structural guarantee of the Messages API (an empty/absent tool list
 *     cannot produce a tool_use response), not behavior that depends on
 *     the prompt or on what the model chooses to do. The live customer
 *     path is unchanged by this file being unified.
 *   - tools: TOOLS (via generateReplyWithTools, below) runs the real
 *     tool-use loop: call the model; while stop_reason is 'tool_use',
 *     execute every tool_use block (catching thrown errors into an
 *     is_error tool_result so the model can recover), send all results
 *     back in one user turn, and call again -- capped at MAX_TOOL_ROUNDS
 *     model calls, so a model stuck calling tools returns whatever text it
 *     has instead of looping forever.
 *
 * `max_tokens` is 4096 with tools, 1024 without -- verified empirically
 * (see the scratch tool-use test) that on this model, a tool round can
 * spend part of the budget on adaptive thinking before it reaches a
 * tool_use or text block, so 1024 could come back empty on a longer system
 * prompt. Each path keeps exactly its historical value, so neither one's
 * behavior changes because of the merge.
 *
 * @param {'adi'|'chef'} activeBot
 * @param {{role: 'user'|'assistant', content: string}[]} history - oldest first
 * @param {string} userText
 * @param {string|null} imageBase64
 * @param {string|null} imageMediaType
 * @param {object[]} [tools] - Anthropic tool specs to offer the model; defaults to none.
 */
async function generateReply({ activeBot, history, userText, imageBase64, imageMediaType, tools = [] }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set -- cannot generate a reply.');
  }

  const userContent = [];
  if (imageBase64) {
    userContent.push({
      type: 'image',
      source: { type: 'base64', media_type: imageMediaType || 'image/jpeg', data: imageBase64 }
    });
  }
  userContent.push({ type: 'text', text: userText || '(הלקוח שלח תמונה בלי טקסט)' });

  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userContent }
  ];

  const maxTokens = tools.length ? 4096 : 1024;

  let response;
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system: SYSTEM_PROMPTS[activeBot],
      // Omitted entirely (not sent as []) when there are no tools, so the
      // request is byte-for-byte what the old standalone generateReply sent.
      ...(tools.length ? { tools } : {}),
      messages
    });

    if (response.stop_reason !== 'tool_use') {
      break;
    }

    messages.push({ role: 'assistant', content: response.content });

    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      try {
        const result = executeTool(block.name, block.input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result)
        });
      } catch (err) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          is_error: true,
          content: err.message
        });
      }
    }

    messages.push({ role: 'user', content: toolResults });
  }

  // Cap reached while still tool_use: response.content has no text blocks,
  // so this returns '' rather than loop forever -- same extraction either way.
  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

/**
 * Convenience wrapper: generateReply with every calculator tool attached.
 * NOT called anywhere in the live path today -- routes/whapi.js calls
 * generateReply() directly, which defaults `tools` to [].
 *
 * @param {'adi'|'chef'} activeBot
 * @param {{role: 'user'|'assistant', content: string}[]} history - oldest first
 * @param {string} userText
 * @param {string|null} imageBase64
 * @param {string|null} imageMediaType
 */
function generateReplyWithTools({ activeBot, history, userText, imageBase64, imageMediaType }) {
  return generateReply({ activeBot, history, userText, imageBase64, imageMediaType, tools: TOOLS });
}

module.exports = { generateReply, generateReplyWithTools };
