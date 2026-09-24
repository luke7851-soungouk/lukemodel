/* FaceLook traffic counters — Abacus primary, hits.dwyl image-beacon fallback.
   Public/writable keys; aggregate only; fail silently; never block UI. */
(function (global) {
  'use strict';
  var NS = 'lukemodel-com';
  var ABACUS = 'https://abacus.jasoncameron.dev';
  var DWYL = 'https://hits.dwyl.com';
  var LS_UV = 'facenaru.traffic.uv';
  var LS_UV_DAY = 'facenaru.traffic.uvDay';
  var SOURCE_KEYS = ['google','naver','reddit','x','clien','dcinside','civitai','futuretools','producthunt','direct','other'];

  function kstDate(d) {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(d || new Date());
    } catch (e) {
      var x = d || new Date();
      var k = new Date(x.getTime() + 9 * 3600 * 1000);
      return k.toISOString().slice(0, 10);
    }
  }

  function kstDaysAgo(n) {
    var now = new Date();
    var utc = now.getTime() + now.getTimezoneOffset() * 60000;
    var kst = new Date(utc + 9 * 3600 * 1000);
    kst.setDate(kst.getDate() - n);
    var y = kst.getFullYear();
    var m = String(kst.getMonth() + 1).padStart(2, '0');
    var day = String(kst.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function sanitizeKey(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 48) || 'other';
  }

  function sourceBucket() {
    try {
      var u = new URL(location.href);
      var utm = (u.searchParams.get('utm_source') || '').toLowerCase().trim();
      if (utm) {
        if (/twitter|x\.com|^x$/.test(utm)) return 'x';
        if (SOURCE_KEYS.indexOf(utm) >= 0) return utm;
        if (/google/.test(utm)) return 'google';
        if (/naver/.test(utm)) return 'naver';
        if (/reddit/.test(utm)) return 'reddit';
        if (/product.?hunt/.test(utm)) return 'producthunt';
        if (/civitai/.test(utm)) return 'civitai';
        if (/future.?tools?/.test(utm)) return 'futuretools';
        if (/clien/.test(utm)) return 'clien';
        if (/dcinside|dc\.|디시/.test(utm)) return 'dcinside';
        return 'other';
      }
      var ref = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : '';
      if (!ref || /lukemodel\.com$/.test(ref) || ref === 'localhost' || ref === '127.0.0.1') return 'direct';
      if (/google\./.test(ref) || ref === 'google.com') return 'google';
      if (/naver\./.test(ref)) return 'naver';
      if (/reddit\./.test(ref)) return 'reddit';
      if (/(^|\.)x\.com$|(^|\.)twitter\.com$|(^|\.)t\.co$/.test(ref)) return 'x';
      if (/clien\.net/.test(ref)) return 'clien';
      if (/dcinside\.com/.test(ref)) return 'dcinside';
      if (/civitai\.com/.test(ref)) return 'civitai';
      if (/futuretools\.io/.test(ref)) return 'futuretools';
      if (/producthunt\.com/.test(ref)) return 'producthunt';
      return 'other';
    } catch (e) {
      return 'other';
    }
  }

  function beaconDwyl(key) {
    try {
      var img = new Image();
      img.referrerPolicy = 'no-referrer';
      img.src = DWYL + '/' + NS + '/' + encodeURIComponent(key) + '.svg?t=' + Date.now();
    } catch (e) {}
  }

  function hitAbacus(key) {
    return fetch(ABACUS + '/hit/' + NS + '/' + encodeURIComponent(key), {
      mode: 'cors', cache: 'no-store', credentials: 'omit'
    }).then(function (r) {
      if (!r.ok) throw new Error('abacus-hit-' + r.status);
      return r.json();
    }).then(function (j) {
      if (!j || typeof j.value !== 'number') throw new Error((j && j.error) || 'abacus-bad');
      return j.value | 0;
    });
  }

  function getAbacus(key) {
    return fetch(ABACUS + '/get/' + NS + '/' + encodeURIComponent(key), {
      mode: 'cors', cache: 'no-store', credentials: 'omit'
    }).then(function (r) {
      if (r.status === 404) return 0;
      if (!r.ok) throw new Error('abacus-get-' + r.status);
      return r.json();
    }).then(function (j) { return (j && j.value) | 0; }).catch(function () { return 0; });
  }

  function hit(key) {
    key = sanitizeKey(key);
    return hitAbacus(key).catch(function () {
      beaconDwyl(key);
      return -1;
    });
  }

  function fireAndForget(keys) {
    try {
      (keys || []).forEach(function (k, i) {
        setTimeout(function () { hit(k); }, i * 40);
      });
    } catch (e) {}
  }

  function trackPageview() {
    try {
      var day = kstDate();
      var keys = ['pv-total', 'pv-' + day];
      var src = sourceBucket();
      keys.push('src-' + src);

      var isNew = false;
      try {
        if (!localStorage.getItem(LS_UV)) {
          localStorage.setItem(LS_UV, '1');
          isNew = true;
          keys.push('uv-total');
        }
        var lastDay = localStorage.getItem(LS_UV_DAY);
        if (lastDay !== day) {
          localStorage.setItem(LS_UV_DAY, day);
          keys.push('uv-' + day);
        }
      } catch (e) {}

      fireAndForget(keys);
      return { day: day, source: src, unique: isNew };
    } catch (e) {
      return null;
    }
  }

  function trackEvent(name) {
    try {
      var map = {
        upload: 'evt-upload',
        generate: 'evt-generate',
        share: 'evt-share',
        download: 'evt-download'
      };
      var key = map[name] || ('evt-' + sanitizeKey(name));
      fireAndForget([key]);
    } catch (e) {}
  }

  function getMany(keys) {
    var out = {};
    var chain = Promise.resolve();
    (keys || []).forEach(function (k) {
      chain = chain.then(function () {
        return getAbacus(k).then(function (v) { out[k] = v; });
      });
    });
    return chain.then(function () { return out; });
  }

  /* Parallel with mild concurrency + pacing to stay under Abacus 30/10s */
  function getManyParallel(keys, concurrency) {
    concurrency = concurrency || 4;
    var out = {};
    var i = 0;
    var done = 0;
    function worker() {
      if (i >= keys.length) return Promise.resolve();
      var k = keys[i++];
      return getAbacus(k).then(function (v) {
        out[k] = v;
        done++;
        var pause = (done % 8 === 0) ? 1200 : 80;
        return new Promise(function (res) { setTimeout(res, pause); }).then(worker);
      });
    }
    var workers = [];
    for (var w = 0; w < concurrency; w++) workers.push(worker());
    return Promise.all(workers).then(function () { return out; });
  }

  function loadStats() {
    var today = kstDate();
    var yesterday = kstDaysAgo(1);
    var days = [];
    for (var d = 0; d < 7; d++) days.push(kstDaysAgo(d));

    var keys = ['pv-total', 'uv-total', 'evt-upload', 'evt-generate', 'evt-share', 'evt-download'];
    days.forEach(function (day) {
      keys.push('pv-' + day);
      keys.push('uv-' + day);
    });
    SOURCE_KEYS.forEach(function (s) { keys.push('src-' + s); });

    return getManyParallel(keys, 4).then(function (vals) {
      var last7pv = 0, last7uv = 0;
      var series = days.slice().reverse().map(function (day) {
        var pv = vals['pv-' + day] || 0;
        var uv = vals['uv-' + day] || 0;
        last7pv += pv;
        last7uv += uv;
        return { day: day, pv: pv, uv: uv };
      });
      var sources = SOURCE_KEYS.map(function (s) {
        return { key: s, value: vals['src-' + s] || 0 };
      }).filter(function (x) { return x.value > 0; })
        .sort(function (a, b) { return b.value - a.value; });

      return {
        today: today,
        yesterday: yesterday,
        totals: { pv: vals['pv-total'] || 0, uv: vals['uv-total'] || 0 },
        todayCounts: { pv: vals['pv-' + today] || 0, uv: vals['uv-' + today] || 0 },
        yesterdayCounts: { pv: vals['pv-' + yesterday] || 0, uv: vals['uv-' + yesterday] || 0 },
        last7: { pv: last7pv, uv: last7uv, series: series },
        sources: sources,
        events: {
          upload: vals['evt-upload'] || 0,
          generate: vals['evt-generate'] || 0,
          share: vals['evt-share'] || 0,
          download: vals['evt-download'] || 0
        },
        raw: vals
      };
    });
  }

  global.FaceLookTraffic = {
    NS: NS,
    SOURCE_KEYS: SOURCE_KEYS,
    kstDate: kstDate,
    kstDaysAgo: kstDaysAgo,
    sourceBucket: sourceBucket,
    hit: hit,
    get: getAbacus,
    trackPageview: trackPageview,
    trackEvent: trackEvent,
    loadStats: loadStats
  };
})(typeof window !== 'undefined' ? window : this);
