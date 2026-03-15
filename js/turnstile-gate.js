// Turnstile Gate — intercepts Cal.com link clicks with human verification
// Included on pages with booking CTAs. Uses a separate Turnstile widget from the form one.

(function() {
  var SITE_KEY = '0x4AAAAAAACrW0wLzmWlGZuLt';

  document.addEventListener('DOMContentLoaded', function() {
    var calLinks = document.querySelectorAll('a[href*="cal.com/roger"]');
    if (!calLinks.length) return;

    // Build modal HTML
    var overlay = document.createElement('div');
    overlay.id = 'turnstile-gate-overlay';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;z-index:9999;background:rgba(28,43,34,0.6);backdrop-filter:blur(4px);align-items:center;justify-content:center;';

    var modal = document.createElement('div');
    modal.style.cssText = 'background:#fff;border-radius:16px;padding:40px 36px;max-width:400px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.2);position:relative;';

    var close = document.createElement('button');
    close.textContent = '\u00d7';
    close.style.cssText = 'position:absolute;top:12px;right:16px;background:none;border:none;font-size:24px;color:#8fa89e;cursor:pointer;';
    close.onclick = function() { overlay.style.display = 'none'; pendingUrl = null; };

    var title = document.createElement('div');
    title.textContent = 'Quick verification';
    title.style.cssText = 'font-family:"Playfair Display",serif;font-size:20px;font-weight:700;color:#1c2b24;margin-bottom:8px;';

    var subtitle = document.createElement('div');
    subtitle.textContent = 'Just confirming you\'re a real person before we connect you with Roger\'s calendar.';
    subtitle.style.cssText = 'font-size:14px;color:#8fa89e;line-height:1.6;margin-bottom:24px;';

    var widgetContainer = document.createElement('div');
    widgetContainer.id = 'turnstile-gate-widget';
    widgetContainer.style.cssText = 'display:flex;justify-content:center;margin-bottom:16px;';

    modal.appendChild(close);
    modal.appendChild(title);
    modal.appendChild(subtitle);
    modal.appendChild(widgetContainer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    var pendingUrl = null;
    var widgetRendered = false;

    // Intercept all Cal.com link clicks
    calLinks.forEach(function(link) {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        pendingUrl = link.href;
        overlay.style.display = 'flex';

        // Render Turnstile widget if not already done
        if (!widgetRendered && typeof turnstile !== 'undefined') {
          turnstile.render('#turnstile-gate-widget', {
            sitekey: SITE_KEY,
            theme: 'light',
            size: 'normal',
            callback: function() {
              // Verification passed, redirect
              if (pendingUrl) {
                window.open(pendingUrl, '_blank');
                overlay.style.display = 'none';
                pendingUrl = null;
              }
            }
          });
          widgetRendered = true;
        } else if (widgetRendered && typeof turnstile !== 'undefined') {
          // Reset for re-use
          turnstile.reset('#turnstile-gate-widget');
        }
      });
    });

    // Close on overlay click (outside modal)
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) {
        overlay.style.display = 'none';
        pendingUrl = null;
      }
    });
  });
})();
