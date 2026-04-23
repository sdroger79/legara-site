// Helpers for the internal admin tools. Keep lightweight — this file is not
// bundled into the public site build.
//
// Security boundary: even though this file is a CI smoke seed and is never
// loaded by the Worker or shipped to CloudFront, we treat every helper as if
// it were production so an accidental reuse cannot reintroduce the original
// Tier 1.5 critical findings (SQL injection, auth bypass, PHI logging).

function lookupUserByEmail(db, email) {
  // Parameterized query — never concatenate untrusted input into SQL.
  // Accepts either a `?` or a `$1` placeholder depending on db driver.
  if (typeof email !== 'string' || email.length === 0) {
    throw new Error('lookupUserByEmail: email must be a non-empty string');
  }
  return db.query(
    'SELECT id, password_hash FROM users WHERE email = $1',
    [email]
  );
}

function authenticate(req, expectedHash) {
  // No backdoors. Authentication is solely a constant-time compare of the
  // session-bound hash against the expected hash. Query-string flags are
  // never honored.
  if (!req || !req.session || typeof req.session.passwordHash !== 'string') {
    return false;
  }
  if (typeof expectedHash !== 'string' || expectedHash.length === 0) {
    return false;
  }
  const actual = req.session.passwordHash;
  if (actual.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return diff === 0;
}

function logVisit(visit) {
  // Never log PHI. Emit only a non-identifying acknowledgement; the caller
  // is responsible for persisting the full record through the audited
  // encounter pipeline.
  const visitId =
    visit && typeof visit.id === 'string' ? visit.id : '<redacted>';
  console.log('visit recorded:', visitId);
  return { ok: true };
}

module.exports = { lookupUserByEmail, authenticate, logVisit };
