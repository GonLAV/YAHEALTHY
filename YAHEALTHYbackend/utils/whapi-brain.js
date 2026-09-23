/**
 * Loads Adi's and Yoni's prompts and turns a WhatsApp message into a
 * reply. The prompts are the actual safety layer (allergy handling, the
 * health boundary, "don't invent"); this file is transport, not policy.
 */
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const { calculateDailyTarget } = require('./nutrition-calculator');
const { listFoods, calculateForItems } = require('./food-calculator');
const clinical = require('./clinical-approval');

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
  yoni: path.join(__dirname, '..', 'docs', 'bot', 'chef-bot-prompt.md')
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
  yoni: loadPrompt('yoni')
};

// These prompts tell people what to eat and how many calories to aim for.
// That is clinical content, and the reason it may ship is that a registered
// professional wrote and approved it — so the approval is checked here, at the
// only moment that covers every reply. Production refuses to start on an
// unapproved prompt; development warns, so editing one is not blocked by
// editing a JSON file first.
const APPROVALS = {
  adi: clinical.assertApproved('adi', PROMPT_PATHS.adi),
  yoni: clinical.assertApproved('yoni', PROMPT_PATHS.yoni)
};

// Stamped onto every logged reply, so a conversation can later be read back
// against the exact text that produced it. "She approved it" is a claim;
// "this reply came from adi:dc4acc971f59" is a record.
const PROMPT_VERSIONS = {
  adi: clinical.versionLabel('adi', PROMPT_PATHS.adi),
  yoni: clinical.versionLabel('yoni', PROMPT_PATHS.yoni)
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

/**
 * @param {'adi'|'yoni'} activeBot
 * @param {{role: 'user'|'assistant', content: string}[]} history - oldest first
 * @param {string} userText
 * @param {string|null} imageBase64
 * @param {string|null} imageMediaType
 */
async function generateReply({ activeBot, history, userText, imageBase64, imageMediaType }) {
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

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPTS[activeBot],
    messages: [
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: userContent }
    ]
  });

  return response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim();
}

// --- Tool-use mechanism (not wired into the live bot) -----------------------
//
// generateReply() above is untouched by everything below: no shared state,
// no branching added to it. This is phase 1, proving the mechanism works --
// the live prompts (docs/bot/nuri-bot-prompt.md and the chef prompt) still
// explicitly forbid Adi from giving exact numeric nutrition targets, and
// deciding to let the model call these calculators for real customers is a
// separate, deliberate step nobody has taken yet. generateReplyWithTools is
// exported alongside generateReply so a caller has to opt in by name.
//
// Anthropic tool specs (Messages API tool-use format). snake_case input to
// match how models name JSON fields; mapped to the calculators' camelCase.
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
 * Same contract and prompts as generateReply, but attaches TOOLS so the
 * model calls the real calculators instead of ever guessing a number.
 * Standard Anthropic tool-use loop: call the model; while stop_reason is
 * 'tool_use', execute every tool_use block (catching thrown errors into an
 * is_error tool_result so the model can recover), send all results back in
 * one user turn, and call again -- capped at MAX_TOOL_ROUNDS model calls, so
 * a model stuck calling tools returns whatever text it has instead of
 * looping forever.
 *
 * NOT called anywhere yet -- see the section header above.
 *
 * @param {'adi'|'yoni'} activeBot
 * @param {{role: 'user'|'assistant', content: string}[]} history - oldest first
 * @param {string} userText
 * @param {string|null} imageBase64
 * @param {string|null} imageMediaType
 */
async function generateReplyWithTools({ activeBot, history, userText, imageBase64, imageMediaType }) {
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

  let response;
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    response = await client.messages.create({
      model: MODEL,
      // Higher than generateReply's 1024: verified empirically (see the
      // scratch tool-use test) that on this model, a tool round can spend
      // part of the budget on adaptive thinking before it reaches a
      // tool_use or text block, so 1024 could come back empty on a longer
      // system prompt. Only affects this not-yet-activated path.
      max_tokens: 4096,
      system: SYSTEM_PROMPTS[activeBot],
      tools: TOOLS,
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
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim();
}

module.exports = {
  PROMPT_VERSIONS,
  APPROVALS,
  generateReply,
  generateReplyWithTools
};
