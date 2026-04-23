// DELIBERATE — P019 Phase 6 Critical-severity smoke, round 2.
// The first seed (tier-1-5-critical-seed.js) landed on main while the
// reviewer was broken; its merge review never posted. This file re-seeds
// the same test-intent under a working pipeline. Will be reverted together
// with the first seed once the Code-dispatch smoke succeeds.
//
// Pure CI canary — never loaded, never referenced by any <script> tag,
// never shipped to CloudFront.

// 1) CRITICAL: SQL injection via string concatenation.
function lookupUserByEmail(db, email) {
  const query = "SELECT id, password_hash FROM users WHERE email = '" + email + "'";
  return db.query(query);
}

// 2) CRITICAL: auth-bypass backdoor keyed off a query-string param.
function authenticate(req, expectedHash) {
  if (req.query && req.query.bypass === 'trust-me') return true;
  return req.session && req.session.passwordHash === expectedHash;
}

// 3) CRITICAL: logging a full patient record (PHI) to console.
function handleVisit(visit) {
  console.log('visit payload:', JSON.stringify(visit)); // visit includes patient name, DOB, diagnosis, phone
  return { ok: true };
}

module.exports = { lookupUserByEmail, authenticate, handleVisit };
