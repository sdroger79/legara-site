// ═══ ROI CALCULATOR ENGINE (shared) ═══
// CALC_MODE ('public' | 'internal') must be defined before this script loads

const DEFAULTS = {
  lcsw_lmft:    { salary: 135000, encPerHour: 1.0, legaraRate: 155, label: 'LCSW / LMFT', encNote: '1.0/hr (therapy)' },
  psychologist:  { salary: 155000, encPerHour: 1.0, legaraRate: 165, label: 'Psychologist', encNote: '1.0/hr (therapy)' },
  pmhnp:         { salary: 200000, encPerHour: 1.5, legaraRate: 165, label: 'PMHNP', encNote: '1.5/hr (psychiatry)' },
  psychiatrist:  { salary: 330000, encPerHour: 1.5, legaraRate: 165, label: 'Psychiatrist', encNote: '1.5/hr (psychiatry)' }
};

const SUPPORT_STAFF_COST = 11000; // 0.25 FTE PSR @ ~$44K
const LEGARA_RAMP_MONTHS = 5;    // credential 3 + panel build 2 (overlapping, faster)

// Graduated ramp: partial productivity during later ramp phases
const RAMP_PRODUCTIVITY = {
  recruit:    0,    // not hired yet
  onboard:    0,    // orientation & training
  credPanel:  0.25, // limited panels active, seeing some patients
  panelBuild: 0.65  // most panels active, building caseload
};

// Baked-in assumptions for public version
const BAKED = {
  loadedMultiplier: 1.4,
  recruiterFee: 8000,
  turnoverRate: 0.30,
  recruitMonths: 3,
  onboardWeeks: 3,
  credentialMonths: 3,
  payerPanelMonths: 3,
  panelBuildMonths: 3,
  scheduledHours: 32,
  ptoDays: 30
};

let currentType = 'lcsw_lmft';

// ─── GA EVENT HELPER ───
function trackEvent(action, category, label, value) {
  if (typeof gtag === 'function') {
    gtag('event', action, {
      event_category: category || 'ROI Calculator',
      event_label: label || '',
      value: value || 0
    });
  }
}

// ─── FORMATTERS ───
function fmt(n) {
  if (Math.abs(n) >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
  return '$' + Math.round(n).toLocaleString();
}

function fmtShort(n) {
  if (Math.abs(n) >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1000) return '$' + (n / 1000).toFixed(0) + 'K';
  return '$' + Math.round(n);
}

function fmtNum(n) {
  return Math.round(n).toLocaleString();
}

function fmtSigned(n) {
  if (n >= 0) return '+$' + Math.round(n).toLocaleString();
  return '–$' + Math.round(Math.abs(n)).toLocaleString();
}

// ─── MISSION YEAR SWITCHER ───
function switchMissionYear(year) {
  document.querySelectorAll('.mission-year-tab').forEach(t => t.classList.toggle('active', t.dataset.year == year));
  document.querySelectorAll('.mission-year-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('missionYear' + year).classList.add('active');
}

// ─── PROVIDER TYPE SWITCH ───
function setProviderType(type, e) {
  currentType = type;
  const d = DEFAULTS[type];
  document.getElementById('salary').value = d.salary;
  // Internal: also update EPH input
  if (CALC_MODE === 'internal') {
    document.getElementById('staffEncPerHour').value = d.encPerHour;
  }
  document.querySelectorAll('.provider-toggle button').forEach(btn => btn.classList.remove('active'));
  e.target.classList.add('active');
  trackEvent('provider_type_change', CALC_MODE === 'internal' ? 'ROI Calculator Internal' : 'ROI Calculator', type);
  calculate();
}

// ─── NULL-SAFE ELEMENT SETTER ───
function setEl(id, text) {
  var el = document.getElementById(id);
  if (el) el.textContent = text;
}
function toggleClass(id, cls, condition) {
  var el = document.getElementById(id);
  if (el) el.classList.toggle(cls, condition);
}

// ═══ MAIN CALCULATION ═══
function calculate() {
  // ─── READ INPUTS ───
  const salary = parseFloat(document.getElementById('salary').value) || 0;
  const multiplier = parseFloat(document.getElementById('loadedMultiplier').value) || 1.4;
  const count = parseInt(document.getElementById('providerCount').value) || 1;
  const recruiterFee = parseFloat(document.getElementById('recruiterFee').value) || 0;
  const turnover = (parseFloat(document.getElementById('turnoverRate').value) || 0) / 100;
  const openSlotRate = (parseFloat(document.getElementById('openSlotRate').value) || 0) / 100;
  const noShowRate = (parseFloat(document.getElementById('noShowRate').value) || 0) / 100;
  const ppsRate = parseFloat(document.getElementById('ppsRate').value) || 230;

  // CALC_MODE branching: internal reads from inputs, public from BAKED
  let recruitMonths, onboardWeeks, credentialMonths, payerPanelMonths, panelBuildMonths, scheduledHours, ptoDays, encPerHour;
  if (CALC_MODE === 'internal') {
    recruitMonths = parseFloat(document.getElementById('recruitTime').value) || 0;
    onboardWeeks = parseFloat(document.getElementById('onboardWeeks').value) || 0;
    credentialMonths = parseFloat(document.getElementById('credentialTime').value) || 0;
    payerPanelMonths = parseFloat(document.getElementById('payerPanelTime').value) || 0;
    panelBuildMonths = parseFloat(document.getElementById('panelBuildTime').value) || 0;
    scheduledHours = parseFloat(document.getElementById('scheduledHours').value) || 32;
    ptoDays = parseFloat(document.getElementById('ptoDays').value) || 0;
    encPerHour = parseFloat(document.getElementById('staffEncPerHour').value) || 1.0;
  } else {
    recruitMonths = BAKED.recruitMonths;
    onboardWeeks = BAKED.onboardWeeks;
    credentialMonths = BAKED.credentialMonths;
    payerPanelMonths = BAKED.payerPanelMonths;
    panelBuildMonths = BAKED.panelBuildMonths;
    scheduledHours = BAKED.scheduledHours;
    ptoDays = BAKED.ptoDays;
    encPerHour = DEFAULTS[currentType].encPerHour;
  }
  const legaraRate = DEFAULTS[currentType].legaraRate;

  // ─── CORE UTILIZATION MATH ───
  const fullyLoaded = salary * multiplier;
  const benefitsCost = fullyLoaded - salary;
  const supportCost = SUPPORT_STAFF_COST;
  const ptoWeeks = ptoDays / 5;
  const availableWeeksPerYear = 52 - ptoWeeks;
  const effectiveHours = scheduledHours * (1 - openSlotRate);
  const effectiveEncPerWeek = effectiveHours * encPerHour * (1 - noShowRate);
  const fullYearEncounters = effectiveEncPerWeek * availableWeeksPerYear;

  // ─── INTERNAL HIRE RAMP TIMELINE ───
  const onboardMonths = onboardWeeks / 4.33;
  const credPanelOverlap = Math.min(credentialMonths, payerPanelMonths) * 0.5;
  const credPanelMonths = credentialMonths + payerPanelMonths - credPanelOverlap;
  const totalRampMonths = recruitMonths + onboardMonths + credPanelMonths + panelBuildMonths;

  // ─── YEAR 1: INTERNAL HIRE (graduated ramp) ───
  const internalFullProdMonths = Math.max(12 - totalRampMonths, 0);

  function phaseEnc(months, productivity) {
    const weeks = months * 4.33;
    const pto = ptoWeeks * (months / 12);
    return effectiveEncPerWeek * Math.max(weeks - pto, 0) * productivity;
  }

  const internalEnc1 =
    phaseEnc(recruitMonths, RAMP_PRODUCTIVITY.recruit) +
    phaseEnc(onboardMonths, RAMP_PRODUCTIVITY.onboard) +
    phaseEnc(credPanelMonths, RAMP_PRODUCTIVITY.credPanel) +
    phaseEnc(panelBuildMonths, RAMP_PRODUCTIVITY.panelBuild) +
    phaseEnc(internalFullProdMonths, 1.0);

  const monthsOnPayroll = Math.max(12 - recruitMonths, 0);
  const proratedSalary = fullyLoaded * (monthsOnPayroll / 12);
  const proratedSupport = supportCost * (monthsOnPayroll / 12);
  const internalCostYear1 = proratedSalary + proratedSupport + recruiterFee;
  const internalCPE1 = internalEnc1 > 0 ? internalCostYear1 / internalEnc1 : 0;

  // ─── YEAR 1: LEGARA ───
  const legaraProductiveMonths1 = Math.max(12 - LEGARA_RAMP_MONTHS, 0);
  const legaraProductiveWeeks1 = legaraProductiveMonths1 * 4.33;
  const legaraPTOWeeks1 = ptoWeeks * (legaraProductiveMonths1 / 12);
  const legaraAvailWeeks1 = Math.max(legaraProductiveWeeks1 - legaraPTOWeeks1, 0);
  const legaraEnc1 = effectiveEncPerWeek * legaraAvailWeeks1;
  const legaraCostYear1 = legaraEnc1 * legaraRate;

  // ─── YEAR 2+ STEADY STATE ───
  const turnoverReplacementCost = turnover * (recruiterFee + fullyLoaded * Math.min(totalRampMonths / 12, 1) * 0.5);
  const internalCostSteady = fullyLoaded + supportCost + turnoverReplacementCost;
  const internalCPESteady = fullYearEncounters > 0 ? internalCostSteady / fullYearEncounters : 0;
  const legaraCostSteady = fullYearEncounters * legaraRate;

  // ─── SAVINGS (kept for HubSpot tracking) ───
  const year1Savings = (internalCostYear1 - legaraCostYear1) * count;
  const year2Savings = (internalCostSteady - legaraCostSteady) * count;
  const year3Savings = year2Savings; // year 3 = year 2 at steady state
  const total3Yr = year1Savings + year2Savings + year3Savings;

  // ─── LOST REVENUE ───
  const encounterGapYear1 = Math.max(legaraEnc1 - internalEnc1, 0);
  const lostPPSRevenue = encounterGapYear1 * ppsRate;

  // ─── CASH GENERATED TO SERVE MISSION ───
  const legaraNetPerEnc = ppsRate - legaraRate;

  // Year 1
  const legaraCashYear1 = legaraEnc1 * legaraNetPerEnc;
  const internalRevYear1 = internalEnc1 * ppsRate;
  const internalCashYear1 = internalRevYear1 - internalCostYear1;
  const internalNetPerEncY1 = internalEnc1 > 0 ? ppsRate - internalCPE1 : 0;

  // Year 2 & 3 (steady state)
  const legaraCashSteady = fullYearEncounters * legaraNetPerEnc;
  const internalRevSteady = fullYearEncounters * ppsRate;
  const internalCashSteady = internalRevSteady - internalCostSteady;
  const internalNetPerEncSteady = fullYearEncounters > 0 ? ppsRate - internalCPESteady : 0;

  // Cumulative 3-year
  const legaraCash3Yr = (legaraCashYear1 + legaraCashSteady + legaraCashSteady) * count;
  const internalCash3Yr = (internalCashYear1 + internalCashSteady + internalCashSteady) * count;
  const missionAdvantage3Yr = legaraCash3Yr - internalCash3Yr;

  // Per-year advantages
  const missionAdvY1 = (legaraCashYear1 - internalCashYear1) * count;
  const missionAdvSteady = (legaraCashSteady - internalCashSteady) * count;

  // ─── PUBLIC: store lastCalc for HubSpot ───
  if (CALC_MODE === 'public') {
    lastCalc = {
      year1Savings: Math.round(year1Savings),
      total3Yr: Math.round(total3Yr),
      legaraCashYear1: Math.round(legaraCashYear1 * count),
      missionAdvantage: Math.round(missionAdvantage3Yr),
      internalCPE1: internalCPE1,
      legaraRate: legaraRate
    };
  }

  // ═══ UPDATE UI ═══

  // ─── 1. MISSION SECTION — Year 1 ───
  setEl('missionLegaraRevY1', fmt(ppsRate));
  setEl('missionLegaraRateY1', '–' + fmt(legaraRate));
  setEl('missionLegaraPerEncY1', fmt(legaraNetPerEnc));
  setEl('missionLegaraEncTextY1',
    fmtNum(legaraEnc1 * count) + ' encounters — ' + fmtNum(legaraEnc1 * count) + ' patients served who would otherwise be on a wait list');
  setEl('missionLegaraCashY1', fmt(legaraCashYear1 * count));

  setEl('missionInternalRevY1', fmt(ppsRate));
  setEl('missionInternalCPEY1', '–' + fmt(internalCPE1));
  setEl('missionInternalPerEncY1', internalEnc1 > 0 ? fmt(internalNetPerEncY1) : '$0');
  toggleClass('missionInternalPerEncY1', 'negative', internalNetPerEncY1 < 0);
  setEl('missionInternalEncTextY1',
    fmtNum(internalEnc1 * count) + ' encounters — but the ramp means ~' + Math.round(totalRampMonths - recruitMonths) + ' months before steady productivity');
  setEl('missionInternalCashY1', fmt(internalCashYear1 * count));
  toggleClass('missionInternalCashY1', 'negative', internalCashYear1 < 0);

  // ─── Mission — Year 2 ───
  setEl('missionLegaraRevY2', fmt(ppsRate));
  setEl('missionLegaraRateY2', '–' + fmt(legaraRate));
  setEl('missionLegaraPerEncY2', fmt(legaraNetPerEnc));
  setEl('missionLegaraEncTextY2',
    fmtNum(fullYearEncounters * count) + ' encounters — ' + fmtNum(fullYearEncounters * count) + ' patients served who would otherwise be on a wait list');
  setEl('missionLegaraCashY2', fmt(legaraCashSteady * count));

  setEl('missionInternalRevY2', fmt(ppsRate));
  setEl('missionInternalCPEY2', '–' + fmt(internalCPESteady));
  setEl('missionInternalPerEncY2', fullYearEncounters > 0 ? fmt(internalNetPerEncSteady) : '$0');
  toggleClass('missionInternalPerEncY2', 'negative', internalNetPerEncSteady < 0);
  setEl('missionInternalEncTextY2',
    fmtNum(fullYearEncounters * count) + ' encounters at full productivity');
  setEl('missionInternalCashY2', fmt(internalCashSteady * count));
  toggleClass('missionInternalCashY2', 'negative', internalCashSteady < 0);

  // ─── Mission — Year 3 (same as Year 2) ───
  setEl('missionLegaraRevY3', fmt(ppsRate));
  setEl('missionLegaraRateY3', '–' + fmt(legaraRate));
  setEl('missionLegaraPerEncY3', fmt(legaraNetPerEnc));
  setEl('missionLegaraEncTextY3',
    fmtNum(fullYearEncounters * count) + ' encounters — ' + fmtNum(fullYearEncounters * count) + ' patients served who would otherwise be on a wait list');
  setEl('missionLegaraCashY3', fmt(legaraCashSteady * count));

  setEl('missionInternalRevY3', fmt(ppsRate));
  setEl('missionInternalCPEY3', '–' + fmt(internalCPESteady));
  setEl('missionInternalPerEncY3', fullYearEncounters > 0 ? fmt(internalNetPerEncSteady) : '$0');
  toggleClass('missionInternalPerEncY3', 'negative', internalNetPerEncSteady < 0);
  setEl('missionInternalEncTextY3',
    fmtNum(fullYearEncounters * count) + ' encounters at full productivity');
  setEl('missionInternalCashY3', fmt(internalCashSteady * count));
  toggleClass('missionInternalCashY3', 'negative', internalCashSteady < 0);

  // ─── Cumulative 3-year totals ───
  setEl('missionLegaraCum3', fmt(legaraCash3Yr));
  setEl('missionInternalCum3', fmt(internalCash3Yr));
  toggleClass('missionInternalCum3', 'negative', internalCash3Yr < 0);

  // Simplified advantage bar
  var advEl = document.getElementById('missionAdvantage3Yr');
  if (advEl) advEl.innerHTML = 'Legara generates <strong>' + fmtSigned(missionAdvantage3Yr) + '</strong> more cash for your mission over 3 years';

  // ─── 2. INTERNAL HIRE BREAKDOWN CARD ───
  if (CALC_MODE === 'internal') {
    const proratedBaseSalary = salary * (monthsOnPayroll / 12);
    const proratedBenefits = benefitsCost * (monthsOnPayroll / 12);
    setEl('cmpSalary', fmt(proratedBaseSalary) + ' (' + Math.round(monthsOnPayroll) + ' mo)');
    setEl('cmpBenefits', fmt(proratedBenefits));
    setEl('cmpSupport', fmt(proratedSupport));
  } else {
    setEl('cmpSalary', fmt(salary));
    setEl('cmpBenefits', fmt(benefitsCost));
    setEl('cmpSupport', fmt(supportCost));
  }
  setEl('cmpRecruiter', fmt(recruiterFee));
  setEl('cmpRamp', Math.round(internalFullProdMonths) + ' of 12 mo at full productivity');
  setEl('cmpTotalInternalCard', fmt(internalCostYear1));

  // ─── 3. CASH GENERATED SUMMARY CARD ───
  setEl('cashGen3YrTotal', fmtSigned(missionAdvantage3Yr));
  setEl('cashGenY1', fmtSigned(missionAdvY1));
  setEl('cashGenY2Plus', fmtSigned(missionAdvSteady));

  // ─── 4. TIMELINE ───
  setEl('internalMonths', Math.round(totalRampMonths) + ' months');
  setEl('legaraMonths', 'As fast as 6 weeks (at $0 cost)');

  const totalForBar = recruitMonths + onboardMonths + credentialMonths + payerPanelMonths + panelBuildMonths;
  var tl = document.getElementById('internalTimeline');
  if (tl) {
    tl.innerHTML = '';
    [
      { label: 'Recruit', months: recruitMonths, cls: 'recruit' },
      { label: 'Onboard', months: onboardMonths, cls: 'onboard' },
      { label: 'Credential', months: credentialMonths, cls: 'credential' },
      { label: 'Payer', months: payerPanelMonths, cls: 'payer' },
      { label: 'Panel', months: panelBuildMonths, cls: 'panel' }
    ].forEach(function(s) {
      if (s.months > 0) {
        var div = document.createElement('div');
        div.className = 'timeline-bar-segment ' + s.cls;
        div.style.width = (s.months / totalForBar * 100) + '%';
        div.textContent = s.label;
        tl.appendChild(div);
      }
    });
  }

  var legaraTl = document.getElementById('legaraTimeline');
  if (legaraTl) {
    var legaraPct = totalRampMonths > 0 ? Math.round(LEGARA_RAMP_MONTHS / totalRampMonths * 100) : 50;
    legaraTl.style.width = legaraPct + '%';
  }

  // ─── 5. WATERFALL ───
  var waterfallData = [
    { label: 'Base salary', value: salary },
    { label: 'Benefits & taxes', value: benefitsCost },
    { label: 'Support staff', value: supportCost },
    { label: 'Recruiter fee', value: recruiterFee },
    { label: 'Lost encounter revenue', value: lostPPSRevenue }
  ];
  var maxWaterfall = Math.max.apply(null, waterfallData.map(function(d) { return d.value; }));
  var wf = document.getElementById('waterfallBars');
  if (wf) {
    wf.innerHTML = '';
    waterfallData.forEach(function(d) {
      var pct = maxWaterfall > 0 ? (d.value / maxWaterfall * 100) : 0;
      wf.innerHTML +=
        '<div class="waterfall-item">' +
          '<div class="waterfall-item-label">' + d.label + '</div>' +
          '<div class="waterfall-item-bar">' +
            '<div class="waterfall-item-fill" style="width: ' + Math.max(pct, 1) + '%;' + (d.label === 'Lost encounter revenue' ? ' background: var(--red);' : '') + '"></div>' +
          '</div>' +
          '<div class="waterfall-item-value">' + fmtShort(d.value) + '</div>' +
        '</div>';
    });
  }

  // ─── 6. ASSUMPTIONS NOTES ───
  if (CALC_MODE === 'internal') {
    var ephEl = document.getElementById('staffEncPerHour');
    setEl('encRateNote', ephEl ? parseFloat(ephEl.value).toFixed(1) + '/hr (staff provider)' : DEFAULTS[currentType].encNote);
  } else {
    setEl('encRateNote', DEFAULTS[currentType].encNote);
  }
  setEl('ppsNote', ppsRate);
  setEl('legaraRateNote', legaraRate);

  // ─── PUBLIC: track engagement ───
  if (CALC_MODE === 'public') {
    calcCount++;
    if (calcCount === 3) {
      trackEvent('calculator_engaged', 'ROI Calculator', currentType, Math.round(internalCPE1));
    }
  }
}
