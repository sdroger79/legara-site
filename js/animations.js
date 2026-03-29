/**
 * Legara — Site-Wide Animation Engine
 * Handles scroll reveal, number counting, staggered entrances, and parallax.
 * Respects prefers-reduced-motion.
 */
(function() {
  'use strict';

  // Bail out entirely if user prefers reduced motion
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) {
    document.querySelectorAll('.reveal, .reveal-slide-left, .reveal-slide-right, .reveal-scale, .count-up').forEach(function(el) {
      el.classList.add('visible');
      // For count-up, just show the final number
      if (el.classList.contains('count-up') && el.dataset.target) {
        el.textContent = el.dataset.target;
      }
    });
    return;
  }

  // ─── SCROLL REVEAL ───
  // Supports: .reveal (fade up), .reveal-slide-left, .reveal-slide-right, .reveal-scale
  var revealEls = document.querySelectorAll('.reveal, .reveal-slide-left, .reveal-slide-right, .reveal-scale');
  if (revealEls.length && 'IntersectionObserver' in window) {
    var revealObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' });
    revealEls.forEach(function(el) { revealObserver.observe(el); });
  } else {
    revealEls.forEach(function(el) { el.classList.add('visible'); });
  }

  // ─── COUNT-UP ANIMATION ───
  // Add class="count-up" and data-target="50000" to any element
  // Optional: data-prefix="$" data-suffix="+" data-duration="2000"
  var countEls = document.querySelectorAll('.count-up');
  if (countEls.length && 'IntersectionObserver' in window) {
    var countObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          countObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });
    countEls.forEach(function(el) { countObserver.observe(el); });
  }

  function animateCount(el) {
    var target = parseFloat(el.dataset.target) || 0;
    var duration = parseInt(el.dataset.duration) || 1800;
    var prefix = el.dataset.prefix || '';
    var suffix = el.dataset.suffix || '';
    var decimals = (el.dataset.target || '').indexOf('.') > -1 ? 2 : 0;
    var start = performance.now();

    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

    function update(now) {
      var elapsed = now - start;
      var progress = Math.min(elapsed / duration, 1);
      var value = target * easeOutCubic(progress);
      el.textContent = prefix + (decimals ? value.toFixed(decimals) : Math.round(value).toLocaleString()) + suffix;
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }

  // ─── STAGGER CHILDREN ───
  // Parent with .reveal-stagger-group: children get incremental delays on reveal
  var staggerGroups = document.querySelectorAll('.reveal-stagger-group');
  if (staggerGroups.length && 'IntersectionObserver' in window) {
    var staggerObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          var children = entry.target.querySelectorAll('.reveal, .reveal-slide-left, .reveal-slide-right, .reveal-scale');
          children.forEach(function(child, i) {
            child.style.transitionDelay = Math.min(i * 100, 300) + 'ms';
            // Small timeout to ensure the delay is applied before triggering
            setTimeout(function() { child.classList.add('visible'); }, 10);
          });
          staggerObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    staggerGroups.forEach(function(el) { staggerObserver.observe(el); });
  }

  // ─── NAV SCROLL EFFECT ───
  // Adds .nav-scrolled class to <nav> after scrolling 80px (subtle shadow + slightly more opaque bg)
  var nav = document.querySelector('nav');
  if (nav) {
    var lastScroll = 0;
    var ticking = false;
    window.addEventListener('scroll', function() {
      lastScroll = window.scrollY;
      if (!ticking) {
        requestAnimationFrame(function() {
          if (lastScroll > 80) {
            nav.classList.add('nav-scrolled');
          } else {
            nav.classList.remove('nav-scrolled');
          }
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  // ─── SUBTLE PARALLAX ON PAGE HEADERS ───
  // Adds a slight upward drift to .page-header content as user scrolls past
  var pageHeader = document.querySelector('.page-header');
  if (pageHeader) {
    var headerContent = pageHeader.querySelector('.section-headline') || pageHeader.querySelector('h1');
    if (headerContent) {
      var parallaxTicking = false;
      window.addEventListener('scroll', function() {
        if (!parallaxTicking) {
          requestAnimationFrame(function() {
            var rect = pageHeader.getBoundingClientRect();
            if (rect.bottom > 0) {
              var shift = Math.min(window.scrollY * 0.15, 60);
              headerContent.style.transform = 'translateY(' + shift + 'px)';
              headerContent.style.opacity = Math.max(1 - (window.scrollY / (rect.height * 1.5)), 0.3);
            }
            parallaxTicking = false;
          });
          parallaxTicking = true;
        }
      });
    }
  }

  // ─── COMPARISON TABLE ROW HIGHLIGHT ───
  // Adds a subtle left-border highlight as comparison rows scroll into view
  var compRows = document.querySelectorAll('.comparison-row');
  if (compRows.length && 'IntersectionObserver' in window) {
    var rowObserver = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('row-visible');
          rowObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    compRows.forEach(function(el, i) {
      el.style.transitionDelay = (i * 80) + 'ms';
      rowObserver.observe(el);
    });
  }

})();
