/**
 * Preloaded with `node -r` by tests/calorie-gate.test.js, to run the server as
 * it will behave once the calorie formula is approved, without writing an
 * approval into data/clinical-approvals.json. Only 'app-calorie-target' is
 * affected; the bots' prompts keep their real status.
 */
const clinical = require('../../utils/clinical-approval');

const real = clinical.statusFor;
clinical.statusFor = (persona, file) =>
  persona === 'app-calorie-target' ? { ...real(persona, file), approved: true, reason: null } : real(persona, file);
