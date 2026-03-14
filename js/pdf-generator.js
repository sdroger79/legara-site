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

function generateReport(orgName) {
  console.log('[PDF] Starting report generation for:', orgName);
  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF({ unit: 'pt', format: 'letter' });
  var d = lastCalc;
  var y;

  // ─── HELPERS ───
  function addFooter(pageNum) {
    doc.setFontSize(8);
    doc.setTextColor.apply(doc, MUTED);
    doc.setFont('helvetica', 'normal');
    doc.text('Legara Behavioral Health Platform | golegara.com', MARGIN, PAGE_H - 30);
    doc.text('Page ' + pageNum, PAGE_W - MARGIN, PAGE_H - 30, { align: 'right' });
  }

  function heading(text, yPos, size) {
    doc.setFontSize(size || 16);
    doc.setTextColor.apply(doc, GREEN);
    doc.setFont('helvetica', 'bold');
    doc.text(text, MARGIN, yPos);
    return yPos + (size || 16) + 8;
  }

  function subheading(text, yPos) {
    doc.setFontSize(12);
    doc.setTextColor.apply(doc, DARK);
    doc.setFont('helvetica', 'bold');
    doc.text(text, MARGIN, yPos);
    return yPos + 18;
  }

  function bodyText(text, yPos, opts) {
    doc.setFontSize(10);
    doc.setTextColor.apply(doc, DARK);
    doc.setFont('helvetica', 'normal');
    var lines = doc.splitTextToSize(text, (opts && opts.width) || CONTENT_W);
    doc.text(lines, (opts && opts.x) || MARGIN, yPos);
    return yPos + lines.length * 14;
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
    doc.roundedRect(x, yPos, w, 58, 4, 4, 'F');
    doc.setFontSize(9);
    doc.setTextColor.apply(doc, MUTED);
    doc.setFont('helvetica', 'normal');
    doc.text(label, x + w / 2, yPos + 18, { align: 'center' });
    doc.setFontSize(22);
    doc.setTextColor.apply(doc, color || GREEN);
    doc.setFont('helvetica', 'bold');
    doc.text(value, x + w / 2, yPos + 44, { align: 'center' });
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
      styles: { cellPadding: 6, lineWidth: 0 },
      theme: 'plain',
      didParseCell: opts && opts.didParseCell || undefined
    });
    return doc.lastAutoTable.finalY + 16;
  }

  // ═══════════════════════════════════════════
  // PAGE 1: PERSONALIZED RESULTS COVER
  // ═══════════════════════════════════════════
  console.log('[PDF] Page 1: Cover');
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
  y += 32;

  // Three stat boxes
  var boxW = (CONTENT_W - 20) / 3;
  statBox(MARGIN, y, boxW, 'Year 1 Savings', fmtK(d.year1Savings), GREEN);
  statBox(MARGIN + boxW + 10, y, boxW, '3-Year Savings', fmtK(d.total3Yr), GREEN);
  statBox(MARGIN + (boxW + 10) * 2, y, boxW, 'Internal Cost/Encounter', fmtD(d.internalCPE1), RED);
  y += 80;

  // Summary text
  y = bodyText('Based on your inputs, switching to Legara\'s encounter-based model could generate ' + fmtK(d.missionAdvantage3Yr || d.total3Yr) + ' more cash for your mission over three years. Your internal cost per completed behavioral health encounter is ' + fmtD(d.internalCPE1) + ' in Year 1 \u2014 significantly above Legara\'s rate of ' + fmtD(d.legaraRate) + '/encounter.*', y);
  y += 8;
  y = bodyText('The following pages break down the detailed comparison, explain why Legara providers achieve significantly higher utilization, and include our full study on behavioral health economics for California FQHCs.', y);

  addFooter(1);

  // ═══════════════════════════════════════════
  // PAGE 2: DETAILED COST COMPARISON
  // ═══════════════════════════════════════════
  console.log('[PDF] Page 2: Cost comparison');
  doc.addPage();
  y = MARGIN;

  y = heading('Detailed Cost Comparison', y, 20);
  y += 8;

  y = subheading('True Cost of Hiring Internally (Year 1)', y);
  y = autoTable(y,
    ['Cost Component', 'Amount'],
    [
      ['Base salary (' + d.monthsOnPayroll + ' months on payroll)', fmtD(d.salary)],
      ['Benefits & taxes (1.4x multiplier)', fmtD(d.benefitsCost)],
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
      ['Legara rate per encounter', fmtD(d.legaraRate)],
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

  y += 12;
  doc.setFillColor(232, 245, 238);
  doc.roundedRect(MARGIN, y, CONTENT_W, 108, 4, 4, 'F');
  doc.setFontSize(11);
  doc.setTextColor.apply(doc, GREEN);
  doc.setFont('helvetica', 'bold');
  doc.text('How does Legara achieve higher provider utilization?', MARGIN + 12, y + 18);
  doc.setFontSize(9);
  doc.setTextColor.apply(doc, DARK);
  doc.setFont('helvetica', 'normal');
  var ecoLines = doc.splitTextToSize('Legara\u2019s three-layer ecosystem removes the organizational friction that limits employed providers. The workforce network attracts motivated independent clinicians who want schedule flexibility and patient diversity. The operational layer handles all administrative burden \u2014 credentialing, scheduling, compliance, EHR \u2014 so providers focus exclusively on patients. And the financial architecture ensures providers are paid promptly without the cash flow uncertainty of independent practice. The result: demonstrated utilization rates significantly above industry norms, without burnout.', CONTENT_W - 24);
  doc.text(ecoLines, MARGIN + 12, y + 34);
  y += 120;
  doc.setFillColor.apply(doc, GREEN);
  doc.roundedRect(MARGIN, y, CONTENT_W, 52, 4, 4, 'F');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('Want to see these numbers with your actual organizational data?', MARGIN + 12, y + 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Schedule a 30-minute conversation with Roger: cal.com/roger-golegara.com/legara-roi-review', MARGIN + 12, y + 36);
  y += 64;

  addFooter(2);

  // ═══════════════════════════════════════════
  // PAGE 3: ECONOMICS STUDY — INTRO
  // ═══════════════════════════════════════════
  console.log('[PDF] Page 3: Economics intro');
  doc.addPage();
  y = MARGIN;

  doc.setFontSize(22);
  doc.setTextColor.apply(doc, GREEN);
  doc.setFont('helvetica', 'bold');
  doc.text('Behavioral Health Economics', MARGIN, y);
  y += 28;
  doc.text('for California FQHCs', MARGIN, y);
  y += 40;

  // Three stat boxes
  statBox(MARGIN, y, boxW, 'California FQHCs', '174', DARK);
  statBox(MARGIN + boxW + 10, y, boxW, 'Counties Served', 'All 58', DARK);
  statBox(MARGIN + (boxW + 10) * 2, y, boxW, 'BH Workforce Deficit', '40.6%', RED);
  y += 80;

  y = bodyText('California\u2019s Prospective Payment System (PPS) creates strong economics for behavioral health encounters at FQHCs \u2014 rates of $200\u2013$350+ per visit make BH services among the most reimbursable in community health. But the employment model that most centers use to deliver those services is quietly eroding the financial advantage.', y);
  y += 8;
  y = bodyText('The true cost of an employed behavioral health provider \u2014 once you account for benefits, taxes, recruitment, ramp time, support staff, and turnover \u2014 routinely exceeds what most CFOs budget. And the gap between what you\u2019re paying and what you\u2019re collecting per encounter is often far wider than it appears on a spreadsheet.', y);
  y += 16;

  y = heading('1. The Cost Structure FQHCs Underestimate', y);
  y += 4;

  y = bodyText('When an FQHC hires a behavioral health provider, the CFO typically budgets for salary plus benefits. But the real 12-month cost includes recruiter fees, onboarding, credentialing lag (3\u20136 months of salary before the first billable encounter), payer enrollment delays, support staff, and a ramp period where the provider is being paid at full salary but producing a fraction of their eventual output.', y);
  y += 8;

  y = subheading('Therapist (LCSW/LMFT) \u2014 $135K Base', y);
  y = autoTable(y,
    ['', 'CFO Budget', '12-Month Reality'],
    [
      ['Base salary', '$135,000', '$135,000'],
      ['Benefits & taxes (1.4x)', '$54,000', '$54,000'],
      ['Recruiter fee', '\u2014', '$8,000'],
      ['Support staff (0.25 FTE)', '\u2014', '$11,000'],
      [{ content: 'Total Cost', styles: { fontStyle: 'bold' } }, { content: '$189,000', styles: { fontStyle: 'bold' } }, { content: '$208,000', styles: { fontStyle: 'bold' } }],
      ['Completed encounters (Year 1)', '~1,350', '~690'],
      [{ content: 'Cost per encounter', styles: { fontStyle: 'bold' } }, { content: '$140', styles: { fontStyle: 'bold' } }, { content: '$301', styles: { fontStyle: 'bold', textColor: RED } }]
    ],
    { columnStyles: { 0: { cellWidth: CONTENT_W * 0.45 }, 1: { halign: 'right' }, 2: { halign: 'right' } } }
  );

  y = subheading('PMHNP \u2014 $200K Base', y);
  y = autoTable(y,
    ['', 'CFO Budget', '12-Month Reality'],
    [
      ['Base salary', '$200,000', '$200,000'],
      ['Benefits & taxes (1.4x)', '$80,000', '$80,000'],
      ['Recruiter fee', '\u2014', '$8,000'],
      ['Support staff (0.25 FTE)', '\u2014', '$11,000'],
      [{ content: 'Total Cost', styles: { fontStyle: 'bold' } }, { content: '$280,000', styles: { fontStyle: 'bold' } }, { content: '$299,000', styles: { fontStyle: 'bold' } }],
      ['Completed encounters (Year 1)', '~2,025', '~1,035'],
      [{ content: 'Cost per encounter', styles: { fontStyle: 'bold' } }, { content: '$138', styles: { fontStyle: 'bold' } }, { content: '$289', styles: { fontStyle: 'bold', textColor: RED } }]
    ],
    { columnStyles: { 0: { cellWidth: CONTENT_W * 0.45 }, 1: { halign: 'right' }, 2: { halign: 'right' } } }
  );

  addFooter(3);

  // ═══════════════════════════════════════════
  // PAGE 4: CASH GENERATED YEAR-BY-YEAR
  // ═══════════════════════════════════════════
  console.log('[PDF] Page 4: Cash generated');
  doc.addPage();
  y = MARGIN;

  y = heading('2. Cash Generated for Your Mission: Year-by-Year', y);
  y += 4;

  y = bodyText('Every behavioral health encounter generates revenue. The question isn\u2019t whether you should offer BH services \u2014 it\u2019s which model generates more cash to reinvest in your mission. Below, we compare the net cash each model produces annually.', y);
  y += 8;

  y = subheading('Therapist (LCSW/LMFT) at $230 PPS', y);
  y = autoTable(y,
    ['', 'Year 1', 'Year 2', 'Year 3', '3-Year Total'],
    [
      ['With Legara', '$51,750', '$100,125', '$100,125', '$252,000'],
      ['Internal Hire', '-$28,938', '$50,730', '$50,730', '$72,522'],
      [{ content: 'Legara Advantage', styles: { fontStyle: 'bold' } },
        { content: '+$80,688', styles: { fontStyle: 'bold', textColor: GREEN } },
        { content: '+$49,395', styles: { fontStyle: 'bold', textColor: GREEN } },
        { content: '+$49,395', styles: { fontStyle: 'bold', textColor: GREEN } },
        { content: '+$179,478', styles: { fontStyle: 'bold', textColor: GREEN } }]
    ],
    { columnStyles: { 0: { cellWidth: CONTENT_W * 0.28 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } } }
  );

  y = subheading('PMHNP at $230 PPS', y);
  y = autoTable(y,
    ['', 'Year 1', 'Year 2', 'Year 3', '3-Year Total'],
    [
      ['With Legara', '$44,850', '$86,775', '$86,775', '$218,400'],
      ['Internal Hire', '-$62,288', '$73,843', '$73,843', '$85,398'],
      [{ content: 'Legara Advantage', styles: { fontStyle: 'bold' } },
        { content: '+$107,138', styles: { fontStyle: 'bold', textColor: GREEN } },
        { content: '+$12,932', styles: { fontStyle: 'bold', textColor: GREEN } },
        { content: '+$12,932', styles: { fontStyle: 'bold', textColor: GREEN } },
        { content: '+$133,002', styles: { fontStyle: 'bold', textColor: GREEN } }]
    ],
    { columnStyles: { 0: { cellWidth: CONTENT_W * 0.28 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } } }
  );

  y += 4;
  doc.setFillColor(245, 247, 246);
  doc.roundedRect(MARGIN, y, CONTENT_W, 72, 4, 4, 'F');
  doc.setFontSize(11);
  doc.setTextColor.apply(doc, GREEN);
  doc.setFont('helvetica', 'bold');
  doc.text('Why does the internal hire lose cash in Year 1?', MARGIN + 12, y + 20);
  doc.setFontSize(9);
  doc.setTextColor.apply(doc, DARK);
  doc.setFont('helvetica', 'normal');
  var calloutLines = doc.splitTextToSize('Because you\u2019re paying full salary and benefits during the 3\u20136 month ramp period (recruiting, credentialing, payer enrollment, caseload building) while generating few or no billable encounters. The provider\u2019s cost is front-loaded, but their revenue is back-loaded. Legara charges $0 during ramp \u2014 you only pay for completed encounters.', CONTENT_W - 24);
  doc.text(calloutLines, MARGIN + 12, y + 36);
  y += 88;

  y = bodyText('The gap is most dramatic in Year 1 because of the ramp period. By Year 2, internal hires reach steady state \u2014 but even at full productivity, the employment model\u2019s overhead (benefits, taxes, support staff, turnover costs) means you keep less of each encounter\u2019s revenue.', y);

  addFooter(4);

  // ═══════════════════════════════════════════
  // PAGE 5: COST SAVINGS + MACRO CONTEXT
  // ═══════════════════════════════════════════
  console.log('[PDF] Page 5: Cost savings + macro');
  doc.addPage();
  y = MARGIN;

  y = subheading('Cost Savings Across All Provider Types', y);

  y = autoTable(y,
    ['Provider Type', 'Year 1 Savings', 'Year 2 Savings', 'Year 3 Savings', '3-Year Total'],
    [
      ['LCSW/LMFT ($135K)', '$52,097', '$25,788', '$25,788', '$103,673'],
      ['Psychologist ($155K)', '$61,977', '$33,588', '$33,588', '$129,153'],
      ['PMHNP ($200K)', '$79,627', '$13,022', '$13,022', '$105,671'],
      ['Psychiatrist ($330K)', '$166,677', '$79,672', '$79,672', '$326,021']
    ],
    { columnStyles: { 0: { cellWidth: CONTENT_W * 0.28 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } } }
  );

  y = subheading('Steady-State Cost Per Encounter Comparison', y);

  y = autoTable(y,
    ['Provider Type', 'Internal CPE', 'Legara Rate', 'Savings/Encounter'],
    [
      ['LCSW/LMFT', '$174', '$155', '$19'],
      ['Psychologist', '$199', '$165', '$34'],
      ['PMHNP', '$175', '$165', '$10'],
      ['Psychiatrist', '$214', '$165', '$49']
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
  doc.text('*Rates shown reflect standard encounter rates by provider type. Final rates are confirmed during contracting and may vary based on licensure, encounter complexity, and agreement terms.', MARGIN, y, { maxWidth: CONTENT_W });
  y += 20;

  y = heading('3. Why This Matters Now \u2014 Especially in California', y);
  y += 4;

  var macroItems = [
    ['Workforce shortage:', 'California faces a 40.6% behavioral health workforce deficit, with rural and underserved counties hit hardest. Traditional recruiting timelines of 3\u20136 months are stretching even longer.'],
    ['CalAIM transformation:', 'Enhanced Care Management (ECM) and Community Supports are expanding the scope of BH services FQHCs are expected to deliver \u2014 requiring more provider capacity at precisely the time it\u2019s hardest to hire.'],
    ['Proposition 1 funding:', '$6.4 billion in new behavioral health infrastructure means demand for BH providers will spike across the state, further tightening an already-constrained labor market.'],
    ['SB 221 access standards:', 'California\u2019s timely access law requires BH appointments within 10 business days. FQHCs that can\u2019t meet this standard face regulatory scrutiny and patient attrition.'],
    ['Turnover costs:', 'BH provider turnover at FQHCs averages 25\u201335% annually. Each departure triggers a new recruiting cycle, a new ramp period, and another year of suboptimal cost-per-encounter economics.']
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
    // First line continues after label
    doc.text(lines[0], MARGIN + labelW, y);
    if (lines.length > 1) {
      doc.text(lines.slice(1), MARGIN, y + 14);
      y += 14 + (lines.length - 1) * 14 + 10;
    } else {
      y += 22;
    }
  });

  addFooter(5);

  // ═══════════════════════════════════════════
  // PAGE 6: HOW LEGARA CHANGES + SOURCES
  // ═══════════════════════════════════════════
  console.log('[PDF] Page 6: Legara model + sources');
  doc.addPage();
  y = MARGIN;

  y = heading('How Legara Changes the Equation', y);
  y += 4;

  var bullets = [
    'Zero ramp cost: You pay nothing during credentialing and payer enrollment. Legara absorbs the entire onboarding investment.',
    'Encounter-based pricing: One rate per completed, billable encounter. No salary, no benefits, no support staff overhead. Your cost scales linearly with actual clinical output.',
    'Higher utilization: Legara providers operate at 82% effective utilization (vs. ~52% for employed providers) because we\u2019ve removed organizational overhead from their schedules.',
    'No turnover risk: If a provider leaves, Legara replaces them \u2014 not your HR team. No new recruiter fee, no new ramp period, no gap in coverage.',
    'Faster time to revenue: Legara providers are typically seeing patients within 5 months vs. 11+ months for a traditional internal hire. That\u2019s 6 additional months of billable encounters in Year 1.'
  ];

  bullets.forEach(function(b) {
    doc.setFontSize(10);
    doc.setTextColor.apply(doc, GREEN);
    doc.setFont('helvetica', 'bold');
    doc.text('\u2022', MARGIN, y);
    doc.setTextColor.apply(doc, DARK);
    var parts = b.split(':');
    var boldPart = parts[0] + ':';
    var normalPart = parts.slice(1).join(':');
    var bW = doc.getTextWidth(boldPart) + 4;
    doc.text(boldPart, MARGIN + 12, y);
    doc.setFont('helvetica', 'normal');
    var lines = doc.splitTextToSize(normalPart.trim(), CONTENT_W - 12 - bW);
    doc.text(lines[0], MARGIN + 12 + bW, y);
    if (lines.length > 1) {
      var wrapLines = doc.splitTextToSize(normalPart.trim(), CONTENT_W - 12);
      // Reflow: print entire normal text starting from next line
      doc.text('', MARGIN + 12, y);
      var fullLines = doc.splitTextToSize(boldPart + ' ' + normalPart.trim(), CONTENT_W - 12);
      y += fullLines.length * 14 + 6;
    } else {
      y += 20;
    }
  });

  y += 8;

  // Bottom line callout
  doc.setFillColor.apply(doc, GREEN);
  doc.roundedRect(MARGIN, y, CONTENT_W, 56, 4, 4, 'F');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('Bottom line:', MARGIN + 16, y + 22);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  var blLines = doc.splitTextToSize('The FQHCs that will thrive are the ones that match the right staffing model to the right economics. Legara exists to make that possible.', CONTENT_W - 32);
  doc.text(blLines, MARGIN + 16, y + 38);
  y += 72;

  // CTA
  doc.setFontSize(11);
  doc.setTextColor.apply(doc, GREEN);
  doc.setFont('helvetica', 'bold');
  doc.text('Run the numbers for your health center:', MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor.apply(doc, DARK);
  doc.text('golegara.com/roi-calculator', MARGIN, y + 16);
  y += 40;

  // Sources
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 16;

  doc.setFontSize(8);
  doc.setTextColor.apply(doc, MUTED);
  doc.setFont('helvetica', 'bold');
  doc.text('Sources', MARGIN, y);
  y += 12;

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
    y += 11;
  });

  addFooter(6);

  // ─── RETURN BLOB URL ───
  var filename = 'Legara ROI Analysis - ' + orgName.replace(/[^a-zA-Z0-9 ]/g, '') + '.pdf';
  var blob = doc.output('blob');
  var blobUrl = URL.createObjectURL(blob);
  // Store filename for the download link
  window._legaraPdfFilename = filename;
  console.log('[PDF] Report ready:', filename);
  return blobUrl;
}
