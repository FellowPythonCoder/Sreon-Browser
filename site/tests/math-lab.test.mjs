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

test('an electrician word problem gives the linear equation and the 8-hour cost', () => {
  const problem = 'An electrician charges a $25 base service call fee plus $50 per hour of labor. Write a linear equation for the total cost (C) based on the number of hours worked (h), and find out how much an 8-hour job costs.';
  const { results, answers, out } = answersOf(problem);
  assert.equal(results.length, 1, 'the paragraph is one problem');
  assert.equal(answers[0], 'Linear equation: C = 50h + 25');
  assert.equal(answers[1], 'For h = 8: C = 50(8) + 25 = $425');
  assert.equal(answers[2], 'So for 8 hours, the total cost is $425.');
  assert.ok(out.series.some((s) => s.kind === 'explicit'), 'the equation is graphed');
});

test('a multi-line word problem is read as one problem', () => {
  const { results, answers } = answersOf('An electrician charges a $25 base service call fee plus $50 per hour of labor.\nWrite a linear equation for the total cost (C) based on the number of hours worked (h), and find out how much an 8-hour job costs.');
  assert.equal(results.length, 1);
  assert.equal(answers[0], 'Linear equation: C = 50h + 25');
});

test('a word problem can be reversed: how many hours for a given total', () => {
  const { answers } = answersOf('An electrician charges a $25 base service call fee plus $50 per hour of labor. How many hours does a $425 job take?');
  assert.equal(answers[0], 'Linear equation: C = 50h + 25');
  assert.equal(answers[1], 'h = ($425 − 25) / 50 = 8');
});

test('two priced quotes give the rate and starting charge', () => {
  const { answers } = answersOf('A plumber charges $120 for 2 hours and $180 for 4 hours. How much for 6 hours?');
  assert.equal(answers[0], 'Linear equation: C = 30h + 60');
  assert.equal(answers[2], 'So for 6 hours, the charge is $240.');
});

test('a discount is subtracted and a flat fee gives a constant model', () => {
  assert.equal(answersOf('A shop charges $40 an hour, with a $10 discount. Find the cost (C) for 5 hours.').answers[0], 'Linear equation: C = 40h − 10');
  const flat = answersOf('A bike rental costs $12. Find the total (T) for 3 days.');
  assert.equal(flat.answers[0], 'Linear equation: T = 12');
});

test('word problems without a rate say what is missing instead of guessing', () => {
  const { results } = answersOf('Tom has 3 apples and 4 pears. How many fruits?');
  assert.match(results[0].error, /could not find a rate/);
});

test('a pipe table shows its rows and per-column statistics', () => {
  const { results, answers } = answersOf('| hours | cost |\n|---|---|\n| 1 | 75 |\n| 2 | 125 |\n| 4 | 225 |');
  assert.equal(results.length, 1);
  assert.equal(results[0].kind, 'Table');
  assert.deepEqual(plain(results[0].table.headers), ['A · hours', 'B · cost']);
  assert.deepEqual(plain(results[0].table.rows), [['1', '75'], ['2', '125'], ['4', '225']]);
  assert.ok(answers.includes('cost: count 3 · sum 425 · mean 141.667 · median 125 · min 75 · max 225'));
  assert.ok(answers.includes('cost = 50·hours + 25 (exact for every row)'));
});

test('table questions use rows when they exist and the exact pattern otherwise', () => {
  const table = '| hours | cost |\n|---|---|\n| 1 | 75 |\n| 2 | 125 |\n| 4 | 225 |';
  assert.equal(answersOf(`${table}\ncost when hours = 8`).answers.at(-1), 'cost when hours = 8: 425');
  assert.equal(answersOf(`${table}\nhours when cost = 125`).answers.at(-1), 'hours when cost = 125: 2');
  assert.equal(answersOf(`${table}\nsum of cost`).answers.at(-1), 'sum of cost = 425');
  assert.equal(answersOf(`${table}\nmean of hours`).answers.at(-1), 'mean of hours = 2.33333');
});

test('table formulas add a new column built from the existing ones', () => {
  const { results } = answersOf('| hours | cost |\n|---|---|\n| 1 | 75 |\n| 2 | 125 |\n| 4 | 225 |\nd = 50a + 25');
  assert.equal(results.at(-1).kind, 'Table · new column');
  assert.deepEqual(plain(results.at(-1).table.headers), ['A · hours', 'B · cost', 'D = 50A + 25']);
  assert.deepEqual(plain(results.at(-1).table.rows).map((r) => r[2]), ['75', '125', '225']);
});

test('CSV tables need a header row and feed the same features', () => {
  const { results, answers, out } = answersOf('hours,cost\n1,75\n2,125\n3,175\nmean of hours\nvalue of cost at hours = 2.5');
  assert.equal(results[0].kind, 'Table');
  assert.ok(answers.includes('cost = 50·hours + 25 (exact for every row)'));
  assert.equal(answers.at(-2), 'mean of hours = 2');
  assert.equal(answers.at(-1), 'cost when hours = 2.5: 150');
  assert.ok(out.series.some((s) => s.kind === 'line'), 'the fitted line is plotted');
});

test('table errors name the missing column and the columns that exist', () => {
  const table = '| hours | cost |\n|---|---|\n| 1 | 75 |\n| 2 | 125 |';
  assert.match(answersOf(`${table}\ncost when height = 2`).results.at(-1).error, /can't find a column called “height”/);
  assert.match(answersOf(`${table}\nsum of name`).results.at(-1).error, /Columns: A · hours, B · cost/);
});

test('text columns get no fit and cannot be used in formulas', () => {
  const people = '| name | score | age |\n|---|---|---|\n| Ana | 90 | 21 |\n| Ben | 75 | 25 |\n| Cy | 82 | 30 |';
  assert.ok(answersOf(people).answers.some((a) => a.startsWith('age = ')), 'numeric columns still fit');
  assert.match(answersOf(`${people}\nd = 2a + 1`).results.at(-1).error, /name is text/);
});
