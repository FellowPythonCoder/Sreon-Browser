/* ============================================================
   Sreon Arcade — game pack 8
   Space Waves: a self-contained, single-button tunnel run.
   ============================================================ */
const GAME_SPACE_WAVES = (() => {
  const WIDTH = 760;
  const HEIGHT = 460;
  const PLAYER_X = 154;
  const PLAYER_RADIUS = 10;
  const GATE_WIDTH = 34;
  const EDGE = 32;
  const LEVEL_COUNT = 33;
  const GRID = { columns: 11, tileWidth: 56, tileHeight: 48, gap: 8, top: 112 };
  const PALETTES = [
    ['#28d7ff', '#8672ff'], ['#4ce0c1', '#3989ff'], ['#ff65cb', '#774fff'],
    ['#ffbd5b', '#ff5c91'], ['#9a8bff', '#40c8ff'], ['#5de7ff', '#54e08b']
  ];
  const LEVEL_NAMES = ['First light', 'Blue drift', 'Soft turns', 'The long way', 'Narrowing', 'Crosswind'];
  const SPIKE_DEPTH = 16;

  function makeRandom(seed) {
    return function random() {
      seed |= 0;
      seed = (seed + 0x6D2B79F5) | 0;
      let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function difficultyFor(level, stage = 0, endless = false) {
    return endless ? Math.min(1, stage / 18) : level / (LEVEL_COUNT - 1);
  }

  function drawButton(ctx, x, y, width, height, label, accent, filled = false) {
    ctx.save();
    ctx.fillStyle = filled ? `${accent}33` : 'rgba(255,255,255,0.035)';
    FX.roundRect(ctx, x, y, width, height, 9);
    ctx.fill();
    ctx.strokeStyle = filled ? `${accent}bb` : 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    FX.roundRect(ctx, x, y, width, height, 9);
    ctx.stroke();
    text(ctx, label, x + width / 2, y + height / 2 + 4, 11, filled ? '#f5f0ff' : '#c1b9d4', 'center', 700);
    ctx.restore();
  }

  function makeGate(g, index, stage = g.endlessStage) {
    const last = g.gates[g.gates.length - 1];
    const difficulty = difficultyFor(g.levelIndex, stage, g.endless);
    const gap = 224 - difficulty * 78;
    const availableDrift = Math.max(18, (HEIGHT - gap) / 2 - 52);
    const minCenter = HEIGHT / 2 - availableDrift;
    const maxCenter = HEIGHT / 2 + availableDrift;
    const previousCenter = last ? last.center : HEIGHT / 2;
    const drift = (g.random() * 2 - 1) * (42 + difficulty * 34);
    const center = Math.max(minCenter, Math.min(maxCenter, previousCenter + drift));
    const spikeChance = g.endless ? 0.12 + difficulty * 0.48 : 0.05 + difficulty * 0.4;
    const spikeSide = g.random() < spikeChance ? (g.random() < 0.5 ? 'top' : 'bottom') : '';
    const gate = {
      index,
      x: last ? last.x + g.spacing : 480,
      center,
      gap,
      spikeSide,
      passed: false
    };

    if (last) {
      const gearChance = g.endless ? 0.2 + difficulty * 0.4 : 0.1 + difficulty * 0.34;
      if (g.random() < gearChance) {
        const side = g.random() < 0.5 ? -1 : 1;
        const middle = (previousCenter + center) / 2;
        const opening = Math.min(last.gap, gap);
        const offset = Math.max(25, opening * 0.5 - 31);
        g.gears.push({
          x: gate.x - g.spacing * 0.52,
          y: middle + side * offset,
          radius: 13 + difficulty * 3,
          rotation: g.random() * Math.PI * 2
        });
      }
    }
    return gate;
  }

  function addGates(g, count) {
    const start = g.gates.length ? g.gates[g.gates.length - 1].index + 1 : 0;
    for (let index = start; index < start + count; index++) {
      const stage = g.endless ? Math.floor(index / 10) : 0;
      if (g.endless) {
        const difficulty = difficultyFor(0, stage, true);
        g.spacing = 308 - difficulty * 42;
      }
      g.gates.push(makeGate(g, index, stage));
    }
  }

  function startLevel(g, levelIndex = 0, endless = false) {
    const selected = Math.max(0, Math.min(LEVEL_COUNT - 1, Math.floor(Number(levelIndex) || 0)));
    g.levelIndex = selected;
    if (!endless) g.selectedLevel = selected;
    g.endless = Boolean(endless);
    g.endlessStage = 0;
    g.selMode = false;
    g.paused = false;
    g.distance = 0;
    g.shipY = HEIGHT / 2;
    g.shipVy = 0;
    g.score = 0;
    g.passedGates = 0;
    g.completed = '';
    g.failed = false;
    g.gears = [];
    g.gates = [];
    g.random = makeRandom(0x5ace1234 + selected * 7919 + (endless ? 0x7319 : 0));

    const difficulty = difficultyFor(selected);
    g.speed = 190 + difficulty * 76;
    g.spacing = 308 - difficulty * 42;
    g.levelLength = endless ? Infinity : 7 + Math.floor(selected / 3);
    addGates(g, endless ? 14 : g.levelLength);
    g.finishDistance = endless
      ? Infinity
      : g.gates[g.gates.length - 1].x + g.spacing + 300;
    return g;
  }

  function returnToLevels(g) {
    const previousSelection = g.endless ? g.selectedLevel : g.levelIndex;
    g.selMode = true;
    g.endless = false;
    g.paused = false;
    g.selectedLevel = previousSelection ?? 0;
    g.distance = 0;
    g.shipY = HEIGHT / 2;
    g.shipVy = 0;
    g.completed = '';
  }

  function selectedTileAt(x, y) {
    const totalWidth = GRID.columns * GRID.tileWidth + (GRID.columns - 1) * GRID.gap;
    const left = (WIDTH - totalWidth) / 2;
    const column = Math.floor((x - left) / (GRID.tileWidth + GRID.gap));
    const row = Math.floor((y - GRID.top) / (GRID.tileHeight + GRID.gap));
    if (column < 0 || column >= GRID.columns || row < 0 || row >= 3) return -1;
    const tileX = left + column * (GRID.tileWidth + GRID.gap);
    const tileY = GRID.top + row * (GRID.tileHeight + GRID.gap);
    if (x > tileX + GRID.tileWidth || y > tileY + GRID.tileHeight) return -1;
    const index = row * GRID.columns + column;
    return index < LEVEL_COUNT ? index : -1;
  }

  function crash(g, x = PLAYER_X, y = g.shipY) {
    if (g.over) return;
    g.failed = true;
    Sound.bad();
    FX.burst(x, y, '#ff5b9b', 28, { speed: 240, grav: 0, size: 3 });
    FX.kick(12, 0.3);
    FX.blink('#ff4a8a', 0.32);
    g.gameOver(false);
  }

  function updateSelection(g) {
    if (Input.pressed('ArrowRight')) g.selectedLevel = Math.min(LEVEL_COUNT - 1, g.selectedLevel + 1);
    if (Input.pressed('ArrowLeft')) g.selectedLevel = Math.max(0, g.selectedLevel - 1);
    if (Input.pressed('ArrowDown')) g.selectedLevel = Math.min(LEVEL_COUNT - 1, g.selectedLevel + GRID.columns);
    if (Input.pressed('ArrowUp')) g.selectedLevel = Math.max(0, g.selectedLevel - GRID.columns);
    if (Input.pressed('Home')) g.selectedLevel = 0;
    if (Input.pressed('End')) g.selectedLevel = LEVEL_COUNT - 1;
    if (Input.pressed('e') || Input.pressed('E')) {
      startLevel(g, 0, true);
      Sound.blip();
      return;
    }
    if (Input.pressed('Enter') || Input.pressed(' ')) {
      startLevel(g, g.selectedLevel);
      Sound.blip();
      return;
    }

    const pointer = Input.pointer;
    if (!pointer.justDown) return;
    const level = selectedTileAt(pointer.x, pointer.y);
    if (level >= 0) {
      g.selectedLevel = level;
      startLevel(g, level);
      Sound.blip();
      return;
    }

    const left = WIDTH / 2 - 162;
    const top = 310;
    if (pointer.x >= left && pointer.x <= left + 150 && pointer.y >= top && pointer.y <= top + 44) {
      startLevel(g, g.selectedLevel);
      Sound.blip();
    } else if (pointer.x >= left + 174 && pointer.x <= left + 324 && pointer.y >= top && pointer.y <= top + 44) {
      startLevel(g, 0, true);
      Sound.blip();
    }
  }

  function update(g, dt) {
    if (g.selMode) {
      updateSelection(g);
      return;
    }
    if (Input.pressed('Escape')) {
      returnToLevels(g);
      return;
    }
    if (Input.pressed('p') || Input.pressed('P')) {
      g.paused = !g.paused;
      return;
    }
    if (g.paused) return;

    if (g.endless) {
      g.endlessStage = Math.floor(g.passedGates / 10);
      const difficulty = difficultyFor(0, g.endlessStage, true);
      g.speed = 190 + difficulty * 76;
    }

    const rising = Input.anyHeld(' ', 'w', 'W', 'ArrowUp') || Input.pointer.down;
    g.shipVy = rising
      ? Math.max(-292, g.shipVy - 920 * dt)
      : Math.min(258, g.shipVy + 660 * dt);
    g.shipY += g.shipVy * dt;
    g.distance += g.speed * dt;

    FX.trail(PLAYER_X - 13, g.shipY, '#39d9ff', { life: 0.28, size: 3.5 });

    if (g.shipY < EDGE + PLAYER_RADIUS || g.shipY > HEIGHT - EDGE - PLAYER_RADIUS) {
      crash(g);
      return;
    }

    for (const gate of g.gates) {
      const delta = gate.x - g.distance;
      if (Math.abs(delta) <= GATE_WIDTH / 2 + PLAYER_RADIUS) {
        const clearance = gate.gap / 2 - PLAYER_RADIUS - (gate.spikeSide ? SPIKE_DEPTH : 0);
        if (Math.abs(g.shipY - gate.center) > clearance) {
          crash(g, PLAYER_X + delta, g.shipY);
          return;
        }
      }
      if (!gate.passed && delta < -GATE_WIDTH / 2 - PLAYER_RADIUS) {
        gate.passed = true;
        g.passedGates++;
        g.score += 100;
        Sound.pop();
        FX.floatText(PLAYER_X, g.shipY - 18, '+100', '#8ef5ff', 12);
      }
    }

    for (const gear of g.gears) {
      const gearX = PLAYER_X + gear.x - g.distance;
      if (Math.abs(gearX - PLAYER_X) <= gear.radius + PLAYER_RADIUS + 2 &&
          Math.hypot(gearX - PLAYER_X, gear.y - g.shipY) <= gear.radius + PLAYER_RADIUS) {
        crash(g, gearX, gear.y);
        return;
      }
    }

    if (g.endless) {
      const last = g.gates[g.gates.length - 1];
      if (last && last.x - g.distance < WIDTH * 1.8) addGates(g, 8);
      g.gates = g.gates.filter(gate => gate.x - g.distance > -GATE_WIDTH - PLAYER_RADIUS);
      g.gears = g.gears.filter(gear => gear.x - g.distance > -gear.radius - PLAYER_RADIUS);
    } else if (g.distance >= g.finishDistance) {
      g.score += 500;
      g.completed = `Level ${g.levelIndex + 1} clear. Nice flying.`;
      Sound.good();
      g.gameOver(true);
    }
  }

  function drawBackground(g, ctx) {
    FX.sky(ctx, WIDTH, HEIGHT, '#111431', '#040711');
    FX.stars(ctx, WIDTH, HEIGHT, g.distance * 0.11 + g.time * 9, 92, 'space-waves');

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = '#5e64bf';
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const y = 68 + i * 61 + Math.sin(g.time * 0.35 + i) * 5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(WIDTH * 0.3, y - 24, WIDTH * 0.62, y + 22, WIDTH, y - 8);
      ctx.stroke();
    }
    ctx.restore();

    const haze = ctx.createRadialGradient(WIDTH * 0.74, HEIGHT * 0.42, 12, WIDTH * 0.74, HEIGHT * 0.42, 280);
    haze.addColorStop(0, 'rgba(37,108,180,0.13)');
    haze.addColorStop(1, 'rgba(37,108,180,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.save();
    ctx.strokeStyle = 'rgba(93,165,231,0.3)';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#36c9ff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(0, EDGE);
    ctx.lineTo(WIDTH, EDGE);
    ctx.moveTo(0, HEIGHT - EDGE);
    ctx.lineTo(WIDTH, HEIGHT - EDGE);
    ctx.stroke();
    ctx.restore();
  }

  function drawGate(ctx, gate, x, palette, time) {
    if (x < -GATE_WIDTH - 30 || x > WIDTH + 30) return;
    const top = gate.center - gate.gap / 2;
    const bottom = gate.center + gate.gap / 2;
    const wall = ctx.createLinearGradient(x, 0, x + GATE_WIDTH, 0);
    wall.addColorStop(0, '#151a3a');
    wall.addColorStop(0.48, palette[1]);
    wall.addColorStop(1, '#19203d');

    ctx.save();
    ctx.shadowColor = palette[0];
    ctx.shadowBlur = 13;
    ctx.fillStyle = wall;
    ctx.fillRect(x, EDGE, GATE_WIDTH, Math.max(0, top - EDGE));
    ctx.fillRect(x, bottom, GATE_WIDTH, Math.max(0, HEIGHT - EDGE - bottom));
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x + 4, EDGE, 2, Math.max(0, top - EDGE));
    ctx.fillRect(x + 4, bottom, 2, Math.max(0, HEIGHT - EDGE - bottom));
    ctx.strokeStyle = palette[0];
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + GATE_WIDTH, top);
    ctx.moveTo(x, bottom);
    ctx.lineTo(x + GATE_WIDTH, bottom);
    ctx.stroke();

    ctx.globalAlpha = 0.32;
    for (let i = 0; i < 3; i++) {
      const markY = EDGE + ((i * 53 + gate.index * 17) % Math.max(1, HEIGHT - EDGE * 2));
      if (markY < top - 8 || markY > bottom + 8) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 10, markY, GATE_WIDTH - 18, 2);
      }
    }
    ctx.globalAlpha = 1;

    if (gate.spikeSide) {
      const isTop = gate.spikeSide === 'top';
      const baseY = isTop ? top : bottom;
      const tipY = isTop ? top + SPIKE_DEPTH : bottom - SPIKE_DEPTH;
      ctx.fillStyle = '#ffe796';
      ctx.shadowColor = '#ffbf67';
      ctx.shadowBlur = 9;
      ctx.beginPath();
      if (isTop) {
        ctx.moveTo(x + 2, baseY);
        ctx.lineTo(x + GATE_WIDTH / 2, tipY);
        ctx.lineTo(x + GATE_WIDTH - 2, baseY);
      } else {
        ctx.moveTo(x + 2, baseY);
        ctx.lineTo(x + GATE_WIDTH / 2, tipY);
        ctx.lineTo(x + GATE_WIDTH - 2, baseY);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.28 + Math.sin(time * 2 + gate.index) * 0.08;
    ctx.strokeStyle = palette[0];
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 4, top - 5, GATE_WIDTH + 8, gate.gap + 10);
    ctx.restore();
  }

  function drawGear(ctx, gear, x, time) {
    ctx.save();
    ctx.translate(x, gear.y);
    ctx.rotate(time * 1.7 + gear.rotation);
    ctx.shadowColor = '#ff71b8';
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#ef65b0';
    ctx.beginPath();
    for (let tooth = 0; tooth < 16; tooth++) {
      const angle = tooth * Math.PI / 8;
      const radius = tooth % 2 === 0 ? gear.radius + 5 : gear.radius - 2;
      const px = Math.cos(angle) * radius;
      const py = Math.sin(angle) * radius;
      if (tooth === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#301632';
    ctx.beginPath();
    ctx.arc(0, 0, gear.radius * 0.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffd9ef';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, gear.radius * 0.66, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawArrow(g, ctx) {
    FX.trail(PLAYER_X - 18, g.shipY, '#44dcff', { life: 0.22, size: 3 });
    ctx.save();
    ctx.translate(PLAYER_X, g.shipY);
    ctx.rotate(Math.max(-0.48, Math.min(0.48, g.shipVy / 620)));
    ctx.shadowColor = '#4be2ff';
    ctx.shadowBlur = 19;
    ctx.fillStyle = '#ffbd7a';
    ctx.beginPath();
    ctx.moveTo(-12, -4);
    ctx.lineTo(-27 - Math.sin(g.time * 31) * 4, 0);
    ctx.lineTo(-12, 4);
    ctx.closePath();
    ctx.fill();

    const body = ctx.createLinearGradient(-12, -10, 17, 9);
    body.addColorStop(0, '#e8fbff');
    body.addColorStop(0.36, '#70edff');
    body.addColorStop(1, '#718bff');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-12, -9);
    ctx.lineTo(-7, 0);
    ctx.lineTo(-12, 9);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.restore();
  }

  function drawMenu(g, ctx) {
    ctx.save();
    ctx.shadowColor = '#6b8cff';
    ctx.shadowBlur = 18;
    text(ctx, 'SPACE WAVES', WIDTH / 2, 47, 29, '#eff5ff', 'center', 800);
    ctx.restore();
    text(ctx, '33 levels · no combat · just timing', WIDTH / 2, 71, 11, '#9eabc9', 'center');

    const totalWidth = GRID.columns * GRID.tileWidth + (GRID.columns - 1) * GRID.gap;
    const left = (WIDTH - totalWidth) / 2;
    for (let level = 0; level < LEVEL_COUNT; level++) {
      const column = level % GRID.columns;
      const row = Math.floor(level / GRID.columns);
      const x = left + column * (GRID.tileWidth + GRID.gap);
      const y = GRID.top + row * (GRID.tileHeight + GRID.gap);
      const selected = level === g.selectedLevel;
      const palette = PALETTES[level % PALETTES.length];
      ctx.save();
      ctx.fillStyle = selected ? `${palette[0]}35` : 'rgba(255,255,255,0.035)';
      FX.roundRect(ctx, x, y, GRID.tileWidth, GRID.tileHeight, 7);
      ctx.fill();
      ctx.strokeStyle = selected ? palette[0] : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = selected ? 1.8 : 1;
      if (selected) { ctx.shadowColor = palette[0]; ctx.shadowBlur = 10; }
      FX.roundRect(ctx, x, y, GRID.tileWidth, GRID.tileHeight, 7);
      ctx.stroke();
      ctx.restore();
      text(ctx, String(level + 1).padStart(2, '0'), x + GRID.tileWidth / 2, y + 23, 12, selected ? '#f6f2ff' : '#b8bad2', 'center', 700);
      const rating = Math.min(5, 1 + Math.floor(level / 7));
      text(ctx, `${'●'.repeat(rating)}${'○'.repeat(5 - rating)}`, x + GRID.tileWidth / 2, y + 38, 6.5, palette[0], 'center');
    }

    const name = LEVEL_NAMES[Math.min(LEVEL_NAMES.length - 1, Math.floor(g.selectedLevel / 6))];
    text(ctx, `LEVEL ${String(g.selectedLevel + 1).padStart(2, '0')} · ${name.toUpperCase()}`, 34, 339, 10, '#b5bdd5', 'left', 700);
    drawButton(ctx, WIDTH / 2 - 162, 310, 150, 44, 'START LEVEL  ↗', '#55d9ff', true);
    drawButton(ctx, WIDTH / 2 + 12, 310, 150, 44, '∞  ENDLESS', '#ed79c8');
    text(ctx, 'Hold Space / W / ↑ / click to rise · release to fall · P pause · Esc levels', WIDTH / 2, 428, 9, '#8390ae', 'center');
  }

  function draw(g, ctx) {
    drawBackground(g, ctx);
    if (g.selMode) {
      drawMenu(g, ctx);
      return;
    }

    const palette = PALETTES[g.levelIndex % PALETTES.length];
    for (const gate of g.gates) {
      const x = PLAYER_X + gate.x - g.distance - GATE_WIDTH / 2;
      drawGate(ctx, gate, x, palette, g.time);
    }
    for (const gear of g.gears) {
      const x = PLAYER_X + gear.x - g.distance;
      if (x > -40 && x < WIDTH + 40) drawGear(ctx, gear, x, g.time);
    }
    drawArrow(g, ctx);

    ctx.save();
    ctx.fillStyle = 'rgba(4,7,17,0.72)';
    ctx.fillRect(0, 0, WIDTH, 46);
    text(ctx, g.endless ? `ENDLESS · SECTOR ${g.endlessStage + 1}` : `LEVEL ${String(g.levelIndex + 1).padStart(2, '0')} / ${LEVEL_COUNT}`, 17, 25, 11, '#dbe8ff', 'left', 700);
    text(ctx, `${Math.floor(g.score).toLocaleString()}`, WIDTH - 18, 25, 13, '#9ef1ff', 'right', 700);
    const progress = g.endless ? (g.passedGates % 10) / 10 : Math.min(1, g.distance / g.finishDistance);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(0, 43, WIDTH, 3);
    ctx.fillStyle = palette[0];
    ctx.shadowColor = palette[0];
    ctx.shadowBlur = 7;
    ctx.fillRect(0, 43, WIDTH * progress, 3);
    ctx.restore();

    if (g.paused) {
      ctx.save();
      ctx.fillStyle = 'rgba(4,5,17,0.74)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      text(ctx, 'PAUSED', WIDTH / 2, HEIGHT / 2 - 8, 31, '#f3f2ff', 'center', 800);
      text(ctx, 'P to continue · Esc for levels', WIDTH / 2, HEIGHT / 2 + 22, 11, '#aeb8d4', 'center');
      ctx.restore();
    }
    FX.vignette(ctx, WIDTH, HEIGHT, 0.28);
  }

  return {
    id: 'spacewaves',
    name: 'Space Waves',
    emoji: '✦',
    librarySymbol: '✦',
    libraryDescription: '33 levels + endless · Hold to rise, release to fall.',
    desc: 'Guide a glowing arrow through neon tunnels, spikes, and gears.',
    controls: 'Hold Space / W / ↑ / click to rise · release to fall · P pause · Esc for levels',
    hasEndless: true,
    levelCount: LEVEL_COUNT,
    w: WIDTH,
    h: HEIGHT,
    update,
    draw,
    init(g) {
      g.selMode = true;
      g.selectedLevel = 0;
      g.levelIndex = 0;
      g.endless = false;
      g.endlessStage = 0;
      g.paused = false;
      g.distance = 0;
      g.shipY = HEIGHT / 2;
      g.shipVy = 0;
      g.score = 0;
      g.time = 0;
      g.gates = [];
      g.gears = [];
      g.passedGates = 0;
      g.levelLength = 0;
      g.finishDistance = Infinity;
      g.completed = '';
      g.startLevel = startLevel;
      g.returnToLevels = returnToLevels;
    }
  };
})();

window.GAME_PACK_8 = [GAME_SPACE_WAVES];
