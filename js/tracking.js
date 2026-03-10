/* ═══ Legara GA4 Event Tracking ═══ */

// CTA click tracking
document.addEventListener('click', function(e) {
  var el = e.target.closest('a.btn-primary, a.btn-secondary, a.nav-cta, a.hero-card-cta, button.btn-primary');
  if (!el) return;
  if (typeof gtag !== 'function') return;

  gtag('event', 'cta_click', {
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
        if (typeof gtag === 'function') {
          gtag('event', 'scroll_depth', { depth_threshold: m, page_location: window.location.pathname });
        }
      }
    });
  }, { passive: true });
})();
