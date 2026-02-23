/**
 * services/complexityAnalyzer.js
 *
 * ⚠️  LEGAL & TECHNICAL WARNINGS:
 * ──────────────────────────────────────────────────────────────────────────────
 * 1. ToS Risk    — Using TimeComplexity.ai's private API without permission may
 *                  violate their Terms of Service (timecomplexity.ai/terms).
 *                  Review it before deploying. Consider reaching out to them.
 * 2. IP Blocking — Your Render.com server IP can be rate-limited or banned.
 *                  The 4-second polite delay below reduces this risk.
 * 3. Fragility   — This is an undocumented private API. Payload shape or auth
 *                  requirements can change without warning and break silently.
 * 4. No SLA      — Zero uptime guarantees. The rule-based fallback (Tier 2)
 *                  keeps your extension functional if the scraper goes down.
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * Verified endpoints (confirmed via DevTools Network tab):
 *   POST https://www.timecomplexity.ai/api/analyze   ← main analysis
 *   POST https://www.timecomplexity.ai/api/queries   ← history (read-only, unused)
 *   POST https://umami-gamma-smoky.vercel.app/api/send ← their analytics (skip)
 */

const axios = require('axios');

// ─────────────────────────────────────────────────────────────────────────────
// TIER 1 — TimeComplexity.ai Scraper
//
// Fully verified via DevTools (Feb 2026):
//
//   Endpoint  : POST https://www.timecomplexity.ai/api/analyze
//   Auth      : None — no cookies, no Next-Action header needed
//   Request   : { inputCode: "<code string>" }
//   Response  : {
//                 status           : "Success",
//                 timeComplexity   : "O(n)",
//                 reasoning        : "The code uses a single for loop...",
//                 requestId        : "",
//                 message          : "",
//                 timestampUnixEpochMs: 1771829696102
//               }
//
// Session ID : Sent as part of x-session-id header — we generate a UUID v4
//              to match what the browser does (cf6f9a4f-8dc1-447a-804b-1ca79cd8e7e5)
// ─────────────────────────────────────────────────────────────────────────────

const { randomUUID } = require('crypto'); // built-in Node.js, no install needed

class TimeComplexityScraper {
  constructor() {
    this.endpoint = 'https://www.timecomplexity.ai/api/analyze';

    // Exact User-Agent observed in the real request (Android/Edge)
    this.userAgent =
      'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/109.0.0.0 Mobile Safari/537.36 Edg/109.0.1518.140';

    // ⚠️  Be a polite scraper — do NOT reduce below 4 seconds
    this.lastRequestTime = 0;
    this.minIntervalMs   = 4000;
  }

  async _rateLimit() {
    const wait = this.minIntervalMs - (Date.now() - this.lastRequestTime);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    this.lastRequestTime = Date.now();
  }

  async analyze(code) {
    await this._rateLimit();

    // Generate a fresh session UUID per request, exactly as the browser does
    const sessionId = randomUUID();

    const response = await axios.post(
      this.endpoint,
      { inputCode: code },           // ← exact field name confirmed via DevTools
      {
        headers: {
          'Content-Type'   : 'application/json',
          'Accept'         : '*/*',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept-Language': 'en-US,en;q=0.9',
          'Origin'         : 'https://www.timecomplexity.ai',
          'Referer'        : 'https://www.timecomplexity.ai/',
          'User-Agent'     : this.userAgent,
          'x-session-id'   : sessionId,
          'sec-fetch-dest' : 'empty',
          'sec-fetch-mode' : 'cors',
          'sec-fetch-site' : 'same-origin',
        },
        timeout       : 25000,
        decompress    : true,          // axios handles br/gzip automatically
      }
    );

    return this._parseResponse(response.data);
  }

  _parseResponse(data) {
    // Exact response shape confirmed:
    // { status, timeComplexity, reasoning, requestId, message, timestampUnixEpochMs }
    if (data?.status !== 'Success' || !data?.timeComplexity) {
      throw new Error(
        `API returned status="${data?.status ?? 'unknown'}": ${data?.message ?? JSON.stringify(data).slice(0, 120)}`
      );
    }

    return {
      timeComplexity : data.timeComplexity,   // e.g. "O(n)"
      timeReasoning  : data.reasoning ?? '',  // full English explanation
      spaceComplexity: null,                  // not provided by this API — filled by orchestrator
      spaceReasoning : null,
      breakdown      : [],
      confidence     : 'high',
      source         : 'timecomplexity.ai',
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER 2 — Rule-Based Static Analyzer (no network, always available)
// ─────────────────────────────────────────────────────────────────────────────

class RuleBasedAnalyzer {
  analyze(code) {
    const f  = this._extractFeatures(code);
    const tc = this._estimateTC(f);
    const sc = this._estimateSC(f);

    return {
      timeComplexity : tc.notation,
      spaceComplexity: sc.notation,
      timeReasoning  : tc.reason,
      spaceReasoning : sc.reason,
      breakdown      : this._buildBreakdown(f),
      confidence     : 'low',
      source         : 'rule-based',
    };
  }

  spaceOnly(code) {
    const f  = this._extractFeatures(code);
    const sc = this._estimateSC(f);
    return { spaceComplexity: sc.notation, spaceReasoning: sc.reason, breakdown: this._buildBreakdown(f) };
  }

  _extractFeatures(code) {
    let loopDepth = 0, maxLoopDepth = 0;
    for (const line of code.split('\n')) {
      const t = line.trim();
      if (/\b(for|while)\b/.test(t))      { loopDepth++; maxLoopDepth = Math.max(maxLoopDepth, loopDepth); }
      if (/^[}\])]/.test(t) && loopDepth > 0) loopDepth--;
    }
    return {
      maxLoopDepth,
      hasSort        : /\.(sort|sorted|Arrays\.sort|Collections\.sort|sort_by)\b/.test(code),
      hasRecursion   : this._detectRecursion(code),
      hasDivConquer  : /\b(mid|left|right|pivot)\b/.test(code) && /\b(merge|split|partition)\b/i.test(code),
      hasHashMap     : /\b(dict\b|HashMap|new Map\b|Counter\(|set\(\)|HashSet|\{\})\b/.test(code),
      hasMatrix      : /\[\s*\[/.test(code) || /\bmatrix\b/i.test(code),
      hasBFS         : /\b(queue|deque|BFS|bfs)\b/i.test(code),
      hasDFS         : /\b(stack|DFS|dfs|backtrack)\b/i.test(code),
      hasDP          : /\b(dp\[|memo\b|@cache|lru_cache|functools\.cache)\b/.test(code),
      hasBinarySearch: /\b(binary.?search|lo\s*=|hi\s*=|mid\s*=.*\/\/\s*2)\b/i.test(code),
    };
  }

  _detectRecursion(code) {
    const m = code.match(/(?:def|function|func)\s+(\w+)\s*\(/);
    if (!m) return false;
    const after = code.slice(code.indexOf(m[0]) + m[0].length);
    return new RegExp(`\\b${m[1]}\\s*\\(`).test(after);
  }

  _estimateTC(f) {
    if (f.hasBinarySearch && f.maxLoopDepth === 0)
      return { notation: 'O(log n)',        reason: 'Binary search — input halved each iteration' };
    if (f.hasDivConquer)
      return { notation: 'O(n log n)',      reason: 'Divide-and-conquer (merge/partition detected)' };
    if (f.hasSort && f.maxLoopDepth >= 1)
      return { notation: 'O(n log n)',      reason: 'Built-in sort dominates the nested loop' };
    if (f.hasSort)
      return { notation: 'O(n log n)',      reason: 'Built-in sort (TimSort baseline)' };
    if (f.hasRecursion && f.maxLoopDepth >= 1)
      return { notation: 'O(n²) or worse', reason: 'Recursion combined with a loop' };
    if (f.hasRecursion)
      return { notation: 'O(2ⁿ) or O(n)', reason: 'Recursive — depends on branching factor' };
    if (f.maxLoopDepth >= 3)
      return { notation: 'O(n³)',           reason: 'Triple-nested loops' };
    if (f.maxLoopDepth === 2)
      return { notation: 'O(n²)',           reason: 'Double-nested loops' };
    if (f.maxLoopDepth === 1)
      return { notation: 'O(n)',            reason: 'Single loop over input' };
    if (f.hasDP)
      return { notation: 'O(n)–O(n²)',     reason: 'DP — depends on state dimensions' };
    return   { notation: 'O(1)',            reason: 'No loops or recursion found' };
  }

  _estimateSC(f) {
    if (f.hasMatrix)              return { notation: 'O(n²)', reason: '2D matrix / grid allocated' };
    if (f.hasDP && f.hasHashMap)  return { notation: 'O(n)',  reason: 'DP memo hash map' };
    if (f.hasDP)                  return { notation: 'O(n)',  reason: 'DP array allocated' };
    if (f.hasRecursion)           return { notation: 'O(n)',  reason: 'Recursive call-stack depth' };
    if (f.hasHashMap)             return { notation: 'O(n)',  reason: 'Hash map / set in memory' };
    if (f.hasBFS || f.hasDFS)    return { notation: 'O(n)',  reason: 'Queue / stack for traversal' };
    return                               { notation: 'O(1)', reason: 'No significant extra memory' };
  }

  _buildBreakdown(f) {
    const out = [];
    if (f.hasSort)         out.push({ label: 'Built-in sort',               complexity: 'O(n log n)', note: 'TimSort' });
    if (f.maxLoopDepth>0)  out.push({ label: `Loops (depth ${f.maxLoopDepth})`, complexity: `O(n${f.maxLoopDepth>1?f.maxLoopDepth:''})`, note: 'Dominant cost' });
    if (f.hasRecursion)    out.push({ label: 'Recursion',                   complexity: 'varies',     note: 'Branching factor' });
    if (f.hasHashMap)      out.push({ label: 'Hash structure',              complexity: 'O(n) space', note: 'Keys in memory' });
    if (f.hasDP)           out.push({ label: 'DP memo',                     complexity: 'O(n)',       note: 'Memo table' });
    if (f.hasBinarySearch) out.push({ label: 'Binary search',               complexity: 'O(log n)',   note: 'Halved per step' });
    return out.slice(0, 4);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator — combines Tier 1 + Tier 2 intelligently
// ─────────────────────────────────────────────────────────────────────────────

const scraper   = new TimeComplexityScraper();
const ruleBased = new RuleBasedAnalyzer();

/**
 * analyzeComplexity(code, language)
 *
 * Returns a unified result object regardless of which tier runs.
 * TimeComplexity.ai only provides TIME complexity, so we always
 * supplement SPACE complexity from the rule-based engine.
 *
 * @returns {Promise<{
 *   timeComplexity : string,
 *   spaceComplexity: string,
 *   timeReasoning  : string,
 *   spaceReasoning : string,
 *   breakdown      : Array<{label,complexity,note}>,
 *   confidence     : 'high'|'medium'|'low',
 *   source         : string
 * }>}
 */
async function analyzeComplexity(code, language = 'python') {
  if (!code?.trim()) throw new Error('No code provided');

  const spaceResult = ruleBased.spaceOnly(code); // always computed locally

  try {
    const scraperResult = await scraper.analyze(code); // API only needs inputCode

    // Merge: TC from scraper (high confidence), SC from rule-based
    return {
      timeComplexity : scraperResult.timeComplexity,
      spaceComplexity: spaceResult.spaceComplexity,
      timeReasoning  : scraperResult.timeReasoning,
      spaceReasoning : spaceResult.spaceReasoning,
      breakdown      : spaceResult.breakdown,
      confidence     : 'high',
      source         : 'timecomplexity.ai',
    };
  } catch (err) {
    const status = err.response?.status;
    if (status === 429)      console.warn('[LeetCo] Rate-limited by TimeComplexity.ai');
    else if (status === 403) console.warn('[LeetCo] Blocked by TimeComplexity.ai — IP may be banned');
    else                     console.warn('[LeetCo] Scraper failed →', err.message, '— using rule-based fallback');

    // Full rule-based fallback
    return ruleBased.analyze(code);
  }
}

module.exports = { analyzeComplexity, RuleBasedAnalyzer, TimeComplexityScraper };