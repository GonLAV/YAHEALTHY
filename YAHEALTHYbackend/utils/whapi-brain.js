/**
 * Loads Nuri's and the chef's prompts and turns a WhatsApp message into a
 * reply. The prompts are the actual safety layer (allergy handling, the
 * health boundary, "don't invent"); this file is transport, not policy.
 */
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

// docs/bot/ lives at the repo root, two levels above utils/. If Vercel's
// project root is set to YAHEALTHYbackend/ instead of the repo root, this
// file won't be in the deploy bundle -- see the error below if that happens.
const PROMPT_PATHS = {
  nuri: path.join(__dirname, '..', '..', 'docs', 'bot', 'nuri-bot-prompt.md'),
  chef: path.join(__dirname, '..', '..', 'docs', 'bot', 'chef-bot-prompt.md')
};

function loadPrompt(bot) {
  try {
    return fs.readFileSync(PROMPT_PATHS[bot], 'utf8');
  } catch (err) {
    throw new Error(
      `Could not read the ${bot} prompt at ${PROMPT_PATHS[bot]}. If this is a ` +
      `Vercel deploy whose project root is set to YAHEALTHYbackend/ rather than ` +
      `the repo root, docs/bot/ isn't in the bundle -- point the project root at ` +
      `the repo root, or vendor the prompt files into YAHEALTHYbackend/. ` +
      `Original error: ${err.message}`
    );
  }
}

const SYSTEM_PROMPTS = {
  nuri: loadPrompt('nuri'),
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

/**
 * @param {'nuri'|'chef'} activeBot
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

module.exports = { generateReply };
