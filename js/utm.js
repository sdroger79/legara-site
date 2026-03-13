// js/utm.js — UTM parameter capture and persistence
(function() {
  var params = new URLSearchParams(window.location.search);
  var utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var hasNew = false;
  var captured = {};

  // Check URL for UTM params
  utmKeys.forEach(function(key) {
    var val = params.get(key);
    if (val) {
      captured[key] = val;
      hasNew = true;
    }
  });

  // If new UTMs found, save to sessionStorage
  if (hasNew) {
    sessionStorage.setItem('legara_utm', JSON.stringify(captured));
    // First-touch: only set once
    if (!localStorage.getItem('legara_first_touch')) {
      localStorage.setItem('legara_first_touch', JSON.stringify(captured));
    }
  }

  // Global accessor
  window.getUtmParams = function() {
    try {
      return JSON.parse(sessionStorage.getItem('legara_utm')) || {};
    } catch(e) { return {}; }
  };

  window.getFirstTouchUtm = function() {
    try {
      return JSON.parse(localStorage.getItem('legara_first_touch')) || {};
    } catch(e) { return {}; }
  };
})();
