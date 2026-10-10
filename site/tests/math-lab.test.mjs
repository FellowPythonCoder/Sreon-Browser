import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// The engine is loaded without a document, so these tests cover the pure
// solver/plotter model. The page-level UI is covered by interface.spec.mjs.
const code = readFileSync(new URL('../assets/math-lab.js', import.meta.url), 'utf8');
const context = vm.createContext({ window: {}, console });
vm.runInContext(code, context);
const MathLab = context.window.MathLab;

// Pulls the SAMPLES object out of the source so the tests exercise the same
// lines a visitor sees when the page opens.
function loadSamples() {
  const start = code.indexOf('const SAMPLES = {');
  const end = code.indexOf('const HINTS');
  return vm.runInContext(`(${code.slice(start, end).replace('const SAMPLES = ', '').trim().replace(/;$/, '')})`, vm.createContext({}));
}

// vm contexts have their own Array prototype, so results are copied into plain objects first.
const plain = (value) => JSON.parse(JSON.stringify(value));
const answersOf = (text) => {
  const out = plain(MathLab.run(text));
  return { out, answers: out.results.flatMap((r) => r.answers), results: out.results };
};

test('the built-in sample sets solve and graph without errors', () => {
  const samples = plain(loadSamples());
  for (const mode of ['solve', 'graph']) {
    const { results, out } = answersOf(samples[mode]);
    assert.ok(results.length > 0, `${mode} samples produce results`);
    assert.deepEqual(results.filter((r) => r.error).map((r) => r.error), [], `${mode} samples have no errors`);
    assert.ok(out.series.length > 0, `${mode} samples produce graph layers`);
  }
});

test('quadratics are solved exactly', () => {
  const { answers } = answersOf('x^2 - 5x + 6 = 0');
  assert.deepEqual(answers, ['x = 3', 'x = 2']);
  assert.deepEqual(answersOf('x^2 + 2x - 2 = 0').answers, ['x = −1 + √3 (≈ 0.732051)', 'x = −1 − √3 (≈ −2.73205)']);
});

test('complex roots are reported as complex', () => {
  const { answers } = answersOf('x^2 + 2x + 5 = 0');
  assert.equal(answers[0], 'No real solutions.');
  assert.equal(answers[1], 'Complex solutions: x = −1 + 2i, x = −1 − 2i');
});

test('factoring keeps repeated roots', () => {
  assert.equal(answersOf('factor x^2 - 5x + 6').answers[0], '(x − 3)(x − 2)');
  assert.equal(answersOf('factor x^2 - 2x + 1').answers[0], '(x − 1)^2');
});

test('a circle equation is named and plotted as an implicit layer', () => {
  const { answers, out } = answersOf('x^2 + y^2 = 25');
  assert.ok(answers.includes('Circle: center (0, 0), radius 5'));
  assert.ok(out.series.some((s) => s.kind === 'implicit'));
});

test('definite integrals use the original bounds and the exact value', () => {
  const { answers, out } = answersOf('integral from 0 to pi of sin(x)');
  assert.equal(answers[0], '∫ from 0 to pi of sin(x) dx = 2');
  assert.ok(out.series.some((s) => s.kind === 'area'));
});

test('derivatives accept both “at 3” and “at x = 3”', () => {
  assert.ok(answersOf('derivative of x^2 at 3').answers.includes('At x = 3: d/dx = 6'));
  assert.ok(answersOf('derivative of sin(x) at x = 0').answers.includes('At x = 0: d/dx = 1'));
});

test('inconsistent systems report no solution', () => {
  const { answers } = answersOf('x + y = 1; x - y = 3; x + 2y = 4');
  assert.equal(answers[0], 'No solution: the equations are inconsistent.');
});

test('consistent linear systems give the solution and plot each line', () => {
  const { answers, out } = answersOf('2x + y = 7; x - y = 2');
  assert.deepEqual(answers, ['x = 3', 'y = 1']);
  assert.equal(out.series.filter((s) => s.kind === 'implicit').length, 2);
});

test('inequalities are returned as intervals', () => {
  assert.equal(answersOf('x^2 - 4 > 0').answers[0], 'x ∈ (−∞, −2) ∪ (2, ∞)');
  assert.equal(answersOf('x^2 - 4 <= 0').answers[0], 'x ∈ [−2, 2]');
});

test('exact arithmetic keeps implicit multiplication readable', () => {
  assert.equal(answersOf('2 + 3 * 4 ^ 2').answers[0], '2 + 3·4^2 = 50');
});

test('a user function can be defined and evaluated on later lines', () => {
  const { answers } = answersOf('f(x) = x^2 - 4\nf(3)');
  assert.ok(answers.includes('3^2 − 4 = 5'));
});

test('parametric, polar and data inputs produce plottable layers', () => {
  assert.ok(answersOf('x = 2cos(t), y = 3sin(t)').out.series.some((s) => s.kind === 'param'));
  assert.ok(answersOf('r = 1 + cos(theta)').out.series.some((s) => s.kind === 'polar'));
  const data = answersOf('points: (0,1) (1,3) (2,5) (3,7.2)');
  assert.ok(data.answers.some((a) => a.startsWith('Best-fit line: y = ')));
  assert.ok(data.out.series.some((s) => s.kind === 'points'));
  assert.ok(data.out.series.some((s) => s.kind === 'line'));
});

test('long numeric root lists are capped', () => {
  const { answers } = answersOf('sin(x) = 0.5');
  assert.ok(answers.some((a) => a.startsWith('…and ')), 'the list says how many more there are');
  assert.ok(answers.filter((a) => a.startsWith('x ≈ ')).length <= 8);
});

test('bad input is reported per line instead of throwing', () => {
  const garbage = ['2x = ', 'derivative of', '1 2 3 4 $$', 'x + y + z = 1', ''].join('\n');
  const { results } = answersOf(garbage);
  assert.ok(results.length >= 4);
  assert.ok(results.some((r) => r.error));
});
