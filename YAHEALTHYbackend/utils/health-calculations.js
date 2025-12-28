/**
 * Health calculation helpers
 */

const { HEALTH_CONSTANTS } = require('./constants');

/**
 * Calculate BMI
 * BMI = weight (kg) / (height (m) ^ 2)
 */
function calculateBMI(weightKg, heightCm) {
  const heightM = heightCm / 100;
  return parseFloat((weightKg / (heightM * heightM)).toFixed(1));
}

/**
 * Calculate body fat percentage (Deurenberg formula)
 */
function calculateBodyFat(bmi, age, gender) {
  let bodyFat;
  const normalizedGender = (gender || '').toLowerCase();

  if (normalizedGender === 'male') {
    bodyFat = (1.20 * bmi) + (0.23 * age) - 16.2;
  } else if (normalizedGender === 'female') {
    bodyFat = (1.20 * bmi) + (0.23 * age) - 5.4;
  } else {
    // non-binary: average
    bodyFat = (1.20 * bmi) + (0.23 * age) - 10.8;
  }

  return Math.max(0, Math.min(100, parseFloat(bodyFat.toFixed(1))));
}

/**
 * Calculate Basal Metabolic Rate (Harris-Benedict equation)
 */
function calculateBMR(weightKg, heightCm, age, gender) {
  const normalizedGender = (gender || '').toLowerCase();

  let bmr;
  if (normalizedGender === 'male') {
    bmr = 88.362 + (13.397 * weightKg) + (4.799 * heightCm) - (5.677 * age);
  } else if (normalizedGender === 'female') {
    bmr = 447.593 + (9.247 * weightKg) + (3.098 * heightCm) - (4.330 * age);
  } else {
    // non-binary: average
    bmr = (88.362 + 447.593) / 2 + 
          ((13.397 + 9.247) / 2 * weightKg) + 
          ((4.799 + 3.098) / 2 * heightCm) - 
          ((5.677 + 4.330) / 2 * age);
  }

  return Math.max(HEALTH_CONSTANTS.MIN_DAILY_CALORIES / 2, parseFloat(bmr.toFixed(0)));
}

/**
 * Calculate Total Daily Energy Expenditure (TDEE)
 */
function calculateTDEE(bmr, lifestyleMultiplier) {
  const multiplier = HEALTH_CONSTANTS.LIFESTYLE_MULTIPLIERS[lifestyleMultiplier] || 
                     HEALTH_CONSTANTS.LIFESTYLE_MULTIPLIERS.moderate;
  return Math.round(bmr * multiplier);
}

/**
 * Calculate daily calories for goal
 */
function calculateDailyCalories(tdee, weightKg, targetWeightKg, targetDays) {
  const totalKgToLose = weightKg - targetWeightKg;
  const daysForGoal = Math.max(1, parseInt(targetDays) || 60);
  
  // Calculate required deficit per day
  const totalCalorieDeficit = totalKgToLose * HEALTH_CONSTANTS.CALORIE_DEFICIT_PER_KG;
  const dailyDeficit = Math.round(totalCalorieDeficit / daysForGoal);
  
  // Cap deficit to reasonable range (typically 500-1000 kcal/day)
  const cappedDeficit = Math.min(1000, Math.max(200, dailyDeficit));
  
  // Calculate target calories
  const targetCalories = Math.max(
    HEALTH_CONSTANTS.MIN_DAILY_CALORIES,
    Math.min(
      HEALTH_CONSTANTS.MAX_DAILY_CALORIES,
      tdee - cappedDeficit
    )
  );

  return {
    tdee,
    dailyDeficit: cappedDeficit,
    targetDailyCalories: targetCalories,
    estimatedWeeksToGoal: (totalCalorieDeficit / (cappedDeficit * 7)).toFixed(1),
    estimatedDaysToGoal: Math.round(totalCalorieDeficit / cappedDeficit)
  };
}

/**
 * Calculate water target (liters per day)
 */
function calculateWaterTarget(weightKg, activityMinutes = 0) {
  const baseWater = weightKg * HEALTH_CONSTANTS.WATER_PER_KG_RATIO;
  const activityBonus = (activityMinutes / 30) * HEALTH_CONSTANTS.WATER_ACTIVITY_BONUS;
  const total = baseWater + activityBonus;

  return parseFloat(
    Math.max(
      HEALTH_CONSTANTS.MIN_WATER_LITERS,
      Math.min(HEALTH_CONSTANTS.MAX_WATER_LITERS, total)
    ).toFixed(1)
  );
}

/**
 * Calculate sleep target (hours per day)
 */
function calculateSleepTarget(age) {
  const config = HEALTH_CONSTANTS.SLEEP_TARGETS;
  
  for (const [key, target] of Object.entries(config)) {
    if (age >= target.minAge && age <= target.maxAge) {
      return target.hours;
    }
  }
  
  return config.adult.hours;
}

/**
 * Get weight loss pace classification
 */
function getWeightLossPace(weightKg, targetWeightKg, targetDays) {
  const totalKgToLose = weightKg - targetWeightKg;
  const weeksToGoal = targetDays / 7;
  const kgPerWeek = totalKgToLose / weeksToGoal;

  if (kgPerWeek >= HEALTH_CONSTANTS.AGGRESSIVE_LOSS_KG_WEEK) {
    return 'aggressive';
  } else if (kgPerWeek >= HEALTH_CONSTANTS.MODERATE_LOSS_KG_WEEK) {
    return 'moderate';
  } else {
    return 'conservative';
  }
}

/**
 * Calculate weight progress percentage
 */
function calculateWeightProgress(startWeight, currentWeight, targetWeight) {
  const totalToLose = startWeight - targetWeight;
  if (totalToLose <= 0) {
    return { progress: 0, status: 'green' };
  }

  const lostSoFar = startWeight - currentWeight;
  const percentage = (lostSoFar / totalToLose) * 100;
  
  let status = 'red';
  if (percentage >= 75) status = 'green';
  else if (percentage >= 40) status = 'yellow';

  return {
    progress: Math.max(0, Math.min(100, percentage)),
    lostKg: parseFloat(lostSoFar.toFixed(1)),
    remainingKg: parseFloat((totalToLose - lostSoFar).toFixed(1)),
    status
  };
}

/**
 * Get hydration status
 */
function getHydrationStatus(consumed, target) {
  const percentage = (consumed / target) * 100;
  const thresholds = HEALTH_CONSTANTS.HYDRATION_STATUS_THRESHOLD;

  let status = 'red';
  if (percentage >= thresholds.green.min) status = 'green';
  else if (percentage >= thresholds.yellow.min) status = 'yellow';

  return { percentage: Math.round(percentage), status };
}

/**
 * Get sleep status
 */
function getSleepStatus(actual, target) {
  const percentage = (actual / target) * 100;
  const thresholds = HEALTH_CONSTANTS.SLEEP_STATUS_THRESHOLD;

  let status = 'red';
  if (percentage >= thresholds.green.min) status = 'green';
  else if (percentage >= thresholds.yellow.min) status = 'yellow';

  return { percentage: Math.round(percentage), status };
}

/**
 * Get readiness score (0-100) from HRV and resting HR
 */
function getReadinessScore(hrv, restingHr) {
  const hrvScore = Math.min(100, (hrv / HEALTH_CONSTANTS.HRV_BASELINE) * 100);
  const restingHrScore = Math.max(0, 100 - ((restingHr - HEALTH_CONSTANTS.RESTING_HR_BASELINE) * 2));
  return Math.round((hrvScore + restingHrScore) / 2);
}

/**
 * Calculate sleep debt
 */
function calculateSleepDebt(sleepLogs, targetHours) {
  if (!Array.isArray(sleepLogs) || sleepLogs.length === 0) {
    return { debt: 0, days: 0, avgSleep: 0 };
  }

  const totalSleep = sleepLogs.reduce((sum, log) => sum + (log.hours || 0), 0);
  const avgSleep = totalSleep / sleepLogs.length;
  const expectedTotal = targetHours * sleepLogs.length;
  const debt = Math.max(0, expectedTotal - totalSleep);

  return {
    debt: parseFloat(debt.toFixed(1)),
    days: sleepLogs.length,
    avgSleep: parseFloat(avgSleep.toFixed(1)),
    daysToRecover: Math.ceil(debt / targetHours)
  };
}

module.exports = {
  calculateBMI,
  calculateBodyFat,
  calculateBMR,
  calculateTDEE,
  calculateDailyCalories,
  calculateWaterTarget,
  calculateSleepTarget,
  getWeightLossPace,
  calculateWeightProgress,
  getHydrationStatus,
  getSleepStatus,
  getReadinessScore,
  calculateSleepDebt
};
