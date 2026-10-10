/* DAF SFX v1 — suara tombol, backsound (lobi & layar utama Pets) dan jejak kaki hewan.
   Semua suara dibuat lewat WebAudio (tanpa file audio). Dimuat oleh index.html dan pets.html.
   API: DAFSound.ui(kind) · .bgm(name) · .bgmStop() · .step(species,{vol,pan}) · .pet(species)
        .setBgm(bool) · .setSfx(bool) · .isBgm() · .isSfx() · .onChange(fn) · .autoBind({skip}) */
(function () {
  "use strict";
  if (window.DAFSound) return;

  var K_SFX = "daf_sfx", K_BGM = "daf_bgm";
  var UG = 2.2;   // penguat suara tombol/suara hewan (yang memakai bus bawaan) agar terdengar di atas musik
  var ls = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  if (ls.get(K_BGM) === null && ls.get("dafpets_bgm") === "0") ls.set(K_BGM, "0");   // migrasi pengaturan lama Pets

  var st = {
    ctx: null, sfx: null, bgm: null, comp: null, nbuf: null,
    sfxOn: ls.get(K_SFX) !== "0", bgmOn: ls.get(K_BGM) !== "0",
    want: null, cur: null, unlocked: false, hidden: false, listeners: [], steps: []
  };

  /* ---------- konteks audio & bus ---------- */
  function build(c) {
    st.ctx = c;
    st.comp = c.createDynamicsCompressor();
    st.comp.threshold.value = -14; st.comp.knee.value = 18; st.comp.ratio.value = 5;
    st.comp.attack.value = .004; st.comp.release.value = .2;
    st.comp.connect(c.destination);
    st.sfx = c.createGain(); st.sfx.gain.value = .85; st.sfx.connect(st.comp);
    var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 5200; lp.Q.value = .4;
    st.bgm = c.createGain(); st.bgm.gain.value = .4; st.bgm.connect(lp); lp.connect(st.comp);
    var n = Math.floor(c.sampleRate * 1.2), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    st.nbuf = b;
  }
  function ensure() {
    if (st.ctx) return st.ctx;
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try { build(new C()); } catch (e) { return null; }
    return st.ctx;
  }
  function ready() { return !!(st.ctx && st.ctx.state === "running"); }

  /* ---------- bahan dasar suara ---------- */
  function tone(f, t, d, v, type, f2, dest, att) {
    var c = st.ctx, o = c.createOscillator(), g = c.createGain(), a = att || .006;
    if (!dest) v *= UG;
    o.type = type || "sine";
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + d);
    g.gain.setValueAtTime(.0001, t);
    g.gain.linearRampToValueAtTime(v, t + Math.min(a, d * .5));
    g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g); g.connect(dest || st.sfx);
    o.start(t); o.stop(t + d + .04);
  }
  function nz(t, d, v, type, f, q, dest, f2) {
    var c = st.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = st.nbuf;
    if (!dest) v *= UG;
    fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q || .8;
    if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    s.connect(fl); fl.connect(g); g.connect(dest || st.sfx);
    s.start(t, Math.random() * .8); s.stop(t + d + .03);
  }
  var mtof = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };
  var jit = function (x) { return x * (1 + (Math.random() - .5) * .08); };

  /* ---------- suara tombol ---------- */
  var UI = {
    tap: function (t) { var f = jit(640); tone(f, t, .06, .1, "triangle", f * .74); nz(t, .02, .05, "highpass", 5000, .7); },
    primary: function (t) { tone(jit(520), t, .09, .1, "triangle"); tone(jit(784), t + .07, .13, .11, "triangle"); tone(1568, t + .07, .09, .03, "sine"); },
    back: function (t) { tone(jit(460), t, .09, .1, "triangle", 330); },
    tab: function (t) { tone(jit(380), t, .08, .1, "sine", 560); nz(t, .03, .04, "bandpass", 2400, 1.2); },
    open: function (t) { nz(t, .2, .06, "bandpass", 500, 1.1, null, 2400); tone(660, t + .02, .1, .06, "triangle", 880); },
    close: function (t) { nz(t, .17, .05, "bandpass", 2000, 1.1, null, 420); tone(560, t, .09, .05, "triangle", 380); },
    on: function (t) { tone(560, t, .08, .09, "triangle"); tone(840, t + .07, .1, .1, "triangle"); },
    off: function (t) { tone(560, t, .08, .09, "triangle"); tone(380, t + .07, .1, .09, "triangle"); },
    coin: function (t) { tone(1319, t, .12, .09, "sine"); tone(1760, t + .07, .22, .1, "sine"); tone(1760 * 2.4, t + .07, .1, .025, "sine"); },
    spend: function (t) { tone(880, t, .1, .08, "triangle", 660); tone(1175, t + .05, .12, .06, "triangle", 880); },
    ok: function (t) { [523, 659, 784].forEach(function (f, i) { tone(f, t + i * .07, .14, .09, "triangle"); }); },
    err: function (t) { tone(220, t, .1, .07, "square", 190); tone(165, t + .09, .14, .07, "square", 140); },
    hatch: function (t) {
      nz(t, .35, .07, "bandpass", 400, 1, null, 3000);
      [523, 659, 784, 1047, 1319, 1568].forEach(function (f, i) { tone(f, t + .1 + i * .075, .22, .08, "triangle"); tone(f * 2, t + .1 + i * .075, .14, .025, "sine"); });
    },
    level: function (t) { [392, 523, 659, 784].forEach(function (f, i) { tone(f, t + i * .08, .16, .09, "triangle"); }); tone(1047, t + .34, .35, .08, "sine"); }
  };
  function ui(kind) {
    if (!st.sfxOn) return;
    var c = ensure(); if (!c || !ready()) return;
    var fn = UI[kind] || UI.tap, t = c.currentTime + .005;
    try { fn(t); } catch (e) {}
  }
  /* nz() dengan dest null memakai bus sfx */

  /* ---------- suara hewan saat dielus ---------- */
  var GRP = { harimau: "cat", singa: "cat", singasurya: "cat", panda: "bear", beruang: "bear", gajah: "ele", rubah: "dog", serigala: "dog",
              zebra: "hoof", rusa: "hoof", unicorn: "hoof", pegasus: "hoof", merak: "bird", phoenix: "bird", naga: "drag", nagaes: "drag", kosmik: "drag" };
  var VOICE = {
    cat: function (t, o) { tone(jit(520), t, .22, .12, "sine", 700, o, .03); tone(jit(700), t + .16, .24, .1, "sine", 480, o, .02); },
    bear: function (t, o) { tone(jit(210), t, .3, .14, "triangle", 170, o, .03); tone(jit(300), t + .05, .22, .06, "sine", 240, o); },
    ele: function (t, o) { tone(jit(300), t, .45, .13, "sawtooth", 520, o, .05); tone(jit(460), t + .22, .35, .08, "sawtooth", 360, o, .04); },
    dog: function (t, o) { tone(jit(780), t, .09, .1, "triangle", 980, o); tone(jit(980), t + .11, .09, .1, "triangle", 1180, o); },
    hoof: function (t, o) { tone(jit(480), t, .24, .1, "triangle", 760, o, .03); tone(jit(760), t + .14, .2, .08, "triangle", 560, o); },
    bird: function (t, o) { for (var i = 0; i < 3; i++) tone(jit(1900 + i * 260), t + i * .08, .07, .08, "sine", 2700 + i * 200, o); },
    drag: function (t, o) { tone(jit(120), t, .5, .13, "sawtooth", 80, o, .06); nz(t, .45, .08, "lowpass", 700, .8, o, 220); }
  };
  function pet(sp) {
    if (!st.sfxOn) return;
    var c = ensure(); if (!c || !ready()) return;
    var g = GRP[sp] || "cat", fn = VOICE[g]; if (!fn) return;
    try { fn(c.currentTime + .005, null); } catch (e) {}
  }

  /* ---------- jejak kaki hewan (satu panggilan = satu langkah) ---------- */
  var STEP = {
    cat: function (t, o, F) { nz(t, .08, .5, "lowpass", 520 * F, .7, o); tone(110 * F, t, .1, .35, "sine", 68, o, .003); nz(t + .002, .03, .08, "bandpass", 3200, 1.2, o); },
    bear: function (t, o, F) { nz(t, .12, .55, "lowpass", 340 * F, .6, o); tone(74 * F, t, .16, .5, "sine", 46, o, .004); },
    ele: function (t, o, F) { tone(64 * F, t, .36, .9, "sine", 34, o, .004); nz(t, .24, .55, "lowpass", 250 * F, .6, o); nz(t + .01, .06, .12, "bandpass", 900, 1, o); },
    dog: function (t, o, F) { nz(t, .04, .62, "bandpass", 1900 * F, 1.4, o); nz(t + .05, .035, .42, "bandpass", 2400 * F, 1.4, o); tone(210 * F, t, .03, .2, "triangle", 150, o); },
    hoof: function (t, o, F) { tone(820 * F, t, .05, .26, "triangle", 430, o, .002); nz(t, .035, .3, "bandpass", 1500 * F, 1.6, o); tone(190 * F, t, .07, .22, "sine", 120, o, .002); },
    bird: function (t, o, F) { nz(t, .014, .24, "highpass", 3600 * F, .7, o); nz(t + .04, .012, .15, "highpass", 4300 * F, .7, o); },
    drag: function (t, o, F) { nz(t, .22, .5, "lowpass", 380 * F, .8, o, 160); tone(56 * F, t, .28, .6, "sine", 32, o, .005); nz(t + .01, .1, .1, "bandpass", 2600, 3, o); }
  };
  var STEPVOL = { ele: 1, drag: .85, bear: .7, cat: .6, hoof: .62, dog: .5, bird: .42 };
  function step(sp, o) {
    if (!st.sfxOn) return;
    var c = ensure(); if (!c || !ready()) return;
    o = o || {};
    var now = c.currentTime;
    st.steps = st.steps.filter(function (x) { return now - x < .16; });
    if (st.steps.length >= 4) return;                     // batasi langkah serentak
    st.steps.push(now);
    var g = GRP[sp] || "cat", fn = STEP[g]; if (!fn) return;
    var vol = Math.max(0, Math.min(1, o.vol == null ? 1 : o.vol)) * (STEPVOL[g] || .6);
    if (vol < .015) return;
    var vg = c.createGain(); vg.gain.value = vol * (.88 + Math.random() * .24);
    var out = vg;
    if (c.createStereoPanner) {
      var p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan || 0));
      vg.connect(p); p.connect(st.sfx);
    } else vg.connect(st.sfx);
    try { fn(now + .004, out, .92 + Math.random() * .16); } catch (e) {}
    setTimeout(function () { try { vg.disconnect(); } catch (e) {} }, 700);
    if (g === "bird" && Math.random() < .08) nz(now + .06, .1, .03, "highpass", 5200, .6, out);   // kepak bulu
  }

  /* ---------- backsound (dibuat langsung, tanpa file) ---------- */
  var CH_LOBBY = [[45, 57, 60, 64], [41, 53, 57, 60], [48, 55, 60, 64], [43, 55, 59, 62]];       // Am – F – C – G
  var CH_MAIN = [[48, 60, 64, 67], [45, 57, 60, 64], [41, 53, 57, 60], [43, 55, 59, 62]];         // C – Am – F – G
  var PENTA = [72, 74, 76, 79, 81, 84];
  var rnd = function (a) { return a[Math.floor(Math.random() * a.length)]; };
  var TRACKS = {
    /* lobi: ceria, ringan, rasa arena (108 bpm) */
    lobby: {
      bpm: 108,
      step: function (i, t, dt, o) {
        var bar = (i >> 3) & 3, p = i & 7, ch = CH_LOBBY[bar];
        if (p === 0) {
          tone(mtof(ch[0]), t, dt * 3.4, .17, "triangle", 0, o, .01);
          for (var k = 1; k < 4; k++) tone(mtof(ch[k]), t, dt * 8, .028, "sine", 0, o, .4);
        }
        if (p === 3 || p === 6) tone(mtof(ch[0] + (p === 6 ? 7 : 12)), t, dt * 1.2, .08, "triangle", 0, o, .008);
        if (p === 0 || p === 4) { tone(125, t, .16, .18, "sine", 44, o, .003); }
        if (p === 4) nz(t, .12, .05, "bandpass", 1900, .9, o);
        if (i & 1) nz(t, .04, .045, "highpass", 7000, .6, o);
        var arp = [0, 1, 2, 3, 2, 1, 3, 2][p];
        if (Math.random() < .88) tone(mtof(ch[arp] + 12), t, dt * 1.7, .06, "triangle", 0, o, .005);
        if (p === 5 && Math.random() < .35) { var b = mtof(rnd(PENTA) + 12); tone(b, t, .5, .035, "sine", 0, o); tone(b * 2.01, t, .3, .012, "sine", 0, o); }
      }
    },
    /* layar utama Pets: hangat, santai, kotak musik (76 bpm) */
    main: {
      bpm: 76,
      step: function (i, t, dt, o) {
        var bar = (i >> 3) & 3, p = i & 7, ch = CH_MAIN[bar];
        if (p === 0) {
          for (var k = 1; k < 4; k++) tone(mtof(ch[k]), t, dt * 8.4, .042, "sine", 0, o, .7);
          tone(mtof(ch[0]), t, dt * 4, .1, "triangle", 0, o, .03);
        }
        if (p === 4) tone(mtof(ch[0] + 7), t, dt * 2.5, .05, "triangle", 0, o, .02);
        var chance = (p & 3) === 0 ? .72 : (p & 1) === 0 ? .4 : .12;
        if (Math.random() < chance) {
          var f = mtof(rnd(PENTA));
          tone(f, t, 1.1, .06, "sine", 0, o, .004);
          tone(f * 2.003, t, .45, .018, "sine", 0, o, .004);
        }
      }
    }
  };
  function pump(tr) {
    var c = st.ctx; if (!c || tr.dead) return;
    if (c.state !== "running") { tr.t = Math.max(tr.t, c.currentTime + .05); return; }
    var dt = 60 / tr.T.bpm / 2;
    if (tr.t < c.currentTime - .3) tr.t = c.currentTime + .05;
    while (tr.t < c.currentTime + .9) { try { tr.T.step(tr.i, tr.t, dt, tr.g); } catch (e) {} tr.i++; tr.t += dt; }
  }
  function startTrack(name) {
    var T = TRACKS[name], c = st.ctx; if (!T || !c) return null;
    var g = c.createGain(); g.gain.setValueAtTime(.0001, c.currentTime); g.gain.linearRampToValueAtTime(1, c.currentTime + 1.4); g.connect(st.bgm);
    var tr = { name: name, T: T, g: g, i: 0, t: c.currentTime + .12, dead: false, timer: 0 };
    tr.timer = setInterval(function () { pump(tr); }, 140); pump(tr);
    return tr;
  }
  function stopTrack(tr, fade) {
    if (!tr) return; tr.dead = true; clearInterval(tr.timer);
    var c = st.ctx, f = fade == null ? .7 : fade;
    try { tr.g.gain.cancelScheduledValues(c.currentTime); tr.g.gain.setValueAtTime(Math.max(.0001, tr.g.gain.value), c.currentTime); tr.g.gain.linearRampToValueAtTime(0, c.currentTime + f); } catch (e) {}
    setTimeout(function () { try { tr.g.disconnect(); } catch (e) {} }, f * 1000 + 900);
  }
  function apply() {
    if (!st.bgmOn || !st.want || st.hidden || !ready()) {
      if (st.cur && (!st.bgmOn || !st.want || st.hidden)) { stopTrack(st.cur); st.cur = null; }
      return;
    }
    if (st.cur && st.cur.name === st.want) return;
    if (st.cur) stopTrack(st.cur);
    st.cur = startTrack(st.want);
  }

  /* ---------- buka kunci audio (kebijakan autoplay browser) ---------- */
  function unlock() {
    var c = ensure(); if (!c) return;
    if (c.state === "running") { if (!st.unlocked) { st.unlocked = true; } apply(); return; }
    try { var p = c.resume(); if (p && p.then) p.then(function () { if (c.state === "running") { st.unlocked = true; apply(); } }, function () {}); } catch (e) {}
  }
  ["pointerdown", "touchend", "click", "keydown"].forEach(function (ev) { window.addEventListener(ev, unlock, { capture: true, passive: true }); });
  document.addEventListener("visibilitychange", function () {
    st.hidden = document.hidden;
    if (st.hidden) { apply(); try { st.ctx && st.ctx.suspend(); } catch (e) {} }
    else { try { var p = st.ctx && st.ctx.resume(); if (p && p.then) p.then(apply, function () {}); else apply(); } catch (e) {} }
  });

  /* ---------- pengaturan (satu pengaturan untuk semua frame, lewat localStorage) ---------- */
  function emit() { st.listeners.forEach(function (f) { try { f({ sfx: st.sfxOn, bgm: st.bgmOn }); } catch (e) {} }); }
  window.addEventListener("storage", function (e) {
    if (e.key === K_BGM) { st.bgmOn = e.newValue !== "0"; apply(); emit(); }
    else if (e.key === K_SFX) { st.sfxOn = e.newValue !== "0"; emit(); }
  });

  /* ---------- klik tombol otomatis ---------- */
  var BTN = "button,[role=button],a[href],input[type=button],input[type=submit],.ubtn,.btn,[data-a],[data-t],[data-hg],[data-g],.hc,.gCard,.ch,[data-z],[data-v],[data-r]";
  var PRIMARY_DATA = /^(claim|claimAll|hatch|buyE|buyD|claimQ|daily|egg|place|speed|redeem|merge|up|bid)$/;
  function kindOf(el) {
    var d = el.dataset || {};
    if (d.snd) return d.snd;
    var cls = typeof el.className === "string" ? el.className : "", id = el.id || "";
    var txt = (el.textContent || "").trim().slice(0, 18).toLowerCase(), lab = ((el.getAttribute && el.getAttribute("aria-label")) || "").toLowerCase();
    if (d.close !== undefined || /back|close|exit|batal|cancel|tutup|keluar/i.test(id + " " + lab) || /^(←|✕|×|✖|tutup|batal|keluar|kembali)/.test(txt)) return "back";
    if (/toggle|sound|bgm|snd|mute/i.test(id + " " + cls)) return "tab";
    if (el.closest && el.closest("nav,.lbNav") || d.t !== undefined) return "tab";
    if (PRIMARY_DATA.test(d.a || "") || /(^|\s)(gold|go|gd|primary|maxbet)(\s|$)/.test(cls) || d.hg !== undefined || d.g !== undefined) return "primary";
    return "tap";
  }
  function autoBind(opts) {
    opts = opts || {};
    document.addEventListener("click", function (e) {
      if (!st.sfxOn) return;
      var t = e.target; if (!t || !t.closest) return;
      var el = t.closest(BTN); if (!el) return;
      if (el.closest("[data-nosnd]") || el.disabled || el.getAttribute("aria-disabled") === "true") return;
      if (opts.skip && opts.skip(el)) return;
      ui(kindOf(el));
    }, true);
  }

  window.DAFSound = {
    ui: ui, pet: pet, step: step, unlock: unlock, autoBind: autoBind,
    group: function (sp) { return GRP[sp] || "cat"; },
    bgm: function (name) { st.want = name; ensure(); apply(); },
    bgmStop: function () { st.want = null; apply(); },
    current: function () { return st.cur ? st.cur.name : null; },
    setBgm: function (on) { st.bgmOn = !!on; ls.set(K_BGM, on ? "1" : "0"); apply(); emit(); },
    setSfx: function (on) { st.sfxOn = !!on; ls.set(K_SFX, on ? "1" : "0"); emit(); },
    isBgm: function () { return st.bgmOn; }, isSfx: function () { return st.sfxOn; },
    toggleBgm: function () { this.setBgm(!st.bgmOn); return st.bgmOn; },
    onChange: function (fn) { st.listeners.push(fn); },
    _test: { use: function (c) { build(c); }, tracks: TRACKS, ui: UI, step: STEP, voice: VOICE, st: st }
  };
})();
