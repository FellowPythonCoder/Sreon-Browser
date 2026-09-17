/* ============================================================
   Sreon Arcade — shared engine
   Every game plugs into this: canvas setup, fixed-timestep loop,
   keyboard/touch input, score persistence, and simple WebAudio SFX.
   ============================================================ */

const Arcade = (() => {

  /* ---------- Input ---------- */
  const keys = Object.create(null);
  const justPressed = Object.create(null);
  let pointer = { x: 0, y: 0, down: false, justDown: false };

  window.addEventListener('keydown', e => {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
    if (!keys[e.key]) justPressed[e.key] = true;
    keys[e.key] = true;
  });
  window.addEventListener('keyup', e => { keys[e.key] = false; });

  function bindPointer(canvas) {
    const pos = e => {
      const r = canvas.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      pointer.x = (p.clientX - r.left) * (canvas.width / r.width);
      pointer.y = (p.clientY - r.top) * (canvas.height / r.height);
    };
    canvas.addEventListener('mousemove', pos);
    canvas.addEventListener('mousedown', e => { pos(e); pointer.down = true; pointer.justDown = true; });
    window.addEventListener('mouseup', () => { pointer.down = false; });
    canvas.addEventListener('touchstart', e => { e.preventDefault(); pos(e); pointer.down = true; pointer.justDown = true; }, {passive:false});
    canvas.addEventListener('touchmove', e => { e.preventDefault(); pos(e); }, {passive:false});
    canvas.addEventListener('touchend', e => { e.preventDefault(); pointer.down = false; }, {passive:false});
  }

  const Input = {
    held: k => !!keys[k],
    pressed: k => { const v = !!justPressed[k]; return v; },
    anyHeld: (...ks) => ks.some(k => keys[k]),
    pointer,
    clearFrame() {
      for (const k in justPressed) delete justPressed[k];
      pointer.justDown = false;
    }
  };

  /* ---------- Audio (tiny synth, no asset files) ---------- */
  let actx = null;
  function ac() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){} }
    return actx;
  }
  const Sound = {
    muted: false,
    tone(freq, dur = 0.08, type = 'square', vol = 0.06) {
      if (Sound.muted) return;
      const c = ac(); if (!c) return;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g); g.connect(c.destination);
      o.start(); o.stop(c.currentTime + dur);
    },
    blip()  { Sound.tone(660, 0.05); },
    good()  { Sound.tone(880, 0.09); setTimeout(()=>Sound.tone(1180, 0.09), 70); },
    bad()   { Sound.tone(180, 0.18, 'sawtooth'); },
    pop()   { Sound.tone(420, 0.06, 'triangle'); }
  };

  /* ---------- High scores (localStorage) ---------- */
  const Scores = {
    key: id => 'sreon_arcade_hs_' + id,
    get(id) { return Number(localStorage.getItem(Scores.key(id)) || 0); },
    set(id, v) {
      const cur = Scores.get(id);
      if (v > cur) { localStorage.setItem(Scores.key(id), String(v)); return true; }
      return false;
    }
  };

  /* ---------- Helpers ---------- */
  const rand  = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b));
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const aabb = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const dist = (x1,y1,x2,y2) => Math.hypot(x2-x1, y2-y1);
  const choice = arr => arr[randi(0, arr.length)];

  /* ---------- Game runner ---------- */
  /*
    Each game is: { id, name, desc, controls, w, h, init(g), update(g, dt), draw(g, ctx) }
    `g` is a per-run state bag the game owns. Engine provides:
      g.score, g.over, g.won, g.time, g.w, g.h
    Call g.gameOver() to end a run.
  */
  let current = null, rafId = null, lastT = 0, acc = 0;
  const STEP = 1 / 60;

  function start(def, canvas, hud) {
    stop();
    canvas.width = def.w || 640;
    canvas.height = def.h || 480;
    bindPointer(canvas);
    const ctx = canvas.getContext('2d');

    const g = {
      w: canvas.width, h: canvas.height,
      score: 0, over: false, won: false, time: 0,
      gameOver(won = false) { g.over = true; g.won = won; },
    };
    def.init(g);

    current = { def, g, ctx, canvas, hud };
    lastT = performance.now(); acc = 0;
    rafId = requestAnimationFrame(frame);
    return g;
  }

  function frame(t) {
    if (!current) return;
    const { def, g, ctx, hud } = current;
    let dt = (t - lastT) / 1000; lastT = t;
    if (dt > 0.25) dt = 0.25;
    acc += dt;

    while (acc >= STEP) {
      if (!g.over) { g.time += STEP; def.update(g, STEP); }
      Input.clearFrame();
      acc -= STEP;
    }

    def.draw(g, ctx);

    if (g.over) {
      drawOverlay(ctx, g);
      const isNew = Scores.set(def.id, Math.floor(g.score));
      if (hud) hud(g, isNew);
      // allow restart
      if (Input.held('Enter') || Input.held(' ') || pointer.down) {
        setTimeout(() => start(def, current.canvas, hud), 120);
        return;
      }
    }
    if (hud) hud(g, false);
    rafId = requestAnimationFrame(frame);
  }

  function drawOverlay(ctx, g) {
    const { width: w, height: h } = ctx.canvas;
    ctx.save();
    ctx.fillStyle = 'rgba(10,8,16,0.78)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = '700 34px "Space Grotesk", sans-serif';
    ctx.fillText(g.won ? 'You win!' : 'Game over', w/2, h/2 - 14);
    ctx.font = '500 16px Inter, sans-serif';
    ctx.fillStyle = '#c9c2e8';
    ctx.fillText('Score: ' + Math.floor(g.score), w/2, h/2 + 16);
    ctx.font = '500 13px Inter, sans-serif';
    ctx.fillStyle = '#8f88ad';
    ctx.fillText('Press Space / tap to play again', w/2, h/2 + 44);
    ctx.restore();
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null; current = null;
  }

  return { start, stop, Input, Sound, Scores, rand, randi, clamp, aabb, dist, choice };
})();
