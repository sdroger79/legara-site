/* ═══ Legara GA4 Event Tracking ═══ */
/* Events are deferred until gtag.js finishes loading so that
   GA4's automatic page_view always fires first. This prevents
   "(not set)" landing pages in GA4 reports.                    */

var _trackingReady = false;
var _trackingQueue = [];

(function() {
  var gtagScript = document.querySelector('script[src*="googletagmanager.com/gtag/js"]');
  if (gtagScript) {
    if (gtagScript.complete || gtagScript.readyState === 'complete') {
      setTimeout(function() { _trackingReady = true; _flushTrackingQueue(); }, 0);
    } else {
      gtagScript.addEventListener('load', function() {
        _trackingReady = true;
        _flushTrackingQueue();
      });
    }
  } else {
    _trackingReady = true;
  }
})();

function _flushTrackingQueue() {
  while (_trackingQueue.length) {
    var e = _trackingQueue.shift();
    gtag('event', e.name, e.params);
  }
}

function _safeTrack(name, params) {
  if (_trackingReady && typeof gtag === 'function') {
    gtag('event', name, params);
  } else {
    _trackingQueue.push({ name: name, params: params });
  }
}

// CTA click tracking
document.addEventListener('click', function(e) {
  var el = e.target.closest('a.btn-primary, a.btn-secondary, a.nav-cta, a.hero-card-cta, button.btn-primary');
  if (!el) return;

  _safeTrack('cta_click', {
    cta_text: el.textContent.trim().substring(0, 50),
    link_url: el.href || '',
    page_location: window.location.pathname
  });
});

// Scroll depth tracking
(function() {
  var milestones = [25, 50, 75, 90];
  var fired = {};
  window.addEventListener('scroll', function() {
    var scrollable = document.body.scrollHeight - window.innerHeight;
    if (scrollable <= 0) return;
    var pct = Math.round((window.scrollY / scrollable) * 100);
    milestones.forEach(function(m) {
      if (pct >= m && !fired[m]) {
        fired[m] = true;
        _safeTrack('scroll_depth', { depth_threshold: m, page_location: window.location.pathname });
      }
    });
  }, { passive: true });
})();
