import { useEffect, useRef } from 'react';
import { prefApi } from '@/services/api';
/**
 * Reminder schedule (fires only while the app is open):
 * - water: every 2 hours, 09:00–21:00
 * - meals: breakfast 09:00, lunch 12:30, dinner 19:00
 * - weight: Mondays 08:00
 * - sleep: 22:30
 */
const SCHEDULE = {
    water: ['09:00', '11:00', '13:00', '15:00', '17:00', '19:00', '21:00'],
    breakfast: ['09:00'],
    lunch: ['12:30'],
    dinner: ['19:00'],
    weight: ['08:00'],
    sleep: ['22:30'],
};
const TITLES = {
    water: { title: '💧 Time to hydrate', body: 'A glass of water now keeps your goal on track.' },
    breakfast: { title: '🌅 Log your breakfast', body: 'Start the day with a quick food log.' },
    lunch: { title: '☀️ Log your lunch', body: 'Take 10 seconds to log what you had.' },
    dinner: { title: '🌙 Log your dinner', body: 'Close the day with your final food log.' },
    weight: { title: '⚖️ Weekly weigh-in', body: 'Monday morning — step on the scale and log it.' },
    sleep: { title: '😴 Wind down', body: 'Time to start your evening routine for a good night.' },
};
const keyFor = (day, name, time) => `yahealthy.reminder.${day}.${name}.${time}`;
/**
 * Browser reminders while the app is open. Falls back to nothing visible if
 * notifications are unavailable — Settings shows the support state.
 */
export function useReminders(onMissed) {
    const onMissedRef = useRef(onMissed);
    onMissedRef.current = onMissed;
    useEffect(() => {
        let stopped = false;
        let lastMinute = '';
        const fire = (name) => {
            const t = TITLES[name];
            if (!t)
                return;
            const show = typeof Notification !== 'undefined' && Notification.permission === 'granted'
                ? () => new Notification(t.title, { body: t.body })
                : () => onMissedRef.current?.(`${t.title} — ${t.body}`);
            try {
                show();
            }
            catch {
                /* notification failures shouldn't break the app */
            }
        };
        const tick = async () => {
            const now = new Date();
            const day = now.toISOString().slice(0, 10);
            const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            const minuteKey = `${day}T${hhmm}`;
            if (minuteKey === lastMinute)
                return;
            lastMinute = minuteKey;
            try {
                const prefs = await prefApi.get();
                const enabled = prefs.reminders || {};
                for (const [name, times] of Object.entries(SCHEDULE)) {
                    if (!enabled[name])
                        continue;
                    if (!times.includes(hhmm))
                        continue;
                    if (localStorage.getItem(keyFor(day, name, hhmm)))
                        continue;
                    localStorage.setItem(keyFor(day, name, hhmm), '1');
                    fire(name);
                }
            }
            catch {
                /* preferences unavailable — skip this tick */
            }
        };
        const interval = window.setInterval(() => {
            if (!stopped)
                void tick();
        }, 30000);
        void tick();
        return () => {
            stopped = true;
            window.clearInterval(interval);
        };
    }, []);
}
