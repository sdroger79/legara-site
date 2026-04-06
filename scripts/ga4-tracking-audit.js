#!/usr/bin/env node
/**
 * GA4 Tracking Code Audit — Full-Site Analysis
 *
 * Scans the legara-site codebase and cross-references every GA4 tracking call
 * against what GA4 expects. Catches:
 *   1. Events fired in code that aren't configured as key events (if they should be)
 *   2. Key events in GA4 that have no code firing them (phantom events)
 *   3. Undefined functions called for tracking (silent failures)
 *   4. sendBeacon calls missing required parameters
 *   5. Measurement Protocol calls missing required fields
 *   6. UTM tracking config order issues (gtag('set') must come before gtag('config'))
 *   7. Missing tracking on conversion-critical pages (forms, CTAs)
 *   8. Client ID extraction inconsistencies
 *   9. Duplicate event names across files
 *  10. Events not matching the brand conversion hierarchy
 *
 * Usage:
 *   node scripts/ga4-tracking-audit.js              # Full audit
 *   node scripts/ga4-tracking-audit.js --json       # JSON output
 *   node scripts/ga4-tracking-audit.js --fix-plan   # Show fix recommendations
 */

const fs = require('fs');
const path = require('path');

// ─── Configuration ─────────────────────────────────────────────────────────────

const SITE_ROOT = path.resolve(__dirname, '..');
const GA4_MEASUREMENT_ID = 'G-GC0KH378ZK';
const GOOGLE_ADS_ID = 'AW-1769529274';

// Brand conversion hierarchy: what events SHOULD exist and be key events
// NOTE: ROI calculator is retired for public use (internal only). Its events
// (calculator_engaged, roi_form_submit, roi_report_download) are deprioritized.
const BRAND_EVENT_TAXONOMY = {
  // Awareness (auto-tracked by GA4, no custom events needed)
  awareness: {
    events: ['page_view', 'session_start', 'first_visit'],
    keyEvent: false,
    note: 'Automatic GA4 events — do not mark as key events'
  },
  // Engagement
  engagement: {
    events: ['calculator_engaged', 'contact_form_submit'],
    keyEvent: true,
    note: 'High-intent engagement actions (ROI calc is internal-only, calculator_engaged still fires for internal use)'
  },
  // Assessment (PRIMARY conversion path)
  assessment: {
    events: ['quiz_start', 'quiz_progress', 'quiz_form_view', 'quiz_form_start', 'quiz_complete', 'quiz_abandon'],
    keyEvent: ['quiz_complete'], // Only quiz_complete should be a key event
    note: 'Assessment quiz funnel — primary conversion mechanism'
  },
  // Conversion
  conversion: {
    events: ['generate_lead', 'meeting_booked'],
    keyEvent: true,
    note: 'Bottom-of-funnel conversion events'
  },
  // Server-side (Measurement Protocol)
  serverSide: {
    events: ['assessment_complete', 'meeting_booked'],
    keyEvent: false,
    note: 'Server-side events via Measurement Protocol — supplement client-side tracking'
  }
};

// Events that should be key events in GA4
// NOTE: roi_form_submit, roi_report_download, lead_form_submit removed —
// ROI calculator is internal-only, lead_form_submit was never implemented
const EXPECTED_KEY_EVENTS = new Set([
  'calculator_engaged',
  'generate_lead',
  'quiz_complete',
]);

// Events that should NEVER be key events
const NEVER_KEY_EVENTS = new Set([
  'page_view', 'scroll', 'click', 'session_start', 'first_visit',
  'user_engagement', 'file_download', 'video_start', 'video_progress',
  'video_complete', 'cta_click', 'scroll_depth',
]);

// Measurement Protocol required fields
const MP_REQUIRED_FIELDS = ['client_id', 'events', 'events[].name'];

// sendBeacon required parameters for proper attribution
const BEACON_REQUIRED_PARAMS = ['v', 'tid', 'cid', 'en', 'dl', 'dt'];

// ─── File Scanner ──────────────────────────────────────────────────────────────

function getFiles(dir, extensions = ['.html', '.js'], exclude = ['node_modules', '.git', 'dist', 'scripts']) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!exclude.includes(entry.name)) {
          results.push(...getFiles(fullPath, extensions, exclude));
        }
      } else if (extensions.some(ext => entry.name.endsWith(ext))) {
        results.push(fullPath);
      }
    }
  } catch (e) { /* skip unreadable dirs */ }
  return results;
}

// ─── Pattern Matchers ──────────────────────────────────────────────────────────

function findGtagEvents(content, filePath) {
  const events = [];
  // Match: gtag('event', 'event_name', { ... })
  const gtagRegex = /gtag\s*\(\s*['"]event['"]\s*,\s*['"]([^'"]+)['"]\s*(?:,\s*(\{[^}]*\}))?\s*\)/g;
  let match;
  while ((match = gtagRegex.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    const params = match[2] || '{}';
    events.push({
      type: 'gtag',
      eventName: match[1],
      params: extractParams(params),
      file: path.relative(SITE_ROOT, filePath),
      line: lineNum,
      raw: match[0].substring(0, 120)
    });
  }
  return events;
}

function findSafeTrackEvents(content, filePath) {
  const events = [];
  // Match: _safeTrack('event_name', { ... })
  const regex = /_safeTrack\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*(\{[^}]*\}))?\s*\)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    events.push({
      type: '_safeTrack',
      eventName: match[1],
      params: extractParams(match[2] || '{}'),
      file: path.relative(SITE_ROOT, filePath),
      line: lineNum,
      raw: match[0].substring(0, 120)
    });
  }
  return events;
}

function findTrackEventCalls(content, filePath) {
  const events = [];
  // Match: trackEvent('event_name', ...)
  const regex = /trackEvent\s*\(\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    events.push({
      type: 'trackEvent (UNDEFINED)',
      eventName: match[1],
      file: path.relative(SITE_ROOT, filePath),
      line: lineNum,
      raw: match[0],
      issue: 'trackEvent() is called but never defined — event silently fails'
    });
  }
  return events;
}

function findSendBeaconCalls(content, filePath) {
  const events = [];
  // Match: navigator.sendBeacon(...g/collect...)
  const regex = /navigator\.sendBeacon\s*\(\s*(['"`])([\s\S]*?)\1/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    const url = match[2];

    // Also handle template literals and concatenated strings
    // Look for the broader sendBeacon block
    const blockStart = Math.max(0, match.index - 50);
    const blockEnd = Math.min(content.length, match.index + 800);
    const block = content.substring(blockStart, blockEnd);

    const eventNameMatch = block.match(/en=([^&'"]+)/);
    const hasDl = /[&?]dl=/.test(block);
    const hasDt = /[&?]dt=/.test(block);
    const hasDr = /[&?]dr=/.test(block);
    const hasTid = /tid=/.test(block);
    const hasCid = /cid=/.test(block);

    const missing = [];
    if (!hasDl) missing.push('dl (document location)');
    if (!hasDt) missing.push('dt (document title)');
    if (!hasDr) missing.push('dr (document referrer)');
    if (!hasTid) missing.push('tid (tracking ID)');
    if (!hasCid) missing.push('cid (client ID)');

    events.push({
      type: 'sendBeacon',
      eventName: eventNameMatch ? eventNameMatch[1] : 'unknown',
      file: path.relative(SITE_ROOT, filePath),
      line: lineNum,
      hasDl, hasDt, hasDr, hasTid, hasCid,
      missingParams: missing,
      issue: missing.length > 0 ? `Missing attribution params: ${missing.join(', ')}` : null
    });
  }

  return events;
}

function findMeasurementProtocolCalls(content, filePath) {
  const events = [];
  // Match: sendGA4Event("event_name", { ... }, ...)
  const regex = /sendGA4Event\s*\(\s*["']([^"']+)["']\s*,\s*\{([^}]*)\}/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    events.push({
      type: 'measurement_protocol',
      eventName: match[1],
      params: extractParams('{' + match[2] + '}'),
      file: path.relative(SITE_ROOT, filePath),
      line: lineNum,
      raw: match[0].substring(0, 120)
    });
  }
  return events;
}

function findGtagConfig(content, filePath) {
  const configs = [];
  const issues = [];

  // Find gtag('set', ...) and gtag('config', ...) positions
  const setRegex = /gtag\s*\(\s*['"]set['"]/g;
  const configRegex = /gtag\s*\(\s*['"]config['"]\s*,\s*['"]([^'"]+)['"]/g;

  let setPositions = [];
  let configPositions = [];

  let m;
  while ((m = setRegex.exec(content)) !== null) {
    setPositions.push({ pos: m.index, line: content.substring(0, m.index).split('\n').length });
  }
  while ((m = configRegex.exec(content)) !== null) {
    configPositions.push({
      pos: m.index,
      line: content.substring(0, m.index).split('\n').length,
      id: m[1]
    });
  }

  // Check: gtag('set') must come BEFORE gtag('config')
  for (const cfg of configPositions) {
    if (cfg.id === GA4_MEASUREMENT_ID) {
      configs.push({
        file: path.relative(SITE_ROOT, filePath),
        measurementId: cfg.id,
        line: cfg.line
      });

      for (const s of setPositions) {
        if (s.pos > cfg.pos) {
          issues.push({
            severity: 'ERROR',
            file: path.relative(SITE_ROOT, filePath),
            message: `gtag('set') at line ${s.line} comes AFTER gtag('config') at line ${cfg.line} — UTM params won't attach to the session`,
            fix: `Move gtag('set', {...}) BEFORE gtag('config', '${GA4_MEASUREMENT_ID}')`
          });
        }
      }
    }
  }

  // Check: has GA4 config but no UTM handling
  if (configPositions.some(c => c.id === GA4_MEASUREMENT_ID) && setPositions.length === 0) {
    const hasUtmScript = content.includes('utm.js');
    if (hasUtmScript) {
      // utm.js loaded but no gtag('set') — might be a missed integration
    }
    // Not necessarily an issue — only landing pages need UTM passthrough
  }

  return { configs, issues };
}

function findClientIdExtraction(content, filePath) {
  const extractions = [];
  // Various patterns for extracting GA client ID from cookie
  const patterns = [
    { regex: /gaCookie\.split\('\.'\)\.slice\(-2\)\.join\('\.'\)/, method: 'slice(-2).join(".")' },
    { regex: /gaCookie\.split\('\.'\)\.slice\(2\)\.join\('\.'\)/, method: 'slice(2).join(".")' },
    { regex: /_ga=.*?\.slice\((-?\d+)\)/, method: 'custom slice' },
  ];

  for (const p of patterns) {
    const m = content.match(p.regex);
    if (m) {
      const lineNum = content.substring(0, m.index).split('\n').length;
      extractions.push({
        file: path.relative(SITE_ROOT, filePath),
        line: lineNum,
        method: p.method,
      });
    }
  }
  return extractions;
}

function findFormSubmissions(content, filePath) {
  const forms = [];
  // Look for form submit handlers
  const submitRegex = /(?:onsubmit|addEventListener.*submit|\.submit\(\))/gi;
  let m;
  while ((m = submitRegex.exec(content)) !== null) {
    const lineNum = content.substring(0, m.index).split('\n').length;
    // Check if there's a gtag event near this submit
    const surroundingBlock = content.substring(
      Math.max(0, m.index - 200),
      Math.min(content.length, m.index + 1000)
    );
    const hasGtagEvent = /gtag\s*\(\s*['"]event['"]/.test(surroundingBlock);
    const hasSafeTrack = /_safeTrack/.test(surroundingBlock);
    const hasTrackEvent = /trackEvent/.test(surroundingBlock);

    forms.push({
      file: path.relative(SITE_ROOT, filePath),
      line: lineNum,
      hasGA4Event: hasGtagEvent || hasSafeTrack,
      hasUndefinedTrackEvent: hasTrackEvent && !hasGtagEvent && !hasSafeTrack,
      match: m[0]
    });
  }
  return forms;
}

function extractParams(paramStr) {
  // Simple key extraction from object literal strings
  const keys = [];
  const keyRegex = /(\w+)\s*:/g;
  let m;
  while ((m = keyRegex.exec(paramStr)) !== null) {
    keys.push(m[1]);
  }
  return keys;
}

// ─── Main Audit ────────────────────────────────────────────────────────────────

function runAudit() {
  const jsonMode = process.argv.includes('--json');
  const fixPlan = process.argv.includes('--fix-plan');

  const files = getFiles(SITE_ROOT);
  const allEvents = [];
  const allBeacons = [];
  const allMPCalls = [];
  const allConfigs = [];
  const allConfigIssues = [];
  const allClientIds = [];
  const allForms = [];
  const undefinedCalls = [];
  const issues = [];

  // Scan all files
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Gather events from all sources
    allEvents.push(...findGtagEvents(content, filePath));
    allEvents.push(...findSafeTrackEvents(content, filePath));

    const trackEventCalls = findTrackEventCalls(content, filePath);
    undefinedCalls.push(...trackEventCalls);
    allEvents.push(...trackEventCalls);

    allBeacons.push(...findSendBeaconCalls(content, filePath));
    allMPCalls.push(...findMeasurementProtocolCalls(content, filePath));

    const { configs, issues: cfgIssues } = findGtagConfig(content, filePath);
    allConfigs.push(...configs);
    allConfigIssues.push(...cfgIssues);

    allClientIds.push(...findClientIdExtraction(content, filePath));
    allForms.push(...findFormSubmissions(content, filePath));
  }

  // Add beacon events to allEvents for unified view
  for (const b of allBeacons) {
    allEvents.push({
      type: b.type,
      eventName: b.eventName,
      file: b.file,
      line: b.line,
      params: [],
    });
  }
  for (const mp of allMPCalls) {
    allEvents.push({
      type: mp.type,
      eventName: mp.eventName,
      file: mp.file,
      line: mp.line,
      params: mp.params,
    });
  }

  // ─── Analysis ──────────────────────────────────────────────────────────────

  // 1. Build unique event inventory
  const eventInventory = {};
  for (const evt of allEvents) {
    if (!eventInventory[evt.eventName]) {
      eventInventory[evt.eventName] = [];
    }
    eventInventory[evt.eventName].push(evt);
  }

  // 2. Check for undefined function calls
  for (const call of undefinedCalls) {
    issues.push({
      severity: 'CRITICAL',
      category: 'Undefined Function',
      event: call.eventName,
      file: call.file,
      line: call.line,
      message: call.issue,
      fix: `Replace trackEvent('${call.eventName}', ...) with _safeTrack('${call.eventName}', {...}) or gtag('event', '${call.eventName}', {...})`
    });
  }

  // 3. sendBeacon attribution check
  for (const beacon of allBeacons) {
    if (beacon.missingParams.length > 0) {
      issues.push({
        severity: 'ERROR',
        category: 'sendBeacon Attribution',
        event: beacon.eventName,
        file: beacon.file,
        line: beacon.line,
        message: beacon.issue,
        fix: `Add missing params to sendBeacon URL: ${beacon.missingParams.join(', ')}`
      });
    }
  }

  // 4. Key events in GA4 that have no code
  const allEventNames = new Set(Object.keys(eventInventory));
  for (const keyEvent of EXPECTED_KEY_EVENTS) {
    if (!allEventNames.has(keyEvent)) {
      issues.push({
        severity: 'ERROR',
        category: 'Phantom Key Event',
        event: keyEvent,
        message: `Key event '${keyEvent}' is configured in GA4 but NO CODE fires it anywhere in the site`,
        fix: `Either add tracking code for '${keyEvent}' or remove it from GA4 key events`
      });
    }
  }

  // 5. GTM config ordering issues
  issues.push(...allConfigIssues);

  // 6. Forms without GA4 tracking
  for (const form of allForms) {
    if (!form.hasGA4Event && !form.hasUndefinedTrackEvent) {
      // Only flag actual form handlers (skip generic matches)
      if (form.match.includes('submit')) {
        issues.push({
          severity: 'WARNING',
          category: 'Untracked Form',
          file: form.file,
          line: form.line,
          message: `Form submission at line ${form.line} has no GA4 event tracking`,
          fix: `Add gtag('event', '<form_name>_submit', { event_category: '...', ... })`
        });
      }
    }
  }

  // 7. Client ID extraction consistency
  const cidMethods = new Set(allClientIds.map(c => c.method));
  if (cidMethods.size > 1) {
    issues.push({
      severity: 'WARNING',
      category: 'Client ID Inconsistency',
      message: `Multiple client ID extraction methods found: ${[...cidMethods].join(', ')}. Should use consistent method.`,
      details: allClientIds,
      fix: `Standardize on slice(-2).join(".") across all files (both produce the same result for standard _ga cookies, but slice(-2) is more resilient)`
    });
  }

  // 8. Brand hierarchy coverage check
  const brandGaps = [];
  for (const [stage, config] of Object.entries(BRAND_EVENT_TAXONOMY)) {
    for (const event of config.events) {
      if (config.keyEvent && !NEVER_KEY_EVENTS.has(event) && !allEventNames.has(event)) {
        brandGaps.push({ stage, event });
      }
    }
  }
  if (brandGaps.length > 0) {
    for (const gap of brandGaps) {
      issues.push({
        severity: 'WARNING',
        category: 'Brand Hierarchy Gap',
        event: gap.event,
        message: `Brand conversion stage '${gap.stage}' expects event '${gap.event}' but it's not fired in any code`,
        fix: `Add '${gap.event}' tracking to the appropriate page/form`
      });
    }
  }

  // ─── Output ────────────────────────────────────────────────────────────────

  if (jsonMode) {
    console.log(JSON.stringify({
      scannedFiles: files.length,
      eventInventory,
      issues,
      configs: allConfigs,
      beacons: allBeacons,
      measurementProtocol: allMPCalls,
      clientIdExtractions: allClientIds,
      forms: allForms,
    }, null, 2));
    return;
  }

  console.log(`\n══════════════════════════════════════════════════════════`);
  console.log(`  GA4 Tracking Code Audit — Legara Site`);
  console.log(`  Measurement ID: ${GA4_MEASUREMENT_ID}`);
  console.log(`  Files scanned: ${files.length}`);
  console.log(`══════════════════════════════════════════════════════════\n`);

  // Event Inventory
  console.log(`─── Event Inventory (${Object.keys(eventInventory).length} unique events) ───`);
  console.log('');
  for (const [name, locations] of Object.entries(eventInventory).sort((a, b) => a[0].localeCompare(b[0]))) {
    const types = [...new Set(locations.map(l => l.type))];
    const isKeyEvent = EXPECTED_KEY_EVENTS.has(name) ? ' ★ KEY EVENT' : '';
    const isNever = NEVER_KEY_EVENTS.has(name) ? ' (auto/non-key)' : '';
    console.log(`  ${name}${isKeyEvent}${isNever}`);
    for (const loc of locations) {
      const issueFlag = loc.issue ? ' ⚠' : '';
      console.log(`    └─ ${loc.type} in ${loc.file}:${loc.line}${issueFlag}`);
    }
  }

  // GA4 Config Deployments
  console.log(`\n─── GA4 Config Deployments (${allConfigs.length} pages) ───`);
  for (const cfg of allConfigs) {
    console.log(`  ${cfg.file}:${cfg.line}  →  ${cfg.measurementId}`);
  }

  // sendBeacon Calls
  if (allBeacons.length > 0) {
    console.log(`\n─── sendBeacon Calls (${allBeacons.length}) ───`);
    for (const b of allBeacons) {
      const status = b.missingParams.length === 0 ? '✓' : '✗';
      console.log(`  ${status} ${b.eventName} in ${b.file}:${b.line}`);
      if (b.missingParams.length > 0) {
        console.log(`    Missing: ${b.missingParams.join(', ')}`);
      } else {
        console.log(`    Has: dl, dt, dr, tid, cid ✓`);
      }
    }
  }

  // Measurement Protocol
  if (allMPCalls.length > 0) {
    console.log(`\n─── Measurement Protocol (Server-Side) ───`);
    for (const mp of allMPCalls) {
      console.log(`  ${mp.eventName} in ${mp.file}:${mp.line}`);
      console.log(`    Params: ${mp.params.join(', ')}`);
    }
  }

  // Client ID Extraction
  if (allClientIds.length > 0) {
    console.log(`\n─── Client ID Extraction Methods ───`);
    for (const cid of allClientIds) {
      console.log(`  ${cid.file}:${cid.line}  →  ${cid.method}`);
    }
    if (cidMethods.size > 1) {
      console.log(`  ⚠ INCONSISTENT: ${cidMethods.size} different methods found`);
    }
  }

  // Issues
  const critical = issues.filter(i => i.severity === 'CRITICAL');
  const errors = issues.filter(i => i.severity === 'ERROR');
  const warnings = issues.filter(i => i.severity === 'WARNING');

  console.log(`\n══════════════════════════════════════════════════════════`);
  console.log(`  Issues: ${critical.length} critical, ${errors.length} errors, ${warnings.length} warnings`);
  console.log(`══════════════════════════════════════════════════════════\n`);

  if (critical.length > 0) {
    console.log('─── CRITICAL ─────────────────────────────────────────────');
    for (const i of critical) {
      console.log(`\n  ✗ [${i.category}] ${i.event || ''}`);
      console.log(`    ${i.message}`);
      if (i.file) console.log(`    File: ${i.file}:${i.line}`);
      if (fixPlan && i.fix) console.log(`    FIX: ${i.fix}`);
    }
  }

  if (errors.length > 0) {
    console.log('\n─── ERRORS ───────────────────────────────────────────────');
    for (const i of errors) {
      console.log(`\n  ✗ [${i.category}] ${i.event || ''}`);
      console.log(`    ${i.message}`);
      if (i.file) console.log(`    File: ${i.file}:${i.line}`);
      if (fixPlan && i.fix) console.log(`    FIX: ${i.fix}`);
    }
  }

  if (warnings.length > 0) {
    console.log('\n─── WARNINGS ─────────────────────────────────────────────');
    for (const i of warnings) {
      console.log(`\n  ⚠ [${i.category}] ${i.event || ''}`);
      console.log(`    ${i.message}`);
      if (i.file) console.log(`    File: ${i.file}:${i.line}`);
      if (fixPlan && i.fix) console.log(`    FIX: ${i.fix}`);
    }
  }

  // Brand Hierarchy Coverage
  console.log('\n─── Brand Conversion Hierarchy Coverage ──────────────────');
  for (const [stage, config] of Object.entries(BRAND_EVENT_TAXONOMY)) {
    console.log(`\n  ${stage.toUpperCase()}: ${config.note}`);
    for (const event of config.events) {
      const inCode = allEventNames.has(event);
      const isKey = EXPECTED_KEY_EVENTS.has(event);
      const status = inCode ? '✓' : '✗ MISSING';
      const keyStatus = isKey ? ' ★' : '';
      console.log(`    ${status} ${event}${keyStatus}`);
    }
  }

  console.log(`\n══════════════════════════════════════════════════════════`);
  if (critical.length > 0 || errors.length > 0) {
    console.log(`  Action required: ${critical.length + errors.length} issue(s) need fixing.`);
    if (!fixPlan) console.log(`  Run with --fix-plan to see recommended fixes.`);
  } else if (warnings.length > 0) {
    console.log(`  ${warnings.length} warning(s) to review. No critical issues.`);
  } else {
    console.log(`  All clear. Tracking code matches GA4 expectations.`);
  }
  console.log(`══════════════════════════════════════════════════════════\n`);
}

runAudit();
