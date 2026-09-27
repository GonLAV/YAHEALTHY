#!/usr/bin/env node
/**
 * Schema + integrity check for the eval case files. No API calls, no deps.
 *
 *   node evals/validate-cases.mjs                     # evals/cases.json + evals/holdout/cases.json
 *   node evals/validate-cases.mjs path/to/other.json  # any extra file(s), validated as a main set
 *
 * run-eval.mjs imports validateSet() and refuses to run (including --dry-run)
 * on a file with errors, so a broken case can never be silently skipped or
 * silently graded against empty criteria.
 *
 * Case schema (one of `message` / `turns` is required, never both):
 *   id, bot, category, severity, title, pass, fail        required strings
 *   message        single customer message (the original format)
 *   turns          [{role: 'user'|'assistant', content}]  -- a conversation.
 *                  Must start and end with a user turn.
 *   history        'scripted' (default) -- assistant turns are written by the
 *                  case author as context and are NOT graded; only the bot's
 *                  reply to the last user turn is graded.
 *                  'live' -- turns are user-only; the harness runs the bot
 *                  after EVERY user turn and the judge grades EVERY bot turn
 *                  (any violation anywhere fails the case).
 *   trap_turn      1-based index of the user turn where the trap is sprung
 *                  (documentation; checked to be in range)
 *   family         id of the family's root case. The root carries its own id.
 *                  Every severity=blocker case in the main set must sit in a
 *                  family with >= 2 re-phrased variants (README rule:
 *                  "after every fix, re-phrase the same trap").
 *   tags           free-form style tags (slang, typos, injection, authority...)
 *   forbid_patterns [{pattern, flags?, why}] -- deterministic auto-fail if any
 *                  graded bot turn matches, regardless of the judge.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const BOTS = ['chef', 'nuri', 'both', 'sales'];
export const SEVERITIES = ['blocker', 'high', 'medium'];
export const CATEGORIES = [
  // food bots (chef / nuri)
  'safety',
  'truth',
  'pressure',
  'beginner',
  'menu',
  'supermarket',
  'natural',
  // sales bot
  'sales-price',
  'sales-claims',
  'sales-safety',
  'sales-pressure',
];
const MIN_CRITERION_CHARS = 15;
const MIN_VARIANTS_PER_BLOCKER_FAMILY = 2;

const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

export function userTurnCount(c) {
  if (Array.isArray(c.turns)) return c.turns.filter((t) => t?.role === 'user').length;
  return 1;
}

/**
 * @param {object[]} cases
 * @param {{setName: string, isHoldout?: boolean, requireBlockerFamilies?: boolean}} opts
 * @returns {{errors: string[], warnings: string[]}}
 */
export function validateSet(cases, { setName, isHoldout = false, requireBlockerFamilies = !isHoldout } = {}) {
  const errors = [];
  const warnings = [];
  const err = (id, msg) => errors.push(`[${setName}] ${id ?? '?'}: ${msg}`);
  const warn = (id, msg) => warnings.push(`[${setName}] ${id ?? '?'}: ${msg}`);

  if (!Array.isArray(cases)) {
    errors.push(`[${setName}] top-level "cases" is not an array`);
    return { errors, warnings };
  }

  const ids = new Set();
  const byId = new Map();
  const messages = new Map();

  for (const c of cases) {
    const id = c?.id;
    if (!nonEmpty(id)) {
      err(id, 'missing id');
      continue;
    }
    if (ids.has(id)) err(id, 'duplicate id');
    ids.add(id);
    byId.set(id, c);

    for (const f of ['bot', 'category', 'severity', 'title', 'pass', 'fail']) {
      if (!nonEmpty(c[f])) err(id, `missing required field "${f}"`);
    }
    if (c.bot && !BOTS.includes(c.bot)) err(id, `bot "${c.bot}" not in ${BOTS.join('|')}`);
    if (c.severity && !SEVERITIES.includes(c.severity)) err(id, `severity "${c.severity}" not in ${SEVERITIES.join('|')}`);
    if (c.category && !CATEGORIES.includes(c.category)) err(id, `unknown category "${c.category}"`);
    if (c.category?.startsWith('sales-') && c.bot !== 'sales') err(id, `category ${c.category} is sales-only but bot is "${c.bot}"`);

    // Criteria: a judge must be able to decide on them without interpreting.
    for (const f of ['pass', 'fail']) {
      if (nonEmpty(c[f]) && c[f].trim().length < MIN_CRITERION_CHARS) err(id, `"${f}" criterion is too short to be checkable`);
    }
    if (nonEmpty(c.pass) && c.pass.trim() === c.fail?.trim()) err(id, 'pass and fail criteria are identical');

    // message XOR turns
    const hasMessage = c.message !== undefined;
    const hasTurns = c.turns !== undefined;
    if (hasMessage === hasTurns) err(id, 'exactly one of "message" or "turns" is required');
    if (hasMessage && !nonEmpty(c.message)) err(id, '"message" is empty');

    if (hasTurns) {
      const history = c.history ?? 'scripted';
      if (!['scripted', 'live'].includes(history)) err(id, `history "${c.history}" not in scripted|live`);
      if (!Array.isArray(c.turns) || c.turns.length === 0) {
        err(id, '"turns" must be a non-empty array');
      } else {
        c.turns.forEach((t, i) => {
          if (!t || !['user', 'assistant'].includes(t.role)) err(id, `turn ${i + 1}: role must be user|assistant`);
          if (!nonEmpty(t?.content)) err(id, `turn ${i + 1}: empty content`);
        });
        if (c.turns[0]?.role !== 'user') err(id, 'first turn must be a user turn');
        if (c.turns[c.turns.length - 1]?.role !== 'user') err(id, 'last turn must be a user turn (the bot answers it)');
        if (history === 'scripted') {
          for (let i = 1; i < c.turns.length; i++) {
            if (c.turns[i].role === c.turns[i - 1].role) err(id, `turns ${i} and ${i + 1} have the same role -- scripted turns must alternate`);
          }
          if (c.turns.length === 1) warn(id, 'single-turn "turns" -- use "message" instead');
        } else if (c.turns.some((t) => t.role !== 'user')) {
          err(id, 'history "live" takes user turns only -- the harness generates every bot turn');
        }
      }
    } else if (c.history !== undefined) {
      err(id, '"history" only applies to "turns" cases');
    }

    if (c.trap_turn !== undefined) {
      const n = userTurnCount(c);
      if (!Number.isInteger(c.trap_turn) || c.trap_turn < 1 || c.trap_turn > n) err(id, `trap_turn ${c.trap_turn} out of range 1..${n} user turns`);
    }

    if (c.tags !== undefined && (!Array.isArray(c.tags) || !c.tags.every(nonEmpty))) err(id, '"tags" must be an array of strings');

    if (c.forbid_patterns !== undefined) {
      if (!Array.isArray(c.forbid_patterns)) err(id, '"forbid_patterns" must be an array');
      else
        c.forbid_patterns.forEach((p, i) => {
          if (!nonEmpty(p?.pattern) || !nonEmpty(p?.why)) err(id, `forbid_patterns[${i}] needs "pattern" and "why"`);
          else
            try {
              new RegExp(p.pattern, p.flags ?? 'u');
            } catch (e) {
              err(id, `forbid_patterns[${i}] bad regex: ${e.message}`);
            }
        });
    }

    const text = hasMessage ? c.message : JSON.stringify(c.turns);
    if (text && messages.has(text)) warn(id, `same customer text as ${messages.get(text)}`);
    else if (text) messages.set(text, id);

    if (isHoldout && c.family !== undefined) err(id, 'holdout cases must not join a family -- they are never tuned against');
  }

  // ---- families
  const families = new Map();
  for (const c of cases) {
    if (c?.family === undefined) continue;
    if (!nonEmpty(c.family)) {
      err(c.id, '"family" must be a case id');
      continue;
    }
    const root = byId.get(c.family);
    if (!root) {
      err(c.id, `family "${c.family}" does not reference an existing case in this set`);
      continue;
    }
    if (root.family !== root.id) err(root.id, `is a family root (referenced by ${c.id}) so it must carry "family": "${root.id}"`);
    if (!families.has(c.family)) families.set(c.family, []);
    families.get(c.family).push(c);
  }

  if (requireBlockerFamilies) {
    for (const c of cases) {
      if (c?.severity !== 'blocker') continue;
      if (c.family === undefined) {
        err(c.id, `severity=blocker needs a "family" with >= ${MIN_VARIANTS_PER_BLOCKER_FAMILY} re-phrased variants`);
        continue;
      }
      const members = families.get(c.family) ?? [];
      const variants = members.filter((m) => m.id !== c.family);
      if (variants.length < MIN_VARIANTS_PER_BLOCKER_FAMILY)
        err(c.id, `family ${c.family} has ${variants.length} variant(s); blockers need >= ${MIN_VARIANTS_PER_BLOCKER_FAMILY}`);
      if (c.id !== c.family) {
        const root = byId.get(c.family);
        if (root && root.severity !== 'blocker') warn(c.id, `blocker variant of non-blocker root ${root.id}`);
      }
    }
  }

  return { errors, warnings, families };
}

export function loadCaseFile(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return raw.cases;
}

export function summarize(cases) {
  const count = (keyFn) => {
    const out = {};
    for (const c of cases) {
      const k = keyFn(c);
      out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  };
  return {
    total: cases.length,
    byBot: count((c) => c.bot),
    byCategory: count((c) => c.category),
    bySeverity: count((c) => c.severity),
    byShape: count((c) => (c.turns ? `multi-turn/${c.history ?? 'scripted'}` : 'single')),
    families: new Set(cases.filter((c) => c.family).map((c) => c.family)).size,
  };
}

function printSummary(name, cases) {
  const s = summarize(cases);
  const fmt = (o) =>
    Object.entries(o)
      .sort()
      .map(([k, v]) => `${k}=${v}`)
      .join('  ');
  console.log(`\n${name}: ${s.total} cases, ${s.families} families`);
  console.log(`  bot       ${fmt(s.byBot)}`);
  console.log(`  category  ${fmt(s.byCategory)}`);
  console.log(`  severity  ${fmt(s.bySeverity)}`);
  console.log(`  shape     ${fmt(s.byShape)}`);
}

// ---------------------------------------------------------------- CLI

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const extra = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const mainFile = path.join(here, 'cases.json');
  const holdoutFile = path.join(here, 'holdout', 'cases.json');

  const sets = [
    { name: 'cases.json', file: mainFile, isHoldout: false },
    ...(fs.existsSync(holdoutFile) ? [{ name: 'holdout/cases.json', file: holdoutFile, isHoldout: true }] : []),
    ...extra.map((f) => ({ name: f, file: path.resolve(f), isHoldout: false })),
  ];

  let errors = [];
  let warnings = [];
  const loaded = [];
  for (const s of sets) {
    let cases;
    try {
      cases = loadCaseFile(s.file);
    } catch (e) {
      errors.push(`[${s.name}] cannot parse: ${e.message}`);
      continue;
    }
    const r = validateSet(cases, { setName: s.name, isHoldout: s.isHoldout });
    errors = errors.concat(r.errors);
    warnings = warnings.concat(r.warnings);
    loaded.push({ ...s, cases });
  }

  // ids must be unique ACROSS main + holdout, and a holdout case must not
  // be a copy of a visible one (then it would not be hidden at all).
  const seen = new Map();
  for (const s of loaded) {
    for (const c of s.cases) {
      if (!c?.id) continue;
      if (seen.has(c.id) && seen.get(c.id) !== s.name) errors.push(`[${s.name}] ${c.id}: id also used in ${seen.get(c.id)}`);
      seen.set(c.id, s.name);
    }
  }
  const main = loaded.find((s) => !s.isHoldout && s.name === 'cases.json');
  const hold = loaded.find((s) => s.isHoldout);
  if (main && hold) {
    const visible = new Set(main.cases.map((c) => c.message ?? JSON.stringify(c.turns)));
    for (const c of hold.cases) if (visible.has(c.message ?? JSON.stringify(c.turns))) errors.push(`[holdout] ${c.id}: identical text to a visible case`);
  }

  for (const s of loaded) printSummary(s.name, s.cases);

  if (warnings.length) {
    console.log(`\n${warnings.length} warning(s):`);
    for (const w of warnings) console.log(`  ! ${w}`);
  }
  if (errors.length) {
    console.log(`\n${errors.length} error(s):`);
    for (const e of errors) console.log(`  x ${e}`);
    process.exit(1);
  }
  console.log('\nOK -- all case files valid.');
}
