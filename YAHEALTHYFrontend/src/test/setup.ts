import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Testing Library only unmounts by itself when the runner exposes a global
// afterEach; this config keeps globals off, so it is done here.
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
});
