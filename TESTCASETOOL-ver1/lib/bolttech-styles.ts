/**
 * Bolttech Button and Component Styles
 * Reusable className sets for consistent Bolttech design
 */

export const BolttechStyles = {
  // Buttons
  buttons: {
    primary: 'px-4 py-2.5 bg-gradient-to-r from-bolttech-primary to-bolttech-accent hover:shadow-bolttech-hover text-white rounded-bolttech font-semibold transition-all duration-250',
    primaryDisabled: 'px-4 py-2.5 from-bolttech-border to-bolttech-border cursor-not-allowed text-bolttech-text-light rounded-bolttech font-semibold',
    secondary: 'px-4 py-2.5 border-2 border-bolttech-primary text-bolttech-primary bg-white dark:bg-bolttech-dark-surface hover:bg-bolttech-primary/5 dark:hover:bg-bolttech-primary/10 rounded-bolttech font-semibold transition-all duration-250',
    ghost: 'px-4 py-2.5 text-bolttech-text dark:text-white hover:bg-bolttech-primary/10 dark:hover:bg-bolttech-primary/20 rounded-bolttech font-semibold transition-all duration-250',
    danger: 'px-4 py-2.5 bg-bolttech-error hover:bg-red-700 text-white rounded-bolttech font-semibold transition-all duration-250',
    icon: 'p-2 hover:bg-bolttech-primary/10 dark:hover:bg-bolttech-primary/20 rounded-bolttech transition-all duration-250',
  },

  // Cards and containers
  cards: {
    base: 'bg-white dark:bg-bolttech-dark-surface rounded-bolttech-lg border border-bolttech-border dark:border-bolttech-dark-border',
    elevated: 'bg-white dark:bg-bolttech-dark-surface rounded-bolttech-lg border border-bolttech-border dark:border-bolttech-dark-border shadow-bolttech-card hover:shadow-bolttech-hover transition-shadow duration-250',
    outlined: 'rounded-bolttech-lg border-2 border-bolttech-primary/50 bg-transparent',
  },

  // Inputs and forms
  inputs: {
    base: 'w-full px-4 py-2.5 bg-white dark:bg-bolttech-dark-surface border border-bolttech-border dark:border-bolttech-dark-border rounded-bolttech text-bolttech-text dark:text-white focus:outline-none focus:ring-2 focus:ring-bolttech-primary focus:ring-offset-2 dark:focus:ring-offset-bolttech-dark-bg transition-all duration-250',
    textarea: 'w-full px-4 py-3 bg-white dark:bg-bolttech-dark-surface border border-bolttech-border dark:border-bolttech-dark-border rounded-bolttech text-bolttech-text dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-bolttech-primary focus:ring-offset-2 dark:focus:ring-offset-bolttech-dark-bg transition-all duration-250',
    error: 'border-bolttech-error focus:ring-bolttech-error',
    success: 'border-bolttech-success focus:ring-bolttech-success',
  },

  // Text and typography
  text: {
    heading1: 'text-3xl font-bold text-bolttech-text dark:text-white',
    heading2: 'text-2xl font-bold text-bolttech-text dark:text-white',
    heading3: 'text-xl font-semibold text-bolttech-text dark:text-white',
    body: 'text-sm text-bolttech-text-light dark:text-bolttech-text-lighter',
    small: 'text-xs text-bolttech-text-light dark:text-bolttech-text-lighter',
  },

  // Backgrounds and sections
  sections: {
    header: 'px-6 py-5 border-b border-bolttech-border dark:border-bolttech-dark-border bg-gradient-to-r from-bolttech-primary/5 to-bolttech-accent/5',
    footer: 'px-6 py-4 border-t border-bolttech-border dark:border-bolttech-dark-border bg-bolttech-bg/30 dark:bg-bolttech-dark-bg/30',
    info: 'px-6 py-3 bg-bolttech-info/5 dark:bg-bolttech-info/10 border-b border-bolttech-info/20',
    success: 'px-6 py-3 bg-bolttech-success/5 dark:bg-bolttech-success/10 border-b border-bolttech-success/20',
    error: 'px-6 py-3 bg-bolttech-error/5 dark:bg-bolttech-error/10 border-b border-bolttech-error/20',
    warning: 'px-6 py-3 bg-bolttech-warning/5 dark:bg-bolttech-warning/10 border-b border-bolttech-warning/20',
  },

  // Status badges
  badges: {
    success: 'inline-block px-3 py-1 bg-bolttech-success/10 text-bolttech-success rounded-bolttech text-xs font-semibold',
    error: 'inline-block px-3 py-1 bg-bolttech-error/10 text-bolttech-error rounded-bolttech text-xs font-semibold',
    warning: 'inline-block px-3 py-1 bg-bolttech-warning/10 text-bolttech-warning rounded-bolttech text-xs font-semibold',
    info: 'inline-block px-3 py-1 bg-bolttech-info/10 text-bolttech-info rounded-bolttech text-xs font-semibold',
    primary: 'inline-block px-3 py-1 bg-bolttech-primary/10 text-bolttech-primary rounded-bolttech text-xs font-semibold',
  },

  // Dividers
  dividers: {
    light: 'bg-bolttech-border dark:bg-bolttech-dark-border',
    primary: 'bg-bolttech-primary',
  },

  // Transitions
  transitions: {
    smooth: 'transition-all duration-250 ease',
    hover: 'hover:shadow-bolttech-hover hover:scale-105',
  },
};

/**
 * Helper function to combine button styles
 */
export function getButtonClass(
  variant: 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon' = 'primary',
  disabled: boolean = false
): string {
  if (disabled && variant === 'primary') {
    return 'px-4 py-2.5 bg-bolttech-border text-bolttech-text-light rounded-bolttech font-semibold cursor-not-allowed opacity-60';
  }

  return BolttechStyles.buttons[variant as keyof typeof BolttechStyles.buttons] || BolttechStyles.buttons.primary;
}

/**
 * Helper function to combine input styles with validation state
 */
export function getInputClass(
  hasError: boolean = false,
  hasSuccess: boolean = false
): string {
  let classes = BolttechStyles.inputs.base;

  if (hasError) {
    classes += ` ${BolttechStyles.inputs.error}`;
  } else if (hasSuccess) {
    classes += ` ${BolttechStyles.inputs.success}`;
  }

  return classes;
}

/**
 * Helper function to get section background
 */
export function getSectionClass(
  type: 'header' | 'footer' | 'info' | 'success' | 'error' | 'warning' = 'header'
): string {
  return BolttechStyles.sections[type as keyof typeof BolttechStyles.sections] || BolttechStyles.sections.header;
}

/**
 * Helper function to get badge class
 */
export function getBadgeClass(
  type: 'success' | 'error' | 'warning' | 'info' | 'primary' = 'primary'
): string {
  return BolttechStyles.badges[type as keyof typeof BolttechStyles.badges] || BolttechStyles.badges.primary;
}
