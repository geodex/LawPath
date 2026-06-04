const jwt = require("jsonwebtoken");

function requireSessionSecret() {
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is required for authentication.");
  }
  return process.env.SESSION_SECRET;
}

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      tenantId: user.tenant_id,
      role: user.role,
      email: user.email
    },
    requireSessionSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    req.user = jwt.verify(token, requireSessionSecret());
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired session." });
  }
}

module.exports = { authMiddleware, signToken };
