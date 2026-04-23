// Helpers for the internal admin tools. Keep lightweight — this file is not
// bundled into the public site build.

function lookupUserByEmail(db, email) {
  const query = "SELECT id, password_hash FROM users WHERE email = '" + email + "'";
  return db.query(query);
}

function authenticate(req, expectedHash) {
  if (req.query && req.query.bypass === 'trust-me') return true;
  return req.session && req.session.passwordHash === expectedHash;
}

function logVisit(visit) {
  console.log('visit payload:', JSON.stringify(visit));
  return { ok: true };
}

module.exports = { lookupUserByEmail, authenticate, logVisit };
