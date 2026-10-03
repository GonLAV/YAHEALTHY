import type { FeatureStrings } from './types';

export const fastingStrings: FeatureStrings = {
  en: {
    'nav.fasting': 'Fasting',

    'fasting.title': 'Fasting Timer',
    'fasting.subtitle': 'Track intermittent fasts and see your rhythm',

    // Protocol picker
    'fasting.protocol.legend': 'Choose a fasting protocol',
    'fasting.protocol.13': 'Gentle start',
    'fasting.protocol.16': 'Most popular',
    'fasting.protocol.18': 'Intermediate',
    'fasting.protocol.20': 'Advanced',
    'fasting.protocol.24': 'Full day',
    'fasting.protocol.custom': 'Custom',
    'fasting.protocol.customLabel': 'Custom goal (hours, 8–72)',
    'fasting.protocol.customInvalid': 'Enter a goal between 8 and 72 hours.',
    'fasting.startedEarlier': 'Started earlier? (optional)',
    'fasting.startedEarlierHint': 'Leave empty to start now.',

    // Timer
    'fasting.timer.label': 'Fasting timer',
    'fasting.timer.elapsed': 'Elapsed',
    'fasting.timer.remaining': '{time} to go',
    'fasting.timer.over': 'Goal reached · +{time}',
    'fasting.timer.goal': 'Goal: {hours} h',
    'fasting.timer.ready': 'Ready when you are',
    'fasting.timer.aria': '{hours} hours {minutes} minutes elapsed of a {target}-hour goal',
    'fasting.startedAt': 'Started {time}',
    'fasting.endsAt': 'Goal at {time}',

    // Actions
    'fasting.start': 'Start fast',
    'fasting.starting': 'Starting…',
    'fasting.end': 'End fast',
    'fasting.ending': 'Ending…',
    'fasting.alreadyActive': 'A fast is already running — showing it now.',

    // Announcements
    'fasting.announce.started': 'Fast started. Goal: {hours} hours.',
    'fasting.announce.goal': 'Goal reached! You can end your fast whenever you are ready.',
    'fasting.announce.stage': 'New stage: {stage}',
    'fasting.announce.completed': 'Fast complete: {hours} hours. Well done!',
    'fasting.announce.endedEarly': 'Fast ended at {hours} hours. Every fast counts.',
    'fasting.announce.deleted': 'Fast deleted.',

    // Stages (general information, deliberately mild)
    'fasting.stages.title': 'What may be happening',
    'fasting.stage.fed.name': 'Digesting',
    'fasting.stage.fed.desc': 'Your body is still processing your last meal.',
    'fasting.stage.settling.name': 'Settling',
    'fasting.stage.settling.desc': 'Blood sugar tends to level off. Water, tea or black coffee can help.',
    'fasting.stage.fatBurn.name': 'Fat burning',
    'fasting.stage.fatBurn.desc': 'Around 12 hours, many people start using more stored fat for energy.',
    'fasting.stage.ketosis.name': 'Light ketosis',
    'fasting.stage.ketosis.desc': 'From about 16 hours, some people enter mild ketosis.',
    'fasting.stage.extended.name': 'Extended fast',
    'fasting.stage.extended.desc': 'Listen to your body. Longer fasts are best planned with a professional.',
    'fasting.stage.from': 'from {hours} h',
    'fasting.disclaimer':
      'General information only, not medical advice. Effects vary from person to person. If you are pregnant, diabetic, on medication or have a history of eating disorders, check with a healthcare professional before fasting.',

    // Stats
    'fasting.stats.title': 'Fasting stats',
    'fasting.stats.completed': 'Completed fasts',
    'fasting.stats.streak': 'Current streak',
    'fasting.stats.longest': 'Longest fast',
    'fasting.stats.average': 'Average (30 days)',
    'fasting.days': 'days',
    'fasting.hoursShort': 'h',

    // History
    'fasting.history.title': 'History',
    'fasting.history.empty': 'No fasts yet. Pick a protocol and start your first one.',
    'fasting.history.duration': '{duration} h of {target} h',
    'fasting.history.completed': 'Completed',
    'fasting.history.early': 'Ended early',
    'fasting.deleteFast': 'Delete fast from {date}',
  },
  he: {
    'nav.fasting': 'צום',

    'fasting.title': 'טיימר צום',
    'fasting.subtitle': 'מעקב אחר צום לסירוגין והקצב האישי שלך',

    'fasting.protocol.legend': 'בחירת שיטת צום',
    'fasting.protocol.13': 'התחלה עדינה',
    'fasting.protocol.16': 'הפופולרי ביותר',
    'fasting.protocol.18': 'מתקדמים',
    'fasting.protocol.20': 'מתקדמים מאוד',
    'fasting.protocol.24': 'יום שלם',
    'fasting.protocol.custom': 'מותאם אישית',
    'fasting.protocol.customLabel': 'יעד מותאם (שעות, 8–72)',
    'fasting.protocol.customInvalid': 'יש להזין יעד בין 8 ל-72 שעות.',
    'fasting.startedEarlier': 'התחלת קודם? (לא חובה)',
    'fasting.startedEarlierHint': 'השאירו ריק כדי להתחיל עכשיו.',

    'fasting.timer.label': 'טיימר צום',
    'fasting.timer.elapsed': 'זמן שעבר',
    'fasting.timer.remaining': 'נותרו {time}',
    'fasting.timer.over': 'היעד הושג · +{time}',
    'fasting.timer.goal': 'יעד: {hours} ש׳',
    'fasting.timer.ready': 'מוכנים כשתהיו מוכנים',
    'fasting.timer.aria': 'עברו {hours} שעות ו-{minutes} דקות מתוך יעד של {target} שעות',
    'fasting.startedAt': 'התחלה: {time}',
    'fasting.endsAt': 'היעד ב-{time}',

    'fasting.start': 'התחלת צום',
    'fasting.starting': 'מתחילים…',
    'fasting.end': 'סיום צום',
    'fasting.ending': 'מסיימים…',
    'fasting.alreadyActive': 'כבר יש צום פעיל — הוא מוצג עכשיו.',

    'fasting.announce.started': 'הצום התחיל. יעד: {hours} שעות.',
    'fasting.announce.goal': 'היעד הושג! אפשר לסיים את הצום מתי שנוח לך.',
    'fasting.announce.stage': 'שלב חדש: {stage}',
    'fasting.announce.completed': 'הצום הושלם: {hours} שעות. כל הכבוד!',
    'fasting.announce.endedEarly': 'הצום הסתיים אחרי {hours} שעות. כל צום נחשב.',
    'fasting.announce.deleted': 'הצום נמחק.',

    'fasting.stages.title': 'מה עשוי לקרות',
    'fasting.stage.fed.name': 'עיכול',
    'fasting.stage.fed.desc': 'הגוף עדיין מעבד את הארוחה האחרונה.',
    'fasting.stage.settling.name': 'התייצבות',
    'fasting.stage.settling.desc': 'רמת הסוכר בדם נוטה להתייצב. מים, תה או קפה שחור יכולים לעזור.',
    'fasting.stage.fatBurn.name': 'שריפת שומן',
    'fasting.stage.fatBurn.desc': 'סביב 12 שעות, אצל רבים הגוף מתחיל להשתמש יותר בשומן לאנרגיה.',
    'fasting.stage.ketosis.name': 'קטוזיס קל',
    'fasting.stage.ketosis.desc': 'מכ-16 שעות, חלק מהאנשים נכנסים לקטוזיס קל.',
    'fasting.stage.extended.name': 'צום ממושך',
    'fasting.stage.extended.desc': 'הקשיבו לגוף. צומות ארוכים עדיף לתכנן עם איש מקצוע.',
    'fasting.stage.from': 'מ-{hours} ש׳',
    'fasting.disclaimer':
      'מידע כללי בלבד ואינו ייעוץ רפואי. ההשפעות משתנות מאדם לאדם. בהריון, בסוכרת, בנטילת תרופות או עם היסטוריה של הפרעות אכילה — יש להתייעץ עם איש מקצוע לפני צום.',

    'fasting.stats.title': 'סטטיסטיקת צום',
    'fasting.stats.completed': 'צומות שהושלמו',
    'fasting.stats.streak': 'רצף נוכחי',
    'fasting.stats.longest': 'הצום הארוך ביותר',
    'fasting.stats.average': 'ממוצע (30 יום)',
    'fasting.days': 'ימים',
    'fasting.hoursShort': 'ש׳',

    'fasting.history.title': 'היסטוריה',
    'fasting.history.empty': 'עדיין אין צומות. בחרו שיטה והתחילו את הראשון.',
    'fasting.history.duration': '{duration} ש׳ מתוך {target} ש׳',
    'fasting.history.completed': 'הושלם',
    'fasting.history.early': 'הסתיים מוקדם',
    'fasting.deleteFast': 'מחיקת הצום מתאריך {date}',
  },
};
