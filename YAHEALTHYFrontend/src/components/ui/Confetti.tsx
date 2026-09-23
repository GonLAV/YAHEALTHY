import { useEffect, useRef } from 'react';
import { COLOR } from '@/theme';

/**
 * A burst of confetti, drawn on a canvas.
 *
 * Hand-rolled rather than pulled from npm. The whole thing is a hundred lines
 * and it buys three things a package would not: nothing new in the dependency
 * tree for a decoration, colours that come from this app's palette rather than
 * a library's defaults, and an honest answer to prefers-reduced-motion — which
 * most confetti packages either ignore or leave to the caller.
 *
 * That last one is not a nicety. Confetti is a field of small objects
 * accelerating across the whole viewport, which is close to the worst case for
 * someone with a vestibular disorder. When the system asks for reduced motion
 * this component renders nothing at all and the achievement still gets
 * announced in words by whatever is showing it.
 */

// The app's own palette: emerald, amber, sky, rose, violet.
const COLORS = [COLOR.brand, COLOR.fat, COLOR.carbs, COLOR.protein, COLOR.badge];

const PARTICLE_COUNT = 90;
const GRAVITY = 0.16;
const DRAG = 0.992;
const FADE_AFTER_MS = 1400;
const LIFETIME_MS = 2600;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  spin: number;
}

const prefersReducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    // If we cannot ask, assume the cautious answer.
    return true;
  }
};

export const Confetti = ({ fireKey }: { fireKey: string | number | null }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (fireKey == null) return;
    if (prefersReducedMotion()) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Crisp on a phone, where this is mostly seen.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Two bursts from the lower corners, angled inward. Direction-neutral by
    // construction — a mirrored layout needs no change here, and the eye ends
    // up in the middle of the screen in both.
    const particles: Particle[] = [];
    const origins = [
      { x: width * 0.15, y: height * 0.92, spread: -1 },
      { x: width * 0.85, y: height * 0.92, spread: 1 },
    ];

    for (const origin of origins) {
      for (let i = 0; i < PARTICLE_COUNT / 2; i++) {
        const angle = -Math.PI / 2 - origin.spread * (Math.random() * 0.6 + 0.1);
        const speed = 9 + Math.random() * 8;
        particles.push({
          x: origin.x,
          y: origin.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 5 + Math.random() * 5,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          rotation: Math.random() * Math.PI,
          spin: (Math.random() - 0.5) * 0.3,
        });
      }
    }

    const started = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const elapsed = now - started;
      ctx.clearRect(0, 0, width, height);

      if (elapsed > LIFETIME_MS) return;

      const fade =
        elapsed < FADE_AFTER_MS
          ? 1
          : 1 - (elapsed - FADE_AFTER_MS) / (LIFETIME_MS - FADE_AFTER_MS);

      for (const p of particles) {
        p.vy += GRAVITY;
        p.vx *= DRAG;
        p.vy *= DRAG;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.spin;

        if (p.y > height + 20) continue;

        ctx.save();
        ctx.globalAlpha = Math.max(0, fade);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        // Flat rectangles that foreshorten as they spin — paper, not dots.
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      ctx.clearRect(0, 0, width, height);
    };
  }, [fireKey]);

  if (fireKey == null) return null;

  return (
    <canvas
      ref={canvasRef}
      // Decoration. It must never intercept a tap, and a screen reader has
      // nothing to gain from it — the achievement is announced in text.
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50"
    />
  );
};

export default Confetti;
