import { sleepConsistency, waterToday } from '@/lib/health';
const has = (q, ...words) => words.some((w) => q.includes(w));
function fmt(n) {
    return Math.round(n).toString();
}
function pickRecipe(data, opts) {
    const pool = data.recipes.filter((r) => (!opts.category || r.category === opts.category) &&
        (!opts.maxCalories || r.calories <= opts.maxCalories));
    if (pool.length === 0)
        return data.recipes[0] ?? null;
    return pool[Math.floor(Math.random() * pool.length)];
}
/** 3 personalized, data-driven daily recommendations */
export function dailyRecommendations(data) {
    const out = [];
    const today = data.date;
    const calories = data.todayLogs.reduce((s, l) => s + (l.calories || 0), 0);
    const protein = data.todayLogs.reduce((s, l) => s + (l.protein_grams || 0), 0);
    const water = waterToday(data.waterLogs, today);
    const lastSleep = data.sleepLogs.find((l) => l.date === today) ?? data.sleepLogs[0] ?? null;
    const targetCal = data.targets?.calories ?? null;
    const targetProtein = data.targets?.protein_grams ?? null;
    if (data.todayLogs.length === 0) {
        out.push({
            icon: '🍽️',
            title: 'Start your food log',
            text: "You haven't logged anything today. Log your first meal to see your daily picture.",
        });
    }
    else if (targetCal && calories < targetCal * 0.7) {
        const remaining = targetCal - calories;
        const r = pickRecipe(data, { maxCalories: remaining });
        out.push({
            icon: '🍽️',
            title: `${fmt(remaining)} kcal left today`,
            text: r
                ? `You have ${fmt(remaining)} kcal remaining — a good fit would be ${r.name} (${r.calories} kcal, ${r.time_minutes} min).`
                : `You have ${fmt(remaining)} kcal remaining today.`,
        });
    }
    else if (targetCal && calories > targetCal) {
        out.push({
            icon: '⚖️',
            title: 'Above your calorie target',
            text: `You're ${fmt(calories - targetCal)} kcal over your target. A light evening walk is a nice balance.`,
        });
    }
    else {
        out.push({
            icon: '✅',
            title: 'Nutrition on track',
            text: targetCal
                ? `${fmt(calories)} of ${fmt(targetCal)} kcal logged — nicely paced for the rest of the day.`
                : `${fmt(calories)} kcal logged so far today. Set targets in Settings for sharper guidance.`,
        });
    }
    if (targetProtein && protein < targetProtein) {
        out.push({
            icon: '💪',
            title: `${fmt(targetProtein - protein)}g protein to go`,
            text: `You've logged ${fmt(protein)}g of your ${fmt(targetProtein)}g protein target. Eggs, fish or tofu close the gap fast.`,
        });
    }
    const waterLeft = data.waterGoal - water;
    if (waterLeft > 0.05) {
        out.push({
            icon: '💧',
            title: 'Hydration check',
            text: `You're at ${(water * 1000).toFixed(0)}ml of your ${(data.waterGoal * 1000).toFixed(0)}ml goal — about ${(waterLeft * 1000).toFixed(0)}ml to go.`,
        });
    }
    else {
        out.push({ icon: '💧', title: 'Hydration done', text: 'You hit your water goal today. Great for energy and focus.' });
    }
    if (lastSleep) {
        const off = lastSleep.sleep_hours - data.sleepTarget;
        if (off <= -1) {
            out.push({
                icon: '😴',
                title: 'Catch up on rest',
                text: `Last night you slept ${lastSleep.sleep_hours}h vs your ${data.sleepTarget}h target. Wind down 30 minutes earlier tonight.`,
            });
        }
    }
    else {
        out.push({
            icon: '😴',
            title: 'Log last night\'s sleep',
            text: `A quick sleep log sharpens your daily score and recommendations (target: ${data.sleepTarget}h).`,
        });
    }
    if (data.streak >= 3) {
        out.push({ icon: '🔥', title: `${data.streak}-day streak`, text: 'You are building real consistency — keep the chain alive today.' });
    }
    return out.slice(0, 4);
}
const DISCLAIMER = 'This is general wellness guidance based on your logged data — not medical advice.';
/** Rule-based coach grounded in the user's real data. */
export function coachAnswer(question, data) {
    const q = question.toLowerCase();
    const today = data.date;
    const calories = data.todayLogs.reduce((s, l) => s + (l.calories || 0), 0);
    const protein = data.todayLogs.reduce((s, l) => s + (l.protein_grams || 0), 0);
    const water = waterToday(data.waterLogs, today);
    const lastSleep = data.sleepLogs.find((l) => l.date === today) ?? data.sleepLogs[0] ?? null;
    const targetCal = data.targets?.calories ?? null;
    const targetProtein = data.targets?.protein_grams ?? null;
    if (has(q, 'how am i', 'doing today', 'summary', 'how did i do')) {
        const cal = targetCal ? ` (${fmt((calories / targetCal) * 100)}% of your ${fmt(targetCal)} kcal target)` : '';
        const prot = targetProtein ? ` against a ${fmt(targetProtein)}g target` : '';
        return `Here's your day so far: ${fmt(calories)} kcal logged${cal}, ${fmt(protein)}g protein${prot}, ${(water * 1000).toFixed(0)}ml of ${(data.waterGoal * 1000).toFixed(0)}ml water${lastSleep ? `, and ${lastSleep.sleep_hours}h of sleep last night` : ''}. ${data.todayLogs.length === 0
            ? 'Log your first meal to get a fuller picture.'
            : targetCal
                ? calories < targetCal * 0.7
                    ? `You have ${fmt(targetCal - calories)} kcal left — pace them across your remaining meals.`
                    : 'You are nicely on track. Keep it steady!'
                : 'Set your targets in Settings for sharper guidance.'}`;
    }
    if (has(q, 'dinner', 'eat for', 'meal under', 'what should i eat', 'suggest')) {
        const maxCal = /(\d{2,4})/.exec(q);
        const budget = maxCal ? Number(maxCal[1]) : targetCal ? Math.max(300, targetCal - calories) : 600;
        const r = pickRecipe(data, { maxCalories: budget });
        return r
            ? `Try ${r.name} tonight — ${r.calories} kcal, ready in ${r.time_minutes} minutes. Ingredients: ${r.ingredients.join(', ')}. ${targetCal ? `That leaves about ${fmt(Math.max(0, targetCal - calories - r.calories))} kcal of headroom.` : ''}`
            : 'No recipe in your collection fits right now — try logging a simple protein + veggie plate.';
    }
    if (has(q, 'protein')) {
        if (!targetProtein) {
            return `You've logged ${fmt(protein)}g of protein today, but no protein target is set. Complete your profile (Profile → Body metrics) and I'll track it against your goal.`;
        }
        const left = targetProtein - protein;
        return left > 0
            ? `You're at ${fmt(protein)}g of your ${fmt(targetProtein)}g protein target — ${fmt(left)}g to go. Eggs, tuna, cottage cheese or tofu close the gap quickly.`
            : `Nice — ${fmt(protein)}g already meets your ${fmt(targetProtein)}g protein target. 💪`;
    }
    if (has(q, 'sleep')) {
        if (!lastSleep) {
            return `I don't have a sleep log for last night yet. You logged nothing, so add it on the Health page. Aim for your ${data.sleepTarget}h target and a fixed bedtime window.`;
        }
        const { label } = sleepConsistency(data.sleepLogs.slice(0, 7));
        return `Last night: ${lastSleep.sleep_hours}h${lastSleep.sleep_quality ? ` (${lastSleep.sleep_quality} quality)` : ''} vs your ${data.sleepTarget}h target. ${label}. A consistent bedtime and a screen-free wind-down usually help most.`;
    }
    if (has(q, 'water', 'hydrat', 'drink')) {
        const left = data.waterGoal - water;
        return left > 0.05
            ? `You're at ${(water * 1000).toFixed(0)}ml of ${(data.waterGoal * 1000).toFixed(0)}ml today — about ${(left * 1000).toFixed(0)}ml to go. A glass with each meal gets you there.`
            : `You've hit your ${(data.waterGoal * 1000).toFixed(0)}ml water goal today. 💧`;
    }
    if (has(q, 'weight', 'weigh')) {
        if (!data.goal) {
            return 'You don\'t have a weight goal yet. Create one on the Progress page and log weigh-ins — I\'ll track your trend and milestones.';
        }
        const latest = data.weightLogs[0];
        const change = latest ? latest.weight_kg - data.goal.start_weight_kg : 0;
        const dir = change < 0 ? 'down' : change > 0 ? 'up' : 'steady';
        return `Your goal: ${data.goal.start_weight_kg}kg → ${data.goal.target_weight_kg}kg. Latest weigh-in: ${latest ? `${latest.weight_kg}kg` : 'none yet'}, ${dir} ${Math.abs(Math.round(change * 10) / 10)}kg from your start. ${data.weightLogs.length < 2 ? 'Log weekly weigh-ins to see a reliable trend.' : 'Keep weighing in consistently — the trend matters more than any single number.'}`;
    }
    if (has(q, 'calorie', 'kcal', 'calories')) {
        return targetCal
            ? `You've logged ${fmt(calories)} of your ${fmt(targetCal)} kcal target — ${fmt(Math.max(0, targetCal - calories))} kcal remaining. ${calories > targetCal ? 'Above target today; a lighter dinner balances it.' : 'Spread the rest across your remaining meals.'}`
            : `You've logged ${fmt(calories)} kcal today, but no target is set. Add one in Settings → Goals for daily pacing.`;
    }
    if (has(q, 'meal plan', 'tomorrow')) {
        const b = pickRecipe(data, { category: 'breakfast' });
        const l = pickRecipe(data, { category: 'salad' });
        const d = pickRecipe(data, {});
        return `For tomorrow: breakfast — ${b ? b.name : 'oats with fruit'}; lunch — ${l ? l.name : 'grilled chicken bowl'}; dinner — ${d ? d.name : 'fish + veggies'}. Head to the Meal Plan page to generate and save a full plan for the next days.`;
    }
    if (has(q, 'streak', 'motivat', 'consist')) {
        return data.streak > 0
            ? `You're on a ${data.streak}-day logging streak 🔥 — consistency is the single biggest driver of results. Log today to keep it alive.`
            : 'No active streak. Log one meal today and it starts again — small chains build big habits.';
    }
    if (has(q, 'bmi', 'body')) {
        return `Check the Profile page for BMI, body fat estimate and calorie targets calculated from your latest survey. Remember: BMI is a general screening metric, not a medical diagnosis. ${DISCLAIMER}`;
    }
    return `I can help with your nutrition, hydration, sleep, weight trend and meal ideas. Try asking "How am I doing today?", "What should I eat for dinner?", "Am I getting enough protein?" or "How can I improve my sleep?". ${DISCLAIMER}`;
}
