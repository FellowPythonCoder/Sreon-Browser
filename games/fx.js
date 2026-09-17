/* ============================================================
   Sreon Arcade — FX layer
   Particles, screen shake, bloom/glow, trails, gradient skies.
   Games call FX.* to add juice; engine calls FX.update/FX.apply.
   ============================================================ */

const FX = (() => {
  let parts = [];
  let shake = 0, shakeT = 0;
  let flash = 0, flashColor = '#fff';

  function reset() { parts = []; shake = 0; shakeT = 0; flash = 0; }

  /* ---- particles ---- */
  function burst(x, y, color, n = 14, opts = {}) {
    const spd = opts.speed || 180;
    const life = opts.life || 0.6;
    const size = opts.size || 4;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = spd * (0.35 + Math.random() * 0.9);
      parts.push({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: life * (0.6 + Math.random() * 0.7), max: life,
        color, size: size * (0.5 + Math.random()),
        grav: opts.grav ?? 220, glow: opts.glow ?? true
      });
    }
  }
  function trail(x, y, color, opts = {}) {
    parts.push({
      x, y, vx: (Math.random()-0.5)*30, vy: (Math.random()-0.5)*30,
      life: opts.life || 0.35, max: opts.life || 0.35,
      color, size: opts.size || 3, grav: 0, glow: true
    });
  }
  function spark(x, y, color, dir, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = dir + (Math.random()-0.5) * 1.2;
      const s = 120 + Math.random()*260;
      parts.push({
        x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s,
        life: 0.4*(0.5+Math.random()), max: 0.4,
        color, size: 2.5, grav: 60, glow: true
      });
    }
  }

  /* ---- camera / screen ---- */
  function kick(amount = 8, dur = 0.25) { shake = Math.max(shake, amount); shakeT = dur; }
  function blink(color = '#fff', amount = 0.5) { flash = amount; flashColor = color; }

  function update(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.vx *= 0.99;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    if (shakeT > 0) { shakeT -= dt; if (shakeT <= 0) shake = 0; }
    if (flash > 0) flash = Math.max(0, flash - dt * 2.6);
  }

  /* wrap drawing so shake offsets everything */
  function begin(ctx) {
    ctx.save();
    if (shake > 0 && shakeT > 0) {
      const k = shake * (shakeT / 0.25);
      ctx.translate((Math.random()-0.5)*k, (Math.random()-0.5)*k);
    }
  }
  function end(ctx) {
    // particles render on top, inside the shake transform
    ctx.save();
    for (const p of parts) {
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      if (p.glow) { ctx.shadowColor = p.color; ctx.shadowBlur = 12; }
      ctx.fillStyle = p.color;
      const s = p.size * (0.4 + a * 0.8);
      ctx.fillRect(p.x - s/2, p.y - s/2, s, s);
    }
    ctx.restore();
    ctx.restore(); // matches begin()

    if (flash > 0) {
      ctx.save();
      ctx.globalAlpha = flash;
      ctx.fillStyle = flashColor;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
    }
  }

  /* ---- drawing helpers games can use ---- */
  function glowRect(ctx, x, y, w, h, color, blur = 14) {
    ctx.save();
    ctx.shadowColor = color; ctx.shadowBlur = blur;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
  function glowCircle(ctx, x, y, r, color, blur = 16) {
    ctx.save();
    ctx.shadowColor = color; ctx.shadowBlur = blur;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.restore();
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y, x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r);
    ctx.arcTo(x, y, x+w, y, r);
    ctx.closePath();
  }
  function glowRoundRect(ctx, x, y, w, h, r, color, blur = 14) {
    ctx.save();
    ctx.shadowColor = color; ctx.shadowBlur = blur;
    ctx.fillStyle = color;
    roundRect(ctx, x, y, w, h, r); ctx.fill();
    ctx.restore();
  }
  /* vertical gradient backdrop */
  function sky(ctx, w, h, top, bottom) {
    const gr = ctx.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, top); gr.addColorStop(1, bottom);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
  }
  /* soft radial vignette — cheap "cinematic" framing */
  function vignette(ctx, w, h, strength = 0.55) {
    const gr = ctx.createRadialGradient(w/2, h/2, Math.min(w,h)*0.3, w/2, h/2, Math.max(w,h)*0.75);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, `rgba(0,0,0,${strength})`);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
  }
  /* scrolling starfield, seeded so it's stable across frames */
  const starCache = {};
  function stars(ctx, w, h, offset = 0, count = 90, key = 'd') {
    if (!starCache[key]) {
      starCache[key] = Array.from({length: count}, () => ({
        x: Math.random()*w, y: Math.random()*h,
        r: Math.random()*1.6 + 0.4, sp: Math.random()*0.6 + 0.2
      }));
    }
    ctx.save();
    for (const s of starCache[key]) {
      const y = (s.y + offset * s.sp) % h;
      ctx.globalAlpha = 0.25 + s.r/2.4;
      ctx.fillStyle = '#fff';
      ctx.fillRect(s.x, y, s.r, s.r);
    }
    ctx.restore();
  }

  return {
    reset, burst, trail, spark, kick, blink, update, begin, end,
    glowRect, glowCircle, glowRoundRect, roundRect, sky, vignette, stars,
    get count() { return parts.length; }
  };
})();
