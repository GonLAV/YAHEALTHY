/**
 * Onboarding wizard support. Everything the wizard saves goes through the
 * endpoints that already own that data (preferences, weight goals, hydration
 * logs); this router adds only what had no home:
 *
 *   GET  /api/onboarding                  (auth) { completed, completedAt, source }
 *   POST /api/onboarding                  (auth) mark finished or skipped
 *   POST /api/onboarding/targets-preview  (auth) daily targets for confirmation
 *
 * The preview stores nothing. It exists so the frontend never carries a copy
 * of the calorie formulas: the numbers come from the same calculators the
 * rest of the backend uses, safety floors included.
 */

const express = require('express');
const { z, ZodError } = require('zod');
const auth = require('../utils/auth');
const db = require('../utils/database');
const onboarding = require('../utils/onboarding');

const router = express.Router();
router.use(auth.authMiddleware);

router.get('/', async (req, res) => {
  try {
    const status = await onboarding.getStatus(req.user.userId);
    if (!status) return res.status(404).json({ error: 'User not found', requestId: req.id });
    return res.json(status);
  } catch (error) {
    console.error('Onboarding status error:', error);
    return res.status(500).json({ error: 'Could not load onboarding status', requestId: req.id });
  }
});

const completeSchema = z.object({
  skipped: z.boolean().optional()
}).strict();

router.post('/', async (req, res) => {
  try {
    const { skipped } = completeSchema.parse(req.body || {});
    const user = await db.setOnboardingCompletedAt(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found', requestId: req.id });
    return res.json({
      completed: true,
      completedAt: user.onboarding_completed_at,
      source: 'wizard',
      skipped: Boolean(skipped)
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.issues, requestId: req.id });
    }
    console.error('Onboarding complete error:', error);
    return res.status(500).json({ error: 'Could not save onboarding status', requestId: req.id });
  }
});

// Ranges match the existing survey validators (constants.js): age 10–120,
// height 100–250 cm, weight 30–300 kg.
const currentYear = () => new Date().getFullYear();
const previewSchema = z
  .object({
    goal: z.enum(Object.keys(onboarding.MAIN_GOALS)),
    sex: z.enum(['male', 'female']),
    age: z.number().int().min(10).max(120).optional(),
    birthYear: z.number().int().optional(),
    heightCm: z.number().min(100).max(250),
    weightKg: z.number().min(30).max(300),
    targetWeightKg: z.number().min(30).max(300).optional().nullable(),
    activityLevel: z.enum(onboarding.ACTIVITY_LEVELS)
  })
  .refine((v) => v.age !== undefined || v.birthYear !== undefined, {
    message: 'age or birthYear is required',
    path: ['age']
  })
  .refine(
    (v) => {
      if (v.age !== undefined) return true;
      const age = currentYear() - v.birthYear;
      return age >= 10 && age <= 120;
    },
    { message: 'birthYear must give an age between 10 and 120', path: ['birthYear'] }
  );

router.post('/targets-preview', async (req, res) => {
  try {
    const input = previewSchema.parse(req.body || {});
    return res.json(onboarding.previewTargets(input));
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.issues, requestId: req.id });
    }
    console.error('Onboarding preview error:', error);
    return res.status(500).json({ error: 'Could not calculate targets', requestId: req.id });
  }
});

module.exports = router;
