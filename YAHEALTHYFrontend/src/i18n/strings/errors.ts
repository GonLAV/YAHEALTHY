import { registerTranslations, type Lang } from '../translations';

/**
 * The app-wide error fallback's strings (errorPage.*). Imported by
 * src/components/AppErrorBoundary.tsx, which is part of the main bundle, so
 * they are always present when the fallback renders — even when the chunk that
 * crashed was a lazily loaded page.
 */
export const errorStrings: Record<Lang, Record<string, string>> = {
  en: {
    'errorPage.title': 'Something went wrong',
    'errorPage.body':
      'An unexpected error stopped this page. Anything you already saved is safe. Reloading usually fixes it.',
    'errorPage.reload': 'Reload the page',
    'errorPage.home': 'Go to the home page',
    'errorPage.contact': 'If it keeps happening, please let us know.',
  },
  he: {
    'errorPage.title': 'משהו השתבש',
    'errorPage.body': 'שגיאה לא צפויה עצרה את הדף. מה ששמרתם כבר שמור. טעינה מחדש בדרך כלל פותרת את זה.',
    'errorPage.reload': 'טעינה מחדש של הדף',
    'errorPage.home': 'מעבר לדף הבית',
    'errorPage.contact': 'אם זה חוזר על עצמו, נשמח שתספרו לנו.',
  },
};

registerTranslations(errorStrings);
