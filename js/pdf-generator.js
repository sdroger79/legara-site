// ═══ LEGARA ROI REPORT PDF GENERATOR ═══
// Requires jsPDF + jspdf-autotable loaded via CDN before this script

var LEGARA_LOGO_B64 = 'PLACEHOLDER';

// Load logo as base64 at init
(function() {
  var canvas = document.createElement('canvas');
  var img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = function() {
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext('2d').drawImage(img, 0, 0);
    LEGARA_LOGO_B64 = canvas.toDataURL('image/png');
  };
  img.src = 'img/logo.png';
})();

var GREEN = [26, 107, 74];
var DARK = [26, 43, 34];
var MUTED = [90, 107, 98];
var RED = [192, 57, 43];
var ALT_ROW = [245, 247, 246];
var WHITE = [255, 255, 255];
var MARGIN = 54; // 0.75in
var PAGE_W = 612;
var PAGE_H = 792;
var CONTENT_W = PAGE_W - MARGIN * 2;
var CONTENT_TOP = 72; // y where content starts on pages with header

// Compute ROI data for any provider type using DEFAULTS + BAKED constants
function computeForType(type, ppsRate) {
  var def = DEFAULTS[type];
  var salary = def.salary;
  var encPerHour = def.encPerHour;
  var legaraRate = def.legaraRate;
  var multiplier = BAKED.loadedMultiplier;
  var recruiterFee = BAKED.recruiterFee;
  var turnover = BAKED.turnoverRate;
  var pps = ppsRate || 230;

  var fullyLoaded = salary * multiplier;
  var benefitsCost = fullyLoaded - salary;
  var supportCost = SUPPORT_STAFF_COST;
  var ptoWeeks = BAKED.ptoDays / 5;
  var availWeeks = 52 - ptoWeeks;
  var effectiveHours = BAKED.scheduledHours * (1 - 0.04);
  var effectiveEncPerWeek = effectiveHours * encPerHour * (1 - 0.18);
  var fullYearEnc = effectiveEncPerWeek * availWeeks;

  var onboardMonths = BAKED.onboardWeeks / 4.33;
  var credPanelOverlap = Math.min(BAKED.credentialMonths, BAKED.payerPanelMonths) * 0.5;
  var credPanelMonths = BAKED.credentialMonths + BAKED.payerPanelMonths - credPanelOverlap;
  var totalRampMonths = BAKED.recruitMonths + onboardMonths + credPanelMonths + BAKED.panelBuildMonths;

  function phaseEnc(months, productivity) {
    var weeks = months * 4.33;
    var pto = ptoWeeks * (months / 12);
    return effectiveEncPerWeek * Math.max(weeks - pto, 0) * productivity;
  }

  var internalEnc1 =
    phaseEnc(BAKED.recruitMonths, 0) +
    phaseEnc(onboardMonths, 0) +
    phaseEnc(credPanelMonths, 0.25) +
    phaseEnc(BAKED.panelBuildMonths, 0.65) +
    phaseEnc(Math.max(12 - totalRampMonths, 0), 1.0);

  var monthsOnPayroll = Math.max(12 - BAKED.recruitMonths, 0);
  var proratedSalary = fullyLoaded * (monthsOnPayroll / 12);
  var proratedSupport = supportCost * (monthsOnPayroll / 12);
  var internalCostYear1 = proratedSalary + proratedSupport + recruiterFee;
  var internalCPE1 = internalEnc1 > 0 ? internalCostYear1 / internalEnc1 : 0;
  var cfoBudget = salary + benefitsCost;
  var cfoCPE = fullYearEnc > 0 ? cfoBudget / fullYearEnc : 0;

  var legaraProdMonths1 = Math.max(12 - LEGARA_RAMP_MONTHS, 0);
  var legaraProdWeeks1 = legaraProdMonths1 * 4.33;
  var legaraPTOWeeks1 = ptoWeeks * (legaraProdMonths1 / 12);
  var legaraEnc1 = effectiveEncPerWeek * Math.max(legaraProdWeeks1 - legaraPTOWeeks1, 0);
  var legaraCostYear1 = legaraEnc1 * legaraRate;

  var turnoverCost = turnover * (recruiterFee + fullyLoaded * Math.min(totalRampMonths / 12, 1) * 0.5);
  var internalCostSteady = fullyLoaded + supportCost + turnoverCost;
  var legaraCostSteady = fullYearEnc * legaraRate;

  var legaraNetPerEnc = pps - legaraRate;
  var legaraCashYear1 = legaraEnc1 * legaraNetPerEnc;
  var legaraCashSteady = fullYearEnc * legaraNetPerEnc;
  var internalCashYear1 = (internalEnc1 * pps) - internalCostYear1;
  var internalCashSteady = (fullYearEnc * pps) - internalCostSteady;

  var year1Savings = internalCostYear1 - legaraCostYear1;
  var year2Savings = internalCostSteady - legaraCostSteady;
  var total3Yr = year1Savings + year2Savings + year2Savings;
  var missionAdvY1 = legaraCashYear1 - internalCashYear1;
  var missionAdvSteady = legaraCashSteady - internalCashSteady;
  var missionAdvantage3Yr = (legaraCashYear1 + legaraCashSteady * 2) - (internalCashYear1 + internalCashSteady * 2);

  return {
    label: def.label, salary: salary, multiplier: multiplier,
    benefitsCost: Math.round(benefitsCost), fullyLoaded: Math.round(fullyLoaded),
    supportCost: supportCost, recruiterFee: recruiterFee,
    internalCostYear1: Math.round(internalCostYear1),
    internalEnc1: Math.round(internalEnc1), internalCPE1: internalCPE1,
    cfoBudget: Math.round(cfoBudget), cfoCPE: Math.round(cfoCPE),
    fullYearEnc: Math.round(fullYearEnc),
    legaraRate: legaraRate, legaraEnc1: Math.round(legaraEnc1),
    legaraCostYear1: Math.round(legaraCostYear1),
    legaraCashYear1: Math.round(legaraCashYear1),
    legaraCashSteady: Math.round(legaraCashSteady),
    internalCashYear1: Math.round(internalCashYear1),
    internalCashSteady: Math.round(internalCashSteady),
    year1Savings: Math.round(year1Savings), total3Yr: Math.round(total3Yr),
    missionAdvY1: Math.round(missionAdvY1),
    missionAdvSteady: Math.round(missionAdvSteady),
    missionAdvantage3Yr: Math.round(missionAdvantage3Yr),
    monthsOnPayroll: Math.round(12 - BAKED.recruitMonths),
    totalRampMonths: Math.round(totalRampMonths),
    legaraCash3Yr: Math.round(legaraCashYear1 + legaraCashSteady * 2),
    internalCash3Yr: Math.round(internalCashYear1 + internalCashSteady * 2)
  };
}

function generateReport(orgName) {
  console.log('[PDF] Starting report generation for:', orgName);
  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF({ unit: 'pt', format: 'letter' });
  var d = lastCalc;
  var y;
  var pageNum = 0; // incremented by newPage()

  // ─── HELPERS ───
  function addFooter() {
    doc.setFontSize(8);
    doc.setTextColor.apply(doc, MUTED);
    doc.setFont('helvetica', 'normal');
    doc.text('Legara Behavioral Health Platform | golegara.com', MARGIN, PAGE_H - 30);
    doc.text('Page ' + pageNum, PAGE_W - MARGIN, PAGE_H - 30, { align: 'right' });
  }

  function addHeader() {
    try {
      if (LEGARA_LOGO_B64 && LEGARA_LOGO_B64 !== 'PLACEHOLDER') {
        doc.addImage(LEGARA_LOGO_B64, 'PNG', MARGIN, 18, 72, 24);
      }
    } catch (e) {
      console.warn('[PDF] Header logo failed:', e);
    }
    doc.setDrawColor.apply(doc, GREEN);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, 54, PAGE_W - MARGIN, 54);
  }

  // Start a new page with header. Returns the y position for content.
  function newPage() {
    if (pageNum > 0) addFooter(); // footer for the page we're leaving
    doc.addPage();
    pageNum++;
    addHeader();
    return CONTENT_TOP;
  }

  // How much vertical space remains before the footer area
  function remaining(currentY) {
    return PAGE_H - 50 - currentY; // 50pt reserved for footer
  }

  function heading(text, yPos, size) {
    doc.setFontSize(size || 16);
    doc.setTextColor.apply(doc, GREEN);
    doc.setFont('helvetica', 'bold');
    doc.text(text, MARGIN, yPos);
    return yPos + (size || 16) + 6;
  }

  function subheading(text, yPos) {
    doc.setFontSize(12);
    doc.setTextColor.apply(doc, DARK);
    doc.setFont('helvetica', 'bold');
    doc.text(text, MARGIN, yPos);
    return yPos + 16;
  }

  function bodyText(text, yPos, opts) {
    doc.setFontSize(10);
    doc.setTextColor.apply(doc, DARK);
    doc.setFont('helvetica', 'normal');
    var lines = doc.splitTextToSize(text, (opts && opts.width) || CONTENT_W);
    doc.text(lines, (opts && opts.x) || MARGIN, yPos);
    return yPos + lines.length * 13;
  }

  function fmtD(n) { return '$' + Math.round(Math.abs(n)).toLocaleString(); }
  function fmtDSigned(n) { return n >= 0 ? '+$' + Math.round(n).toLocaleString() : '-$' + Math.round(Math.abs(n)).toLocaleString(); }
  function fmtK(n) {
    if (Math.abs(n) >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
    if (Math.abs(n) >= 1000) return '$' + (n / 1000).toFixed(0) + 'K';
    return '$' + Math.round(n);
  }

  function statBox(x, yPos, w, label, value, color) {
    doc.setFillColor(245, 247, 246);
    doc.roundedRect(x, yPos, w, 54, 4, 4, 'F');
    doc.setFontSize(9);
    doc.setTextColor.apply(doc, MUTED);
    doc.setFont('helvetica', 'normal');
    doc.text(label, x + w / 2, yPos + 16, { align: 'center' });
    doc.setFontSize(20);
    doc.setTextColor.apply(doc, color || GREEN);
    doc.setFont('helvetica', 'bold');
    doc.text(value, x + w / 2, yPos + 40, { align: 'center' });
  }

  function autoTable(yPos, head, body, opts) {
    doc.autoTable({
      startY: yPos,
      margin: { left: MARGIN, right: MARGIN },
      head: [head],
      body: body,
      headStyles: { fillColor: GREEN, textColor: WHITE, fontSize: 9, fontStyle: 'bold', halign: 'center' },
      bodyStyles: { fontSize: 9, textColor: DARK },
      alternateRowStyles: { fillColor: ALT_ROW },
      columnStyles: opts && opts.columnStyles || {},
      styles: { cellPadding: 5, lineWidth: 0 },
      theme: 'plain',
      didParseCell: opts && opts.didParseCell || undefined
    });
    return doc.lastAutoTable.finalY + 12;
  }

  // ═══════════════════════════════════════════
  // PAGE 1: PERSONALIZED RESULTS COVER
  // ═══════════════════════════════════════════
  console.log('[PDF] Page 1: Cover');
  pageNum = 1;
  try {
    if (LEGARA_LOGO_B64 && LEGARA_LOGO_B64 !== 'PLACEHOLDER') {
      doc.addImage(LEGARA_LOGO_B64, 'PNG', MARGIN, MARGIN, 120, 40);
    }
  } catch (logoErr) {
    console.warn('[PDF] Logo failed to load, skipping:', logoErr);
  }
  y = 120;

  doc.setFontSize(28);
  doc.setTextColor.apply(doc, DARK);
  doc.setFont('helvetica', 'bold');
  doc.text('Your Behavioral Health', MARGIN, y);
  y += 34;
  doc.text('ROI Analysis', MARGIN, y);
  y += 48;

  doc.setFontSize(14);
  doc.setTextColor.apply(doc, MUTED);
  doc.setFont('helvetica', 'normal');
  doc.text('Prepared for ' + orgName, MARGIN, y);
  y += 22;

  var today = new Date();
  doc.setFontSize(10);
  doc.text(today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), MARGIN, y);
  y += 14;
  doc.text('Provider type: ' + d.providerLabel + '  |  Base salary: ' + fmtD(d.salary), MARGIN, y);
  y += 40;

  // Divider
  doc.setDrawColor.apply(doc, GREEN);
  doc.setLineWidth(2);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 28;

  // Three stat boxes
  var boxW = (CONTENT_W - 20) / 3;
  statBox(MARGIN, y, boxW, 'Year 1 Mission Cash', fmtK(d.year1Savings), GREEN);
  statBox(MARGIN + boxW + 10, y, boxW, '3-Year Mission Cash', fmtK(d.total3Yr), GREEN);
  statBox(MARGIN + (boxW + 10) * 2, y, boxW, 'Internal Cost/Encounter', fmtD(d.internalCPE1), RED);
  y += 74;

  // Summary text
  y = bodyText('Based on your inputs, adding Legara\'s encounter-based model to your workforce strategy could generate ' + fmtK(d.missionAdvantage3Yr || d.total3Yr) + ' more cash for your mission over three years. Your internal cost per completed behavioral health encounter is ' + fmtD(d.internalCPE1) + ' in Year 1, compared to a Legara encounter rate of ' + fmtD(d.legaraRate) + '.*', y);
  y += 6;
  y = bodyText('The following pages break down the detailed comparison, explain why Legara providers achieve significantly higher utilization, and include our full study on behavioral health economics for California Federally Qualified Health Centers (FQHCs).', y);

  addFooter();

  // ═══════════════════════════════════════════
  // PAGE 2: DETAILED COST COMPARISON
  // ═══════════════════════════════════════════
  console.log('[PDF] Page 2: Cost comparison');
  y = newPage();

  y = heading('Detailed Cost Comparison', y, 18);
  y += 4;

  y = subheading('True Cost of Hiring Internally (Year 1)', y);
  y = autoTable(y,
    ['Cost Component', 'Amount'],
    [
      ['Base salary (' + d.monthsOnPayroll + ' months on payroll)', fmtD(d.salary)],
      ['Benefits & taxes (' + (d.multiplier || 1.4) + 'x multiplier)', fmtD(d.benefitsCost)],
      ['Support staff (0.25 FTE PSR)', fmtD(d.supportCost)],
      ['Recruiter / placement fee', fmtD(d.recruiterFee)],
      [{ content: 'Total 12-Month Cost', styles: { fontStyle: 'bold' } }, { content: fmtD(d.internalCostYear1), styles: { fontStyle: 'bold' } }],
      ['Year 1 completed encounters', d.internalEnc1.toLocaleString()],
      [{ content: 'Cost Per Encounter', styles: { fontStyle: 'bold', textColor: RED } }, { content: fmtD(d.internalCPE1), styles: { fontStyle: 'bold', textColor: RED } }]
    ],
    { columnStyles: { 0: { cellWidth: CONTENT_W * 0.65 }, 1: { halign: 'right' } } }
  );

  y = subheading('With Legara (Year 1)', y);
  y = autoTable(y,
    ['', 'Amount'],
    [
      ['Legara encounter rate (' + d.providerLabel + ')', fmtD(d.legaraRate)],
      ['Year 1 completed encounters', d.legaraEnc1.toLocaleString()],
      [{ content: 'Total Cost Year 1', styles: { fontStyle: 'bold' } }, { content: fmtD(d.legaraCostYear1), styles: { fontStyle: 'bold' } }]
    ],
    { columnStyles: { 0: { cellWidth: CONTENT_W * 0.65 }, 1: { halign: 'right' } } }
  );

  y = subheading('Cash Generated for Your Mission', y);

  function missionColor(n) { return n >= 0 ? GREEN : RED; }

  y = autoTable(y,
    ['', 'Year 1', 'Year 2', 'Year 3', '3-Year Total'],
    [
      ['With Legara', fmtD(d.legaraCashYear1), fmtD(d.legaraCashSteady), fmtD(d.legaraCashSteady), fmtD(d.legaraCash3Yr)],
      ['Internal Hire', fmtD(d.internalCashYear1), fmtD(d.internalCashSteady), fmtD(d.internalCashSteady), fmtD(d.internalCash3Yr)],
      [{ content: 'Legara Advantage', styles: { fontStyle: 'bold' } },
        { content: fmtDSigned(d.missionAdvY1), styles: { fontStyle: 'bold', textColor: missionColor(d.missionAdvY1) } },
        { content: fmtDSigned(d.missionAdvSteady), styles: { fontStyle: 'bold', textColor: missionColor(d.missionAdvSteady) } },
        { content: fmtDSigned(d.missionAdvSteady), styles: { fontStyle: 'bold', textColor: missionColor(d.missionAdvSteady) } },
        { content: fmtDSigned(d.missionAdvantage3Yr), styles: { fontStyle: 'bold', textColor: missionColor(d.missionAdvantage3Yr) } }]
    ],
    { columnStyles: { 0: { cellWidth: CONTENT_W * 0.28 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } } }
  );

  y = bodyText('Timeline: Internal hires take approximately ' + d.totalRampMonths + ' months to reach full productivity (recruiting, onboarding, credentialing, payer enrollment, and caseload building). Legara providers are typically seeing patients within 5 months, at zero cost to your health center during the ramp period.', y);

  // Utilization callout + CTA block
  doc.setFontSize(9);
  var ecoText = 'Three things that don\'t exist inside a traditional employment model: a workforce network built around clinician autonomy, an operational layer that eliminates every administrative distraction, and a financial architecture that removes cash flow uncertainty. The structure changes the math. We\'re happy to walk through exactly how this applies to your specific organization.';
  var ecoLines = doc.splitTextToSize(ecoText, CONTENT_W - 24);
  var calloutBoxH = 36 + ecoLines.length * 12 + 10;
  var ctaBlockH = calloutBoxH + 12 + 52; // callout + gap + CTA bar

  // Break to new page if callout + CTA won't fit
  if (remaining(y) < ctaBlockH + 20) {
    addFooter();
    y = newPage();
  }

  y += 10;
  doc.setFillColor(232, 245, 238);
  doc.roundedRect(MARGIN, y, CONTENT_W, calloutBoxH, 4, 4, 'F');
  doc.setFontSize(10);
  doc.setTextColor.apply(doc, GREEN);
  doc.setFont('helvetica', 'bold');
  doc.text('Why is Legara\'s provider utilization significantly higher than industry norms?', MARGIN + 12, y + 16);
  doc.setFontSize(9);
  doc.setTextColor.apply(doc, DARK);
  doc.setFont('helvetica', 'normal');
  doc.text(ecoLines, MARGIN + 12, y + 30);
  y += calloutBoxH + 10;

  doc.setFillColor.apply(doc, GREEN);
  doc.roundedRect(MARGIN, y, CONTENT_W, 48, 4, 4, 'F');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('Want to turn these estimates into your organization\'s actual business case?', MARGIN + 12, y + 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Schedule a 30-minute conversation with Roger: cal.com/roger-golegara.com/legara-roi-review', MARGIN + 12, y + 34);
  y += 56;

  addFooter();

  // ═══════════════════════════════════════════
  // PAGE 3: OPERATIONAL MODEL
  // ═══════════════════════════════════════════
  console.log('[PDF] Page 3: Operational model');
  y = newPage();

  y = heading('The Operational Infrastructure Behind Every Provider', y, 16);
  y += 4;

  y = bodyText('Legara is not a staffing agency that places a clinician and walks away. Every provider deployed through Legara is backed by dedicated operational infrastructure designed to maximize utilization, minimize disruption, and ensure care quality. This infrastructure is the product of a decade of FQHC workforce deployments.', y);
  y += 8;

  y = subheading('Patient Service Representatives (PSRs)', y);
  y = bodyText('Every Legara clinician is supported by a dedicated, full-time Patient Service Representative. Each PSR handles no more than 3 to 4 providers. They coordinate scheduling within your EHR, manage patient flow, follow through on documentation, and handle administrative overhead. PSRs are the reason utilization runs at 82%, no-shows stay low, and every chart note is complete and locked within 24 hours. When you add a second or third provider, you are not building new infrastructure. You are assigning a PSR who already knows your workflows.', y);
  y += 8;

  y = subheading('Partner Relationship Owners (PROs)', y);
  y = bodyText('Every health center has a named Partner Relationship Owner as their single point of contact at Legara. Each PRO serves 2 to 5 health centers. Their job is making the partnership work on both sides: coordinating with your BH Director as a peer, managing the operational relationship, handling escalations, and ensuring nothing falls through the cracks. One call, one person, one answer.', y);
  y += 8;

  y = subheading('Quality Assurance Protocols', y);
  y = bodyText('Every encounter is documented and locked within 24 hours. Biweekly nonclinical chart spot-checks cover a minimum of 3% of all encounters or five per clinician, whichever is greater. Findings are delivered to your Compliance Officer within ten banking days. Clinical QA and QI oversight remain entirely with your health center.', y);
  y += 8;

  y = subheading('Compliance Architecture', y);
  y = bodyText('Legara operates through a three-entity structure designed around California\'s corporate practice of medicine law. Your health center retains full clinical authority, credentialing and privileging control, scheduling approval, and billing responsibility. Legara never exercises clinical control over any clinician. Compensation is fixed per encounter, not tied to referral volume. Financial flows are separated through a dedicated clearinghouse. The Clinician Facilitation Agreement is structured for HRSA operational site visit review.', y);
  y += 12;

  // Performance stats row
  var opsStatsY = y;
  var opsStatW = (CONTENT_W - 30) / 4;

  doc.setFillColor(240, 247, 243);
  doc.roundedRect(MARGIN, opsStatsY, CONTENT_W, 50, 3, 3, 'F');

  var opsStats = [
    { num: '<3%', label: 'Annual Turnover' },
    { num: '82%', label: 'Provider Utilization' },
    { num: '24hrs', label: 'Chart Completion' },
    { num: '4.76', label: 'Patient Satisfaction' }
  ];

  opsStats.forEach(function(stat, i) {
    var x = MARGIN + 10 + (i * (opsStatW + 10));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(26, 107, 74);
    doc.text(stat.num, x + opsStatW/2, opsStatsY + 20, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(136, 136, 136);
    doc.text(stat.label, x + opsStatW/2, opsStatsY + 32, { align: 'center' });
  });

  y = opsStatsY + 60;

  // Callout box
  doc.setFillColor(26, 107, 74);
  doc.roundedRect(MARGIN, y, CONTENT_W, 40, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('This operational layer is why the numbers work.', MARGIN + 12, y + 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Nobody else in this space builds dedicated support infrastructure around every provider. That is what', MARGIN + 12, y + 27);
  doc.text('produces 82% utilization, under 3% turnover, and the financial results on the previous page.', MARGIN + 12, y + 35);

  addFooter();

  // ═══════════════════════════════════════════
  // PAGE 4: ECONOMICS STUDY - INTRO
  // ═══════════════════════════════════════════
  console.log('[PDF] Page 4: Economics intro');
  y = newPage();

  doc.setFontSize(20);
  doc.setTextColor.apply(doc, GREEN);
  doc.setFont('helvetica', 'bold');
  doc.text('Behavioral Health Economics', MARGIN, y);
  y += 24;
  doc.text('for California FQHCs', MARGIN, y);
  y += 36;

  // Three stat boxes
  statBox(MARGIN, y, boxW, 'California FQHCs', '174', DARK);
  statBox(MARGIN + boxW + 10, y, boxW, 'Counties Served', 'All 58', DARK);
  statBox(MARGIN + (boxW + 10) * 2, y, boxW, 'Behavioral Health Deficit', '40.6%', RED);
  y += 74;

  y = bodyText('California\u2019s Prospective Payment System (PPS) creates strong economics for behavioral health encounters at FQHCs, where rates of $200\u2013$350+ per visit make behavioral health services among the most reimbursable in community health. But the employment model that most centers use to deliver those services is quietly eroding the financial advantage.', y);
  y += 6;
  y = bodyText('The true cost of an employed behavioral health provider, once you account for benefits, taxes, recruitment, ramp time, support staff, and turnover, routinely exceeds what most CFOs budget. And the gap between what you\u2019re paying and what you\u2019re collecting per encounter is often far wider than it appears on a spreadsheet.', y);
  y += 12;

  y = heading('1. The Cost Structure FQHCs Underestimate', y);

  y = bodyText('When an FQHC hires a behavioral health provider, the CFO typically budgets for salary plus benefits. But the real 12-month cost includes recruiter fees, onboarding, credentialing lag (3\u20136 months of salary before the first billable encounter), payer enrollment delays, support staff, and a ramp period where the provider is being paid at full salary but producing a fraction of their eventual output.', y);
  y += 6;

  // Primary: prospect's chosen provider type with their actual data
  var ppsRate = d.legaraRate ? (d.legaraCashYear1 / d.legaraEnc1 + d.legaraRate) : 230;
  if (isNaN(ppsRate) || ppsRate <= 0) ppsRate = 230;

  y = subheading(d.providerLabel + ' at ' + fmtD(d.salary) + ' Base (Your Data)', y);
  y = autoTable(y,
    ['', 'CFO Budget', '12-Month Reality'],
    [
      ['Base salary', fmtD(d.salary), fmtD(d.salary)],
      ['Benefits & taxes (' + (d.multiplier || 1.4) + 'x)', fmtD(d.benefitsCost), fmtD(d.benefitsCost)],
      ['Recruiter fee', '-', fmtD(d.recruiterFee)],
      ['Support staff (0.25 FTE)', '-', fmtD(d.supportCost)],
      [{ content: 'Total Cost', styles: { fontStyle: 'bold' } }, { content: fmtD((d.salary + d.benefitsCost)), styles: { fontStyle: 'bold' } }, { content: fmtD(d.internalCostYear1), styles: { fontStyle: 'bold' } }],
      ['Completed encounters (Year 1)', '~' + d.fullYearEncounters.toLocaleString(), '~' + d.internalEnc1.toLocaleString()],
      [{ content: 'Cost per encounter', styles: { fontStyle: 'bold' } }, { content: fmtD((d.salary + d.benefitsCost) / d.fullYearEncounters), styles: { fontStyle: 'bold' } }, { content: fmtD(d.internalCPE1), styles: { fontStyle: 'bold', textColor: RED } }]
    ],
    { columnStyles: { 0: { cellWidth: CONTENT_W * 0.45 }, 1: { halign: 'right' }, 2: { halign: 'right' } } }
  );

  // Secondary: contrasting provider type
  var contrastType = (currentType === 'lcsw_lmft' || currentType === 'psychologist') ? 'pmhnp' : 'lcsw_lmft';
  var c = computeForType(contrastType, 230);

  if (remaining(y) < 160) {
    addFooter();
    y = newPage();
  }

  y = subheading(c.label + ' at ' + fmtD(c.salary) + ' Base (Comparison)', y);
  y = autoTable(y,
    ['', 'CFO Budget', '12-Month Reality'],
    [
      ['Base salary', fmtD(c.salary), fmtD(c.salary)],
      ['Benefits & taxes (1.4x)', fmtD(c.benefitsCost), fmtD(c.benefitsCost)],
      ['Recruiter fee', '-', fmtD(c.recruiterFee)],
      ['Support staff (0.25 FTE)', '-', fmtD(c.supportCost)],
      [{ content: 'Total Cost', styles: { fontStyle: 'bold' } }, { content: fmtD(c.cfoBudget), styles: { fontStyle: 'bold' } }, { content: fmtD(c.internalCostYear1), styles: { fontStyle: 'bold' } }],
      ['Completed encounters (Year 1)', '~' + c.fullYearEnc.toLocaleString(), '~' + c.internalEnc1.toLocaleString()],
      [{ content: 'Cost per encounter', styles: { fontStyle: 'bold' } }, { content: fmtD(c.cfoCPE), styles: { fontStyle: 'bold' } }, { content: fmtD(c.internalCPE1), styles: { fontStyle: 'bold', textColor: RED } }]
    ],
    { columnStyles: { 0: { cellWidth: CONTENT_W * 0.45 }, 1: { halign: 'right' }, 2: { halign: 'right' } } }
  );

  addFooter();

  // ═══════════════════════════════════════════
  // PAGE 5: CASH GENERATED YEAR-BY-YEAR
  // ═══════════════════════════════════════════
  console.log('[PDF] Page 5: Cash generated');
  y = newPage();

  y = heading('2. Cash Generated for Your Mission: Year-by-Year', y);

  y = bodyText('Every behavioral health encounter generates revenue. The question isn\u2019t whether you should offer behavioral health services. It\u2019s which model generates more cash to reinvest in your mission. Below, we compare the net cash each model produces annually.', y);
  y += 6;

  // Primary: prospect's actual data
  y = subheading(d.providerLabel + ' (Your Data)', y);
  y = autoTable(y,
    ['', 'Year 1', 'Year 2', 'Year 3', '3-Year Total'],
    [
      ['With Legara', fmtD(d.legaraCashYear1), fmtD(d.legaraCashSteady), fmtD(d.legaraCashSteady), fmtD(d.legaraCash3Yr)],
      ['Internal Hire', fmtD(d.internalCashYear1), fmtD(d.internalCashSteady), fmtD(d.internalCashSteady), fmtD(d.internalCash3Yr)],
      [{ content: 'Legara Advantage', styles: { fontStyle: 'bold' } },
        { content: fmtDSigned(d.missionAdvY1), styles: { fontStyle: 'bold', textColor: missionColor(d.missionAdvY1) } },
        { content: fmtDSigned(d.missionAdvSteady), styles: { fontStyle: 'bold', textColor: missionColor(d.missionAdvSteady) } },
        { content: fmtDSigned(d.missionAdvSteady), styles: { fontStyle: 'bold', textColor: missionColor(d.missionAdvSteady) } },
        { content: fmtDSigned(d.missionAdvantage3Yr), styles: { fontStyle: 'bold', textColor: missionColor(d.missionAdvantage3Yr) } }]
    ],
    { columnStyles: { 0: { cellWidth: CONTENT_W * 0.28 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } } }
  );

  // Secondary: contrasting provider type
  y = subheading(c.label + ' (Comparison)', y);
  y = autoTable(y,
    ['', 'Year 1', 'Year 2', 'Year 3', '3-Year Total'],
    [
      ['With Legara', fmtD(c.legaraCashYear1), fmtD(c.legaraCashSteady), fmtD(c.legaraCashSteady), fmtD(c.legaraCash3Yr)],
      ['Internal Hire', fmtD(c.internalCashYear1), fmtD(c.internalCashSteady), fmtD(c.internalCashSteady), fmtD(c.internalCash3Yr)],
      [{ content: 'Legara Advantage', styles: { fontStyle: 'bold' } },
        { content: fmtDSigned(c.missionAdvY1), styles: { fontStyle: 'bold', textColor: missionColor(c.missionAdvY1) } },
        { content: fmtDSigned(c.missionAdvSteady), styles: { fontStyle: 'bold', textColor: missionColor(c.missionAdvSteady) } },
        { content: fmtDSigned(c.missionAdvSteady), styles: { fontStyle: 'bold', textColor: missionColor(c.missionAdvSteady) } },
        { content: fmtDSigned(c.missionAdvantage3Yr), styles: { fontStyle: 'bold', textColor: missionColor(c.missionAdvantage3Yr) } }]
    ],
    { columnStyles: { 0: { cellWidth: CONTENT_W * 0.28 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } } }
  );

  // Year 1 callout box
  doc.setFillColor(245, 247, 246);
  doc.roundedRect(MARGIN, y, CONTENT_W, 68, 4, 4, 'F');
  doc.setFontSize(10);
  doc.setTextColor.apply(doc, GREEN);
  doc.setFont('helvetica', 'bold');
  doc.text('Why does the internal hire lose cash in Year 1?', MARGIN + 12, y + 18);
  doc.setFontSize(9);
  doc.setTextColor.apply(doc, DARK);
  doc.setFont('helvetica', 'normal');
  var calloutLines = doc.splitTextToSize('Because you\u2019re paying full salary and benefits during the 3\u20136 month ramp period (recruiting, credentialing, payer enrollment, caseload building) while generating few or no billable encounters. The provider\u2019s cost is front-loaded, but their revenue is back-loaded. Legara charges $0 during ramp. You only pay for completed encounters.', CONTENT_W - 24);
  doc.text(calloutLines, MARGIN + 12, y + 32);
  y += 80;

  y = bodyText('The gap is most dramatic in Year 1 because of the ramp period. By Year 2, internal hires reach steady state, but even at full productivity the employment model\u2019s overhead (benefits, taxes, support staff, turnover costs) means you keep less of each encounter\u2019s revenue.', y);

  addFooter();

  // ═══════════════════════════════════════════
  // PAGE 6: MISSION CASH ADVANTAGE + STEADY STATE
  // ═══════════════════════════════════════════
  console.log('[PDF] Page 6: Mission cash advantage');
  y = newPage();

  y = subheading('Mission Cash Advantage by Provider Type', y);

  // Compute for all 4 provider types
  var allTypes = ['lcsw_lmft', 'psychologist', 'pmhnp', 'psychiatrist'];
  var allRows = allTypes.map(function(t) {
    var r = computeForType(t, 230);
    var isSelected = (t === currentType);
    var rowLabel = r.label + ' (' + fmtD(r.salary) + ')';
    return [
      isSelected ? { content: rowLabel, styles: { fontStyle: 'bold' } } : rowLabel,
      isSelected ? { content: fmtD(r.year1Savings), styles: { fontStyle: 'bold' } } : fmtD(r.year1Savings),
      isSelected ? { content: fmtD(r.total3Yr - r.year1Savings) + '/yr', styles: { fontStyle: 'bold' } } : fmtD((r.total3Yr - r.year1Savings) / 2) + '/yr',
      isSelected ? { content: fmtD(r.total3Yr), styles: { fontStyle: 'bold', textColor: GREEN } } : fmtD(r.total3Yr)
    ];
  });

  y = autoTable(y,
    ['Provider Type', 'Year 1 Advantage', 'Year 2-3 Advantage', '3-Year Total'],
    allRows,
    { columnStyles: { 0: { cellWidth: CONTENT_W * 0.3 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } } }
  );

  y = subheading('Steady-State Cost Per Encounter Comparison', y);

  y = autoTable(y,
    ['Provider Type', 'Internal CPE', 'Legara Encounter Rate*', 'Difference/Encounter'],
    [
      ['LCSW/LMFT', '$174', '$148\u2013$168', '$6\u2013$26'],
      ['Psychologist', '$199', '$158\u2013$178', '$21\u2013$41'],
      ['PMHNP', '$175', '$158\u2013$176', '$0\u2013$17'],
      ['Psychiatrist', '$214', '$173\u2013$188', '$26\u2013$41']
    ],
    {
      columnStyles: { 0: { cellWidth: CONTENT_W * 0.3 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      didParseCell: function(data) {
        if (data.section === 'body' && data.column.index === 3) {
          data.cell.styles.textColor = GREEN;
          data.cell.styles.fontStyle = 'bold';
        }
      }
    }
  );

  doc.setFontSize(8);
  doc.setTextColor.apply(doc, MUTED);
  doc.setFont('helvetica', 'italic');
  doc.text('*Legara encounter rates shown reflect actual fee schedule ranges by provider type and visit complexity. Final rates are confirmed during contracting.', MARGIN, y, { maxWidth: CONTENT_W });
  y += 20;

  addFooter();

  // ═══════════════════════════════════════════
  // PAGE 7: WHY THIS MATTERS NOW
  // ═══════════════════════════════════════════
  console.log('[PDF] Page 7: Why this matters now');
  y = newPage();

  y = heading('3. Why This Matters Now, Especially in California', y);

  var macroItems = [
    ['Workforce shortage:', 'California faces a 40.6% behavioral health workforce deficit, with rural and underserved counties hit hardest. Traditional recruiting timelines of 3\u20136 months are stretching even longer.'],
    ['CalAIM transformation:', 'Enhanced Care Management (ECM) and Community Supports are expanding the scope of behavioral health services FQHCs are expected to deliver, requiring more provider capacity at precisely the time it\u2019s hardest to hire.'],
    ['Proposition 1 funding:', '$6.4 billion in new behavioral health infrastructure means demand for behavioral health providers will spike across the state, further tightening an already-constrained labor market.'],
    ['SB 221 access standards:', 'California\u2019s timely access law requires behavioral health appointments within 10 business days. FQHCs that can\u2019t meet this standard face regulatory scrutiny and patient attrition.'],
    ['Turnover costs:', 'Behavioral health provider turnover at FQHCs averages 25\u201335% annually. Each departure triggers a new recruiting cycle, a new ramp period, and another year of suboptimal cost-per-encounter economics.']
  ];

  macroItems.forEach(function(item) {
    doc.setFontSize(10);
    doc.setTextColor.apply(doc, GREEN);
    doc.setFont('helvetica', 'bold');
    doc.text(item[0], MARGIN, y);
    var labelW = doc.getTextWidth(item[0]) + 4;
    doc.setTextColor.apply(doc, DARK);
    doc.setFont('helvetica', 'normal');
    var lines = doc.splitTextToSize(item[1], CONTENT_W - labelW);
    doc.text(lines[0], MARGIN + labelW, y);
    if (lines.length > 1) {
      doc.text(lines.slice(1), MARGIN, y + 13);
      y += 13 + (lines.length - 1) * 13 + 8;
    } else {
      y += 20;
    }
  });

  addFooter();

  // ═══════════════════════════════════════════
  // PAGE 8: HOW LEGARA CHANGES + SOURCES
  // ═══════════════════════════════════════════
  console.log('[PDF] Page 8: Legara model + sources');
  y = newPage();

  y = heading('How Legara Changes the Equation', y);

  var bullets = [
    'Zero ramp cost: You pay nothing during credentialing and payer enrollment.',
    'Encounter-based pricing: One rate per completed, billable encounter. No other costs. No salary, no benefits, no support staff overhead.',
    'Higher utilization: Legara providers operate at 82% effective utilization (vs. ~52% for employed providers) because we\u2019ve removed organizational overhead from their schedules.',
    'No turnover risk: If a provider leaves, Legara handles the backfill. No new recruiter fee, no new ramp period, no gap in coverage.',
    'Faster time to revenue: Legara providers are typically seeing patients within 5 months vs. 11+ months for a traditional internal hire. That\u2019s 6 additional months of billable encounters in Year 1.'
  ];

  bullets.forEach(function(b) {
    var parts = b.split(':');
    var boldPart = parts[0] + ':';
    var normalPart = parts.slice(1).join(':').trim();

    doc.setFontSize(10);
    doc.setTextColor.apply(doc, GREEN);
    doc.setFont('helvetica', 'bold');
    doc.text('\u2022', MARGIN, y);

    doc.text(boldPart, MARGIN + 12, y);
    var bW = doc.getTextWidth(boldPart) + 4;

    doc.setTextColor.apply(doc, DARK);
    doc.setFont('helvetica', 'normal');

    var firstLineWidth = CONTENT_W - 12 - bW;
    var firstLineWords = normalPart.split(' ');
    var firstLine = '';
    var bulletRemaining = '';

    for (var i = 0; i < firstLineWords.length; i++) {
      var test = firstLine ? firstLine + ' ' + firstLineWords[i] : firstLineWords[i];
      if (doc.getTextWidth(test) <= firstLineWidth) {
        firstLine = test;
      } else {
        bulletRemaining = firstLineWords.slice(i).join(' ');
        break;
      }
    }

    doc.text(firstLine, MARGIN + 12 + bW, y);
    y += 13;

    if (bulletRemaining) {
      var wrapLines = doc.splitTextToSize(bulletRemaining, CONTENT_W - 12);
      doc.text(wrapLines, MARGIN + 12, y);
      y += wrapLines.length * 13;
    }

    y += 5;
  });

  y += 6;

  // Testimonial
  y += 2;
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(MARGIN, y, CONTENT_W, 36, 3, 3, 'F');
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(10);
  doc.setTextColor(68, 68, 68);
  doc.text('"Legara allows us to increase access to care while improving outcomes for our patients.', MARGIN + 12, y + 14);
  doc.text('Their consistency has been remarkable."', MARGIN + 12, y + 24);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(26, 107, 74);
  doc.text('Kevin Mattson, CEO, San Ysidro Health', MARGIN + 12, y + 32);
  y += 44;

  // Bottom line callout
  doc.setFillColor.apply(doc, GREEN);
  doc.roundedRect(MARGIN, y, CONTENT_W, 52, 4, 4, 'F');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('Bottom line:', MARGIN + 16, y + 20);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  var blLines = doc.splitTextToSize('The FQHCs that will thrive are the ones that match the right staffing model to the right economics. Legara exists to make that possible.', CONTENT_W - 32);
  doc.text(blLines, MARGIN + 16, y + 36);
  y += 64;

  // CTA
  doc.setFontSize(11);
  doc.setTextColor.apply(doc, GREEN);
  doc.setFont('helvetica', 'bold');
  doc.text('Run the numbers for your health center:', MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor.apply(doc, DARK);
  doc.text('golegara.com/roi-calculator', MARGIN, y + 16);
  y += 36;

  // Sources
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 14;

  doc.setFontSize(8);
  doc.setTextColor.apply(doc, MUTED);
  doc.setFont('helvetica', 'bold');
  doc.text('Sources', MARGIN, y);
  y += 10;

  var sources = [
    '1. HRSA UDS 2022 data; California Primary Care Association analysis',
    '2. DHCS PPS rate data; individual FQHC rate letters',
    '3. NACHC Staffing & Operations Survey, 2023',
    '4. Bureau of Labor Statistics, Occupational Employment & Wages, May 2023',
    '5. MGMA Provider Compensation Survey, 2023',
    '6. California Future Health Workforce Commission, 2019',
    '7. Mercer Behavioral Health Workforce Study, 2023',
    '8. DHCS CalAIM implementation guides, 2024',
    '9. California Proposition 1 (2024) fiscal analysis',
    '10. California SB 221 timely access standards',
    '11. Internal Legara operational data, 2024\u20132025'
  ];

  doc.setFont('helvetica', 'normal');
  sources.forEach(function(s) {
    doc.text(s, MARGIN, y);
    y += 10;
  });

  addFooter();

  // ─── RETURN BLOB URL ───
  var filename = 'Legara ROI Analysis - ' + orgName.replace(/[^a-zA-Z0-9 ]/g, '') + '.pdf';
  var blob = doc.output('blob');
  var blobUrl = URL.createObjectURL(blob);
  window._legaraPdfFilename = filename;

  // Fire-and-forget: email the PDF to the lead
  try {
    var pdfBase64 = doc.output('datauristring').split(',')[1];
    var dlEmail = (document.getElementById('dlEmail') || {}).value || '';
    var dlFirstName = (document.getElementById('dlFirstName') || {}).value || '';
    var dlLastName = (document.getElementById('dlLastName') || {}).value || '';
    if (dlEmail) {
      fetch('/api/email-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: dlEmail,
          firstName: dlFirstName,
          lastName: dlLastName,
          organization: orgName,
          pdfBase64: pdfBase64,
          filename: filename
        })
      }).catch(function(err) { console.error('[PDF] Email report send failed:', err); });
    }
  } catch (emailErr) {
    console.error('[PDF] Email report error:', emailErr);
  }

  console.log('[PDF] Report ready:', filename);
  return blobUrl;
}
