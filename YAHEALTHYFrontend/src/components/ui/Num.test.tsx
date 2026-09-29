import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Num } from './Num';

// jsdom does not apply stylesheets (and Vitest blanks CSS imports), so the
// isolation itself is checked where it is defined: the .num rule in index.css
// is what keeps a number LTR inside Hebrew text.
describe('.num rule', () => {
  it('sets the number LTR and isolates it from the surrounding text', () => {
    // jsdom replaces the global URL, and fs accepts only Node's own.
    const css = readFileSync(new NodeURL('../../index.css', import.meta.url), 'utf8');
    const rule = css.match(/\.num\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/direction:\s*ltr/);
    expect(rule).toMatch(/unicode-bidi:\s*isolate/);
  });
});

describe('Num', () => {
  it('puts the number, and only the number, in the isolate', () => {
    const { container } = render(<p><Num>72.5</Num></p>);
    const p = container.querySelector('p')!;
    expect(p.childNodes).toHaveLength(1);
    const span = p.firstChild as HTMLElement;
    expect(span.tagName).toBe('SPAN');
    expect(span.classList.contains('num')).toBe(true);
    expect(span.textContent).toBe('72.5');
  });

  it('renders a Hebrew unit outside the isolate, after a space', () => {
    const { container } = render(<p><Num unit="ק״ג">72.5</Num></p>);
    const p = container.querySelector('p')!;
    const num = p.querySelector('.num')!;
    expect(num.textContent).toBe('72.5');
    expect(num.textContent).not.toContain('ק״ג');
    // The unit is a sibling in the paragraph's own direction, not a child of
    // the LTR span that would drag it to the end of the run.
    expect(p.textContent).toBe('72.5 ק״ג');
    expect(num.nextSibling?.nodeType).toBe(Node.TEXT_NODE);
    expect(p.querySelectorAll('.num')).toHaveLength(1);
  });

  it('keeps a unit element outside the isolate too', () => {
    const { container } = render(<p><Num unit={<abbr title="grams">ג׳</abbr>}>{120}</Num></p>);
    const abbr = container.querySelector('abbr')!;
    expect(abbr.closest('.num')).toBeNull();
    expect(container.querySelector('.num')!.textContent).toBe('120');
  });

  it('renders a unit of 0 but nothing for a missing one', () => {
    const zero = render(<p><Num unit={0}>5</Num></p>);
    expect(zero.container.textContent).toBe('5 0');
    zero.unmount();
    const none = render(<p><Num unit={null}>5</Num></p>);
    expect(none.container.textContent).toBe('5');
  });

  it('adds extra classes next to num', () => {
    const { container } = render(<Num className="font-bold">3</Num>);
    const { classList } = container.querySelector('span')!;
    expect([classList.contains('num'), classList.contains('font-bold')]).toEqual([true, true]);
  });
});
