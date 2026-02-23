/**
 * routes/complexity.routes.js
 *
 * Mount in server.js:
 *   const complexityRoutes = require('./routes/complexity.routes');
 *   app.use('/api', complexityRoutes);
 *
 * Endpoint : POST /api/analyze-complexity
 * Body     : { code: string, language?: string }
 * Response : { timeComplexity, spaceComplexity, timeReasoning,
 *              spaceReasoning, breakdown, confidence, source, analyzedAt }
 */

const express             = require('express');
const { analyzeComplexity } = require('../services/complexityAnalyzer');

const router = express.Router();

// ─── Simple in-memory rate limiter (no external deps) ─────────────────────────

const ipHitMap       = new Map();
const RATE_WINDOW_MS = 60_000; // 1-minute rolling window
const MAX_REQUESTS   = 10;     // per IP per window

function rateLimiter(req, res, next) {
  const ip  = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  const now = Date.now();
  const rec = ipHitMap.get(ip) ?? { count: 0, windowStart: now };

  // Reset window if expired
  if (now - rec.windowStart > RATE_WINDOW_MS) {
    ipHitMap.set(ip, { count: 1, windowStart: now });
    return next();
  }

  if (rec.count >= MAX_REQUESTS) {
    const retryAfter = Math.ceil((RATE_WINDOW_MS - (now - rec.windowStart)) / 1000);
    res.setHeader('Retry-After', retryAfter);
    return res.status(429).json({
      error      : 'Too Many Requests',
      message    : `Max ${MAX_REQUESTS} analyses per minute. Retry in ${retryAfter}s.`,
      retryAfter,
    });
  }

  rec.count++;
  ipHitMap.set(ip, rec);
  next();
}

// Prune stale IP records every 5 minutes to prevent memory leak
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW_MS;
  for (const [ip, rec] of ipHitMap) {
    if (rec.windowStart < cutoff) ipHitMap.delete(ip);
  }
}, 5 * 60_000);

// ─── Input validation middleware ───────────────────────────────────────────────

function validateBody(req, res, next) {
  const { code, language = 'python' } = req.body ?? {};

  if (!code || typeof code !== 'string') {
    return res.status(400).json({
      error  : 'Bad Request',
      message: '"code" must be a non-empty string',
    });
  }

  const trimmed = code.trim();

  if (trimmed.length < 5) {
    return res.status(400).json({
      error  : 'Bad Request',
      message: 'Code is too short to analyze (min 5 characters)',
    });
  }

  if (trimmed.length > 20_000) {
    return res.status(400).json({
      error  : 'Bad Request',
      message: 'Code exceeds 20,000 character limit',
    });
  }

  // Sanitize language string — allow only alphanumeric
  req._validated = {
    code    : trimmed,
    language: String(language).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'python',
  };

  next();
}

// ─── POST /api/analyze-complexity ─────────────────────────────────────────────

router.post('/analyze-complexity', rateLimiter, validateBody, async (req, res) => {
  const { code, language } = req._validated;

  try {
    const result = await analyzeComplexity(code, language);

    return res.json({
      ...result,
      language   : language,
      analyzedAt : new Date().toISOString(),
    });
  } catch (err) {
    console.error('[POST /analyze-complexity]', err.message);
    return res.status(500).json({
      error  : 'Internal Server Error',
      message: 'Analysis failed — please try again',
    });
  }
});

module.exports = router;