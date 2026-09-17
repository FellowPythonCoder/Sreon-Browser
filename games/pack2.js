/* ============================================================
   Sreon Arcade — game pack 2
   ============================================================ */

/* ---------------- SPACE INVADERS ---------------- */
const GAME_INVADERS = {
  id: 'invaders', name: 'Invaders', emoji: '👾',
  desc: 'Hold the line. They descend faster every wave.',
  controls: '← → move · Space shoot',
  w: 640, h: 560,
  init(g) {
    g.ship = { x: g.w/2-20, y: g.h-46, w: 40, h: 18, cool: 0 };
    g.bullets = []; g.bombs = []; g.wave = 1; g.lives = 3;
    g.buildWave = function() {
      g.aliens = [];
      const cols = 10, rows = 4 + Math.min(2, Math.floor(g.wave/3));
      for (let r=0;r<rows;r++) for (let c=0;c<cols;c++)
        g.aliens.push({ x: 60+c*52, y: 60+r*42, w: 34, h: 24, alive: true, row: r });
      g.adir = 1;
      g.aspeed = 26 + g.wave*7;
      g.fireRate = Math.max(0.5, 1.7 - g.wave*0.12);
      g.fireT = 0;
    };
    g.buildWave();
  },
  update(g, dt) {
    const s = g.ship;
    if (Input.anyHeld('ArrowLeft','a'))  s.x -= 340*dt;
    if (Input.anyHeld('ArrowRight','d')) s.x += 340*dt;
    s.x = clamp(s.x, 0, g.w - s.w);
    s.cool -= dt;
    if ((Input.held(' ') || Input.pointer.down) && s.cool <= 0) {
      g.bullets.push({ x: s.x+s.w/2-2, y: s.y, w: 4, h: 12, vy: -520 });
      s.cool = 0.32; Sound.blip();
    }

    const alive = g.aliens.filter(a=>a.alive);
    if (!alive.length) { g.wave++; g.score += 250; Sound.good(); g.buildWave(); return; }

    let hitEdge = false;
    alive.forEach(a => {
      a.x += g.adir * g.aspeed * dt;
      if (a.x < 8 || a.x + a.w > g.w-8) hitEdge = true;
    });
    if (hitEdge) { g.adir *= -1; alive.forEach(a => a.y += 22); }

    if (alive.some(a => a.y + a.h >= s.y)) { Sound.bad(); return g.gameOver(); }

    g.fireT += dt;
    if (g.fireT >= g.fireRate) {
      g.fireT = 0;
      const shooter = choice(alive);
      g.bombs.push({ x: shooter.x+shooter.w/2-2, y: shooter.y+shooter.h, w: 4, h: 12, vy: 260 });
    }

    g.bullets.forEach(b => b.y += b.vy*dt);
    g.bombs.forEach(b => b.y += b.vy*dt);
    g.bullets = g.bullets.filter(b => b.y > -20);
    g.bombs = g.bombs.filter(b => b.y < g.h+20);

    g.bullets.forEach(b => {
      for (const a of g.aliens) {
        if (a.alive && aabb(b, a)) {
          a.alive = false; b.y = -99;
          g.score += (5 - a.row) * 10; Sound.pop();
          break;
        }
      }
    });
    for (const b of g.bombs) {
      if (aabb(b, s)) {
        b.y = g.h+99; g.lives--; Sound.bad();
        if (g.lives <= 0) return g.gameOver();
      }
    }
  },
  draw(g, ctx) {
    bg(ctx, g);
    ctx.fillStyle = PALETTE.accent2;
    ctx.fillRect(g.ship.x, g.ship.y, g.ship.w, g.ship.h);
    ctx.fillRect(g.ship.x+g.ship.w/2-3, g.ship.y-8, 6, 8);
    g.aliens.forEach(a => {
      if (!a.alive) return;
      const cols = ['#f43f5e','#fb923c','#fbbf24','#4ade80','#22d3ee','#a855f7'];
      ctx.fillStyle = cols[a.row % cols.length];
      ctx.fillRect(a.x, a.y, a.w, a.h);
      ctx.fillStyle = PALETTE.bg;
      ctx.fillRect(a.x+7, a.y+7, 5, 5);
      ctx.fillRect(a.x+a.w-12, a.y+7, 5, 5);
    });
    ctx.fillStyle = PALETTE.ink;
    g.bullets.forEach(b => ctx.fillRect(b.x, b.y, b.w, b.h));
    ctx.fillStyle = PALETTE.bad;
    g.bombs.forEach(b => ctx.fillRect(b.x, b.y, b.w, b.h));
    text(ctx, 'SCORE ' + g.score, 14, 26, 14, PALETTE.dim);
    text(ctx, 'WAVE ' + g.wave, g.w/2, 26, 14, PALETTE.dim, 'center');
    text(ctx, 'LIVES ' + g.lives, g.w-14, 26, 14, PALETTE.dim, 'right');
  }
};

/* ---------------- FLAPPY ---------------- */
const GAME_FLAPPY = {
  id: 'flappy', name: 'Flappy', emoji: '🐦',
  desc: 'One button. Infinite frustration.',
  controls: 'Space / click to flap',
  w: 480, h: 600,
  init(g) {
    g.bird = { x: 120, y: g.h/2, r: 13, vy: 0 };
    g.pipes = []; g.spawnT = 0; g.gap = 165; g.started = false;
  },
  update(g, dt) {
    const flap = Input.pressed(' ') || Input.pointer.justDown;
    if (!g.started) { if (flap) { g.started = true; g.bird.vy = -300; } return; }
    if (flap) { g.bird.vy = -300; Sound.blip(); }

    g.bird.vy += 980*dt;
    g.bird.y += g.bird.vy*dt;

    g.spawnT += dt;
    if (g.spawnT > 1.45) {
      g.spawnT = 0;
      const top = rand(60, g.h - g.gap - 120);
      g.pipes.push({ x: g.w, top, w: 62, passed: false });
      g.gap = Math.max(125, g.gap - 1.5);
    }
    g.pipes.forEach(p => p.x -= 165*dt);
    g.pipes = g.pipes.filter(p => p.x > -80);

    for (const p of g.pipes) {
      if (!p.passed && p.x + p.w < g.bird.x) { p.passed = true; g.score += 10; Sound.good(); }
      const inX = g.bird.x + g.bird.r > p.x && g.bird.x - g.bird.r < p.x + p.w;
      const hitY = g.bird.y - g.bird.r < p.top || g.bird.y + g.bird.r > p.top + g.gap;
      if (inX && hitY) { Sound.bad(); return g.gameOver(); }
    }
    if (g.bird.y > g.h - g.bird.r || g.bird.y < g.bird.r) { Sound.bad(); return g.gameOver(); }
  },
  draw(g, ctx) {
    bg(ctx, g);
    g.pipes.forEach(p => {
      ctx.fillStyle = PALETTE.good;
      ctx.fillRect(p.x, 0, p.w, p.top);
      ctx.fillRect(p.x, p.top + g.gap, p.w, g.h);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(p.x, p.top-14, p.w, 14);
      ctx.fillRect(p.x, p.top+g.gap, p.w, 14);
    });
    ctx.save();
    ctx.translate(g.bird.x, g.bird.y);
    ctx.rotate(clamp(g.bird.vy/500, -0.5, 1));
    ctx.fillStyle = PALETTE.warn;
    ctx.beginPath(); ctx.arc(0,0,g.bird.r,0,7); ctx.fill();
    ctx.fillStyle = PALETTE.bg;
    ctx.beginPath(); ctx.arc(5,-4,3,0,7); ctx.fill();
    ctx.restore();
    text(ctx, String(g.score/10|0), g.w/2, 70, 40, PALETTE.ink, 'center', 700);
    if (!g.started) text(ctx, 'Space / tap to start', g.w/2, g.h/2+90, 14, PALETTE.dim, 'center');
  }
};

/* ---------------- MINESWEEPER ---------------- */
const GAME_MINES = {
  id: 'minesweeper', name: 'Minesweeper', emoji: '💣',
  desc: 'Classic logic. Right-click to flag.',
  controls: 'Click reveal · Right-click flag',
  w: 560, h: 600,
  init(g) {
    g.n = 12; g.mines = 22; g.cell = 42;
    g.ox = (g.w - g.n*g.cell)/2; g.oy = 80;
    g.grid = [];
    g.first = true; g.flags = 0;
    for (let r=0;r<g.n;r++) { g.grid[r]=[]; for(let c=0;c<g.n;c++)
      g.grid[r][c] = { mine:false, open:false, flag:false, n:0 }; }

    g.place = function(sr, sc) {
      let placed = 0;
      while (placed < g.mines) {
        const r = randi(0,g.n), c = randi(0,g.n);
        if (g.grid[r][c].mine) continue;
        if (Math.abs(r-sr)<=1 && Math.abs(c-sc)<=1) continue;
        g.grid[r][c].mine = true; placed++;
      }
      for (let r=0;r<g.n;r++) for (let c=0;c<g.n;c++) {
        let n=0;
        for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) {
          const rr=r+dr, cc=c+dc;
          if (rr>=0&&cc>=0&&rr<g.n&&cc<g.n&&g.grid[rr][cc].mine) n++;
        }
        g.grid[r][c].n = n;
      }
    };
    g.open = function(r,c) {
      if (r<0||c<0||r>=g.n||c>=g.n) return;
      const cell = g.grid[r][c];
      if (cell.open || cell.flag) return;
      cell.open = true;
      if (cell.mine) { Sound.bad(); return g.gameOver(); }
      g.score += 5; 
      if (cell.n === 0) {
        for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) g.open(r+dr,c+dc);
      }
    };
    g.checkWin = function() {
      for (let r=0;r<g.n;r++) for (let c=0;c<g.n;c++) {
        const cell = g.grid[r][c];
        if (!cell.mine && !cell.open) return;
      }
      Sound.good(); g.gameOver(true);
    };
    g.lastRight = false;
  },
  update(g) {
    const p = Input.pointer;
    if (!p.justDown) return;
    const c = Math.floor((p.x - g.ox)/g.cell);
    const r = Math.floor((p.y - g.oy)/g.cell);
    if (r<0||c<0||r>=g.n||c>=g.n) return;
    if (g.first) { g.place(r,c); g.first = false; }
    g.open(r,c); Sound.pop();
    if (!g.over) g.checkWin();
  },
  draw(g, ctx) {
    bg(ctx, g);
    text(ctx, 'Minesweeper', 24, 44, 24, PALETTE.ink, 'left', 700);
    text(ctx, g.mines + ' mines', g.w-24, 42, 14, PALETTE.dim, 'right');
    const NUMCOL = ['', '#60a5fa','#4ade80','#f43f5e','#a855f7','#fb923c','#22d3ee','#fbbf24','#94a3b8'];
    for (let r=0;r<g.n;r++) for (let c=0;c<g.n;c++) {
      const cell = g.grid[r][c];
      const x = g.ox + c*g.cell, y = g.oy + r*g.cell;
      ctx.fillStyle = cell.open ? 'rgba(255,255,255,0.05)' : PALETTE.panel;
      ctx.fillRect(x+1, y+1, g.cell-2, g.cell-2);
      if (cell.open) {
        if (cell.mine) text(ctx, '💣', x+g.cell/2, y+g.cell/2+8, 20, '#fff', 'center');
        else if (cell.n) text(ctx, String(cell.n), x+g.cell/2, y+g.cell/2+7, 18, NUMCOL[cell.n], 'center', 700);
      } else if (cell.flag) {
        text(ctx, '🚩', x+g.cell/2, y+g.cell/2+8, 18, '#fff', 'center');
      }
    }
  }
};

/* ---------------- ASTEROIDS ---------------- */
const GAME_ASTEROIDS = {
  id: 'asteroids', name: 'Asteroids', emoji: '🚀',
  desc: 'Drift, shoot, survive. Big rocks split.',
  controls: '← → turn · ↑ thrust · Space shoot',
  w: 640, h: 560,
  init(g) {
    g.ship = { x: g.w/2, y: g.h/2, a: -Math.PI/2, vx:0, vy:0, cool:0, inv: 2 };
    g.lives = 3; g.wave = 1;
    g.bullets = [];
    g.rocks = [];
    g.spawnRocks = function(n) {
      for (let i=0;i<n;i++) {
        let x, y;
        do { x = rand(0,g.w); y = rand(0,g.h); } while (dist(x,y,g.ship.x,g.ship.y) < 140);
        g.rocks.push({ x, y, vx: rand(-55,55), vy: rand(-55,55), r: 42, seed: rand(0,9) });
      }
    };
    g.spawnRocks(4);
  },
  update(g, dt) {
    const s = g.ship;
    s.inv -= dt;
    if (Input.anyHeld('ArrowLeft','a'))  s.a -= 3.4*dt;
    if (Input.anyHeld('ArrowRight','d')) s.a += 3.4*dt;
    if (Input.anyHeld('ArrowUp','w')) { s.vx += Math.cos(s.a)*280*dt; s.vy += Math.sin(s.a)*280*dt; }
    s.vx *= 0.993; s.vy *= 0.993;
    s.x = (s.x + s.vx*dt + g.w) % g.w;
    s.y = (s.y + s.vy*dt + g.h) % g.h;

    s.cool -= dt;
    if (Input.held(' ') && s.cool <= 0) {
      g.bullets.push({ x:s.x, y:s.y, vx: Math.cos(s.a)*460+s.vx, vy: Math.sin(s.a)*460+s.vy, life: 1.1 });
      s.cool = 0.22; Sound.blip();
    }
    g.bullets.forEach(b => { b.x=(b.x+b.vx*dt+g.w)%g.w; b.y=(b.y+b.vy*dt+g.h)%g.h; b.life-=dt; });
    g.bullets = g.bullets.filter(b => b.life > 0);

    g.rocks.forEach(r => { r.x=(r.x+r.vx*dt+g.w)%g.w; r.y=(r.y+r.vy*dt+g.h)%g.h; });

    outer:
    for (let i=g.rocks.length-1;i>=0;i--) {
      const r = g.rocks[i];
      for (let j=g.bullets.length-1;j>=0;j--) {
        const b = g.bullets[j];
        if (dist(b.x,b.y,r.x,r.y) < r.r) {
          g.bullets.splice(j,1); g.rocks.splice(i,1);
          g.score += Math.floor(120/r.r*10); Sound.pop();
          if (r.r > 18) {
            for (let k=0;k<2;k++) g.rocks.push({
              x:r.x, y:r.y, vx:rand(-90,90), vy:rand(-90,90), r:r.r/2, seed:rand(0,9)
            });
          }
          continue outer;
        }
      }
      if (s.inv <= 0 && dist(s.x,s.y,r.x,r.y) < r.r + 10) {
        g.lives--; Sound.bad();
        if (g.lives <= 0) return g.gameOver();
        s.x=g.w/2; s.y=g.h/2; s.vx=s.vy=0; s.inv=2.2;
      }
    }

    if (!g.rocks.length) { g.wave++; g.score += 300; Sound.good(); g.spawnRocks(3+g.wave); }
  },
  draw(g, ctx) {
    bg(ctx, g);
    ctx.strokeStyle = PALETTE.ink; ctx.lineWidth = 2;
    g.rocks.forEach(r => {
      ctx.beginPath();
      for (let i=0;i<9;i++) {
        const a = (i/9)*Math.PI*2;
        const rr = r.r * (0.78 + 0.28*Math.sin(i*2.7 + r.seed));
        const x = r.x + Math.cos(a)*rr, y = r.y + Math.sin(a)*rr;
        i ? ctx.lineTo(x,y) : ctx.moveTo(x,y);
      }
      ctx.closePath(); ctx.stroke();
    });
    ctx.fillStyle = PALETTE.accent2;
    g.bullets.forEach(b => { ctx.beginPath(); ctx.arc(b.x,b.y,2.5,0,7); ctx.fill(); });

    const s = g.ship;
    if (s.inv <= 0 || Math.floor(s.inv*10)%2===0) {
      ctx.save(); ctx.translate(s.x,s.y); ctx.rotate(s.a);
      ctx.strokeStyle = PALETTE.accent2;
      ctx.beginPath(); ctx.moveTo(14,0); ctx.lineTo(-10,-9); ctx.lineTo(-5,0); ctx.lineTo(-10,9);
      ctx.closePath(); ctx.stroke();
      if (Input.anyHeld('ArrowUp','w')) {
        ctx.strokeStyle = PALETTE.warn;
        ctx.beginPath(); ctx.moveTo(-6,-4); ctx.lineTo(-15,0); ctx.lineTo(-6,4); ctx.stroke();
      }
      ctx.restore();
    }
    text(ctx, 'SCORE ' + g.score, 14, 26, 14, PALETTE.dim);
    text(ctx, 'LIVES ' + g.lives, g.w-14, 26, 14, PALETTE.dim, 'right');
  }
};

/* ---------------- MEMORY MATCH ---------------- */
const GAME_MEMORY = {
  id: 'memory', name: 'Memory', emoji: '🃏',
  desc: 'Find all the pairs. Fewer moves = higher score.',
  controls: 'Click cards',
  w: 560, h: 560,
  init(g) {
    const icons = ['🍎','🚀','🎧','🌙','⚡','🎲','🔮','🍀'];
    g.cards = [...icons, ...icons]
      .map(v => ({ v, open:false, done:false }))
      .sort(()=>Math.random()-0.5);
    g.cols = 4; g.cell = 118; g.pad = 12;
    g.ox = (g.w - (g.cols*g.cell + (g.cols-1)*g.pad))/2;
    g.oy = 90;
    g.sel = []; g.moves = 0; g.lockT = 0; g.score = 1000;
  },
  update(g, dt) {
    if (g.lockT > 0) {
      g.lockT -= dt;
      if (g.lockT <= 0) { g.sel.forEach(i => g.cards[i].open = false); g.sel = []; }
      return;
    }
    const p = Input.pointer;
    if (!p.justDown || g.sel.length >= 2) return;
    const c = Math.floor((p.x - g.ox)/(g.cell+g.pad));
    const r = Math.floor((p.y - g.oy)/(g.cell+g.pad));
    if (c<0||r<0||c>=g.cols||r>=4) return;
    const i = r*g.cols + c;
    const card = g.cards[i];
    if (!card || card.open || card.done) return;
    card.open = true; g.sel.push(i); Sound.blip();

    if (g.sel.length === 2) {
      g.moves++;
      g.score = Math.max(50, g.score - 25);
      const [a,b] = g.sel;
      if (g.cards[a].v === g.cards[b].v) {
        g.cards[a].done = g.cards[b].done = true;
        g.sel = []; Sound.good();
        if (g.cards.every(c2 => c2.done)) g.gameOver(true);
      } else { g.lockT = 0.7; Sound.bad(); }
    }
  },
  draw(g, ctx) {
    bg(ctx, g);
    text(ctx, 'Memory', 24, 46, 24, PALETTE.ink, 'left', 700);
    text(ctx, 'MOVES ' + g.moves, g.w-24, 44, 14, PALETTE.dim, 'right');
    g.cards.forEach((card, i) => {
      const r = Math.floor(i/g.cols), c = i%g.cols;
      const x = g.ox + c*(g.cell+g.pad), y = g.oy + r*(g.cell+g.pad);
      const show = card.open || card.done;
      ctx.fillStyle = card.done ? 'rgba(74,222,128,0.18)' : show ? 'rgba(255,255,255,0.08)' : PALETTE.accent;
      ctx.fillRect(x, y, g.cell, g.cell);
      if (show) text(ctx, card.v, x+g.cell/2, y+g.cell/2+16, 44, '#fff', 'center');
      else text(ctx, '?', x+g.cell/2, y+g.cell/2+12, 32, 'rgba(255,255,255,0.4)', 'center', 700);
    });
  }
};

window.GAME_PACK_2 = [GAME_INVADERS, GAME_FLAPPY, GAME_MINES, GAME_ASTEROIDS, GAME_MEMORY];
