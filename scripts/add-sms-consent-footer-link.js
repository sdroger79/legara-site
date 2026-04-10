#!/usr/bin/env node
/**
 * Idempotent footer link injector: adds <a href="sms-consent.html">SMS Consent</a>
 * after the Contact link inside the Company footer column on every listed page.
 *
 * Usage: node scripts/add-sms-consent-footer-link.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const FILES = [
  'about.html',
  'assessment.html',
  'become-a-provider.html',
  'blog-11-month-blind-spot.html',
  'blog-229k-therapist.html',
  'blog-9-health-centers-one-question.html',
  'blog-doc-in-the-box.html',
  'blog-federal-funding-roulette.html',
  'blog.html',
  'contact.html',
  'for-health-centers.html',
  'how-it-works.html',
  'index.html',
  'partners.html',
  'press-legara-launch.html',
  'press.html',
  'roi-calculator-internal.html',
  'roi-calculator.html',
  'sms-consent.html',
];

let updated = 0;
let alreadyHas = 0;
let notFound = 0;

for (const file of FILES) {
  const filePath = path.join(ROOT, file);
  if (!fs.existsSync(filePath)) {
    console.log(`MISSING FILE: ${file}`);
    notFound++;
    continue;
  }

  const original = fs.readFileSync(filePath, 'utf8');

  // Locate the Company column region. Find <h4>Company</h4> and the next </div>.
  const companyHeaderIdx = original.indexOf('<h4>Company</h4>');
  if (companyHeaderIdx === -1) {
    console.log(`already-has-link or footer-pattern-not-found: ${file} (no Company h4)`);
    notFound++;
    continue;
  }
  const closeDivIdx = original.indexOf('</div>', companyHeaderIdx);
  if (closeDivIdx === -1) {
    console.log(`footer-pattern-not-found: ${file} (no closing </div> after Company h4)`);
    notFound++;
    continue;
  }

  const companyBlock = original.slice(companyHeaderIdx, closeDivIdx);

  // Idempotency check: if sms-consent.html already in the Company block, skip.
  if (companyBlock.includes('sms-consent.html')) {
    console.log(`already-has-link: ${file}`);
    alreadyHas++;
    continue;
  }

  // Find the Contact link within the Company block.
  const contactLineRegex = /([ \t]*)<a href="contact\.html">Contact<\/a>\n/;
  const match = companyBlock.match(contactLineRegex);
  if (!match) {
    console.log(`footer-pattern-not-found: ${file} (no Contact link in Company column)`);
    notFound++;
    continue;
  }

  const indent = match[1];
  const insertion = `${indent}<a href="sms-consent.html">SMS Consent</a>\n`;

  // Splice the new line in right after the Contact line, within the company block region.
  const contactLineAbsStart = companyHeaderIdx + match.index;
  const contactLineAbsEnd = contactLineAbsStart + match[0].length;
  const updatedContent =
    original.slice(0, contactLineAbsEnd) +
    insertion +
    original.slice(contactLineAbsEnd);

  fs.writeFileSync(filePath, updatedContent, 'utf8');
  console.log(`updated: ${file}`);
  updated++;
}

console.log('');
console.log(`Summary: ${updated} updated, ${alreadyHas} already-has-link, ${notFound} not-found`);
