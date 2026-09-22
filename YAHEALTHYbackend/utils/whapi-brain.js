/**
 * Loads Adi's and the chef's prompts and turns a WhatsApp message into a
 * reply. The prompts are the actual safety layer (allergy handling, the
 * health boundary, "don't invent"); this file is transport, not policy.
 */
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

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

/**
 * @param {'adi'|'chef'} activeBot
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
