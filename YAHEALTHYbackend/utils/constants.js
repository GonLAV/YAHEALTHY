/**
 * Health & nutrition constants
 */

const HEALTH_CONSTANTS = {
  // Calorie calculations
  CALORIE_DEFICIT_PER_KG: 7700,      // kcal to lose 1 kg
  BASELINE_KCAL_PER_KG: 0.5,         // baseline metabolic cost per kg
  DEFAULT_DEFICIT: 500,               // kcal/day default deficit for weight loss
  MIN_DAILY_CALORIES: 1200,           // absolute minimum
  MAX_DAILY_CALORIES: 5000,           // absolute maximum

  // Water intake
  WATER_PER_KG_RATIO: 0.033,         // liters per kg body weight (baseline)
  WATER_ACTIVITY_BONUS: 0.5,         // extra liters per 30 min activity
  MIN_WATER_LITERS: 1.5,             // absolute minimum
  MAX_WATER_LITERS: 5.0,             // absolute maximum

  // Sleep targets by age
  SLEEP_TARGETS: {
    child: { minAge: 0, maxAge: 12, hours: 9.0 },
    teen: { minAge: 13, maxAge: 18, hours: 8.5 },
    adult: { minAge: 19, maxAge: 64, hours: 7.5 },
    senior: { minAge: 65, maxAge: 150, hours: 7.0 }
  },

  // Weight loss pace
  AGGRESSIVE_LOSS_KG_WEEK: 0.5,      // 500g/week
  MODERATE_LOSS_KG_WEEK: 0.4,        // 400g/week
  CONSERVATIVE_LOSS_KG_WEEK: 0.25,   // 250g/week

  // Body composition
  BMI_CATEGORIES: {
    underweight: { min: 0, max: 18.5 },
    normal: { min: 18.5, max: 25 },
    overweight: { min: 25, max: 30 },
    obese: { min: 30, max: Infinity }
  },

  // Lifestyle activity multipliers
  LIFESTYLE_MULTIPLIERS: {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9
  },

  // Protein targets (grams per kg)
  PROTEIN_MIN_G_PER_KG: 1.2,
  PROTEIN_OPTIMAL_G_PER_KG: 1.6,
  PROTEIN_MAX_G_PER_KG: 2.2,

  // Fiber targets (grams per day)
  FIBER_MIN_G: 25,
  FIBER_OPTIMAL_G: 30,
  FIBER_MAX_G: 50,

  // Hydration & sleep validation
  HYDRATION_STATUS_THRESHOLD: {
    red: { min: 0, max: 0.7 },     // < 70% of target
    yellow: { min: 0.7, max: 0.9 }, // 70-90% of target
    green: { min: 0.9, max: Infinity } // >= 90% of target
  },

  SLEEP_STATUS_THRESHOLD: {
    red: { min: 0, max: 0.8 },     // < 80% of target
    yellow: { min: 0.8, max: 0.95 }, // 80-95% of target
    green: { min: 0.95, max: Infinity } // >= 95% of target
  },

  // Weight progress status
  WEIGHT_STATUS_THRESHOLD: {
    red: { min: 0, max: 0.4 },     // < 40% to goal
    yellow: { min: 0.4, max: 0.75 }, // 40-75% to goal
    green: { min: 0.75, max: Infinity } // >= 75% to goal
  },

  // Readiness HRV baseline (ms)
  HRV_BASELINE: 50,
  HRV_STATUS_THRESHOLD: {
    red: { min: 0, max: 30 },
    yellow: { min: 30, max: 50 },
    green: { min: 50, max: Infinity }
  },

  // Resting HR baseline (bpm)
  RESTING_HR_BASELINE: 60,
  RESTING_HR_STATUS_THRESHOLD: {
    green: { min: 0, max: 60 },
    yellow: { min: 60, max: 75 },
    red: { min: 75, max: Infinity }
  }
};

/**
 * Normalize lifestyle string
 */
function normalizeLifestyle(lifestyle) {
  const normalized = (lifestyle || '').toLowerCase().trim();
  const valid = Object.keys(HEALTH_CONSTANTS.LIFESTYLE_MULTIPLIERS);
  return valid.includes(normalized) ? normalized : 'moderate';
}

/**
 * Validate weight bounds
 */
function validateWeight(weight, minKg = 30, maxKg = 300) {
  const w = parseFloat(weight);
  if (isNaN(w) || w < minKg || w > maxKg) {
    return { isValid: false, error: `Weight must be between ${minKg}kg and ${maxKg}kg` };
  }
  return { isValid: true };
}

/**
 * Validate height bounds
 */
function validateHeight(height, minCm = 100, maxCm = 250) {
  const h = parseFloat(height);
  if (isNaN(h) || h < minCm || h > maxCm) {
    return { isValid: false, error: `Height must be between ${minCm}cm and ${maxCm}cm` };
  }
  return { isValid: true };
}

/**
 * Validate age bounds
 */
function validateAge(age, minYears = 10, maxYears = 120) {
  const a = parseInt(age, 10);
  if (isNaN(a) || a < minYears || a > maxYears) {
    return { isValid: false, error: `Age must be between ${minYears} and ${maxYears} years` };
  }
  return { isValid: true };
}

/**
 * Validate gender
 */
function validateGender(gender) {
  const valid = ['male', 'female', 'non-binary', 'other'];
  const normalized = (gender || '').toLowerCase().trim();
  return valid.includes(normalized) 
    ? { isValid: true, normalized }
    : { isValid: false, error: `Gender must be one of: ${valid.join(', ')}` };
}

module.exports = {
  HEALTH_CONSTANTS,
  normalizeLifestyle,
  validateWeight,
  validateHeight,
  validateAge,
  validateGender
};
