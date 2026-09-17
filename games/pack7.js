/* ============================================================
   Sreon Arcade — Geometry Rush (Geometry Dash-style)
   Auto-runner: cube (jump), ship (fly), wave (zigzag).
   10 procedurally-built levels, seeded for determinism.
   ============================================================ */

function mulberry32(seed) {
  return function() {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- level generation ---- */
function buildLevel(idx) {
  const rnd = mulberry32(1000 + idx*97);
  const r = (a,b) => a + rnd()*(b-a);
  const ri = (a,b) => Math.floor(r(a,b+1));
  const speed = 300 + idx*24;
  const length = 90 + idx*14; // world units
  const obs = []; // {x, type, w, h, y}  x in units, y in units from ground (0)
  let x = 6; // safe start
  let mode = 'cube';
  const zones = []; // {from, to, mode}
  zones.push({ from: 0, to: length, mode: 'cube' });

  function setZone(from, mode) {
    // close previous zone, open new
    zones[zones.length-1].to = from;
    zones.push({ from, to: length, mode });
  }

  const complexity = clamp(idx/10, 0, 1);
  while (x < length - 8) {
    const roll = rnd();
    const wantModeSwitch = idx >= 3 && rnd() < 0.10 + complexity*0.05 && mode === 'cube' && x > 14;

    if (wantModeSwitch) {
      const newMode = rnd() < 0.5 ? 'ship' : 'wave';
      obs.push({ x, type: 'portal', mode: newMode });
      setZone(x+1, newMode);
      mode = newMode;
      x += 1.5;
      const zoneLen = ri(10, 16);
      if (mode === 'ship') {
        // alternating top/bottom obstacle pairs forming a corridor
        let cx = x;
        const end = x + zoneLen;
        while (cx < end) {
          const gapY = r(1.6, 3.2);
          const gapH = r(1.6, 2.1) - complexity*0.3;
          obs.push({ x: cx, type: 'shipBlockTop', y: gapY+gapH, h: 5-gapY-gapH, w: 1.4 });
          obs.push({ x: cx, type: 'shipBlockBot', y: 0, h: gapY, w: 1.4 });
          cx += r(3.2, 4.4);
        }
        x = end + 1;
      } else {
        // wave corridor: zigzag walls
        let cx = x;
        const end = x + zoneLen;
        let lane = 1;
        while (cx < end) {
          const gapY = lane ? 0.4 : 2.6;
          obs.push({ x: cx, type: 'waveWallTop', y: gapY+1.6, h: 3, w: 1.1 });
          obs.push({ x: cx, type: 'waveWallBot', y: 0, h: gapY, w: 1.1 });
          lane = 1-lane;
          cx += r(2.6, 3.4);
        }
        x = end + 1;
      }
      obs.push({ x, type: 'portal', mode: 'cube' });
      setZone(x+0.5, 'cube');
      mode = 'cube';
      x += 2.5;
      continue;
    }

    if (mode !== 'cube') { x += 3; continue; } // safety (shouldn't hit, zones consume x already)

    if (roll < 0.34) {
      const n = ri(1, 1+Math.floor(complexity*2));
      for (let i=0;i<n;i++) obs.push({ x: x+i*0.9, type:'spike' });
      x += n*0.9 + r(2.2, 3.4);
    } else if (roll < 0.55) {
      const w = r(1.6, 2.4 + complexity*0.9);
      obs.push({ x, type:'gap', w });
      x += w + r(2, 3);
    } else if (roll < 0.78) {
      obs.push({ x, type:'block', h:1, w:1.3 });
      x += 1.3 + r(1.8, 2.8);
    } else {
      // a low block immediately followed by a spike — tests reaction, still clearable
      // with a single well-timed jump since both fit under one jump arc
      obs.push({ x, type:'block', h:1, w:1.1 });
      obs.push({ x: x+1.5, type:'spike' });
      x += 2.6 + r(1.8,2.6);
    }
  }
  zones[zones.length-1].to = length + 5;
  return { obs, length, speed, zones, seedIdx: idx };
}

const GD_THEMES = [
  ['#7C3AED','#c026d3'], ['#0891b2','#22d3ee'], ['#dc2626','#fb923c'],
  ['#15803d','#4ade80'], ['#a855f7','#ec4899'], ['#0284c7','#38bdf8'],
  ['#ea580c','#facc15'], ['#4338ca','#818cf8'], ['#be123c','#fb7185'],
  ['#065f46','#10b981']
];

const GAME_GD = {
  id: 'geodash', name: 'Geometry Rush', emoji: '🔺',
  desc: '10 levels. Cube, ship, and wave modes. One hit and you restart.',
  controls: 'Space / click / tap: jump (cube) · hold to fly (ship) · hold to rise (wave)',
  w: 760, h: 460,

  init(g) {
    g.PPU = 34; // pixels per world unit
    g.groundY = g.h - 70;
    g.selMode = true;
    g.selIdx = Number(localStorage.getItem('sreon_gd_lastlevel')||0);
    g.best = {};
    for (let i=0;i<10;i++) g.best[i] = Number(localStorage.getItem('sreon_gd_best_'+i)||0);
    g.playerColors = ['#4ade80','#22d3ee','#f43f5e','#fbbf24','#a855f7','#ffffff'];
    g.playerColorIdx = Number(localStorage.getItem('sreon_gd_color')||0);
  },

  update(g, dt) {
    if (g.selMode) { g.updateSelect(g, dt); return; }
    g.updatePlay(g, dt);
  },

  draw(g, ctx) {
    if (g.selMode) { g.drawSelect(g, ctx); return; }
    g.drawPlay(g, ctx);
  }
};

(function(){
  const origInit = GAME_GD.init;
  GAME_GD.init = function(g) {
    origInit(g);

    /* ---------------- LEVEL SELECT ---------------- */
    g.updateSelect = function(g, dt) {
      const p = Input.pointer;
      if (!p.justDown) return;
      const cols = 5, cw = 130, ch = 90, gapx=14, gapy=14;
      const totalW = cols*cw + (cols-1)*gapx;
      const ox = (g.w-totalW)/2, oy = 110;
      for (let i=0;i<10;i++) {
        const cx = ox + (i%cols)*(cw+gapx), cy = oy + Math.floor(i/cols)*(ch+gapy);
        if (p.x>=cx && p.x<=cx+cw && p.y>=cy && p.y<=cy+ch) {
          g.selIdx = i; localStorage.setItem('sreon_gd_lastlevel', i);
          Sound.blip();
          g.startLevel(g, i);
          return;
        }
      }
      // color swatches
      const swY = g.h - 60, sw=24, gap=8, startX = g.w/2 - (g.playerColors.length*(sw+gap))/2;
      g.playerColors.forEach((c,i) => {
        const bx = startX+i*(sw+gap);
        if (p.x>=bx&&p.x<=bx+sw&&p.y>=swY&&p.y<=swY+sw) {
          g.playerColorIdx = i; localStorage.setItem('sreon_gd_color', i); Sound.blip();
        }
      });
    };

    g.drawSelect = function(g, ctx) {
      FX.sky(ctx, g.w, g.h, '#150f2e', '#05040c');
      FX.stars(ctx, g.w, g.h, g.time*10, 70, 'gdsel');
      text(ctx, 'GEOMETRY RUSH', g.w/2, 56, 30, '#e9d5ff', 'center', 700);
      text(ctx, 'pick a level', g.w/2, 82, 13, 'rgba(255,255,255,0.4)', 'center');

      const cols = 5, cw = 130, ch = 90, gapx=14, gapy=14;
      const totalW = cols*cw + (cols-1)*gapx;
      const ox = (g.w-totalW)/2, oy = 110;
      for (let i=0;i<10;i++) {
        const cx = ox + (i%cols)*(cw+gapx), cy = oy + Math.floor(i/cols)*(ch+gapy);
        const theme = GD_THEMES[i];
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        FX.roundRect(ctx, cx, cy, cw, ch, 10); ctx.fill();
        ctx.strokeStyle = theme[0]; ctx.lineWidth = 2;
        ctx.shadowColor = theme[0]; ctx.shadowBlur = 10;
        FX.roundRect(ctx, cx, cy, cw, ch, 10); ctx.stroke();
        ctx.restore();
        text(ctx, 'LEVEL ' + (i+1), cx+cw/2, cy+30, 13, '#efeaff', 'center', 700);
        ctx.fillStyle = theme[1];
        ctx.fillRect(cx+cw/2-16, cy+42, 32, 6);
        const best = g.best[i]||0;
        text(ctx, best + '%', cx+cw/2, cy+68, 15, best>=100?'#4ade80':'#c4b5fd', 'center', 700);
      }

      text(ctx, 'CUBE COLOR', g.w/2, g.h-78, 11, 'rgba(255,255,255,0.4)', 'center', 700);
      const swY = g.h-60, sw=24, gap=8, startX = g.w/2 - (g.playerColors.length*(sw+gap))/2;
      g.playerColors.forEach((c,i) => {
        const bx = startX+i*(sw+gap);
        ctx.save();
        if (i===g.playerColorIdx) { ctx.shadowColor=c; ctx.shadowBlur=12; ctx.strokeStyle='#fff'; ctx.lineWidth=2; }
        ctx.fillStyle = c;
        FX.roundRect(ctx, bx, swY, sw, sw, 5); ctx.fill();
        if (i===g.playerColorIdx) ctx.stroke();
        ctx.restore();
      });
    };

    g.startLevel = function(g, idx) {
      g.selMode = false;
      g.lvl = buildLevel(idx);
      g.theme = GD_THEMES[idx];
      g.px = 2.2; g.py = 0; g.pvy = 0;
      g.mode = 'cube';
      g.angle = 0;
      g.grounded = true;
      g.scrollX = 0;
      g.dead = false; g.deadT = 0;
      g.progress = 0;
      g.attempts = (g.attempts||0) + 1;
      g.trail = [];
      g.holding = false;
      g.flashT = 0;
      g.gravityDir = 1;
    };

    g.currentZoneMode = function(g, worldX) {
      for (const z of g.lvl.zones) if (worldX >= z.from && worldX < z.to) return z.mode;
      return 'cube';
    };

    g.resetToStart = function(g) {
      g.px = 2.2; g.py = 0; g.pvy = 0; g.mode = 'cube';
      g.grounded = true;
      g.scrollX = 0; g.dead = false; g.trail = [];
      g.gravityDir = 1;
    };

    /* ---------------- PLAY ---------------- */
    g.updatePlay = function(g, dt) {
      const p = Input.pointer;
      const wantAction = Input.held(' ') || p.down;

      if (g.dead) {
        g.deadT -= dt;
        if (g.deadT <= 0) g.resetToStart(g);
        return;
      }

      if (Input.pressed('Escape')) { g.selMode = true; return; }

      const speed = g.lvl.speed / g.PPU; // units/sec
      g.scrollX += speed*dt;
      const worldX = g.px + g.scrollX;
      g.progress = clamp(worldX/g.lvl.length, 0, 1);

      const zoneMode = g.currentZoneMode(g, worldX);
      if (zoneMode !== g.mode) { g.mode = zoneMode; FX.shockwave(g.px*g.PPU, g.h-140, '#fff', 40, 0.3); Sound.pop(); }

      if (g.mode === 'cube') {
        g.pvy -= 34*dt * g.gravityDir;
        if (wantAction && !g._heldPrev && g.grounded) { g.pvy = 11*g.gravityDir; Sound.blip(); FX.burst(g.px*g.PPU, g.groundY, g.theme[1], 8, {speed:80}); }
        g.py += g.pvy*dt;
        g.angle += (g.grounded?0:9)*dt*g.gravityDir;
        // ground collision
        const floorHere = g.groundSolidAt(g, worldX);
        if (floorHere && g.py <= 0 && g.pvy <= 0 && g.gravityDir>0) { g.py = 0; g.pvy = 0; g.grounded = true; g.angle = Math.round(g.angle/ (Math.PI/2)) * (Math.PI/2); }
        else if (floorHere && g.gravityDir<0 && g.py>=0 && g.pvy>=0) { g.py=0; g.pvy=0; g.grounded=true; }
        else g.grounded = false;
        if (g.py < -6 || g.py > 6) g.kill(g);
      } else if (g.mode === 'ship') {
        const thrust = wantAction ? -22 : 14;
        g.pvy += thrust*dt;
        g.pvy = clamp(g.pvy, -9, 9);
        g.py += g.pvy*dt;
        g.angle = clamp(g.pvy*0.06, -0.5, 0.5);
        if (g.py < -3.4 || g.py > 3.8) g.kill(g);
      } else if (g.mode === 'wave') {
        const dir = wantAction ? 1 : -1;
        g.py += dir * 9 * dt;
        g.angle = dir>0 ? -0.5 : 0.5;
        if (g.py < -3.2 || g.py > 3.6) g.kill(g);
      }

      g._heldPrev = wantAction;

      g.trail.push({ x: g.px, y: g.py, life: 0.35 });
      g.trail = g.trail.filter(t => (t.life -= dt) > 0);

      // collisions with obstacles
      for (const o of g.lvl.obs) {
        if (g.checkHit(g, o, worldX)) { g.kill(g); break; }
      }

      if (worldX >= g.lvl.length) g.finishLevel(g);
    };

    g.groundSolidAt = function(g, worldX) {
      for (const o of g.lvl.obs) {
        if (o.type === 'gap' && worldX >= o.x && worldX <= o.x + o.w) return false;
      }
      return true;
    };

    g.checkHit = function(g, o, worldX) {
      const px = worldX, py = g.py;
      const pr = 0.42;
      if (o.type === 'spike') {
        if (Math.abs(px - (o.x+0.5)) < 0.30 && py < 0.55) return true;
      } else if (o.type === 'block') {
        if (px+pr > o.x && px-pr < o.x+o.w) {
          if (py < o.h - 0.08) {
            // side/underside hit is deadly unless standing exactly on top
            if (!(g.grounded && Math.abs(py-o.h) < 0.12)) return true;
          }
        }
      } else if (o.type === 'gap') {
        if (worldX >= o.x+0.15 && worldX <= o.x+o.w-0.15 && py <= 0.05 && g.mode==='cube') return true;
      } else if (o.type === 'shipBlockTop' || o.type==='waveWallTop') {
        if (px+pr > o.x && px-pr < o.x+o.w && py+pr > o.y) return true;
      } else if (o.type === 'shipBlockBot' || o.type==='waveWallBot') {
        if (px+pr > o.x && px-pr < o.x+o.w && py-pr < o.y+o.h) return true;
      }
      return false;
    };

    g.kill = function(g) {
      if (g.dead) return;
      g.dead = true; g.deadT = 0.55;
      Sound.bad(); FX.kick(16, 0.35); FX.blink('#f43f5e', 0.45);
      FX.burst(g.px*g.PPU, g.h-140-g.py*g.PPU, g.theme[1], 30, {speed:240});
      const pct = Math.floor(g.progress*100);
      if (pct > (g.best[g.lvl.seedIdx]||0)) {
        g.best[g.lvl.seedIdx] = pct;
        localStorage.setItem('sreon_gd_best_'+g.lvl.seedIdx, pct);
      }
    };

    g.finishLevel = function(g) {
      g.best[g.lvl.seedIdx] = 100;
      localStorage.setItem('sreon_gd_best_'+g.lvl.seedIdx, 100);
      g.score += 500 + g.lvl.seedIdx*100;
      Sound.good(); FX.blink('#4ade80', 0.5); FX.kick(10,0.3);
      g.selMode = true;
    };

    /* ---------------- DRAW ---------------- */
    g.drawPlay = function(g, ctx) {
      const th = g.theme;
      FX.sky(ctx, g.w, g.h, th[0]+'33', '#050510');
      // parallax bg triangles
      ctx.save();
      ctx.globalAlpha = 0.15;
      for (let i=0;i<8;i++) {
        const bx = ((i*140 - g.scrollX*g.PPU*0.2) % (g.w+140)) - 70;
        ctx.fillStyle = th[1];
        ctx.beginPath();
        ctx.moveTo(bx, g.groundY); ctx.lineTo(bx+40, g.groundY-70); ctx.lineTo(bx+80, g.groundY);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();

      // ground
      ctx.save();
      ctx.fillStyle = 'rgba(10,8,20,0.9)';
      ctx.fillRect(0, g.groundY, g.w, g.h-g.groundY);
      ctx.strokeStyle = th[1]; ctx.lineWidth = 2;
      ctx.shadowColor = th[1]; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(0,g.groundY); ctx.lineTo(g.w,g.groundY); ctx.stroke();
      ctx.restore();

      const toScreenX = (worldX) => (worldX - g.scrollX)*g.PPU;
      const toScreenY = (worldY) => g.groundY - worldY*g.PPU;

      // obstacles
      for (const o of g.lvl.obs) {
        const sx = toScreenX(o.x);
        if (sx < -100 || sx > g.w+100) continue;
        if (o.type === 'spike') {
          const sy = g.groundY;
          ctx.save();
          ctx.fillStyle = th[1]; ctx.shadowColor = th[1]; ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.moveTo(sx, sy); ctx.lineTo(sx+g.PPU*0.5, sy-g.PPU*0.85); ctx.lineTo(sx+g.PPU, sy);
          ctx.closePath(); ctx.fill();
          ctx.restore();
        } else if (o.type === 'block') {
          const h = o.h*g.PPU, w=o.w*g.PPU;
          FX.glowRoundRect(ctx, sx, g.groundY-h, w, h, 4, th[0], 8);
          ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.strokeRect(sx, g.groundY-h, w, h);
        } else if (o.type === 'gap') {
          ctx.fillStyle = '#050510';
          ctx.fillRect(sx, g.groundY, o.w*g.PPU, g.h-g.groundY);
        } else if (o.type === 'shipBlockTop' || o.type === 'shipBlockBot' || o.type==='waveWallTop' || o.type==='waveWallBot') {
          const sy = toScreenY(o.y+o.h);
          const h = o.h*g.PPU, w=o.w*g.PPU;
          FX.glowRoundRect(ctx, sx, sy, w, h, 3, th[1], 8);
        } else if (o.type === 'portal') {
          const sy = g.groundY - 1.1*g.PPU;
          const col = o.mode==='ship' ? '#22d3ee' : o.mode==='wave' ? '#fbbf24' : '#4ade80';
          ctx.save();
          ctx.strokeStyle = col; ctx.lineWidth = 3;
          ctx.shadowColor = col; ctx.shadowBlur = 16;
          ctx.beginPath(); ctx.ellipse(sx+16, sy, 16, 46, 0, 0, 7); ctx.stroke();
          ctx.restore();
        }
      }

      // trail
      g.trail.forEach(t => {
        ctx.globalAlpha = clamp(t.life/0.35,0,1)*0.5;
        FX.glowRect(ctx, toScreenX(t.x)-4, toScreenY(t.y)-4, 8, 8, g.playerColors[g.playerColorIdx], 6);
      });
      ctx.globalAlpha = 1;

      // player
      if (!g.dead) {
        const sx = toScreenX(g.px), sy = toScreenY(g.py);
        ctx.save();
        ctx.translate(sx+g.PPU*0.42, sy-g.PPU*0.42);
        ctx.rotate(g.angle);
        const col = g.playerColors[g.playerColorIdx];
        FX.glowRoundRect(ctx, -g.PPU*0.42, -g.PPU*0.42, g.PPU*0.84, g.PPU*0.84, 6, col, 16);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.strokeRect(-g.PPU*0.42,-g.PPU*0.42,g.PPU*0.84,g.PPU*0.84);
        ctx.restore();
      }

      FX.vignette(ctx, g.w, g.h, 0.4);

      // HUD
      ctx.save();
      ctx.fillStyle = 'rgba(6,10,18,0.5)';
      ctx.fillRect(0,0,g.w,34);
      ctx.restore();
      text(ctx, 'LEVEL ' + (g.lvl.seedIdx+1), 16, 22, 13, '#efeaff', 'left', 700);
      text(ctx, Math.floor(g.progress*100)+'%', g.w/2, 22, 14, '#4ade80', 'center', 700);
      text(ctx, g.mode.toUpperCase(), g.w-16, 22, 12, th[1], 'right', 700);
      // progress bar
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(0, 34, g.w, 3);
      ctx.fillStyle = th[1];
      ctx.fillRect(0, 34, g.w*g.progress, 3);

      if (g.dead) {
        ctx.save();
        ctx.fillStyle = 'rgba(244,63,94,0.18)';
        ctx.fillRect(0,0,g.w,g.h);
        ctx.restore();
      }
    };
  };
})();

window.GAME_PACK_7 = [GAME_GD];
