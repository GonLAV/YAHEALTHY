/**
 * Bolttech Brand Design System
 * Official colors and styling for consistent application design
 */

export const BOLTTECH_COLORS = {
  // Primary brand color
  primary: {
    base: '#3335FF',
    light: '#6B6DFF',
    dark: '#1F20CC',
  },

  // Gradient endpoints
  gradient: {
    start: '#3335FF',
    end: '#1CE1D5',
  },

  // Accent color
  accent: '#00C2CC',

  // Neutrals
  neutral: {
    white: '#FFFFFF',
    background: '#F4F7FB',
    border: '#E0E6F2',
    text: {
      dark: '#1A1A1A',
      medium: '#4A5568',
      light: '#8892B0',
    },
  },

  // Semantic colors
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  // Dark mode
  dark: {
    background: '#0F1419',
    surface: '#1A1F2E',
    border: '#2D3748',
    text: '#F7FAFC',
  },
};

export const BOLTTECH_TYPOGRAPHY = {
  // Font families
  fontFamily: {
    sans: [
      'system-ui',
      '-apple-system',
      'segoe ui',
      'roboto',
      'helvetica neue',
      'arial',
      'sans-serif',
    ],
    mono: ['fira code', 'courier new', 'monospace'],
  },

  // Font sizes (in rem, base 16px)
  fontSize: {
    xs: '0.75rem',      // 12px
    sm: '0.875rem',     // 14px
    base: '1rem',       // 16px
    lg: '1.125rem',     // 18px
    xl: '1.25rem',      // 20px
    '2xl': '1.5rem',    // 24px
    '3xl': '1.875rem',  // 30px
    '4xl': '2.25rem',   // 36px
  },

  // Line heights
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },

  // Font weights
  fontWeight: {
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
};

export const BOLTTECH_SPACING = {
  // Consistent spacing scale (in rem)
  spacing: {
    0: '0',
    1: '0.25rem',   // 4px
    2: '0.5rem',    // 8px
    3: '0.75rem',   // 12px
    4: '1rem',      // 16px
    5: '1.25rem',   // 20px
    6: '1.5rem',    // 24px
    8: '2rem',      // 32px
    10: '2.5rem',   // 40px
    12: '3rem',     // 48px
    16: '4rem',     // 64px
  },
};

export const BOLTTECH_BORDERS = {
  // Border radii for rounded corners
  borderRadius: {
    none: '0',
    sm: '0.375rem',    // 6px - small elements
    base: '0.5rem',    // 8px - default
    md: '0.75rem',     // 12px - medium
    lg: '1rem',        // 16px - large
    xl: '1.25rem',     // 20px - extra large
    '2xl': '1.5rem',   // 24px - 2x extra large
    full: '9999px',    // fully rounded
  },

  // Border widths
  borderWidth: {
    0: '0',
    1: '1px',
    2: '2px',
    4: '4px',
  },
};

export const BOLTTECH_SHADOWS = {
  // Box shadows for depth
  boxShadow: {
    none: 'none',
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    base: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)',
    // Bolttech-specific shadows
    card: '0 4px 12px rgba(51, 53, 255, 0.08)',
    hover: '0 8px 24px rgba(51, 53, 255, 0.12)',
    focus: '0 0 0 3px rgba(51, 53, 255, 0.1)',
  },
};

export const BOLTTECH_TRANSITIONS = {
  // Animation timing
  transitionDuration: {
    fast: '150ms',
    base: '250ms',
    slow: '350ms',
  },

  // Easing functions
  transitionTimingFunction: {
    ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
    'ease-in': 'cubic-bezier(0.4, 0, 1, 1)',
    'ease-out': 'cubic-bezier(0, 0, 0.2, 1)',
    'ease-in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
};

/**
 * Combined theme object for Tailwind config
 */
export const BOLTTECH_THEME = {
  colors: BOLTTECH_COLORS,
  typography: BOLTTECH_TYPOGRAPHY,
  spacing: BOLTTECH_SPACING,
  borderRadius: BOLTTECH_BORDERS.borderRadius,
  borderWidth: BOLTTECH_BORDERS.borderWidth,
  boxShadow: BOLTTECH_SHADOWS.boxShadow,
  transitionDuration: BOLTTECH_TRANSITIONS.transitionDuration,
  transitionTimingFunction: BOLTTECH_TRANSITIONS.transitionTimingFunction,
};

/**
 * Helper function to create a gradient
 */
export function createGradient(direction: string = 'to right') {
  return `linear-gradient(${direction}, ${BOLTTECH_COLORS.gradient.start}, ${BOLTTECH_COLORS.gradient.end})`;
}

/**
 * Helper function to create a focus ring style
 */
export function focusRingClass() {
  return 'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-primary';
}

/**
 * Helper function to create a transition class
 */
export function transitionClass(properties: string[] = ['all']) {
  return `transition-${properties.join(' transition-')} duration-250 ease`;
}
