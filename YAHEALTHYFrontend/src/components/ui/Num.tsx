import { ReactNode } from 'react';

/**
 * A number, isolated from the text around it.
 *
 * `.num` in index.css sets `direction: ltr; unicode-bidi: isolate`, which is
 * exactly right for a number and exactly wrong for a sentence. Put it on a node
 * that also holds Hebrew words and the whole phrase re-bases to LTR: the
 * reader, scanning right to left, meets the last word first, and any colon or
 * slash detaches to the wrong side.
 *
 * That mistake was made in the same way in five places across the app, because
 * `className="num"` is easy to add to whichever element happens to be there.
 * This component exists so the right thing is the short thing:
 *
 *     ✅ <Num>{pct}</Num>% {t('common.of')} {t('common.target')}
 *     ❌ <span className="num">{pct}% {t('common.of')} {t('common.target')}</span>
 *
 * The rule is one sentence: whatever goes inside must contain no words. Digits,
 * separators and units that are themselves Latin are fine; a translated label
 * is not, and belongs outside.
 *
 * `unit` is a convenience for the very common "number then unit" shape, and it
 * renders the unit OUTSIDE the isolate — so a Hebrew unit like ג׳ or ק״ג stays
 * in the page's own direction instead of being dragged to the end of an LTR
 * run.
 */
export const Num = ({
  children,
  unit,
  className = '',
}: {
  children: ReactNode;
  /** A unit label, rendered outside the isolation so a Hebrew glyph stays put. */
  unit?: ReactNode;
  className?: string;
}) => (
  <>
    <span className={`num ${className}`}>{children}</span>
    {unit != null && <> {unit}</>}
  </>
);

export default Num;
