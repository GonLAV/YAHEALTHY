
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const { z, ZodError } = require('zod');

// Import utilities
const { 
  validateWeight, 
  validateHeight, 
  validateAge, 
  validateGender,
  normalizeLifestyle
} = require('./utils/constants');

const {
  calculateBMI,
  calculateBodyFat,
  calculateBMR,
  calculateTDEE,
  calculateDailyCalories,
  calculateWaterTarget,
  calculateSleepTarget,
  calculateWeightProgress,
  getHydrationStatus,
  getSleepStatus,
  getReadinessScore,
  calculateSleepDebt
} = require('./utils/health-calculations');

const {
  generateId
} = require('./utils/id-generator');

const auth = require('./utils/auth');
const db = require('./utils/database');

const { apiLimiter, authLimiter } = require('./middleware/rateLimit');
const { requestContext } = require('./middleware/requestContext');
const { notFoundHandler, errorHandler } = require('./utils/error-handler');
const { buildOpenApiSpec } = require('./openapi');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(requestContext);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Rate limiting
app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter);

// OpenAPI docs (not authenticated)
const openApiSpec = buildOpenApiSpec({ version: '2.0' });
app.get('/api/docs.json', (req, res) => res.json(openApiSpec));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
  swaggerOptions: { persistAuthorization: true }
}));

// ========== STATIC PAGES ==========

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========== HEALTH CHECK ==========

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'YAHEALTHY API is running with authentication and Supabase...',
    version: '2.0',
    features: [
      'authentication',
      'surveys',
      'weight-goals',
      'weight-logs',
      'hydration-tracking',
      'sleep-tracking',
      'grocery-planning',
      'recipes',
      'meal-plans',
      'fasting-windows',
      'meal-swaps',
      'readiness-scoring',
      'sleep-debt-tracking',
      'offline-logs'
    ]
  });
});

// Readiness check: includes DB connectivity
app.get('/api/ready', async (req, res) => {
  try {
    const result = await db.ping();
    if (!result.ok) {
      return res.status(503).json({ status: 'not_ready', ...result });
    }
    return res.json({ status: 'ready', ...result });
  } catch (error) {
    return res.status(503).json({ status: 'not_ready', error: error.message, requestId: req.id });
  }
});

// ========== AUTHENTICATION ENDPOINTS ==========

/**
 * POST /api/auth/signup
 * Create a new user account
 */
app.post('/api/auth/signup', async (req, res) => {
  try {
    const signupSchema = z.object({
      email: z.string().email(),
      password: z.string().min(6),
      name: z.string().min(1).optional()
    });
    const { email, password, name } = signupSchema.parse(req.body);

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user exists
    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }

    // Hash password and create user
    const passwordHash = await auth.hashPassword(password);
    const user = await db.createUser(email, passwordHash, name);

    // Generate token
    const token = auth.generateToken(user.id, user.email);

    res.status(201).json({
      id: user.id,
      email: user.email,
      name: user.name,
      token
    });
  } catch (error) {
    console.error('Signup error:', error);
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.issues, requestId: req.id });
    }
    res.status(500).json({ error: 'Signup failed', details: error.message, requestId: req.id });
  }
});

/**
 * POST /api/auth/login
 * User login
 */
app.post('/api/auth/login', async (req, res) => {
  try {
    const loginSchema = z.object({
      email: z.string().email(),
      password: z.string().min(1)
    });
    const { email, password } = loginSchema.parse(req.body);

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await db.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const passwordMatch = await auth.comparePassword(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = auth.generateToken(user.id, user.email);

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.issues, requestId: req.id });
    }
    res.status(500).json({ error: 'Login failed', details: error.message, requestId: req.id });
  }
});

/**
 * GET /api/auth/me
 * Get current user info
 */
app.get('/api/auth/me', auth.authMiddleware, async (req, res) => {
  try {
    const user = await db.getUser(req.user.userId);
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      preferences: user.preferences
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user', details: error.message });
  }
});

/**
 * POST /api/auth/change-password
 * Change password for the current user
 */
app.post('/api/auth/change-password', auth.authMiddleware, async (req, res) => {
  try {
    const schema = z.object({
      oldPassword: z.string().min(1),
      newPassword: z.string().min(6)
    });
    const { oldPassword, newPassword } = schema.parse(req.body);

    const user = await db.getUser(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found', requestId: req.id });
    }

    const ok = await auth.comparePassword(oldPassword, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid password', requestId: req.id });
    }

    const passwordHash = await auth.hashPassword(newPassword);
    await db.updateUserPasswordHash(user.id, passwordHash);
    return res.json({ status: 'ok' });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.issues, requestId: req.id });
    }
    return res.status(500).json({ error: 'Change password failed', details: error.message, requestId: req.id });
  }
});

/**
 * POST /api/auth/request-password-reset
 * Requests a password reset token. In production you would email it.
 */
app.post('/api/auth/request-password-reset', async (req, res) => {
  try {
    const schema = z.object({ email: z.string().email() });
    const { email } = schema.parse(req.body);

    const user = await db.getUserByEmail(email);
    const response = {
      message: 'If an account exists for that email, password reset instructions were sent.'
    };

    if (user && process.env.NODE_ENV !== 'production') {
      response.resetToken = auth.generatePasswordResetToken(user.id, user.email);
    }

    return res.json(response);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.issues, requestId: req.id });
    }
    return res.status(500).json({ error: 'Password reset request failed', details: error.message, requestId: req.id });
  }
});

/**
 * POST /api/auth/reset-password
 * Resets password using a valid password reset token
 */
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const schema = z.object({
      token: z.string().min(1),
      newPassword: z.string().min(6)
    });
    const { token, newPassword } = schema.parse(req.body);

    const decoded = auth.verifyPasswordResetToken(token);
    if (!decoded) {
      return res.status(400).json({ error: 'Invalid or expired reset token', requestId: req.id });
    }

    const passwordHash = await auth.hashPassword(newPassword);
    const updated = await db.updateUserPasswordHash(decoded.userId, passwordHash);
    if (!updated) {
      return res.status(404).json({ error: 'User not found', requestId: req.id });
    }

    return res.json({ status: 'ok' });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.issues, requestId: req.id });
    }
    return res.status(500).json({ error: 'Reset password failed', details: error.message, requestId: req.id });
  }
});

// ========== USER PREFERENCES ==========

/**
 * GET /api/users/me/preferences
 */
app.get('/api/users/me/preferences', auth.authMiddleware, async (req, res) => {
  try {
    const user = await db.getUser(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found', requestId: req.id });
    }
    return res.json({ preferences: user.preferences || {} });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get preferences', details: error.message, requestId: req.id });
  }
});

/**
 * PUT /api/users/me/preferences
 */
app.put('/api/users/me/preferences', auth.authMiddleware, async (req, res) => {
  try {
    const macroSchema = z.object({
      proteinGrams: z.number().nonnegative().optional(),
      carbsGrams: z.number().nonnegative().optional(),
      fatGrams: z.number().nonnegative().optional(),
      protein_grams: z.number().nonnegative().optional(),
      carbs_grams: z.number().nonnegative().optional(),
      fat_grams: z.number().nonnegative().optional(),
      protein: z.number().nonnegative().optional(),
      carbs: z.number().nonnegative().optional(),
      fat: z.number().nonnegative().optional()
    }).partial();

    const schema = z.object({
      preferences: z.object({
        macroTargets: macroSchema.optional(),
        macro_targets: macroSchema.optional()
      }).passthrough()
    });

    const { preferences } = schema.parse(req.body);

    const normalizedPreferences = { ...(preferences || {}) };
    const incomingMacro = normalizedPreferences.macroTargets || normalizedPreferences.macro_targets;
    if (incomingMacro && typeof incomingMacro === 'object') {
      const macro = macroSchema.parse(incomingMacro);
      const toNumberOrNull = (v) => {
        if (v === undefined || v === null) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };
      normalizedPreferences.macroTargets = {
        protein_grams: toNumberOrNull(macro.protein_grams ?? macro.proteinGrams ?? macro.protein),
        carbs_grams: toNumberOrNull(macro.carbs_grams ?? macro.carbsGrams ?? macro.carbs),
        fat_grams: toNumberOrNull(macro.fat_grams ?? macro.fatGrams ?? macro.fat)
      };
    }

    const updated = await db.updateUserPreferences(req.user.userId, normalizedPreferences);
    if (!updated) {
      return res.status(404).json({ error: 'User not found', requestId: req.id });
    }
    return res.json({ preferences: updated.preferences || {} });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.issues, requestId: req.id });
    }
    return res.status(500).json({ error: 'Failed to update preferences', details: error.message, requestId: req.id });
  }
});

// ========== SURVEY ENDPOINTS ==========

/**
 * POST /api/surveys
 * Create a new health survey with metrics calculation
 */
app.post('/api/surveys', auth.authMiddleware, async (req, res) => {
  try {
    const { gender, age, heightCm, weightKg, targetWeightKg, targetDays, lifestyle } = req.body;
    const userId = req.user.userId;

    // Validate inputs
    if (!validateGender(gender)) {
      return res.status(400).json({ error: 'Invalid gender' });
    }
    if (!validateAge(age)) {
      return res.status(400).json({ error: 'Age must be between 10 and 120' });
    }
    if (!validateHeight(heightCm)) {
      return res.status(400).json({ error: 'Height must be between 100cm and 250cm' });
    }
    if (!validateWeight(weightKg)) {
      return res.status(400).json({ error: 'Weight must be between 30kg and 300kg' });
    }

    // Normalize and calculate
    const normalizedGender = gender.toLowerCase();
    const normalizedLifestyle = normalizeLifestyle(lifestyle);

    const bmi = calculateBMI(weightKg, heightCm);
    const bodyFat = calculateBodyFat(bmi, age, normalizedGender);
    const bmr = calculateBMR(weightKg, heightCm, age, normalizedGender);
    const tdee = calculateTDEE(bmr, normalizedLifestyle);
    const dailyCalories = calculateDailyCalories(tdee, weightKg, targetWeightKg, targetDays);
    const waterTarget = calculateWaterTarget(weightKg, 0);
    const sleepTarget = calculateSleepTarget(age);
    const proteinTarget = weightKg * 1.6;

    const survey = await db.createSurvey(userId, {
      gender: normalizedGender,
      age,
      height_cm: heightCm,
      weight_kg: weightKg,
      target_weight_kg: targetWeightKg,
      target_days: targetDays,
      lifestyle: normalizedLifestyle,
      bmi: Math.round(bmi * 10) / 10,
      body_fat_percent: Math.round(bodyFat * 10) / 10,
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      daily_calories: dailyCalories,
      water_target_liters: Math.round(waterTarget * 10) / 10,
      sleep_target_hours: sleepTarget,
      protein_target_g: Math.round(proteinTarget * 10) / 10
    });

    res.status(201).json(survey);
  } catch (error) {
    console.error('Survey creation error:', error);
    res.status(500).json({ error: 'Failed to create survey', details: error.message });
  }
});

/**
 * GET /api/surveys
 * Get all surveys for the user
 */
app.get('/api/surveys', auth.authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const surveys = await db.getSurveys(userId);
    res.json(surveys || []);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get surveys', details: error.message });
  }
});

/**
 * GET /api/surveys/:id
 */
app.get('/api/surveys/:id', auth.authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const survey = await db.getSurveyById(req.params.id, userId);
    if (!survey) {
      return res.status(404).json({ error: 'Survey not found' });
    }
    res.json(survey);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get survey', details: error.message });
  }
});

// ========== WEIGHT GOAL ENDPOINTS ==========

/**
 * POST /api/weight-goals
 */
app.post('/api/weight-goals', auth.authMiddleware, async (req, res) => {
  try {
    const { startWeightKg, targetWeightKg, weighInDays } = req.body;
    const userId = req.user.userId;

    if (!validateWeight(startWeightKg) || !validateWeight(targetWeightKg)) {
      return res.status(400).json({ error: 'Invalid weight values' });
    }

    const goal = await db.createWeightGoal(userId, {
      start_weight_kg: startWeightKg,
      target_weight_kg: targetWeightKg,
      weigh_in_days: JSON.stringify(weighInDays || ['Mon', 'Fri'])
    });

    res.status(201).json(goal);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create weight goal', details: error.message });
  }
});

/**
 * GET /api/weight-goals
 */
app.get('/api/weight-goals', auth.authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const goals = await db.getWeightGoals(userId);
    res.json(goals || []);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get weight goals', details: error.message });
  }
});

/**
 * GET /api/weight-goals/:id
 */
app.get('/api/weight-goals/:id', auth.authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const goal = await db.getWeightGoalById(req.params.id, userId);
    if (!goal) {
      return res.status(404).json({ error: 'Weight goal not found' });
    }
    res.json(goal);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get weight goal', details: error.message });
  }
});

// ========== WEIGHT LOG ENDPOINTS ==========

/**
 * POST /api/weight-logs
 */
app.post('/api/weight-logs', auth.authMiddleware, async (req, res) => {
  try {
    const { goalId, weightKg, waterLiters, sleepHours } = req.body;
    const userId = req.user.userId;

    if (!validateWeight(weightKg)) {
      return res.status(400).json({ error: 'Invalid weight' });
    }

    // Get the goal to check progress
    const goal = await db.getWeightGoalById(goalId, userId);
    if (!goal) {
      return res.status(404).json({ error: 'Weight goal not found' });
    }

    // Get all logs for this goal to check for celebration eligibility
    const logs = await db.getWeightLogs(userId, goalId);
    let celebration = null;

    if (logs && logs.length > 0) {
      const lastLog = logs[0];
      const weightLost = lastLog.weight_kg - weightKg;
      
      if (weightLost > 0) {
        celebration = {
          message: `Great job! Lost ${weightLost.toFixed(1)}kg`,
          remaining: Math.max(0, goal.target_weight_kg - weightKg).toFixed(1)
        };
      }
    }

    const log = await db.createWeightLog(userId, {
      goal_id: goalId,
      weight_kg: weightKg,
      water_liters: waterLiters || null,
      sleep_hours: sleepHours || null,
      celebration: celebration ? JSON.stringify(celebration) : null
    });

    res.status(201).json({ ...log, celebration });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create weight log', details: error.message });
  }
});

/**
 * GET /api/weight-logs
 */
app.get('/api/weight-logs', auth.authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { goalId } = req.query;
    const logs = await db.getWeightLogs(userId, goalId);
    res.json(logs || []);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get weight logs', details: error.message });
  }
});

// ========== HYDRATION ENDPOINTS ==========

/**
 * POST /api/hydration-logs
 */
app.post('/api/hydration-logs', auth.authMiddleware, async (req, res) => {
  try {
    const { date, litersConsumed, timeOfDay, source } = req.body;
    const userId = req.user.userId;

    if (!litersConsumed || litersConsumed < 0 || litersConsumed > 10) {
      return res.status(400).json({ error: 'Hydration must be between 0 and 10 liters' });
    }

    const log = await db.createHydrationLog(userId, {
      date: date || new Date().toISOString().split('T')[0],
      liters_consumed: litersConsumed,
      time_of_day: timeOfDay,
      source
    });

    res.status(201).json(log);
  } catch (error) {
    res.status(500).json({ error: 'Failed to log hydration', details: error.message });
  }
});

/**
 * GET /api/hydration-logs
 */
app.get('/api/hydration-logs', auth.authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { date } = req.query;
    const logs = await db.getHydrationLogs(userId, date);
    res.json(logs || []);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get hydration logs', details: error.message });
  }
});

// ========== SLEEP ENDPOINTS ==========

/**
 * POST /api/sleep-logs
 */
app.post('/api/sleep-logs', auth.authMiddleware, async (req, res) => {
  try {
    const { date, sleepHours, sleepQuality, notes } = req.body;
    const userId = req.user.userId;

    if (!sleepHours || sleepHours < 0 || sleepHours > 16) {
      return res.status(400).json({ error: 'Sleep hours must be between 0 and 16' });
    }

    const log = await db.createSleepLog(userId, {
      date: date || new Date().toISOString().split('T')[0],
      sleep_hours: sleepHours,
      sleep_quality: sleepQuality,
      notes
    });

    res.status(201).json(log);
  } catch (error) {
    res.status(500).json({ error: 'Failed to log sleep', details: error.message });
  }
});

/**
 * GET /api/sleep-logs
 */
app.get('/api/sleep-logs', auth.authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { date } = req.query;
    const logs = await db.getSleepLogs(userId, date);
    res.json(logs || []);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get sleep logs', details: error.message });
  }
});

// ========== FASTING WINDOW ENDPOINTS ==========

/**
 * POST /api/fasting-windows
 */
app.post('/api/fasting-windows', auth.authMiddleware, async (req, res) => {
  try {
    const { windowHours } = req.body;
    const userId = req.user.userId;

    if (!windowHours || windowHours < 8 || windowHours > 23) {
      return res.status(400).json({ error: 'Fasting window must be between 8 and 23 hours' });
    }

    const protocols = {
      16: '16:8 Intermittent Fasting (popular)',
      18: '18:6 Extended Fasting',
      20: '20:4 Warrior Diet',
      23: '23:1 OMAD (One Meal A Day)'
    };

    const tips = windowHours >= 16 ? 'Stay hydrated during fasting. Black coffee/tea is fine.' : 'Moderate fasting window. Perfect for beginners.';

    const window = await db.createFastingWindow(userId, {
      window_hours: windowHours,
      protocol: protocols[windowHours] || `${windowHours}-hour fasting`,
      tips
    });

    res.status(201).json(window);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create fasting window', details: error.message });
  }
});

/**
 * GET /api/fasting-windows
 */
app.get('/api/fasting-windows', auth.authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const windows = await db.getFastingWindows(userId);
    res.json(windows || []);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get fasting windows', details: error.message });
  }
});

// ========== MEAL SWAP ENDPOINTS ==========

/**
 * POST /api/meal-swaps
 */
app.post('/api/meal-swaps', auth.authMiddleware, async (req, res) => {
  try {
    const { ingredients, allergies } = req.body;
    const userId = req.user.userId;

    const swapSuggestions = {
      chicken: ['turkey', 'fish', 'lean beef', 'tofu'],
      beef: ['turkey', 'chicken', 'fish', 'beans'],
      milk: ['almond milk', 'oat milk', 'soy milk', 'coconut milk'],
      bread: ['whole wheat bread', 'brown rice', 'quinoa', 'sweet potato'],
      rice: ['quinoa', 'couscous', 'brown rice', 'millet'],
      oil: ['olive oil', 'coconut oil', 'avocado oil']
    };

    const swaps = {};
    (ingredients || []).forEach(ingredient => {
      const lowerIngredient = ingredient.toLowerCase();
      swaps[ingredient] = (swapSuggestions[lowerIngredient] || ['no suitable swap'])
        .filter(swap => !(allergies || []).some(allergy => 
          swap.toLowerCase().includes(allergy.toLowerCase())
        ));
    });

    const swap = await db.createMealSwap(userId, {
      ingredients: JSON.stringify(ingredients || []),
      allergies: JSON.stringify(allergies || []),
      swaps: JSON.stringify(swaps)
    });

    res.status(201).json({ ...swap, swaps });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create meal swap', details: error.message });
  }
});

/**
 * GET /api/meal-swaps
 */
app.get('/api/meal-swaps', auth.authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const swaps = await db.getMealSwaps(userId);
    res.json(swaps || []);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get meal swaps', details: error.message });
  }
});

// ========== READINESS ENDPOINTS ==========

/**
 * POST /api/readiness
 */
app.post('/api/readiness', auth.authMiddleware, async (req, res) => {
  try {
    const { hrv, restingHr, sleepHours } = req.body;
    const userId = req.user.userId;

    const score = getReadinessScore(hrv || 50, restingHr || 60);
    const levels = ['poor', 'fair', 'good', 'excellent'];
    const level = levels[Math.floor(score / 25)];
    
    const recommendations = level === 'excellent' 
      ? 'You are ready for intense training!' 
      : 'Consider moderate activity. Rest is important.';

    const readiness = await db.createReadinessScore(userId, {
      hrv: hrv || 50,
      resting_hr: restingHr || 60,
      sleep_hours: sleepHours || 0,
      score: Math.round(score),
      level,
      recommendations
    });

    res.status(201).json({ ...readiness, level });
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate readiness', details: error.message });
  }
});

/**
 * GET /api/readiness
 */
app.get('/api/readiness', auth.authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const readinessScores = await db.getReadinessScores(userId);
    res.json(readinessScores || []);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get readiness scores', details: error.message });
  }
});

/**
 * POST /api/sleep-debt
 */
app.post('/api/sleep-debt', auth.authMiddleware, async (req, res) => {
  try {
    const { targetHours } = req.body;
    const userId = req.user.userId;

    const sleepLogs = await db.getSleepLogs(userId);
    const debt = calculateSleepDebt(sleepLogs || [], targetHours || 8);

    res.json({
      debtHours: debt.debtHours,
      daysToRecover: debt.daysToRecover,
      recommendation: debt.daysToRecover > 0 
        ? `Get ${debt.debtHours} extra hours of sleep over the next ${debt.daysToRecover} days` 
        : 'You are all caught up!'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to calculate sleep debt', details: error.message });
  }
});

/**
 * POST /api/water-reminders
 */
app.post('/api/water-reminders', auth.authMiddleware, async (req, res) => {
  try {
    const { weightKg, activityMinutes } = req.body;
    const userId = req.user.userId;

    const targetLiters = calculateWaterTarget(weightKg || 70, activityMinutes || 0);
    const reminders = [];
    const intervalsPerDay = 7;
    const literPerReminder = targetLiters / intervalsPerDay;

    for (let i = 0; i < intervalsPerDay; i++) {
      reminders.push({
        time: `${Math.floor((i * 24) / intervalsPerDay)}:00`,
        liters: Math.round(literPerReminder * 10) / 10,
        message: `Time to drink water! Aim for ${Math.round(literPerReminder * 10) / 10}L`
      });
    }

    res.json({
      targetLiters: Math.round(targetLiters * 10) / 10,
      reminders,
      activityBonus: Math.round((activityMinutes / 30) * 0.5 * 10) / 10
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get water reminders', details: error.message });
  }
});

// ========== OFFLINE LOG ENDPOINTS ==========

/**
 * POST /api/offline-logs
 */
app.post('/api/offline-logs', auth.authMiddleware, async (req, res) => {
  try {
    const { logType, data } = req.body;
    const userId = req.user.userId;

    if (!logType || !data) {
      return res.status(400).json({ error: 'logType and data required' });
    }

    const log = await db.createOfflineLog(userId, {
      log_type: logType,
      data: JSON.stringify(data),
      synced: false
    });

    res.status(201).json(log);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create offline log', details: error.message });
  }
});

/**
 * GET /api/offline-logs
 */
app.get('/api/offline-logs', auth.authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const logs = await db.getOfflineLogs(userId, false);
    res.json(logs || []);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get offline logs', details: error.message });
  }
});

/**
 * POST /api/offline-logs/:id/sync
 */
app.post('/api/offline-logs/:id/sync', auth.authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const log = await db.markOfflineLogSynced(req.params.id, userId);
    res.json(log);
  } catch (error) {
    res.status(500).json({ error: 'Failed to sync offline log', details: error.message });
  }
});

// ========== RECIPE ENDPOINTS ==========

// Existing hardcoded recipes for now
const recipes = [
  {
    id: 'recipe_1',
    name: 'Sabich - Israeli Eggplant Salad',
    category: 'salad',
    difficulty: 'easy',
    time_minutes: 15,
    calories: 280,
    ingredients: ['eggplant', 'tahini', 'lemon', 'garlic', 'olive oil'],
    steps: ['Roast eggplant', 'Mix with tahini', 'Add lemon and garlic', 'Serve with olive oil']
  },
  {
    id: 'recipe_2',
    name: 'Shakshuka - Eggs in Tomato Sauce',
    category: 'breakfast',
    difficulty: 'easy',
    time_minutes: 20,
    calories: 350,
    ingredients: ['eggs', 'tomatoes', 'onion', 'garlic', 'olive oil', 'cumin'],
    steps: ['Cook tomato sauce', 'Make wells', 'Crack eggs', 'Simmer until set']
  },
  {
    id: 'recipe_3',
    name: 'Tabbouleh - Herb Salad',
    category: 'salad',
    difficulty: 'easy',
    time_minutes: 15,
    calories: 220,
    ingredients: ['parsley', 'bulgur', 'tomato', 'lemon', 'olive oil', 'mint'],
    steps: ['Soak bulgur', 'Chop herbs', 'Mix all ingredients', 'Dress with lemon oil']
  }
];

/**
 * GET /api/recipes
 */
app.get('/api/recipes', auth.authMiddleware, (req, res) => {
  res.json(recipes);
});

/**
 * GET /api/recipes/shuffle
 */
app.get('/api/recipes/shuffle', auth.authMiddleware, (req, res) => {
  const count = parseInt(req.query.count) || 2;
  const shuffled = recipes.sort(() => Math.random() - 0.5).slice(0, count);
  res.json(shuffled);
});

/**
 * GET /api/recipes/:id
 */
app.get('/api/recipes/:id', auth.authMiddleware, (req, res) => {
  const recipe = recipes.find(r => r.id === req.params.id);
  if (!recipe) {
    return res.status(404).json({ error: 'Recipe not found' });
  }
  res.json(recipe);
});

/**
 * GET /api/recipes/:id/share
 */
app.get('/api/recipes/:id/share', auth.authMiddleware, (req, res) => {
  const recipe = recipes.find(r => r.id === req.params.id);
  if (!recipe) {
    return res.status(404).json({ error: 'Recipe not found' });
  }

  const recipeText = `${recipe.name}\n${recipe.ingredients.join(', ')}\n\nCheck it out on YAHEALTHY!`;
  const encodedText = encodeURIComponent(recipeText);

  res.json({
    whatsapp: `https://wa.me/?text=${encodedText}`,
    email: `mailto:?subject=${recipe.name}&body=${encodedText}`,
    copy: recipeText
  });
});

// ========== MEAL PLAN ENDPOINTS ==========

const mealPlans = [];

function parseISODate(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  // Normalize to YYYY-MM-DD (UTC-ish) for comparisons used by this API.
  return d;
}

function isDateInRange(dateStr, start, end) {
  if (!dateStr) return false;
  const d = parseISODate(dateStr);
  if (!d) return false;
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

function formatDateYYYYMMDD(date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysUTC(date, days) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function daysBetweenUTC(start, end) {
  const ms = 24 * 60 * 60 * 1000;
  const s = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const e = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.floor((e - s) / ms);
}

/**
 * GET /api/meal-plans
 */
app.get('/api/meal-plans', auth.authMiddleware, (req, res) => {
  const userId = req.user.userId;
  res.json(mealPlans.filter(p => p.user_id === userId));
});

/**
 * POST /api/meal-plans
 */
app.post('/api/meal-plans', auth.authMiddleware, (req, res) => {
  const { recipeId, date, mealType } = req.body;
  const userId = req.user.userId;
  const plan = {
    id: generateId(),
    user_id: userId,
    recipe_id: recipeId,
    date,
    meal_type: mealType,
    completed: false
  };
  mealPlans.push(plan);
  res.status(201).json(plan);
});

/**
 * POST /api/meal-plans/generate
 * Auto-generate meal plans for a date range.
 */
app.post('/api/meal-plans/generate', auth.authMiddleware, (req, res) => {
  const userId = req.user.userId;

  const schema = z.object({
    startDate: z.string().min(1),
    endDate: z.string().min(1),
    mealTypes: z.array(z.string().min(1)).optional(),
    overwrite: z.boolean().optional()
  });

  let startDate;
  let endDate;
  let mealTypes;
  let overwrite;

  try {
    const parsed = schema.parse(req.body);
    startDate = parseISODate(parsed.startDate);
    endDate = parseISODate(parsed.endDate);
    mealTypes = parsed.mealTypes && parsed.mealTypes.length > 0 ? parsed.mealTypes : ['breakfast', 'lunch', 'dinner'];
    overwrite = Boolean(parsed.overwrite);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.issues, requestId: req.id });
    }
    return res.status(400).json({ error: 'Invalid input', requestId: req.id });
  }

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Invalid startDate or endDate', requestId: req.id });
  }
  if (endDate < startDate) {
    return res.status(400).json({ error: 'endDate must be >= startDate', requestId: req.id });
  }

  const rangeDays = daysBetweenUTC(startDate, endDate);
  if (rangeDays > 31) {
    return res.status(400).json({ error: 'Date range too large (max 31 days)', requestId: req.id });
  }

  const created = [];
  let skipped = 0;
  let deleted = 0;

  if (overwrite) {
    for (let i = mealPlans.length - 1; i >= 0; i -= 1) {
      const p = mealPlans[i];
      if (p.user_id !== userId) continue;
      if (!isDateInRange(p.date, startDate, endDate)) continue;
      if (!mealTypes.includes(p.meal_type)) continue;
      mealPlans.splice(i, 1);
      deleted += 1;
    }
  }

  for (let dayOffset = 0; dayOffset <= rangeDays; dayOffset += 1) {
    const date = formatDateYYYYMMDD(addDaysUTC(startDate, dayOffset));
    for (const mealType of mealTypes) {
      const exists = mealPlans.some(p => p.user_id === userId && p.date === date && p.meal_type === mealType);
      if (exists) {
        skipped += 1;
        continue;
      }

      const recipe = recipes[Math.floor(Math.random() * recipes.length)];
      if (!recipe) {
        skipped += 1;
        continue;
      }

      const plan = {
        id: generateId(),
        user_id: userId,
        recipe_id: recipe.id,
        date,
        meal_type: mealType,
        completed: false
      };
      mealPlans.push(plan);
      created.push(plan);
    }
  }

  return res.status(201).json({
    startDate: req.body.startDate,
    endDate: req.body.endDate,
    mealTypes,
    overwrite,
    deleted,
    createdCount: created.length,
    skippedCount: skipped,
    plans: created
  });
});

/**
 * PUT /api/meal-plans/:id
 */
app.put('/api/meal-plans/:id', auth.authMiddleware, (req, res) => {
  const userId = req.user.userId;
  const plan = mealPlans.find(p => p.id === req.params.id && p.user_id === userId);
  if (!plan) {
    return res.status(404).json({ error: 'Meal plan not found' });
  }
  Object.assign(plan, req.body);
  res.json(plan);
});

/**
 * DELETE /api/meal-plans/:id
 */
app.delete('/api/meal-plans/:id', auth.authMiddleware, (req, res) => {
  const userId = req.user.userId;
  const index = mealPlans.findIndex(p => p.id === req.params.id && p.user_id === userId);
  if (index === -1) {
    return res.status(404).json({ error: 'Meal plan not found' });
  }
  const deleted = mealPlans.splice(index, 1);
  res.json(deleted[0]);
});

/**
 * GET /api/grocery-list
 * Build a grocery list from the user's meal plans (optional date range)
 */
app.get('/api/grocery-list', auth.authMiddleware, (req, res) => {
  const userId = req.user.userId;

  const querySchema = z.object({
    start: z.string().optional(),
    end: z.string().optional()
  });

  let startDate = null;
  let endDate = null;

  try {
    const { start, end } = querySchema.parse(req.query);
    if (start) {
      startDate = parseISODate(start);
      if (!startDate) {
        return res.status(400).json({ error: 'Invalid start date', requestId: req.id });
      }
    }
    if (end) {
      endDate = parseISODate(end);
      if (!endDate) {
        return res.status(400).json({ error: 'Invalid end date', requestId: req.id });
      }
    }
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid query', details: error.issues, requestId: req.id });
    }
    return res.status(400).json({ error: 'Invalid query', requestId: req.id });
  }

  const plans = mealPlans
    .filter(p => p.user_id === userId)
    .filter(p => {
      if (!startDate && !endDate) return true;
      return isDateInRange(p.date, startDate, endDate);
    });

  const counts = new Map();
  const recipeIds = new Set();

  for (const plan of plans) {
    recipeIds.add(plan.recipe_id);
    const recipe = recipes.find(r => r.id === plan.recipe_id);
    if (!recipe || !Array.isArray(recipe.ingredients)) continue;
    for (const ingredient of recipe.ingredients) {
      const key = String(ingredient).trim().toLowerCase();
      if (!key) continue;
      const prev = counts.get(key) || 0;
      counts.set(key, prev + 1);
    }
  }

  const items = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([item, count]) => ({ item, count }));

  return res.json({
    start: req.query.start || null,
    end: req.query.end || null,
    mealPlansCount: plans.length,
    recipeIds: [...recipeIds],
    totalUniqueItems: items.length,
    items
  });
});

// ========== GROCERY PLANNING ENDPOINTS ==========

/**
 * POST /api/grocery-plan
 */
app.post('/api/grocery-plan', auth.authMiddleware, (req, res) => {
  const { dailyCalories } = req.body;
  const calories = dailyCalories || 2000;

  const plan = {
    carbs_grams: Math.round(calories * 0.4 / 4),
    protein_grams: Math.round(calories * 0.3 / 4),
    fat_grams: Math.round(calories * 0.3 / 9),
    recommended_items: [
      'Lean proteins: chicken, fish, eggs, tofu',
      'Whole grains: rice, oats, whole wheat bread',
      'Vegetables: broccoli, spinach, bell peppers',
      'Fruits: apples, bananas, berries',
      'Healthy fats: olive oil, avocado, nuts'
    ],
    weekly_budget: '400-600 NIS'
  };

  res.json(plan);
});

/**
 * POST /api/grocery-optimize
 */
app.post('/api/grocery-optimize', auth.authMiddleware, (req, res) => {
  const { budget, allergies } = req.body;

  res.json({
    budget: budget || '400 NIS',
    tips: [
      'Buy seasonal vegetables for better prices',
      'Compare unit prices at different stores',
      'Use store apps for discounts',
      'Buy in bulk for non-perishables'
    ],
    allergyWarning: allergies ? `Avoid: ${allergies.join(', ')}` : 'No allergies noted',
    stores: ['Shufersal', 'Rami Levy', 'Carrefour']
  });
});

// ========== FOOD LOGGING ENDPOINTS ==========

const FOOD_LOG_MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * POST /api/food-logs
 * Log a single food item for a given date
 */
app.post('/api/food-logs', auth.authMiddleware, async (req, res) => {
  try {
    const schema = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      name: z.string().min(1),
      mealType: z.enum(FOOD_LOG_MEAL_TYPES).optional(),
      calories: z.number().nonnegative(),
      proteinGrams: z.number().nonnegative().optional(),
      carbsGrams: z.number().nonnegative().optional(),
      fatGrams: z.number().nonnegative().optional(),
      notes: z.string().max(500).optional()
    });

    const data = schema.parse(req.body);
    const row = await db.createFoodLog(req.user.userId, {
      date: data.date,
      name: data.name,
      meal_type: data.mealType || null,
      calories: data.calories,
      protein_grams: data.proteinGrams ?? null,
      carbs_grams: data.carbsGrams ?? null,
      fat_grams: data.fatGrams ?? null,
      notes: data.notes ?? null
    });

    return res.status(201).json(row);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.issues, requestId: req.id });
    }
    return res.status(500).json({ error: 'Failed to create food log', details: error.message, requestId: req.id });
  }
});

/**
 * POST /api/food-logs/bulk
 * Log multiple food items in one request
 */
app.post('/api/food-logs/bulk', auth.authMiddleware, async (req, res) => {
  try {
    const itemSchema = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      name: z.string().min(1),
      mealType: z.enum(FOOD_LOG_MEAL_TYPES).optional(),
      calories: z.number().nonnegative(),
      proteinGrams: z.number().nonnegative().optional(),
      carbsGrams: z.number().nonnegative().optional(),
      fatGrams: z.number().nonnegative().optional(),
      notes: z.string().max(500).optional()
    });

    const schema = z.object({
      logs: z.array(itemSchema).min(1).max(100)
    });

    const { logs } = schema.parse(req.body);

    const created = [];
    for (const data of logs) {
      // Keep deterministic ordering in response
      const row = await db.createFoodLog(req.user.userId, {
        date: data.date,
        name: data.name,
        meal_type: data.mealType || null,
        calories: data.calories,
        protein_grams: data.proteinGrams ?? null,
        carbs_grams: data.carbsGrams ?? null,
        fat_grams: data.fatGrams ?? null,
        notes: data.notes ?? null
      });
      created.push(row);
    }

    return res.status(201).json({ createdCount: created.length, logs: created });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.issues, requestId: req.id });
    }
    return res.status(500).json({ error: 'Failed to create food logs', details: error.message, requestId: req.id });
  }
});

/**
 * POST /api/food-logs/import
 * Import food logs from a CSV-ish JSON payload (strings allowed)
 */
app.post('/api/food-logs/import', auth.authMiddleware, async (req, res) => {
  try {
    const emptyStringToUndefined = (v) => {
      if (typeof v !== 'string') return v;
      const t = v.trim();
      return t === '' ? undefined : t;
    };
    const emptyStringToNull = (v) => {
      if (v == null) return null;
      if (typeof v !== 'string') return v;
      const t = v.trim();
      return t === '' ? null : t;
    };

    const rowSchema = z.object({
      date: z.preprocess(emptyStringToUndefined, z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
      name: z.preprocess(emptyStringToUndefined, z.string().min(1)),
      mealType: z.preprocess(emptyStringToNull, z.enum(FOOD_LOG_MEAL_TYPES).nullable()).optional(),
      calories: z.preprocess(emptyStringToUndefined, z.coerce.number().nonnegative()),
      proteinGrams: z.preprocess(emptyStringToNull, z.coerce.number().nonnegative().nullable()).optional(),
      carbsGrams: z.preprocess(emptyStringToNull, z.coerce.number().nonnegative().nullable()).optional(),
      fatGrams: z.preprocess(emptyStringToNull, z.coerce.number().nonnegative().nullable()).optional(),
      notes: z.preprocess(emptyStringToNull, z.string().max(500).nullable()).optional()
    });

    const bodySchema = z.object({
      rows: z.array(rowSchema).min(1).max(500)
    });

    const { rows } = bodySchema.parse(req.body);

    const created = [];
    for (const r of rows) {
      const row = await db.createFoodLog(req.user.userId, {
        date: r.date,
        name: r.name,
        meal_type: Object.prototype.hasOwnProperty.call(r, 'mealType') ? (r.mealType ?? null) : null,
        calories: r.calories,
        protein_grams: Object.prototype.hasOwnProperty.call(r, 'proteinGrams') ? (r.proteinGrams ?? null) : null,
        carbs_grams: Object.prototype.hasOwnProperty.call(r, 'carbsGrams') ? (r.carbsGrams ?? null) : null,
        fat_grams: Object.prototype.hasOwnProperty.call(r, 'fatGrams') ? (r.fatGrams ?? null) : null,
        notes: Object.prototype.hasOwnProperty.call(r, 'notes') ? (r.notes ?? null) : null
      });
      created.push(row);
    }

    return res.status(201).json({ createdCount: created.length, logs: created });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.issues, requestId: req.id });
    }
    return res.status(500).json({ error: 'Failed to import food logs', details: error.message, requestId: req.id });
  }
});

/**
 * POST /api/food-logs/copy
 * Copy all food logs from one date to another
 */
app.post('/api/food-logs/copy', auth.authMiddleware, async (req, res) => {
  try {
    const bodySchema = z
      .object({
        fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
      })
      .refine((v) => v.fromDate !== v.toDate, { message: 'fromDate must be different than toDate' });

    const { fromDate, toDate } = bodySchema.parse(req.body);
    const sourceLogs = await db.getFoodLogs(req.user.userId, { date: fromDate });

    const created = [];
    for (const l of sourceLogs || []) {
      const row = await db.createFoodLog(req.user.userId, {
        date: toDate,
        name: l.name,
        meal_type: l.meal_type ?? null,
        calories: l.calories,
        protein_grams: Object.prototype.hasOwnProperty.call(l, 'protein_grams') ? (l.protein_grams ?? null) : null,
        carbs_grams: Object.prototype.hasOwnProperty.call(l, 'carbs_grams') ? (l.carbs_grams ?? null) : null,
        fat_grams: Object.prototype.hasOwnProperty.call(l, 'fat_grams') ? (l.fat_grams ?? null) : null,
        notes: Object.prototype.hasOwnProperty.call(l, 'notes') ? (l.notes ?? null) : null
      });
      created.push(row);
    }

    return res.status(201).json({ fromDate, toDate, copiedCount: created.length, logs: created });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.issues, requestId: req.id });
    }
    return res.status(500).json({ error: 'Failed to copy food logs', details: error.message, requestId: req.id });
  }
});

/**
 * POST /api/food-logs/template
 * Save a reusable food log template (meal)
 */
app.post('/api/food-logs/template', auth.authMiddleware, async (req, res) => {
  try {
    const emptyStringToNull = (v) => {
      if (v == null) return null;
      if (typeof v !== 'string') return v;
      const t = v.trim();
      return t === '' ? null : t;
    };

    const schema = z.object({
      name: z.string().min(1),
      mealType: z.preprocess(emptyStringToNull, z.enum(FOOD_LOG_MEAL_TYPES).nullable()).optional(),
      calories: z.number().nonnegative(),
      proteinGrams: z.number().nonnegative().optional(),
      carbsGrams: z.number().nonnegative().optional(),
      fatGrams: z.number().nonnegative().optional(),
      notes: z.preprocess(emptyStringToNull, z.string().max(500).nullable()).optional()
    });

    const data = schema.parse(req.body);
    const row = await db.createFoodLogTemplate(req.user.userId, {
      name: data.name,
      meal_type: Object.prototype.hasOwnProperty.call(data, 'mealType') ? (data.mealType ?? null) : null,
      calories: data.calories,
      protein_grams: data.proteinGrams ?? null,
      carbs_grams: data.carbsGrams ?? null,
      fat_grams: data.fatGrams ?? null,
      notes: Object.prototype.hasOwnProperty.call(data, 'notes') ? (data.notes ?? null) : null
    });

    return res.status(201).json(row);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.issues, requestId: req.id });
    }
    return res.status(500).json({ error: 'Failed to create food log template', details: error.message, requestId: req.id });
  }
});

/**
 * GET /api/food-logs/templates
 * List reusable food log templates
 */
app.get('/api/food-logs/templates', auth.authMiddleware, async (req, res) => {
  try {
    const querySchema = z
      .object({
        limit: z.coerce.number().int().positive().max(200).optional(),
        offset: z.coerce.number().int().nonnegative().max(100000).optional()
      })
      .refine(v => (v.offset == null ? true : v.limit != null), {
        message: 'offset requires limit'
      });

    const { limit, offset } = querySchema.parse(req.query);
    const templates = await db.getFoodLogTemplates(req.user.userId, {
      limit: limit ?? null,
      offset: offset ?? null
    });
    return res.json(templates || []);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid query', details: error.issues, requestId: req.id });
    }
    return res.status(500).json({ error: 'Failed to get food log templates', details: error.message, requestId: req.id });
  }
});

/**
 * DELETE /api/food-logs/templates/:id
 * Delete a reusable food log template
 */
app.delete('/api/food-logs/templates/:id', auth.authMiddleware, async (req, res) => {
  try {
    const paramsSchema = z.object({
      id: z.string().min(1)
    });

    const { id } = paramsSchema.parse(req.params);
    const deleted = await db.deleteFoodLogTemplate(req.user.userId, id);

    if (!deleted) {
      return res.status(404).json({ error: 'Template not found', requestId: req.id });
    }

    return res.json({ status: 'ok', deleted });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.issues, requestId: req.id });
    }
    return res.status(500).json({ error: 'Failed to delete food log template', details: error.message, requestId: req.id });
  }
});

/**
 * GET /api/food-logs
 * Query food logs by date or range
 */
app.get('/api/food-logs', auth.authMiddleware, async (req, res) => {
  try {
    const querySchema = z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        limit: z.coerce.number().int().positive().max(200).optional(),
        offset: z.coerce.number().int().nonnegative().max(100000).optional()
      })
      .refine(v => (v.offset == null ? true : v.limit != null), {
        message: 'offset requires limit'
      });

    const { date, start, end, limit, offset } = querySchema.parse(req.query);
    const logs = await db.getFoodLogs(req.user.userId, {
      date: date || null,
      start: start || null,
      end: end || null,
      limit: limit ?? null,
      offset: offset ?? null
    });
    return res.json(logs || []);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid query', details: error.issues, requestId: req.id });
    }
    return res.status(500).json({ error: 'Failed to get food logs', details: error.message, requestId: req.id });
  }
});

/**
 * GET /api/food-days
 * List dates that have at least one food log in the given range
 */
app.get('/api/food-days', auth.authMiddleware, async (req, res) => {
  try {
    const querySchema = z
      .object({
        start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
      })
      .refine(v => String(v.start) <= String(v.end), { message: 'start must be <= end' });

    const { start, end } = querySchema.parse(req.query);
    const days = await db.getFoodDays(req.user.userId, { start, end });
    return res.json({ start, end, daysCount: (days || []).length, days: days || [] });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid query', details: error.issues, requestId: req.id });
    }
    return res.status(500).json({ error: 'Failed to get food days', details: error.message, requestId: req.id });
  }
});

/**
 * GET /api/food-logs/:id
 * Get a single food log entry by id
 */
app.get('/api/food-logs/:id', auth.authMiddleware, async (req, res) => {
  try {
    const paramsSchema = z.object({
      id: z.string().min(1)
    });
    const { id } = paramsSchema.parse(req.params);

    const row = await db.getFoodLogById(req.user.userId, id);
    if (!row) {
      return res.status(404).json({ error: 'Food log not found', requestId: req.id });
    }

    return res.json(row);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.issues, requestId: req.id });
    }
    return res.status(500).json({ error: 'Failed to get food log', details: error.message, requestId: req.id });
  }
});

/**
 * DELETE /api/food-logs/:id
 * Delete a single food log entry
 */
app.delete('/api/food-logs/:id', auth.authMiddleware, async (req, res) => {
  try {
    const paramsSchema = z.object({
      id: z.string().min(1)
    });
    const { id } = paramsSchema.parse(req.params);

    const deleted = await db.deleteFoodLog(req.user.userId, id);
    if (!deleted) {
      return res.status(404).json({ error: 'Food log not found', requestId: req.id });
    }

    return res.json({ status: 'ok', deleted });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.issues, requestId: req.id });
    }
    return res.status(500).json({ error: 'Failed to delete food log', details: error.message, requestId: req.id });
  }
});

/**
 * PUT /api/food-logs/:id
 * Update fields on a single food log entry
 */
app.put('/api/food-logs/:id', auth.authMiddleware, async (req, res) => {
  try {
    const paramsSchema = z.object({
      id: z.string().min(1)
    });
    const { id } = paramsSchema.parse(req.params);

    const bodySchema = z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        name: z.string().min(1).optional(),
        mealType: z.enum(FOOD_LOG_MEAL_TYPES).nullable().optional(),
        calories: z.number().nonnegative().optional(),
        proteinGrams: z.number().nonnegative().nullable().optional(),
        carbsGrams: z.number().nonnegative().nullable().optional(),
        fatGrams: z.number().nonnegative().nullable().optional(),
        notes: z.string().max(500).nullable().optional()
      })
      .refine(
        v =>
          Object.prototype.hasOwnProperty.call(v, 'date') ||
          Object.prototype.hasOwnProperty.call(v, 'name') ||
          Object.prototype.hasOwnProperty.call(v, 'mealType') ||
          Object.prototype.hasOwnProperty.call(v, 'calories') ||
          Object.prototype.hasOwnProperty.call(v, 'proteinGrams') ||
          Object.prototype.hasOwnProperty.call(v, 'carbsGrams') ||
          Object.prototype.hasOwnProperty.call(v, 'fatGrams') ||
          Object.prototype.hasOwnProperty.call(v, 'notes'),
        { message: 'At least one field must be provided' }
      );

    const data = bodySchema.parse(req.body);
    const patch = {
      ...(Object.prototype.hasOwnProperty.call(data, 'date') ? { date: data.date } : {}),
      ...(Object.prototype.hasOwnProperty.call(data, 'name') ? { name: data.name } : {}),
      ...(Object.prototype.hasOwnProperty.call(data, 'mealType') ? { meal_type: data.mealType ?? null } : {}),
      ...(Object.prototype.hasOwnProperty.call(data, 'calories') ? { calories: data.calories } : {}),
      ...(Object.prototype.hasOwnProperty.call(data, 'proteinGrams') ? { protein_grams: data.proteinGrams ?? null } : {}),
      ...(Object.prototype.hasOwnProperty.call(data, 'carbsGrams') ? { carbs_grams: data.carbsGrams ?? null } : {}),
      ...(Object.prototype.hasOwnProperty.call(data, 'fatGrams') ? { fat_grams: data.fatGrams ?? null } : {}),
      ...(Object.prototype.hasOwnProperty.call(data, 'notes') ? { notes: data.notes ?? null } : {})
    };

    const updated = await db.updateFoodLog(req.user.userId, id, patch);
    if (!updated) {
      return res.status(404).json({ error: 'Food log not found', requestId: req.id });
    }

    return res.json(updated);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.issues, requestId: req.id });
    }
    return res.status(500).json({ error: 'Failed to update food log', details: error.message, requestId: req.id });
  }
});

/**
 * PATCH /api/food-logs/:id
 * Partially update fields on a single food log entry
 */
app.patch('/api/food-logs/:id', auth.authMiddleware, async (req, res) => {
  try {
    const paramsSchema = z.object({
      id: z.string().min(1)
    });
    const { id } = paramsSchema.parse(req.params);

    const bodySchema = z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        name: z.string().min(1).optional(),
        mealType: z.enum(FOOD_LOG_MEAL_TYPES).nullable().optional(),
        calories: z.number().nonnegative().optional(),
        proteinGrams: z.number().nonnegative().nullable().optional(),
        carbsGrams: z.number().nonnegative().nullable().optional(),
        fatGrams: z.number().nonnegative().nullable().optional(),
        notes: z.string().max(500).nullable().optional()
      })
      .refine(
        v =>
          Object.prototype.hasOwnProperty.call(v, 'date') ||
          Object.prototype.hasOwnProperty.call(v, 'name') ||
          Object.prototype.hasOwnProperty.call(v, 'mealType') ||
          Object.prototype.hasOwnProperty.call(v, 'calories') ||
          Object.prototype.hasOwnProperty.call(v, 'proteinGrams') ||
          Object.prototype.hasOwnProperty.call(v, 'carbsGrams') ||
          Object.prototype.hasOwnProperty.call(v, 'fatGrams') ||
          Object.prototype.hasOwnProperty.call(v, 'notes'),
        { message: 'At least one field must be provided' }
      );

    const data = bodySchema.parse(req.body);
    const patch = {
      ...(Object.prototype.hasOwnProperty.call(data, 'date') ? { date: data.date } : {}),
      ...(Object.prototype.hasOwnProperty.call(data, 'name') ? { name: data.name } : {}),
      ...(Object.prototype.hasOwnProperty.call(data, 'mealType') ? { meal_type: data.mealType ?? null } : {}),
      ...(Object.prototype.hasOwnProperty.call(data, 'calories') ? { calories: data.calories } : {}),
      ...(Object.prototype.hasOwnProperty.call(data, 'proteinGrams') ? { protein_grams: data.proteinGrams ?? null } : {}),
      ...(Object.prototype.hasOwnProperty.call(data, 'carbsGrams') ? { carbs_grams: data.carbsGrams ?? null } : {}),
      ...(Object.prototype.hasOwnProperty.call(data, 'fatGrams') ? { fat_grams: data.fatGrams ?? null } : {}),
      ...(Object.prototype.hasOwnProperty.call(data, 'notes') ? { notes: data.notes ?? null } : {})
    };

    const updated = await db.updateFoodLog(req.user.userId, id, patch);
    if (!updated) {
      return res.status(404).json({ error: 'Food log not found', requestId: req.id });
    }

    return res.json(updated);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.issues, requestId: req.id });
    }
    return res.status(500).json({ error: 'Failed to update food log', details: error.message, requestId: req.id });
  }
});

/**
 * GET /api/food-summary
 * Summarize daily totals
 */
app.get('/api/food-summary', auth.authMiddleware, async (req, res) => {
  try {
    const querySchema = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    });

    const { date } = querySchema.parse(req.query);
    const logs = await db.getFoodLogs(req.user.userId, { date });

    const totals = {
      calories: 0,
      protein_grams: 0,
      carbs_grams: 0,
      fat_grams: 0
    };

    for (const l of logs || []) {
      totals.calories += Number(l.calories || 0);
      totals.protein_grams += Number(l.protein_grams || 0);
      totals.carbs_grams += Number(l.carbs_grams || 0);
      totals.fat_grams += Number(l.fat_grams || 0);
    }

    return res.json({
      date,
      count: (logs || []).length,
      totals
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid query', details: error.issues, requestId: req.id });
    }
    return res.status(500).json({ error: 'Failed to get food summary', details: error.message, requestId: req.id });
  }
});

/**
 * GET /api/food-summary/range
 * Summarize per-day totals across a date range (inclusive)
 */
app.get('/api/food-summary/range', auth.authMiddleware, async (req, res) => {
  try {
    const querySchema = z.object({
      start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    });

    const { start, end } = querySchema.parse(req.query);
    if (start > end) {
      return res.status(400).json({ error: 'Invalid query', details: [{ message: 'start must be <= end' }], requestId: req.id });
    }

    const logs = await db.getFoodLogs(req.user.userId, { start, end });

    const logsByDate = new Map();
    for (const l of logs || []) {
      const d = String(l.date || '');
      if (!d) continue;
      if (!logsByDate.has(d)) logsByDate.set(d, []);
      logsByDate.get(d).push(l);
    }

    const parseDateUTC = (s) => {
      const [y, m, d] = String(s).split('-').map((v) => Number(v));
      return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    };

    const startDt = parseDateUTC(start);
    const endDt = parseDateUTC(end);
    const rangeDays = daysBetweenUTC(startDt, endDt);

    const totals = {
      calories: 0,
      protein_grams: 0,
      carbs_grams: 0,
      fat_grams: 0
    };

    const days = [];
    for (let dayOffset = 0; dayOffset <= rangeDays; dayOffset += 1) {
      const date = formatDateYYYYMMDD(addDaysUTC(startDt, dayOffset));
      const dayLogs = logsByDate.get(date) || [];

      const dayTotals = {
        calories: 0,
        protein_grams: 0,
        carbs_grams: 0,
        fat_grams: 0
      };

      for (const l of dayLogs) {
        dayTotals.calories += Number(l.calories || 0);
        dayTotals.protein_grams += Number(l.protein_grams || 0);
        dayTotals.carbs_grams += Number(l.carbs_grams || 0);
        dayTotals.fat_grams += Number(l.fat_grams || 0);
      }

      totals.calories += dayTotals.calories;
      totals.protein_grams += dayTotals.protein_grams;
      totals.carbs_grams += dayTotals.carbs_grams;
      totals.fat_grams += dayTotals.fat_grams;

      days.push({
        date,
        count: (dayLogs || []).length,
        totals: dayTotals
      });
    }

    return res.json({
      start,
      end,
      daysCount: days.length,
      totals,
      days
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid query', details: error.issues, requestId: req.id });
    }
    return res.status(500).json({ error: 'Failed to get food summary range', details: error.message, requestId: req.id });
  }
});

/**
 * GET /api/food-summary/week
 * Summarize per-day totals for a 7-day week window starting at weekStart (inclusive)
 */
app.get('/api/food-summary/week', auth.authMiddleware, async (req, res) => {
  try {
    const querySchema = z.object({
      weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    });

    const { weekStart } = querySchema.parse(req.query);

    const parseDateUTC = (s) => {
      const [y, m, d] = String(s).split('-').map((v) => Number(v));
      return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    };

    const startDt = parseDateUTC(weekStart);
    const endDt = addDaysUTC(startDt, 6);
    const start = formatDateYYYYMMDD(startDt);
    const end = formatDateYYYYMMDD(endDt);

    const logs = await db.getFoodLogs(req.user.userId, { start, end });

    const logsByDate = new Map();
    for (const l of logs || []) {
      const d = String(l.date || '');
      if (!d) continue;
      if (!logsByDate.has(d)) logsByDate.set(d, []);
      logsByDate.get(d).push(l);
    }

    const totals = {
      calories: 0,
      protein_grams: 0,
      carbs_grams: 0,
      fat_grams: 0
    };

    const days = [];
    for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
      const date = formatDateYYYYMMDD(addDaysUTC(startDt, dayOffset));
      const dayLogs = logsByDate.get(date) || [];

      const dayTotals = {
        calories: 0,
        protein_grams: 0,
        carbs_grams: 0,
        fat_grams: 0
      };

      for (const l of dayLogs) {
        dayTotals.calories += Number(l.calories || 0);
        dayTotals.protein_grams += Number(l.protein_grams || 0);
        dayTotals.carbs_grams += Number(l.carbs_grams || 0);
        dayTotals.fat_grams += Number(l.fat_grams || 0);
      }

      totals.calories += dayTotals.calories;
      totals.protein_grams += dayTotals.protein_grams;
      totals.carbs_grams += dayTotals.carbs_grams;
      totals.fat_grams += dayTotals.fat_grams;

      days.push({
        date,
        count: (dayLogs || []).length,
        totals: dayTotals
      });
    }

    return res.json({
      weekStart,
      start,
      end,
      daysCount: days.length,
      totals,
      days
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid query', details: error.issues, requestId: req.id });
    }
    return res.status(500).json({ error: 'Failed to get food summary week', details: error.message, requestId: req.id });
  }
});

/**
 * GET /api/food-summary/month
 * Summarize per-day totals for a month window
 */
app.get('/api/food-summary/month', auth.authMiddleware, async (req, res) => {
  try {
    const querySchema = z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/)
    });

    const { month } = querySchema.parse(req.query);

    const [yStr, mStr] = String(month).split('-');
    const year = Number(yStr);
    const monthNum = Number(mStr);
    if (!Number.isFinite(year) || !Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ error: 'Invalid query', details: [{ message: 'month must be YYYY-MM' }], requestId: req.id });
    }

    const startDt = new Date(Date.UTC(year, monthNum - 1, 1));
    const endDt = new Date(Date.UTC(year, monthNum, 0));
    const start = formatDateYYYYMMDD(startDt);
    const end = formatDateYYYYMMDD(endDt);
    const rangeDays = daysBetweenUTC(startDt, endDt);

    const logs = await db.getFoodLogs(req.user.userId, { start, end });

    const logsByDate = new Map();
    for (const l of logs || []) {
      const d = String(l.date || '');
      if (!d) continue;
      if (!logsByDate.has(d)) logsByDate.set(d, []);
      logsByDate.get(d).push(l);
    }

    const totals = {
      calories: 0,
      protein_grams: 0,
      carbs_grams: 0,
      fat_grams: 0
    };

    const days = [];
    for (let dayOffset = 0; dayOffset <= rangeDays; dayOffset += 1) {
      const date = formatDateYYYYMMDD(addDaysUTC(startDt, dayOffset));
      const dayLogs = logsByDate.get(date) || [];

      const dayTotals = {
        calories: 0,
        protein_grams: 0,
        carbs_grams: 0,
        fat_grams: 0
      };

      for (const l of dayLogs) {
        dayTotals.calories += Number(l.calories || 0);
        dayTotals.protein_grams += Number(l.protein_grams || 0);
        dayTotals.carbs_grams += Number(l.carbs_grams || 0);
        dayTotals.fat_grams += Number(l.fat_grams || 0);
      }

      totals.calories += dayTotals.calories;
      totals.protein_grams += dayTotals.protein_grams;
      totals.carbs_grams += dayTotals.carbs_grams;
      totals.fat_grams += dayTotals.fat_grams;

      days.push({
        date,
        count: (dayLogs || []).length,
        totals: dayTotals
      });
    }

    return res.json({
      month,
      start,
      end,
      daysCount: days.length,
      totals,
      days
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid query', details: error.issues, requestId: req.id });
    }
    return res.status(500).json({ error: 'Failed to get food summary month', details: error.message, requestId: req.id });
  }
});

/**
 * GET /api/calorie-balance
 * Compare target calories (from latest survey) vs consumed calories (from food logs)
 */
app.get('/api/calorie-balance', auth.authMiddleware, async (req, res) => {
  try {
    const querySchema = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    });
    const { date } = querySchema.parse(req.query);

    const surveys = await db.getSurveys(req.user.userId);
    const latestSurvey = Array.isArray(surveys) && surveys.length > 0 ? surveys[0] : null;

    const dailyCalories = latestSurvey?.daily_calories;
    const targetCalories =
      (dailyCalories && typeof dailyCalories === 'object' && dailyCalories !== null)
        ? (Number(dailyCalories.targetDailyCalories) || null)
        : null;

    const logs = await db.getFoodLogs(req.user.userId, { date });
    const consumedCalories = (logs || []).reduce((sum, l) => sum + Number(l.calories || 0), 0);

    return res.json({
      date,
      targetCalories,
      consumedCalories,
      remainingCalories: targetCalories === null ? null : Math.round((targetCalories - consumedCalories) * 10) / 10,
      overByCalories: targetCalories === null ? null : Math.round(Math.max(0, consumedCalories - targetCalories) * 10) / 10,
      hasTarget: targetCalories !== null,
      surveyId: latestSurvey?.id || null
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid query', details: error.issues, requestId: req.id });
    }
    return res.status(500).json({ error: 'Failed to get calorie balance', details: error.message, requestId: req.id });
  }
});

/**
 * GET /api/weekly-calorie-balance
 * Aggregate calorie target vs consumed for a date range.
 */
app.get('/api/weekly-calorie-balance', auth.authMiddleware, async (req, res) => {
  try {
    const querySchema = z.object({
      start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    });
    const { start, end } = querySchema.parse(req.query);

    if (start > end) {
      return res.status(400).json({ error: 'Invalid query', details: [{ message: 'start must be <= end' }], requestId: req.id });
    }

    const [surveys, logs] = await Promise.all([
      db.getSurveys(req.user.userId),
      db.getFoodLogs(req.user.userId, { start, end })
    ]);

    const latestSurvey = Array.isArray(surveys) && surveys.length > 0 ? surveys[0] : null;

    const dailyCalories = latestSurvey?.daily_calories;
    const targetCalories =
      (dailyCalories && typeof dailyCalories === 'object' && dailyCalories !== null)
        ? (Number(dailyCalories.targetDailyCalories) || null)
        : null;

    const logsByDate = new Map();
    for (const l of logs || []) {
      const d = String(l.date || '');
      if (!d) continue;
      if (!logsByDate.has(d)) logsByDate.set(d, []);
      logsByDate.get(d).push(l);
    }

    const parseDate = (s) => {
      const [y, m, d] = s.split('-').map((v) => Number(v));
      return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    };
    const formatDate = (dt) => {
      const y = dt.getUTCFullYear();
      const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const d = String(dt.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    const startDt = parseDate(start);
    const endDt = parseDate(end);

    const days = [];
    let totalConsumedCalories = 0;

    for (let dt = startDt; dt <= endDt; dt = new Date(dt.getTime() + 24 * 60 * 60 * 1000)) {
      const date = formatDate(dt);
      const dayLogs = logsByDate.get(date) || [];
      const consumedCalories = (dayLogs || []).reduce((sum, l) => sum + Number(l.calories || 0), 0);
      totalConsumedCalories += consumedCalories;

      days.push({
        date,
        targetCalories,
        consumedCalories,
        remainingCalories: targetCalories === null ? null : Math.round((targetCalories - consumedCalories) * 10) / 10,
        overByCalories: targetCalories === null ? null : Math.round(Math.max(0, consumedCalories - targetCalories) * 10) / 10,
        hasTarget: targetCalories !== null,
        count: (dayLogs || []).length
      });
    }

    const totalTargetCalories = targetCalories === null ? null : Math.round((targetCalories * days.length) * 10) / 10;

    return res.json({
      start,
      end,
      daysCount: days.length,
      targetCalories,
      totals: {
        targetCalories: totalTargetCalories,
        consumedCalories: totalConsumedCalories,
        remainingCalories: totalTargetCalories === null ? null : Math.round((totalTargetCalories - totalConsumedCalories) * 10) / 10,
        overByCalories: totalTargetCalories === null ? null : Math.round(Math.max(0, totalConsumedCalories - totalTargetCalories) * 10) / 10
      },
      days,
      hasTarget: targetCalories !== null,
      surveyId: latestSurvey?.id || null
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid query', details: error.issues, requestId: req.id });
    }
    return res.status(500).json({ error: 'Failed to get weekly calorie balance', details: error.message, requestId: req.id });
  }
});

/**
 * GET /api/streaks
 * Compute streaks based on days with at least one food log.
 */
app.get('/api/streaks', auth.authMiddleware, async (req, res) => {
  try {
    const querySchema = z.object({
      asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    });
    const { asOf } = querySchema.parse(req.query);

    const parseDateUTC = (s) => {
      const [y, m, d] = String(s).split('-').map((v) => Number(v));
      return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    };

    const asOfDtRaw = asOf ? parseDateUTC(asOf) : new Date();
    const asOfDt = new Date(Date.UTC(asOfDtRaw.getUTCFullYear(), asOfDtRaw.getUTCMonth(), asOfDtRaw.getUTCDate()));
    const asOfStr = formatDateYYYYMMDD(asOfDt);
    const startStr = formatDateYYYYMMDD(addDaysUTC(asOfDt, -365));

    const logs = await db.getFoodLogs(req.user.userId, { start: startStr, end: asOfStr });

    const activeDates = new Set(
      (logs || [])
        .map((l) => String(l.date || ''))
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= asOfStr)
    );

    const activeDatesSorted = Array.from(activeDates).sort();
    const lastActiveDate = activeDatesSorted.length > 0 ? activeDatesSorted[activeDatesSorted.length - 1] : null;

    // Longest streak across available active dates
    let longestStreak = 0;
    let currentRun = 0;
    let prevDt = null;
    for (const d of activeDatesSorted) {
      const dt = parseDateUTC(d);
      if (!prevDt) {
        currentRun = 1;
      } else {
        const gap = daysBetweenUTC(prevDt, dt);
        currentRun = gap === 1 ? currentRun + 1 : 1;
      }
      if (currentRun > longestStreak) longestStreak = currentRun;
      prevDt = dt;
    }

    // Current streak ending at asOf date
    let currentStreak = 0;
    for (let i = 0; i < 366; i++) {
      const d = formatDateYYYYMMDD(addDaysUTC(asOfDt, -i));
      if (!activeDates.has(d)) break;
      currentStreak++;
    }

    return res.json({
      asOf: asOfStr,
      streakType: 'food-logs',
      activeOnAsOfDate: activeDates.has(asOfStr),
      lastActiveDate,
      activeDatesCount: activeDates.size,
      currentStreak,
      longestStreak
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid query', details: error.issues, requestId: req.id });
    }
    return res.status(500).json({ error: 'Failed to get streaks', details: error.message, requestId: req.id });
  }
});

/**
 * GET /api/macro-balance
 * Compare macro targets (from user preferences or latest survey) vs consumed macros (from food logs)
 */
app.get('/api/macro-balance', auth.authMiddleware, async (req, res) => {
  try {
    const querySchema = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    });
    const { date } = querySchema.parse(req.query);

    const [user, surveys, logs] = await Promise.all([
      db.getUser(req.user.userId),
      db.getSurveys(req.user.userId),
      db.getFoodLogs(req.user.userId, { date })
    ]);

    const latestSurvey = Array.isArray(surveys) && surveys.length > 0 ? surveys[0] : null;
    const preferences = user?.preferences;

    const macroTargets =
      (preferences && typeof preferences === 'object' && preferences !== null)
        ? (preferences.macroTargets || preferences.macro_targets || null)
        : null;

    const readTargetNumber = (obj, keys) => {
      if (!obj || typeof obj !== 'object') return null;
      for (const k of keys) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) {
          const v = Number(obj[k]);
          if (Number.isFinite(v)) return v;
        }
      }
      return null;
    };

    let proteinTarget = readTargetNumber(macroTargets, ['protein_grams', 'proteinGrams', 'protein']);
    let carbsTarget = readTargetNumber(macroTargets, ['carbs_grams', 'carbsGrams', 'carbs']);
    let fatTarget = readTargetNumber(macroTargets, ['fat_grams', 'fatGrams', 'fat']);

    if (proteinTarget === null && latestSurvey && Number.isFinite(Number(latestSurvey.protein_target_g))) {
      proteinTarget = Number(latestSurvey.protein_target_g);
    }

    const consumed = {
      protein_grams: 0,
      carbs_grams: 0,
      fat_grams: 0
    };

    for (const l of logs || []) {
      consumed.protein_grams += Number(l.protein_grams || 0);
      consumed.carbs_grams += Number(l.carbs_grams || 0);
      consumed.fat_grams += Number(l.fat_grams || 0);
    }

    const balance = (target, consumedValue) => {
      if (target === null) return { target: null, consumed: consumedValue, remaining: null, overBy: null };
      const remaining = Math.round((target - consumedValue) * 10) / 10;
      const overBy = Math.round(Math.max(0, consumedValue - target) * 10) / 10;
      return { target: Math.round(target * 10) / 10, consumed: consumedValue, remaining, overBy };
    };

    const protein = balance(proteinTarget, consumed.protein_grams);
    const carbs = balance(carbsTarget, consumed.carbs_grams);
    const fat = balance(fatTarget, consumed.fat_grams);

    const hasTargets = proteinTarget !== null || carbsTarget !== null || fatTarget !== null;

    return res.json({
      date,
      targets: {
        protein_grams: protein.target,
        carbs_grams: carbs.target,
        fat_grams: fat.target
      },
      consumed,
      remaining: {
        protein_grams: protein.remaining,
        carbs_grams: carbs.remaining,
        fat_grams: fat.remaining
      },
      overBy: {
        protein_grams: protein.overBy,
        carbs_grams: carbs.overBy,
        fat_grams: fat.overBy
      },
      hasTargets,
      surveyId: latestSurvey?.id || null
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid query', details: error.issues, requestId: req.id });
    }
    return res.status(500).json({ error: 'Failed to get macro balance', details: error.message, requestId: req.id });
  }
});

/**
 * GET /api/macro-balance/range
 * Compare macro targets vs consumed macros across a date range.
 */
app.get('/api/macro-balance/range', auth.authMiddleware, async (req, res) => {
  try {
    const querySchema = z.object({
      start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    });
    const { start, end } = querySchema.parse(req.query);

    if (start > end) {
      return res.status(400).json({ error: 'Invalid query', details: [{ message: 'start must be <= end' }], requestId: req.id });
    }

    const [user, surveys, logs] = await Promise.all([
      db.getUser(req.user.userId),
      db.getSurveys(req.user.userId),
      db.getFoodLogs(req.user.userId, { start, end })
    ]);

    const latestSurvey = Array.isArray(surveys) && surveys.length > 0 ? surveys[0] : null;
    const preferences = user?.preferences;

    const macroTargets =
      (preferences && typeof preferences === 'object' && preferences !== null)
        ? (preferences.macroTargets || preferences.macro_targets || null)
        : null;

    const readTargetNumber = (obj, keys) => {
      if (!obj || typeof obj !== 'object') return null;
      for (const k of keys) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) {
          const v = Number(obj[k]);
          if (Number.isFinite(v)) return v;
        }
      }
      return null;
    };

    let proteinTarget = readTargetNumber(macroTargets, ['protein_grams', 'proteinGrams', 'protein']);
    let carbsTarget = readTargetNumber(macroTargets, ['carbs_grams', 'carbsGrams', 'carbs']);
    let fatTarget = readTargetNumber(macroTargets, ['fat_grams', 'fatGrams', 'fat']);

    if (proteinTarget === null && latestSurvey && Number.isFinite(Number(latestSurvey.protein_target_g))) {
      proteinTarget = Number(latestSurvey.protein_target_g);
    }

    const round1 = (n) => Math.round(Number(n || 0) * 10) / 10;

    const parseDate = (s) => {
      const [y, m, d] = String(s).split('-').map((v) => Number(v));
      return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    };
    const formatDate = (dt) => {
      const y = dt.getUTCFullYear();
      const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const d = String(dt.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    const logsByDate = new Map();
    for (const l of logs || []) {
      const d = String(l.date || '');
      if (!d) continue;
      if (!logsByDate.has(d)) logsByDate.set(d, []);
      logsByDate.get(d).push(l);
    }

    const balance = (target, consumedValue) => {
      if (target === null) return { target: null, consumed: round1(consumedValue), remaining: null, overBy: null };
      const remaining = round1(target - consumedValue);
      const overBy = round1(Math.max(0, consumedValue - target));
      return { target: round1(target), consumed: round1(consumedValue), remaining, overBy };
    };

    const days = [];
    const totalsConsumed = { protein_grams: 0, carbs_grams: 0, fat_grams: 0 };

    const startDt = parseDate(start);
    const endDt = parseDate(end);
    let daysCount = 0;

    for (let dt = startDt; dt <= endDt; dt = new Date(dt.getTime() + 24 * 60 * 60 * 1000)) {
      const date = formatDate(dt);
      daysCount++;
      const dayLogs = logsByDate.get(date) || [];

      const consumed = { protein_grams: 0, carbs_grams: 0, fat_grams: 0 };
      for (const l of dayLogs) {
        consumed.protein_grams += Number(l.protein_grams || 0);
        consumed.carbs_grams += Number(l.carbs_grams || 0);
        consumed.fat_grams += Number(l.fat_grams || 0);
      }

      totalsConsumed.protein_grams += consumed.protein_grams;
      totalsConsumed.carbs_grams += consumed.carbs_grams;
      totalsConsumed.fat_grams += consumed.fat_grams;

      const protein = balance(proteinTarget, consumed.protein_grams);
      const carbs = balance(carbsTarget, consumed.carbs_grams);
      const fat = balance(fatTarget, consumed.fat_grams);

      days.push({
        date,
        count: dayLogs.length,
        targets: {
          protein_grams: protein.target,
          carbs_grams: carbs.target,
          fat_grams: fat.target
        },
        consumed: {
          protein_grams: protein.consumed,
          carbs_grams: carbs.consumed,
          fat_grams: fat.consumed
        },
        remaining: {
          protein_grams: protein.remaining,
          carbs_grams: carbs.remaining,
          fat_grams: fat.remaining
        },
        overBy: {
          protein_grams: protein.overBy,
          carbs_grams: carbs.overBy,
          fat_grams: fat.overBy
        }
      });
    }

    const totalTargets = {
      protein_grams: proteinTarget === null ? null : round1(proteinTarget * daysCount),
      carbs_grams: carbsTarget === null ? null : round1(carbsTarget * daysCount),
      fat_grams: fatTarget === null ? null : round1(fatTarget * daysCount)
    };

    const totals = {
      targets: totalTargets,
      consumed: {
        protein_grams: round1(totalsConsumed.protein_grams),
        carbs_grams: round1(totalsConsumed.carbs_grams),
        fat_grams: round1(totalsConsumed.fat_grams)
      },
      remaining: {
        protein_grams: totalTargets.protein_grams === null ? null : round1(totalTargets.protein_grams - totalsConsumed.protein_grams),
        carbs_grams: totalTargets.carbs_grams === null ? null : round1(totalTargets.carbs_grams - totalsConsumed.carbs_grams),
        fat_grams: totalTargets.fat_grams === null ? null : round1(totalTargets.fat_grams - totalsConsumed.fat_grams)
      },
      overBy: {
        protein_grams: totalTargets.protein_grams === null ? null : round1(Math.max(0, totalsConsumed.protein_grams - totalTargets.protein_grams)),
        carbs_grams: totalTargets.carbs_grams === null ? null : round1(Math.max(0, totalsConsumed.carbs_grams - totalTargets.carbs_grams)),
        fat_grams: totalTargets.fat_grams === null ? null : round1(Math.max(0, totalsConsumed.fat_grams - totalTargets.fat_grams))
      }
    };

    const hasTargets = proteinTarget !== null || carbsTarget !== null || fatTarget !== null;

    return res.json({
      start,
      end,
      daysCount,
      targets: {
        protein_grams: proteinTarget === null ? null : round1(proteinTarget),
        carbs_grams: carbsTarget === null ? null : round1(carbsTarget),
        fat_grams: fatTarget === null ? null : round1(fatTarget)
      },
      totals,
      days,
      hasTargets,
      surveyId: latestSurvey?.id || null
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid query', details: error.issues, requestId: req.id });
    }
    return res.status(500).json({ error: 'Failed to get macro balance range', details: error.message, requestId: req.id });
  }
});

/**
 * GET /api/nutrition-score
 * Simple daily score (0-100) based on staying within calorie + macro targets.
 */
app.get('/api/nutrition-score', auth.authMiddleware, async (req, res) => {
  try {
    const querySchema = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    });
    const { date } = querySchema.parse(req.query);

    const [user, surveys, logs] = await Promise.all([
      db.getUser(req.user.userId),
      db.getSurveys(req.user.userId),
      db.getFoodLogs(req.user.userId, { date })
    ]);

    const latestSurvey = Array.isArray(surveys) && surveys.length > 0 ? surveys[0] : null;
    const preferences = user?.preferences;

    const dailyCalories = latestSurvey?.daily_calories;
    const targetCalories =
      (dailyCalories && typeof dailyCalories === 'object' && dailyCalories !== null)
        ? (Number(dailyCalories.targetDailyCalories) || null)
        : null;

    const macroTargetsRaw =
      (preferences && typeof preferences === 'object' && preferences !== null)
        ? (preferences.macroTargets || preferences.macro_targets || null)
        : null;

    const readTargetNumber = (obj, keys) => {
      if (!obj || typeof obj !== 'object') return null;
      for (const k of keys) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) {
          const v = Number(obj[k]);
          if (Number.isFinite(v)) return v;
        }
      }
      return null;
    };

    const macroTargets = {
      protein_grams: readTargetNumber(macroTargetsRaw, ['protein_grams', 'proteinGrams', 'protein']),
      carbs_grams: readTargetNumber(macroTargetsRaw, ['carbs_grams', 'carbsGrams', 'carbs']),
      fat_grams: readTargetNumber(macroTargetsRaw, ['fat_grams', 'fatGrams', 'fat'])
    };

    if (macroTargets.protein_grams === null && latestSurvey && Number.isFinite(Number(latestSurvey.protein_target_g))) {
      macroTargets.protein_grams = Number(latestSurvey.protein_target_g);
    }

    const consumed = {
      calories: 0,
      protein_grams: 0,
      carbs_grams: 0,
      fat_grams: 0
    };

    for (const l of logs || []) {
      consumed.calories += Number(l.calories || 0);
      consumed.protein_grams += Number(l.protein_grams || 0);
      consumed.carbs_grams += Number(l.carbs_grams || 0);
      consumed.fat_grams += Number(l.fat_grams || 0);
    }

    const overBy = {
      calories: targetCalories === null ? null : Math.max(0, consumed.calories - targetCalories),
      protein_grams: macroTargets.protein_grams === null ? null : Math.max(0, consumed.protein_grams - macroTargets.protein_grams),
      carbs_grams: macroTargets.carbs_grams === null ? null : Math.max(0, consumed.carbs_grams - macroTargets.carbs_grams),
      fat_grams: macroTargets.fat_grams === null ? null : Math.max(0, consumed.fat_grams - macroTargets.fat_grams)
    };

    const clamp01 = (x) => Math.max(0, Math.min(1, x));
    const safeRatio = (numerator, denominator) => {
      if (denominator === null) return null;
      const d = Number(denominator);
      if (!Number.isFinite(d) || d <= 0) return null;
      return clamp01(Number(numerator || 0) / d);
    };

    const calorieOverRatio = safeRatio(overBy.calories, targetCalories);

    const macroKeys = ['protein_grams', 'carbs_grams', 'fat_grams'];
    const macroRatios = macroKeys
      .map((k) => safeRatio(overBy[k], macroTargets[k]))
      .filter((v) => v !== null);

    const hasCalorieTarget = targetCalories !== null;
    const hasAnyMacroTarget = macroRatios.length > 0;

    const calorieWeight = hasCalorieTarget && hasAnyMacroTarget ? 0.5 : (hasCalorieTarget ? 1 : 0);
    const macroWeight = hasCalorieTarget && hasAnyMacroTarget ? 0.5 : (hasAnyMacroTarget ? 1 : 0);

    const macroOverRatioAvg = macroRatios.length > 0
      ? (macroRatios.reduce((sum, r) => sum + r, 0) / macroRatios.length)
      : null;

    const penalty01 =
      (calorieOverRatio !== null ? calorieWeight * calorieOverRatio : 0) +
      (macroOverRatioAvg !== null ? macroWeight * macroOverRatioAvg : 0);

    const score = Math.round((1 - clamp01(penalty01)) * 100);

    return res.json({
      date,
      score,
      targets: {
        calories: targetCalories,
        ...macroTargets
      },
      consumed,
      overBy,
      surveyId: latestSurvey?.id || null,
      hasTargets: hasCalorieTarget || hasAnyMacroTarget
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid query', details: error.issues, requestId: req.id });
    }
    return res.status(500).json({ error: 'Failed to get nutrition score', details: error.message, requestId: req.id });
  }
});

/**
 * GET /api/nutrition-score/range
 * Nutrition score per day for a date range.
 */
app.get('/api/nutrition-score/range', auth.authMiddleware, async (req, res) => {
  try {
    const querySchema = z.object({
      start: z.string().regex(/^(\d{4})-(\d{2})-(\d{2})$/),
      end: z.string().regex(/^(\d{4})-(\d{2})-(\d{2})$/)
    });
    const { start, end } = querySchema.parse(req.query);

    if (start > end) {
      return res.status(400).json({ error: 'Invalid query', details: [{ message: 'start must be <= end' }], requestId: req.id });
    }

    const [user, surveys, logs] = await Promise.all([
      db.getUser(req.user.userId),
      db.getSurveys(req.user.userId),
      db.getFoodLogs(req.user.userId, { start, end })
    ]);

    const latestSurvey = Array.isArray(surveys) && surveys.length > 0 ? surveys[0] : null;
    const preferences = user?.preferences;

    const dailyCalories = latestSurvey?.daily_calories;
    const targetCalories =
      (dailyCalories && typeof dailyCalories === 'object' && dailyCalories !== null)
        ? (Number(dailyCalories.targetDailyCalories) || null)
        : null;

    const macroTargetsRaw =
      (preferences && typeof preferences === 'object' && preferences !== null)
        ? (preferences.macroTargets || preferences.macro_targets || null)
        : null;

    const readTargetNumber = (obj, keys) => {
      if (!obj || typeof obj !== 'object') return null;
      for (const k of keys) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) {
          const v = Number(obj[k]);
          if (Number.isFinite(v)) return v;
        }
      }
      return null;
    };

    const macroTargets = {
      protein_grams: readTargetNumber(macroTargetsRaw, ['protein_grams', 'proteinGrams', 'protein']),
      carbs_grams: readTargetNumber(macroTargetsRaw, ['carbs_grams', 'carbsGrams', 'carbs']),
      fat_grams: readTargetNumber(macroTargetsRaw, ['fat_grams', 'fatGrams', 'fat'])
    };

    if (macroTargets.protein_grams === null && latestSurvey && Number.isFinite(Number(latestSurvey.protein_target_g))) {
      macroTargets.protein_grams = Number(latestSurvey.protein_target_g);
    }

    const clamp01 = (x) => Math.max(0, Math.min(1, x));
    const safeRatio = (numerator, denominator) => {
      if (denominator === null) return null;
      const d = Number(denominator);
      if (!Number.isFinite(d) || d <= 0) return null;
      return clamp01(Number(numerator || 0) / d);
    };

    const logsByDate = new Map();
    for (const l of logs || []) {
      const d = String(l.date || '');
      if (!d) continue;
      if (!logsByDate.has(d)) logsByDate.set(d, []);
      logsByDate.get(d).push(l);
    }

    const parseDate = (s) => {
      const [y, m, d] = s.split('-').map((v) => Number(v));
      return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    };
    const formatDate = (dt) => {
      const y = dt.getUTCFullYear();
      const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const d = String(dt.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    const startDt = parseDate(start);
    const endDt = parseDate(end);

    const days = [];
    const totals = {
      calories: 0,
      protein_grams: 0,
      carbs_grams: 0,
      fat_grams: 0
    };

    const scores = [];

    for (let dt = startDt; dt <= endDt; dt = new Date(dt.getTime() + 24 * 60 * 60 * 1000)) {
      const date = formatDate(dt);
      const dayLogs = logsByDate.get(date) || [];

      const consumed = {
        calories: 0,
        protein_grams: 0,
        carbs_grams: 0,
        fat_grams: 0
      };

      for (const l of dayLogs) {
        consumed.calories += Number(l.calories || 0);
        consumed.protein_grams += Number(l.protein_grams || 0);
        consumed.carbs_grams += Number(l.carbs_grams || 0);
        consumed.fat_grams += Number(l.fat_grams || 0);
      }

      totals.calories += consumed.calories;
      totals.protein_grams += consumed.protein_grams;
      totals.carbs_grams += consumed.carbs_grams;
      totals.fat_grams += consumed.fat_grams;

      const overBy = {
        calories: targetCalories === null ? null : Math.max(0, consumed.calories - targetCalories),
        protein_grams: macroTargets.protein_grams === null ? null : Math.max(0, consumed.protein_grams - macroTargets.protein_grams),
        carbs_grams: macroTargets.carbs_grams === null ? null : Math.max(0, consumed.carbs_grams - macroTargets.carbs_grams),
        fat_grams: macroTargets.fat_grams === null ? null : Math.max(0, consumed.fat_grams - macroTargets.fat_grams)
      };

      const calorieOverRatio = safeRatio(overBy.calories, targetCalories);
      const macroKeys = ['protein_grams', 'carbs_grams', 'fat_grams'];
      const macroRatios = macroKeys
        .map((k) => safeRatio(overBy[k], macroTargets[k]))
        .filter((v) => v !== null);

      const hasCalorieTarget = targetCalories !== null;
      const hasAnyMacroTarget = macroRatios.length > 0;

      const calorieWeight = hasCalorieTarget && hasAnyMacroTarget ? 0.5 : (hasCalorieTarget ? 1 : 0);
      const macroWeight = hasCalorieTarget && hasAnyMacroTarget ? 0.5 : (hasAnyMacroTarget ? 1 : 0);

      const macroOverRatioAvg = macroRatios.length > 0
        ? (macroRatios.reduce((sum, r) => sum + r, 0) / macroRatios.length)
        : null;

      const penalty01 =
        (calorieOverRatio !== null ? calorieWeight * calorieOverRatio : 0) +
        (macroOverRatioAvg !== null ? macroWeight * macroOverRatioAvg : 0);

      const score = Math.round((1 - clamp01(penalty01)) * 100);
      scores.push(score);

      days.push({
        date,
        score,
        consumed,
        overBy,
        count: dayLogs.length
      });
    }

    const averageScore = scores.length > 0
      ? Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 10) / 10
      : null;

    const hasTargets = targetCalories !== null || macroTargets.protein_grams !== null || macroTargets.carbs_grams !== null || macroTargets.fat_grams !== null;

    return res.json({
      start,
      end,
      daysCount: days.length,
      averageScore,
      targets: {
        calories: targetCalories,
        ...macroTargets
      },
      totals,
      days,
      surveyId: latestSurvey?.id || null,
      hasTargets
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid query', details: error.issues, requestId: req.id });
    }
    return res.status(500).json({ error: 'Failed to get nutrition score range', details: error.message, requestId: req.id });
  }
});

/**
 * GET /api/weekly-nutrition
 * Aggregate daily nutrition scores and totals for a date range.
 */
app.get('/api/weekly-nutrition', auth.authMiddleware, async (req, res) => {
  try {
    const querySchema = z.object({
      start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    });
    const { start, end } = querySchema.parse(req.query);

    if (start > end) {
      return res.status(400).json({ error: 'Invalid query', details: [{ message: 'start must be <= end' }], requestId: req.id });
    }

    const [user, surveys, logs] = await Promise.all([
      db.getUser(req.user.userId),
      db.getSurveys(req.user.userId),
      db.getFoodLogs(req.user.userId, { start, end })
    ]);

    const latestSurvey = Array.isArray(surveys) && surveys.length > 0 ? surveys[0] : null;
    const preferences = user?.preferences;

    const dailyCalories = latestSurvey?.daily_calories;
    const targetCalories =
      (dailyCalories && typeof dailyCalories === 'object' && dailyCalories !== null)
        ? (Number(dailyCalories.targetDailyCalories) || null)
        : null;

    const macroTargetsRaw =
      (preferences && typeof preferences === 'object' && preferences !== null)
        ? (preferences.macroTargets || preferences.macro_targets || null)
        : null;

    const readTargetNumber = (obj, keys) => {
      if (!obj || typeof obj !== 'object') return null;
      for (const k of keys) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) {
          const v = Number(obj[k]);
          if (Number.isFinite(v)) return v;
        }
      }
      return null;
    };

    const macroTargets = {
      protein_grams: readTargetNumber(macroTargetsRaw, ['protein_grams', 'proteinGrams', 'protein']),
      carbs_grams: readTargetNumber(macroTargetsRaw, ['carbs_grams', 'carbsGrams', 'carbs']),
      fat_grams: readTargetNumber(macroTargetsRaw, ['fat_grams', 'fatGrams', 'fat'])
    };

    if (macroTargets.protein_grams === null && latestSurvey && Number.isFinite(Number(latestSurvey.protein_target_g))) {
      macroTargets.protein_grams = Number(latestSurvey.protein_target_g);
    }

    const clamp01 = (x) => Math.max(0, Math.min(1, x));
    const safeRatio = (numerator, denominator) => {
      if (denominator === null) return null;
      const d = Number(denominator);
      if (!Number.isFinite(d) || d <= 0) return null;
      return clamp01(Number(numerator || 0) / d);
    };

    const logsByDate = new Map();
    for (const l of logs || []) {
      const d = String(l.date || '');
      if (!d) continue;
      if (!logsByDate.has(d)) logsByDate.set(d, []);
      logsByDate.get(d).push(l);
    }

    const parseDate = (s) => {
      const [y, m, d] = s.split('-').map((v) => Number(v));
      return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    };
    const formatDate = (dt) => {
      const y = dt.getUTCFullYear();
      const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const d = String(dt.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    const startDt = parseDate(start);
    const endDt = parseDate(end);

    const days = [];
    const totals = {
      calories: 0,
      protein_grams: 0,
      carbs_grams: 0,
      fat_grams: 0
    };

    const scores = [];

    for (let dt = startDt; dt <= endDt; dt = new Date(dt.getTime() + 24 * 60 * 60 * 1000)) {
      const date = formatDate(dt);
      const dayLogs = logsByDate.get(date) || [];

      const consumed = {
        calories: 0,
        protein_grams: 0,
        carbs_grams: 0,
        fat_grams: 0
      };

      for (const l of dayLogs) {
        consumed.calories += Number(l.calories || 0);
        consumed.protein_grams += Number(l.protein_grams || 0);
        consumed.carbs_grams += Number(l.carbs_grams || 0);
        consumed.fat_grams += Number(l.fat_grams || 0);
      }

      totals.calories += consumed.calories;
      totals.protein_grams += consumed.protein_grams;
      totals.carbs_grams += consumed.carbs_grams;
      totals.fat_grams += consumed.fat_grams;

      const overBy = {
        calories: targetCalories === null ? null : Math.max(0, consumed.calories - targetCalories),
        protein_grams: macroTargets.protein_grams === null ? null : Math.max(0, consumed.protein_grams - macroTargets.protein_grams),
        carbs_grams: macroTargets.carbs_grams === null ? null : Math.max(0, consumed.carbs_grams - macroTargets.carbs_grams),
        fat_grams: macroTargets.fat_grams === null ? null : Math.max(0, consumed.fat_grams - macroTargets.fat_grams)
      };

      const calorieOverRatio = safeRatio(overBy.calories, targetCalories);
      const macroKeys = ['protein_grams', 'carbs_grams', 'fat_grams'];
      const macroRatios = macroKeys
        .map((k) => safeRatio(overBy[k], macroTargets[k]))
        .filter((v) => v !== null);

      const hasCalorieTarget = targetCalories !== null;
      const hasAnyMacroTarget = macroRatios.length > 0;

      const calorieWeight = hasCalorieTarget && hasAnyMacroTarget ? 0.5 : (hasCalorieTarget ? 1 : 0);
      const macroWeight = hasCalorieTarget && hasAnyMacroTarget ? 0.5 : (hasAnyMacroTarget ? 1 : 0);

      const macroOverRatioAvg = macroRatios.length > 0
        ? (macroRatios.reduce((sum, r) => sum + r, 0) / macroRatios.length)
        : null;

      const penalty01 =
        (calorieOverRatio !== null ? calorieWeight * calorieOverRatio : 0) +
        (macroOverRatioAvg !== null ? macroWeight * macroOverRatioAvg : 0);

      const score = Math.round((1 - clamp01(penalty01)) * 100);
      scores.push(score);

      days.push({
        date,
        score,
        consumed,
        overBy,
        count: dayLogs.length
      });
    }

    const averageScore = scores.length > 0
      ? Math.round((scores.reduce((sum, s) => sum + s, 0) / scores.length) * 10) / 10
      : null;

    const hasTargets = targetCalories !== null || macroTargets.protein_grams !== null || macroTargets.carbs_grams !== null || macroTargets.fat_grams !== null;

    return res.json({
      start,
      end,
      daysCount: days.length,
      averageScore,
      targets: {
        calories: targetCalories,
        ...macroTargets
      },
      totals,
      days,
      surveyId: latestSurvey?.id || null,
      hasTargets
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Invalid query', details: error.issues, requestId: req.id });
    }
    return res.status(500).json({ error: 'Failed to get weekly nutrition', details: error.message, requestId: req.id });
  }
});

// ========== FOOD LOG SEARCH & ANALYTICS ==========

/**
 * GET /api/food-logs/search?q=
 * Search food logs by name
 */
app.get('/api/food-logs/search', auth.authMiddleware, async (req, res) => {
  try {
    const { q = '', limit = 50, offset = 0 } = req.query;
    const userId = req.user.id;

    const foodLogs = db.getFoodLogs(userId) || [];
    const queryLower = (q || '').toLowerCase();

    const filtered = foodLogs.filter(log => 
      log.name.toLowerCase().includes(queryLower)
    ).slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    return res.json({
      query: q,
      count: filtered.length,
      limit: parseInt(limit),
      offset: parseInt(offset),
      logs: filtered
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to search food logs', details: error.message, requestId: req.id });
  }
});

/**
 * GET /api/food-logs/stats
 * Get top foods and meal statistics
 */
app.get('/api/food-logs/stats', auth.authMiddleware, async (req, res) => {
  try {
    const { start, end } = req.query;
    const userId = req.user.id;

    const foodLogs = db.getFoodLogs(userId) || [];

    // Filter by date range
    let filtered = foodLogs;
    if (start || end) {
      const startDate = start ? new Date(start) : new Date('1900-01-01');
      const endDate = end ? new Date(end) : new Date('2100-12-31');
      filtered = foodLogs.filter(log => {
        const logDate = new Date(log.date);
        return logDate >= startDate && logDate <= endDate;
      });
    }

    // Top foods by frequency
    const foodFrequency = {};
    const mealTypeStats = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };
    let totalCalories = 0;
    let totalLogs = filtered.length;

    filtered.forEach(log => {
      totalCalories += log.calories || 0;
      mealTypeStats[log.meal_type] = (mealTypeStats[log.meal_type] || 0) + 1;
      
      const name = log.name;
      foodFrequency[name] = (foodFrequency[name] || 0) + 1;
    });

    const topFoods = Object.entries(foodFrequency)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const averageCaloriesPerLog = totalLogs > 0 ? Math.round(totalCalories / totalLogs * 10) / 10 : 0;

    return res.json({
      totalLogs,
      averageCaloriesPerLog,
      totalCalories,
      mealTypeStats,
      topFoods,
      dateRange: { start: start || 'all', end: end || 'all' }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get food statistics', details: error.message, requestId: req.id });
  }
});

/**
 * GET /api/food-logs/macros-distribution?date=
 * Get macro distribution for a specific date
 */
app.get('/api/food-logs/macros-distribution', auth.authMiddleware, async (req, res) => {
  try {
    const { date } = req.query;
    const userId = req.user.id;

    if (!date) {
      return res.status(400).json({ error: 'date parameter is required' });
    }

    const foodLogs = db.getFoodLogs(userId) || [];
    const dayLogs = foodLogs.filter(log => log.date === date);

    let totalCalories = 0;
    let protein = 0, carbs = 0, fats = 0;

    dayLogs.forEach(log => {
      totalCalories += log.calories || 0;
      protein += log.protein_grams || 0;
      carbs += log.carbs_grams || 0;
      fats += log.fat_grams || 0;
    });

    // Calculate calorie distribution from macros
    const proteinCalories = protein * 4;
    const carbsCalories = carbs * 4;
    const fatsCalories = fats * 9;
    const totalMacroCalories = proteinCalories + carbsCalories + fatsCalories;

    const distribution = {
      date,
      totals: {
        calories: totalCalories,
        protein_grams: protein,
        carbs_grams: carbs,
        fat_grams: fats
      },
      byCalories: totalMacroCalories > 0 ? {
        protein: Math.round((proteinCalories / totalMacroCalories) * 100 * 10) / 10,
        carbs: Math.round((carbsCalories / totalMacroCalories) * 100 * 10) / 10,
        fats: Math.round((fatsCalories / totalMacroCalories) * 100 * 10) / 10
      } : { protein: 0, carbs: 0, fats: 0 },
      byGrams: protein + carbs + fats > 0 ? {
        protein: Math.round((protein / (protein + carbs + fats)) * 100 * 10) / 10,
        carbs: Math.round((carbs / (protein + carbs + fats)) * 100 * 10) / 10,
        fats: Math.round((fats / (protein + carbs + fats)) * 100 * 10) / 10
      } : { protein: 0, carbs: 0, fats: 0 }
    };

    return res.json(distribution);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get macros distribution', details: error.message, requestId: req.id });
  }
});

// ========== INSIGHTS & BADGES ==========

/**
 * GET /api/insights/daily?date=
 * Get daily insights
 */
app.get('/api/insights/daily', auth.authMiddleware, async (req, res) => {
  try {
    const { date = new Date().toISOString().split('T')[0] } = req.query;
    const userId = req.user.id;

    const foodLogs = db.getFoodLogs(userId) || [];
    const dayLogs = foodLogs.filter(log => log.date === date);

    const survey = db.getLatestSurvey(userId);
    const targetCalories = survey?.daily_calories?.targetDailyCalories || null;
    const macroTargets = survey ? {
      protein_grams: survey.protein_target_g,
      carbs_grams: null,
      fat_grams: null
    } : { protein_grams: null, carbs_grams: null, fat_grams: null };

    let totalCalories = 0, totalProtein = 0;
    const mealCounts = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };

    dayLogs.forEach(log => {
      totalCalories += log.calories || 0;
      totalProtein += log.protein_grams || 0;
      mealCounts[log.meal_type] = (mealCounts[log.meal_type] || 0) + 1;
    });

    const insights = {
      date,
      logCount: dayLogs.length,
      totalCalories,
      totalProtein,
      mealCounts,
      meetsProteinTarget: macroTargets.protein_grams ? totalProtein >= macroTargets.protein_grams : null,
      calorieStatus: targetCalories ? (
        totalCalories < targetCalories ? 'under' :
        totalCalories > targetCalories ? 'over' : 'perfect'
      ) : null
    };

    return res.json(insights);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get daily insights', details: error.message, requestId: req.id });
  }
});

/**
 * GET /api/badges
 * Get earned badges
 */
app.get('/api/badges', auth.authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const foodLogs = db.getFoodLogs(userId) || [];
    
    const badges = [];
    const dates = new Set(foodLogs.map(log => log.date));

    // Badge: First food log
    if (foodLogs.length >= 1) {
      badges.push({
        id: 'first-log',
        name: 'First Step',
        description: 'Logged your first food',
        earnedAt: foodLogs[0].created_at || new Date().toISOString(),
        icon: '🥗'
      });
    }

    // Badge: 7-day streak
    const streak = calculateStreak(foodLogs, null);
    if (streak >= 7) {
      badges.push({
        id: 'week-streak',
        name: 'Week Warrior',
        description: '7-day logging streak',
        earnedAt: new Date().toISOString(),
        icon: '🔥'
      });
    }

    // Badge: 30-day streak
    if (streak >= 30) {
      badges.push({
        id: 'month-streak',
        name: 'Month Master',
        description: '30-day logging streak',
        earnedAt: new Date().toISOString(),
        icon: '🏆'
      });
    }

    // Badge: 100+ logs
    if (foodLogs.length >= 100) {
      badges.push({
        id: 'century',
        name: 'Century Club',
        description: '100+ food logs',
        earnedAt: new Date().toISOString(),
        icon: '💯'
      });
    }

    return res.json({ badges, totalEarned: badges.length });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get badges', details: error.message, requestId: req.id });
  }
});

/**
 * GET /api/targets
 * Get resolved calorie and macro targets
 */
app.get('/api/targets', auth.authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const survey = db.getLatestSurvey(userId);
    const prefs = db.getUserPreferences(userId);

    let targets = {
      calories: survey?.daily_calories?.targetDailyCalories || null,
      protein_grams: survey?.protein_target_g || null,
      carbs_grams: prefs?.macroTargets?.carbs_grams || null,
      fat_grams: prefs?.macroTargets?.fat_grams || null
    };

    return res.json({
      targets,
      source: survey ? 'survey' : 'preferences',
      surveyId: survey?.id || null,
      lastUpdated: survey?.created_at || null
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get targets', details: error.message, requestId: req.id });
  }
});

/**
 * PUT /api/targets
 * Set custom calorie and macro targets
 */
app.put('/api/targets', auth.authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { calories, protein_grams, carbs_grams, fat_grams } = req.body;

    // Validate
    if (calories && (calories < 1000 || calories > 5000)) {
      return res.status(400).json({ error: 'Invalid input', details: 'Calories must be between 1000 and 5000' });
    }

    // Store in preferences
    const updated = db.setUserPreferences(userId, {
      macroTargets: {
        calorieOverride: calories,
        protein_grams: protein_grams || null,
        carbs_grams: carbs_grams || null,
        fat_grams: fat_grams || null
      }
    });

    return res.json({
      targets: {
        calories,
        protein_grams,
        carbs_grams,
        fat_grams
      },
      message: 'Targets updated'
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to set targets', details: error.message, requestId: req.id });
  }
});

// ========== PROGRESS ENDPOINTS ==========

/**
 * GET /api/progress/overview
 * High-level dashboard data
 */
app.get('/api/progress/overview', auth.authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const foodLogs = db.getFoodLogs(userId) || [];
    const weightLogs = db.getWeightLogs(userId) || [];

    const today = new Date().toISOString().split('T')[0];
    const todayLogs = foodLogs.filter(log => log.date === today);
    const totalDaysLogged = new Set(foodLogs.map(log => log.date)).size;

    let totalCalories = 0, totalProtein = 0;
    todayLogs.forEach(log => {
      totalCalories += log.calories || 0;
      totalProtein += log.protein_grams || 0;
    });

    const latestWeight = weightLogs.length > 0 ? weightLogs[weightLogs.length - 1].weight_kg : null;

    return res.json({
      today: {
        date: today,
        caloriesLogged: totalCalories,
        proteinLogged: totalProtein,
        logsCount: todayLogs.length
      },
      stats: {
        totalDaysLogged,
        totalLogsCount: foodLogs.length,
        averageLogsPerDay: totalDaysLogged > 0 ? Math.round(foodLogs.length / totalDaysLogged * 10) / 10 : 0,
        latestWeight
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get progress overview', details: error.message, requestId: req.id });
  }
});

// ========== ERROR HANDLING ==========

app.use(notFoundHandler);
app.use(errorHandler);

// ========== SERVER START ==========

app.listen(PORT, () => {
  console.log(`🚀 YAHEALTHY server running on port ${PORT}`);
  console.log(`📚 API docs: http://localhost:${PORT}/api/docs`);
  console.log(`🔐 Authentication enabled with JWT`);
  console.log(`💾 Database: ${process.env.SUPABASE_URL ? 'Supabase' : 'In-memory (development)'}`);
});
