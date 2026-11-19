// Simple shared access code for the private demo. When ACCESS_CODE is set in the
// environment, the processing endpoints require a matching code; when it is not
// set (local dev), everything is open. Testers get the code from you.
function requireAccess(req, res, next) {
  const code = process.env.ACCESS_CODE;
  if (!code) return next(); // open in dev / when no code is configured
  const provided = req.get('x-access-code') || (req.body && req.body.accessCode) || req.query.code;
  if (provided && provided === code) return next();
  return res.status(401).json({ error: 'access_required', message: 'Enter the access code to use the demo.' });
}

module.exports = { requireAccess };
