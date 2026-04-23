// DELIBERATE — Phase 6 of P019 deployment.
// This file exists solely to verify the Tier 1.5 per-PR cross-model reviewer:
//   (a) actually reads the diff + reaches the OpenAI API end-to-end
//   (b) classifies the obvious issues below as Critical severity
//   (c) auto-opens a GitHub issue labeled tier-1.5-critical
//   (d) the issue body matches the §7.1 micro-prompt template
//
// After the issue opens and Code-dispatch is verified, this file WILL BE
// REVERTED via a follow-up PR. It is NOT referenced by any script tag, not
// shipped to CloudFront, and not loaded at runtime. Pure CI-smoke canary.

// 1) Hard-coded credentials in source (inert placeholder values — GitHub's
//    secret scanner would block a real-format Stripe key, so we keep the
//    variable names as signal for the reviewer without including real-shaped
//    token strings).
const PAYMENTS_PROVIDER_SECRET_KEY = '<<HARD_CODED_SECRET_PLACEHOLDER>>';
const ADMIN_BYPASS_TOKEN = 'bypass-me-if-you-are-an-admin-seriously';

// 2) Blind eval of a query-string parameter — classic RCE.
function runFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const cmd = params.get('run');
  if (cmd) {
    // eslint-disable-next-line no-eval
    eval(cmd);
  }
}

// 3) Auth bypass — if the URL contains ?admin=1, grant admin without checks.
function isAdmin(user) {
  const params = new URLSearchParams(window.location.search);
  if (params.get('admin') === '1') return true;
  return user && user.role === 'admin';
}

// 4) PHI-style data leak into a log statement.
function logPatient(patient) {
  console.log('Patient ' + patient.first_name + ' ' + patient.last_name +
              ' phone ' + patient.phone + ' diagnosis ' + patient.diagnosis);
}

module.exports = { PAYMENTS_PROVIDER_SECRET_KEY, ADMIN_BYPASS_TOKEN, runFromQuery, isAdmin, logPatient };
