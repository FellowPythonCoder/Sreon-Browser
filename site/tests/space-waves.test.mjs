import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../assets/modules/module-08.js', import.meta.url), 'utf8');

function canvasContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({ canvas: { width: 760, height: 460 } }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
      return () => {};
    },
    set(target, key, value) { target[key] = value; return true; }
  });
}

function fixture() {
  const held = new Set();
  const pressed = new Set();
  const pointer = { x: 0, y: 0, down: false, justDown: false };
  const input = {
    pointer,
    held: key => held.has(key),
    pressed: key => pressed.has(key),
    anyHeld: (...keys) => keys.some(key => held.has(key))
  };
  const fx = new Proxy({}, { get: () => () => {} });
  const sound = new Proxy({}, { get: () => () => {} });
  const context = vm.createContext({
    window: {}, Input: input, FX: fx, Sound: sound,
    text: () => {}, console, Math, Number, String
  });
  vm.runInContext(code, context);
  const definition = context.window.GAME_PACK_8[0];
  const state = {
    w: 760, h: 460, time: 0, score: 0, over: false, won: false,
    gameOver(won = false) { this.over = true; this.won = won; }
  };
  definition.init(state);
  return { definition, state, held, pressed, pointer };
}

test('Space Waves registers a 33-level game with an accessible endless option', () => {
  const { definition, state, pressed } = fixture();
  assert.equal(definition.id, 'spacewaves');
  assert.equal(definition.name, 'Space Waves');
  assert.equal(definition.levelCount, 33);
  assert.equal(definition.hasEndless, true);
  assert.equal(state.selMode, true);

  pressed.add('ArrowRight');
  definition.update(state, 1 / 60);
  pressed.clear();
  assert.equal(state.selectedLevel, 1);
  pressed.add('Enter');
  definition.update(state, 1 / 60);
  pressed.clear();
  assert.equal(state.selMode, false);
  assert.equal(state.levelIndex, 1);
  assert.equal(state.endless, false);
  assert.equal(state.gates.length, 7);
});

test('menu, level, and endless scenes render through the existing canvas runner', () => {
  const { definition, state } = fixture();
  const ctx = canvasContext();
  definition.draw(state, ctx);
  state.startLevel(state, 32);
  definition.draw(state, ctx);
  state.startLevel(state, 0, true);
  definition.draw(state, ctx);
});

test('all 33 selectable levels generate a finite course and stable difficulty bounds', () => {
  const { definition, state } = fixture();
  const gateCounts = [];
  for (let level = 0; level < definition.levelCount; level++) {
    state.startLevel(state, level);
    gateCounts.push(state.gates.length);
    assert.ok(state.finishDistance > state.gates.at(-1).x);
    assert.ok(state.speed >= 190 && state.speed <= 266);
    assert.ok(state.gates.every(gate => gate.gap >= 146 && gate.gap <= 224));
    assert.ok(state.gates.every(gate => gate.center - gate.gap / 2 >= 52));
    assert.ok(state.gates.every(gate => gate.center + gate.gap / 2 <= 408));
  }
  assert.equal(gateCounts[0], 7);
  assert.equal(gateCounts.at(-1), 17);
});

test('safe passage scores gates; walls and gears end a run cleanly', () => {
  const { definition, state } = fixture();
  state.startLevel(state, 0);
  const gate = state.gates[0];
  state.shipY = gate.center;
  state.distance = gate.x - 38;
  for (let frame = 0; frame < 30 && !state.over; frame++) definition.update(state, 1 / 60);
  assert.equal(state.over, false);
  assert.equal(gate.passed, true);
  assert.equal(state.score, 100);

  state.startLevel(state, 0);
  const dangerousGate = state.gates[0];
  state.distance = dangerousGate.x - 1;
  state.shipY = dangerousGate.center + dangerousGate.gap / 2 - 1;
  definition.update(state, 1 / 60);
  assert.equal(state.over, true);
  assert.equal(state.won, false);

  state.startLevel(state, 0);
  state.gears.push({ x: state.distance, y: state.shipY, radius: 13, rotation: 0 });
  definition.update(state, 1 / 60);
  assert.equal(state.over, true);
});

test('endless mode grows past its starter gates and Escape returns to level select', () => {
  const { definition, state, pressed } = fixture();
  state.startLevel(state, 17);
  state.startLevel(state, 0, true);
  assert.equal(state.selectedLevel, 17);
  assert.equal(state.endless, true);
  assert.equal(state.endlessStage, 0);
  assert.equal(state.gates.length, 14);
  state.passedGates = 10;
  definition.update(state, 1 / 60);
  assert.equal(state.endlessStage, 1);
  assert.ok(state.speed > 190);

  pressed.add('Escape');
  definition.update(state, 1 / 60);
  pressed.clear();
  assert.equal(state.selMode, true);
  assert.equal(state.endless, false);
  assert.equal(state.selectedLevel, 17);
});
