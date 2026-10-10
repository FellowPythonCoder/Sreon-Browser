/* ============================================================
   Sreon Math Lab: paste a problem, get the answer and the graph.
   Everything runs inside this page. No AI, no network calls, no eval.
   Exposes window.MathLab = { run, mount, close }.
   ============================================================ */
(() => {
'use strict';

const MINUS = '\u2212';
class MathError extends Error {}
const fail = (message) => { throw new MathError(message); };
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

/* ---------------- names, functions, constants ---------------- */
const FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  sec: (v) => 1 / Math.cos(v), csc: (v) => 1 / Math.sin(v), cot: (v) => 1 / Math.tan(v),
  asin: Math.asin, acos: Math.acos, atan: Math.atan, arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
  ln: Math.log, log: Math.log10, log10: Math.log10, log2: Math.log2, exp: Math.exp,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
};
const FUNC2 = { min: Math.min, max: Math.max };
const CONST = { pi: [Math.PI, 'π'], e: [Math.E, 'e'], tau: [2 * Math.PI, 'τ'] };
const NAMES = [...Object.keys(FUNCS), ...Object.keys(FUNC2), 'theta', 'pi', 'tau', 'inf']
  .sort((a, b) => b.length - a.length);
const RESERVED = new Set(['x', 'y', 't', 'theta', 'pi', 'e', 'tau']);
const PAIR_LINE = /^\(?\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?\s*[,\t ]\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?\s*\)?$/i;
const COLORS = ['#a855f7', '#22d3ee', '#f59e0b', '#4ade80', '#f43f5e', '#60a5fa', '#f472b6', '#facc15', '#34d399', '#fb923c'];

/* ---------------- text normalization ---------------- */
const SUPERSCRIPT = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };
const UNICODE = {
  '−': '-', '–': '-', '—': '-', '×': '*', '·': '*', '⋅': '*', '÷': '/', '√': 'sqrt', 'π': 'pi', 'θ': 'theta', 'τ': 'tau',
  '≤': '<=', '≥': '>=', '≠': '!=', '∞': 'inf', '∫': 'integral ', '→': '->', '′': "'", '\u00a0': ' ', '‘': "'", '’': "'",
  '“': '"', '”': '"', '**': '^',
};

function readGroup(s, start) {
  let depth = 0;
  for (let j = start; j < s.length; j++) {
    if (s[j] === '{') depth++;
    else if (s[j] === '}') { depth--; if (depth === 0) return { text: s.slice(start + 1, j), end: j + 1 }; }
  }
  return fail('A brace “{” is missing its closing “}”.');
}

function replaceLatex(input) {
  let s = input.replace(/\\left|\\right/g, '').replace(/\\(cdot|times)/g, '*').replace(/\\div/g, '/')
    .replace(/\\(le|leq)\b/g, '<=').replace(/\\(ge|geq)\b/g, '>=').replace(/\\(lt)\b/g, '<').replace(/\\(gt)\b/g, '>')
    .replace(/\\int\b/g, 'integral ').replace(/\\(sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|sinh|cosh|tanh|ln|log|exp)\b/g, '$1')
    .replace(/\\(pi|theta|tau)\b/g, '$1').replace(/\\[,;!]/g, ' ');
  for (let i = s.indexOf('\\frac'); i >= 0; i = s.indexOf('\\frac')) {
    let j = i + 5; while (s[j] === ' ') j++;
    const a = readGroup(s, j); let k = a.end; while (s[k] === ' ') k++;
    const b = readGroup(s, k);
    s = `${s.slice(0, i)}((${a.text})/(${b.text}))${s.slice(b.end)}`;
  }
  for (let i = s.indexOf('\\sqrt'); i >= 0; i = s.indexOf('\\sqrt')) {
    let j = i + 5; while (s[j] === ' ') j++;
    if (s[j] !== '{') fail('Write \\sqrt{...} with braces, or use sqrt(...).');
    const a = readGroup(s, j);
    s = `${s.slice(0, i)}sqrt(${a.text})${s.slice(a.end)}`;
  }
  return s.replace(/\^\{([^{}]*)\}/g, '^($1)').replace(/\{/g, '(').replace(/\}/g, ')');
}

function normalize(input) {
  let s = String(input).replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (run) => `^(${[...run].map((c) => SUPERSCRIPT[c]).join('')})`);
  s = s.normalize('NFKC');
  s = replaceLatex(s);
  for (const [from, to] of Object.entries(UNICODE)) s = s.split(from).join(to);
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/* ---------------- tokenizer and parser ---------------- */
function splitWord(word) {
  const parts = [];
  let i = 0;
  while (i < word.length) {
    const rest = word.slice(i);
    const hit = NAMES.find((name) => rest.startsWith(name));
    if (hit) { parts.push(hit); i += hit.length; } else { parts.push(word[i]); i += 1; }
  }
  return parts;
}

const OPERATORS = ['<=', '>=', '!=', '==', '**', '+', '-', '*', '/', '^', '(', ')', ',', '=', '<', '>', '!', '|'];

function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    const rest = src.slice(i);
    let m = /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/.exec(rest);
    if (m) { out.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
    m = /^[a-z]+/.exec(rest);
    if (m) {
      for (const part of splitWord(m[0])) out.push(part === 'inf' ? { t: 'num', v: Infinity } : { t: 'id', v: part });
      i += m[0].length;
      continue;
    }
    const op = OPERATORS.find((o) => rest.startsWith(o));
    if (op) { out.push({ t: 'op', v: op === '==' ? '=' : op === '**' ? '^' : op }); i += op.length; continue; }
    fail(`I don't understand “${ch}” in this line.`);
  }
  return out;
}

function parseTokens(tokens) {
  let p = 0;
  const isOp = (v) => Boolean(tokens[p]) && tokens[p].t === 'op' && tokens[p].v === v;
  const startsOperand = (tok) => Boolean(tok) && (tok.t === 'num' || tok.t === 'id' || (tok.t === 'op' && tok.v === '('));
  const expect = (v) => { if (!isOp(v)) fail(`Expected “${v}” here.`); p++; };
  const argList = () => {
    const list = [];
    if (isOp(')')) { p++; return list; }
    for (;;) {
      list.push(expr());
      if (isOp(',')) { p++; continue; }
      expect(')');
      return list;
    }
  };
  function expr() {
    let n = term();
    while (isOp('+') || isOp('-')) { const op = tokens[p++].v; n = { t: 'bin', op, a: n, b: term() }; }
    return n;
  }
  function term() {
    let n = unary();
    for (;;) {
      if (isOp('*') || isOp('/')) { const op = tokens[p++].v; n = { t: 'bin', op, a: n, b: unary() }; }
      else if (startsOperand(tokens[p])) n = { t: 'bin', op: '*', a: n, b: unary() };
      else return n;
    }
  }
  function unary() {
    if (isOp('-')) { p++; return { t: 'un', op: '-', a: unary() }; }
    if (isOp('+')) { p++; return unary(); }
    return power();
  }
  function power() {
    const base = postfix();
    if (isOp('^')) { p++; return { t: 'bin', op: '^', a: base, b: unary() }; }
    return base;
  }
  function postfix() {
    let n = primary();
    while (isOp('!')) { p++; n = { t: 'fact', a: n }; }
    return n;
  }
  function primary() {
    const tok = tokens[p];
    if (!tok) fail('The line ends too early.');
    if (tok.t === 'num') { p++; return { t: 'num', v: tok.v }; }
    if (tok.t === 'id') {
      p++;
      if (has(FUNCS, tok.v) || has(FUNC2, tok.v)) {
        const args = isOp('(') ? (p++, argList()) : [unary()];
        return { t: 'call', f: tok.v, args };
      }
      if (isOp('(') && !RESERVED.has(tok.v)) { p++; return { t: 'call', f: tok.v, args: argList() }; }
      return { t: 'var', n: tok.v };
    }
    if (isOp('(')) { p++; const n = expr(); expect(')'); return n; }
    if (isOp('|')) { p++; const n = expr(); expect('|'); return { t: 'call', f: 'abs', args: [n] }; }
    return fail(`Unexpected “${tok.v}”.`);
  }
  const node = expr();
  if (p < tokens.length) fail(`Unexpected “${tokens[p].v}”.`);
  return node;
}

const REL = new Set(['=', '<', '>', '<=', '>=', '!=']);
function parseStatement(text) {
  const tokens = tokenize(text);
  if (!tokens.length) fail('Nothing to read on this line.');
  const at = [];
  tokens.forEach((t, i) => { if (t.t === 'op' && REL.has(t.v)) at.push(i); });
  if (!at.length) return { op: null, expr: parseTokens(tokens) };
  if (at.length > 1) fail('Use one comparison per line, or separate equations with “;”.');
  const i = at[0];
  if (tokens[i].v === '!=') fail('“≠” is not supported yet.');
  return { op: tokens[i].v, left: parseTokens(tokens.slice(0, i)), right: parseTokens(tokens.slice(i + 1)) };
}
function parseExpr(text) {
  const st = parseStatement(text);
  if (st.op) fail('Expected an expression here, not an equation.');
  return st.expr;
}

function splitTop(text, sep) {
  const parts = [];
  let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') depth--;
    else if (text[i] === sep && depth === 0) { parts.push(text.slice(start, i).trim()); start = i + 1; }
  }
  parts.push(text.slice(start).trim());
  return parts.filter((p) => p.length);
}

/* ---------------- AST helpers ---------------- */
const num = (v, sym) => ({ t: 'num', v, sym });
const isVar = (n, name) => n.t === 'var' && n.n === name;
const isNum = (n, v) => n.t === 'num' && (v === undefined || n.v === v);

function freeVars(n, out = new Set()) {
  switch (n.t) {
    case 'var': out.add(n.n); break;
    case 'un': case 'fact': freeVars(n.a, out); break;
    case 'bin': freeVars(n.a, out); freeVars(n.b, out); break;
    case 'call': n.args.forEach((a) => freeVars(a, out)); break;
    default: break;
  }
  return out;
}

function checkVars(ast) {
  const vars = freeVars(ast);
  for (const v of vars) {
    if (v !== 'x' && v !== 'y') fail(`“${v}” needs a value. Use x and y here, the parametric form (x = …, y = …) for t, or r = … for polar curves.`);
  }
  return vars;
}

function subst(n, name, rep) {
  switch (n.t) {
    case 'var': return n.n === name ? rep : n;
    case 'num': return n;
    case 'un': case 'fact': return { ...n, a: subst(n.a, name, rep) };
    case 'bin': return { ...n, a: subst(n.a, name, rep), b: subst(n.b, name, rep) };
    case 'call': return { ...n, args: n.args.map((a) => subst(a, name, rep)) };
    default: return n;
  }
}

function prep(n, ctx, depth = 0) {
  if (depth > 30) fail('This definition refers to itself too deeply.');
  switch (n.t) {
    case 'num': return n;
    case 'var': {
      if (n.n === 'x' || n.n === 'y' || n.n === 't' || n.n === 'theta') return n;
      if (ctx.params.has(n.n)) return num(ctx.params.get(n.n));
      if (has(CONST, n.n)) return num(CONST[n.n][0], CONST[n.n][1]);
      return fail(`“${n.n}” is not defined. Put its value on its own line first, like ${n.n} = 2.`);
    }
    case 'un': return { t: 'un', op: '-', a: prep(n.a, ctx, depth) };
    case 'fact': return { t: 'fact', a: prep(n.a, ctx, depth) };
    case 'bin': return { t: 'bin', op: n.op, a: prep(n.a, ctx, depth), b: prep(n.b, ctx, depth) };
    case 'call': {
      if (ctx.fns.has(n.f)) {
        const def = ctx.fns.get(n.f);
        if (n.args.length !== 1) fail(`${n.f}() takes one value.`);
        return prep(subst(def.body, def.arg, n.args[0]), ctx, depth + 1);
      }
      if (has(FUNCS, n.f)) {
        if (n.args.length !== 1) fail(`${n.f}() takes one value.`);
        return { t: 'call', f: n.f, args: [prep(n.args[0], ctx, depth)] };
      }
      if (has(FUNC2, n.f)) {
        if (n.args.length !== 2) fail(`${n.f}() takes two values.`);
        return { t: 'call', f: n.f, args: n.args.map((a) => prep(a, ctx, depth)) };
      }
      if (n.args.length === 1 && (['x', 'y', 't', 'theta'].includes(n.f) || ctx.params.has(n.f) || has(CONST, n.f))) {
        return prep({ t: 'bin', op: '*', a: { t: 'var', n: n.f }, b: n.args[0] }, ctx, depth);
      }
      return fail(`“${n.f}” is not a known function. Define it first, like ${n.f}(x) = x^2.`);
    }
    default: return fail('Unsupported expression.');
  }
}

function factorial(v) {
  if (!Number.isInteger(v) || v < 0 || v > 170) return NaN;
  let r = 1;
  for (let i = 2; i <= v; i++) r *= i;
  return r;
}

function compile(n) {
  switch (n.t) {
    case 'num': { const v = n.v; return () => v; }
    case 'var':
      if (n.n === 'x') return (x) => x;
      if (n.n === 'y') return (x, y) => y;
      return (x, y, t) => t;
    case 'un': { const a = compile(n.a); return (x, y, t) => -a(x, y, t); }
    case 'fact': { const a = compile(n.a); return (x, y, t) => factorial(a(x, y, t)); }
    case 'bin': {
      const a = compile(n.a), b = compile(n.b);
      switch (n.op) {
        case '+': return (x, y, t) => a(x, y, t) + b(x, y, t);
        case '-': return (x, y, t) => a(x, y, t) - b(x, y, t);
        case '*': return (x, y, t) => a(x, y, t) * b(x, y, t);
        case '/': return (x, y, t) => a(x, y, t) / b(x, y, t);
        default: return (x, y, t) => Math.pow(a(x, y, t), b(x, y, t));
      }
    }
    case 'call': {
      const args = n.args.map(compile);
      if (args.length === 1) { const f = FUNCS[n.f], a = args[0]; return (x, y, t) => f(a(x, y, t)); }
      const f = FUNC2[n.f], [a, b] = args;
      return (x, y, t) => f(a(x, y, t), b(x, y, t));
    }
    default: return fail('Unsupported expression.');
  }
}

function constValue(ast) {
  if (freeVars(ast).size) fail('This part needs to be a number.');
  return compile(ast)(0, 0, 0);
}

/* ---------------- polynomials: Map<monomialKey, {e, c}> ---------------- */
const rankOf = (v) => ({ x: 0, y: 1, t: 2, theta: 3 }[v] ?? 10);
const varCompare = (a, b) => (rankOf(a) - rankOf(b)) || (a < b ? -1 : a > b ? 1 : 0);
const sortedVars = (e) => Object.keys(e).sort(varCompare);
const degOf = (e) => Object.values(e).reduce((s, n) => s + n, 0);
const monoKey = (e) => sortedVars(e).map((v) => `${v}^${e[v]}`).join('*');
const pConst = (c) => { const m = new Map(); if (Math.abs(c) > 1e-13) m.set('', { e: {}, c }); return m; };
const pVar = (name) => new Map([[`${name}^1`, { e: { [name]: 1 }, c: 1 }]]);

function pAdd(p, q, sign = 1) {
  const m = new Map(p);
  for (const [k, t] of q) {
    const cur = m.get(k);
    const c = (cur ? cur.c : 0) + sign * t.c;
    if (Math.abs(c) < 1e-13) m.delete(k); else m.set(k, { e: cur ? cur.e : t.e, c });
  }
  return m;
}
function pMul(p, q) {
  const m = new Map();
  for (const a of p.values()) {
    for (const b of q.values()) {
      const e = { ...a.e };
      for (const [v, n] of Object.entries(b.e)) e[v] = (e[v] || 0) + n;
      const k = monoKey(e);
      const cur = m.get(k);
      const c = (cur ? cur.c : 0) + a.c * b.c;
      if (Math.abs(c) < 1e-13) m.delete(k); else m.set(k, { e: cur ? cur.e : e, c });
      if (m.size > 3000) fail('This expression is too large to expand here.');
    }
  }
  return m;
}
const pScale = (p, c) => new Map([...p].filter(() => c !== 0).map(([k, t]) => [k, { e: t.e, c: t.c * c }]).filter(([, t]) => Math.abs(t.c) > 1e-13));
function pPow(p, k) { let r = pConst(1); for (let i = 0; i < k; i++) r = pMul(r, p); return r; }

function toPoly(n) {
  switch (n.t) {
    case 'num': return Number.isFinite(n.v) ? pConst(n.v) : null;
    case 'var': return pVar(n.n);
    case 'un': { const a = toPoly(n.a); return a && pScale(a, -1); }
    case 'bin': {
      if (n.op === '^') {
        const a = toPoly(n.a);
        if (!a || n.b.t !== 'num' || !Number.isInteger(n.b.v) || n.b.v < 0 || n.b.v > 24) return null;
        return pPow(a, n.b.v);
      }
      const a = toPoly(n.a), b = toPoly(n.b);
      if (!a || !b) return null;
      if (n.op === '+') return pAdd(a, b, 1);
      if (n.op === '-') return pAdd(a, b, -1);
      if (n.op === '*') return pMul(a, b);
      if (n.op === '/') {
        if (b.size !== 1 || !b.has('')) return null;
        const c = b.get('').c;
        return c === 0 ? null : pScale(a, 1 / c);
      }
      return null;
    }
    default: return null;
  }
}

function univariateCoeffs(p, v) {
  let deg = 0;
  for (const t of p.values()) {
    if (sortedVars(t.e).some((n) => n !== v)) return null;
    deg = Math.max(deg, t.e[v] || 0);
  }
  const a = new Array(deg + 1).fill(0);
  for (const t of p.values()) a[t.e[v] || 0] += t.c;
  return a;
}

function pFromCoeffs(arr, v) {
  const p = new Map();
  arr.forEach((c, k) => { if (Math.abs(c) > 1e-13) p.set(k ? `${v}^${k}` : '', { e: k ? { [v]: k } : {}, c }); });
  return p;
}

function pDiff(p, v) {
  const out = new Map();
  for (const t of p.values()) {
    const k = t.e[v] || 0;
    if (!k) continue;
    const e = { ...t.e, [v]: k - 1 };
    if (!e[v]) delete e[v];
    const key = monoKey(e);
    const cur = out.get(key);
    const c = (cur ? cur.c : 0) + t.c * k;
    if (Math.abs(c) < 1e-13) out.delete(key); else out.set(key, { e: cur ? cur.e : e, c });
  }
  return out;
}

function pIntegrate(p, v) {
  const out = new Map();
  for (const t of p.values()) {
    const k = t.e[v] || 0;
    const e = { ...t.e, [v]: k + 1 };
    out.set(monoKey(e), { e, c: t.c / (k + 1) });
  }
  return out;
}

function polyToAst(p) {
  if (!p.size) return num(0);
  let out = null;
  for (const t of p.values()) {
    let mono = null;
    for (const v of sortedVars(t.e)) {
      const base = { t: 'var', n: v };
      const pw = t.e[v] > 1 ? { t: 'bin', op: '^', a: base, b: num(t.e[v]) } : base;
      mono = mono ? { t: 'bin', op: '*', a: mono, b: pw } : pw;
    }
    const mag = Math.abs(t.c);
    const term = mono ? (mag === 1 ? mono : { t: 'bin', op: '*', a: num(mag), b: mono }) : num(mag);
    if (!out) out = t.c < 0 ? { t: 'un', op: '-', a: term } : term;
    else out = { t: 'bin', op: t.c < 0 ? '-' : '+', a: out, b: term };
  }
  return out;
}

function polyVars(p) {
  const s = new Set();
  for (const t of p.values()) Object.keys(t.e).forEach((v) => s.add(v));
  return s;
}

/* ---------------- number formatting ---------------- */
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; }
function toFraction(v, tol = 1e-9) {
  if (!Number.isFinite(v)) return null;
  for (let d = 1; d <= 200; d++) {
    const n = Math.round(v * d);
    if (Math.abs(v * d - n) < tol * d && Math.abs(n) < 1e7) {
      const g = gcd(n, d) || 1;
      const nn = n / g, dd = d / g;
      return dd === 1 ? String(nn) : `${nn}/${dd}`;
    }
  }
  return null;
}
function fmtNum(v, { exact = true, tol = 1e-9 } = {}) {
  if (Number.isNaN(v)) return 'undefined';
  if (v === Infinity) return '∞';
  if (v === -Infinity) return `${MINUS}∞`;
  if (Math.abs(v) < 1e-13) return '0';
  const r = Math.round(v);
  if (Math.abs(v - r) < 1e-9 * Math.max(1, Math.abs(v)) && Math.abs(v) < 1e15) return String(r).replace('-', MINUS);
  if (exact) { const f = toFraction(v, tol); if (f) return f.replace('-', MINUS); }
  return Number(v.toPrecision(6)).toString().replace('-', MINUS);
}
const approx = (v) => fmtNum(v, { exact: false });
const ratStr = (n, d) => {
  const g = gcd(n, d) || 1;
  let nn = n / g, dd = d / g;
  if (dd < 0) { nn = -nn; dd = -dd; }
  return dd === 1 ? String(nn).replace('-', MINUS) : `${String(nn).replace('-', MINUS)}/${dd}`;
};
const displayName = (v) => ({ theta: 'θ', pi: 'π' }[v] || v);

function monoText(e) {
  const vs = sortedVars(e);
  if (!vs.length) return '';
  const parts = vs.map((v) => (e[v] > 1 ? `${displayName(v)}^${e[v]}` : displayName(v)));
  return vs.every((v) => v.length === 1) ? parts.join('') : parts.join('·');
}

function formatPoly(p) {
  if (!p.size) return '0';
  const terms = [...p.values()].sort((a, b) => {
    const d = degOf(b.e) - degOf(a.e);
    if (d) return d;
    const vs = [...new Set([...Object.keys(a.e), ...Object.keys(b.e)])].sort(varCompare);
    for (const v of vs) { const dd = (b.e[v] || 0) - (a.e[v] || 0); if (dd) return dd; }
    return 0;
  });
  let out = '';
  terms.forEach((t, i) => {
    const neg = t.c < 0, c = Math.abs(t.c), mono = monoText(t.e);
    let body;
    if (!mono) body = fmtNum(c);
    else if (Math.abs(c - 1) < 1e-13) body = mono;
    else { const cs = fmtNum(c); body = (cs.includes('/') ? `(${cs})` : cs) + mono; }
    if (i === 0) out += (neg ? MINUS : '') + body;
    else out += (neg ? ` ${MINUS} ` : ' + ') + body;
  });
  return out;
}

const PREC_OP = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 };
function printNode(n, parent = 0) {
  let s, prec;
  switch (n.t) {
    case 'num':
      if (n.sym) { s = n.sym; prec = 5; }
      else if (n.v < 0) { s = MINUS + fmtNum(-n.v); prec = 3; }
      else { s = fmtNum(n.v); prec = s.includes('/') ? 2 : 5; }
      break;
    case 'var': s = displayName(n.n); prec = 5; break;
    case 'un': s = MINUS + printNode(n.a, 3); prec = 3; break;
    case 'fact': s = `${printNode(n.a, 5)}!`; prec = 5; break;
    case 'call': {
      const inner = n.args.map((a) => printNode(a, 0)).join(', ');
      s = n.f === 'sqrt' ? `√(${inner})` : n.f === 'abs' ? `|${inner}|` : `${n.f}(${inner})`;
      prec = 5;
      break;
    }
    case 'bin': {
      const { op, a, b } = n;
      prec = PREC_OP[op];
      if (op === '+' || op === '-') {
        const left = printNode(a, 1);
        const right = printNode(b, op === '+' ? 1 : 2);
        const flip = right.startsWith(MINUS);
        const r = flip ? right.slice(1) : right;
        const sign = (op === '+') !== flip ? ' + ' : ` ${MINUS} `;
        s = `${left}${sign}${r}`;
      } else if (op === '*') {
        const left = printNode(a, 2), right = printNode(b, 2);
        const joinable = a.t === 'num' && !a.sym && !/^[0-9.(−-]/.test(right);
        s = `${left}${joinable ? '' : '·'}${right}`;
      } else if (op === '/') {
        s = `${printNode(a, 2)} / ${printNode(b, 3)}`;
      } else {
        s = `${printNode(a, 5)}^${printNode(b, 4)}`;
      }
      break;
    }
    default: s = '?';
  }
  return prec < parent ? `(${s})` : s;
}

/* ---------------- symbolic differentiation ---------------- */
const neg = (a) => (isNum(a, 0) ? a : a.t === 'num' ? num(-a.v) : { t: 'un', op: '-', a });
const mul = (a, b) => {
  if (isNum(a, 0) || isNum(b, 0)) return num(0);
  if (isNum(a, 1)) return b;
  if (isNum(b, 1)) return a;
  if (a.t === 'num' && b.t === 'num') return num(a.v * b.v);
  return { t: 'bin', op: '*', a, b };
};
const add = (a, b) => {
  if (isNum(a, 0)) return b;
  if (isNum(b, 0)) return a;
  if (a.t === 'num' && b.t === 'num') return num(a.v + b.v);
  return { t: 'bin', op: '+', a, b };
};
const sub = (a, b) => {
  if (isNum(b, 0)) return a;
  if (isNum(a, 0)) return neg(b);
  if (a.t === 'num' && b.t === 'num') return num(a.v - b.v);
  return { t: 'bin', op: '-', a, b };
};
const divide = (a, b) => {
  if (isNum(a, 0)) return num(0);
  if (isNum(b, 1)) return a;
  return { t: 'bin', op: '/', a, b };
};
const power = (a, b) => {
  if (isNum(b, 1)) return a;
  if (isNum(b, 0)) return num(1);
  return { t: 'bin', op: '^', a, b };
};
const callOf = (f, a) => ({ t: 'call', f, args: [a] });

function diffAst(n, v) {
  switch (n.t) {
    case 'num': return num(0);
    case 'var': return num(n.n === v ? 1 : 0);
    case 'un': return neg(diffAst(n.a, v));
    case 'bin': {
      const { op, a, b } = n;
      if (op === '+') return add(diffAst(a, v), diffAst(b, v));
      if (op === '-') return sub(diffAst(a, v), diffAst(b, v));
      if (op === '*') return add(mul(diffAst(a, v), b), mul(a, diffAst(b, v)));
      if (op === '/') return divide(sub(mul(diffAst(a, v), b), mul(a, diffAst(b, v))), power(b, num(2)));
      const da = diffAst(a, v), db = diffAst(b, v);
      const bDepends = freeVars(b).has(v), aDepends = freeVars(a).has(v);
      if (!bDepends) return mul(mul(b, power(a, sub(b, num(1)))), da);
      if (!aDepends) return mul(mul(n, callOf('ln', a)), db);
      return mul(n, add(mul(db, callOf('ln', a)), divide(mul(b, da), a)));
    }
    case 'call': {
      const a = n.args[0];
      if (n.args.length !== 1) break;
      const da = diffAst(a, v);
      switch (n.f) {
        case 'sin': return mul(callOf('cos', a), da);
        case 'cos': return neg(mul(callOf('sin', a), da));
        case 'tan': return divide(da, power(callOf('cos', a), num(2)));
        case 'exp': return mul(n, da);
        case 'ln': return divide(da, a);
        case 'log': case 'log10': return divide(da, mul(a, callOf('ln', num(10))));
        case 'log2': return divide(da, mul(a, callOf('ln', num(2))));
        case 'sqrt': return divide(da, mul(num(2), callOf('sqrt', a)));
        case 'abs': return mul(callOf('sign', a), da);
        case 'asin': case 'arcsin': return divide(da, callOf('sqrt', sub(num(1), power(a, num(2)))));
        case 'acos': case 'arccos': return neg(divide(da, callOf('sqrt', sub(num(1), power(a, num(2))))));
        case 'atan': case 'arctan': return divide(da, add(num(1), power(a, num(2))));
        case 'sinh': return mul(callOf('cosh', a), da);
        case 'cosh': return mul(callOf('sinh', a), da);
        case 'tanh': return divide(da, power(callOf('cosh', a), num(2)));
        default: break;
      }
      break;
    }
    default: break;
  }
  return fail('There is no symbolic derivative rule for this part yet. The slope is shown numerically.');
}

/* ---------------- numerics ---------------- */
function adaptiveSimpson(f, a, b, eps = 1e-10) {
  const simpson = (x0, x1, f0, fm, f1) => ((x1 - x0) / 6) * (f0 + 4 * fm + f1);
  const rec = (x0, x1, e, whole, f0, fm, f1, depth) => {
    const m = (x0 + x1) / 2, lm = (x0 + m) / 2, rm = (m + x1) / 2;
    const flm = f(lm), frm = f(rm);
    const left = simpson(x0, m, f0, flm, fm), right = simpson(m, x1, fm, frm, f1);
    const delta = left + right - whole;
    if (depth <= 0 || Math.abs(delta) <= 15 * e) return left + right + delta / 15;
    return rec(x0, m, e / 2, left, f0, flm, fm, depth - 1) + rec(m, x1, e / 2, right, fm, frm, f1, depth - 1);
  };
  const fa = f(a), fb = f(b), fm = f((a + b) / 2);
  return rec(a, b, eps, simpson(a, b, fa, fm, fb), fa, fm, fb, 40);
}

function bisect(f, a, b) {
  let fa = f(a);
  for (let i = 0; i < 100; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (fm === 0) return m;
    if (Math.sign(fm) === Math.sign(fa)) { a = m; fa = fm; } else b = m;
  }
  return (a + b) / 2;
}

function scanCrossings(f, lo, hi, n = 4000) {
  const out = [];
  const step = (hi - lo) / n;
  let px = lo, pv = f(lo);
  for (let i = 1; i <= n; i++) {
    const x = lo + i * step, v = f(x);
    if (Number.isFinite(pv) && Number.isFinite(v)) {
      if (v === 0) out.push({ x, root: true });
      else if (pv !== 0 && (pv < 0) !== (v < 0)) {
        const r = bisect(f, px, x);
        const fr = f(r);
        out.push({ x: r, root: Math.abs(fr) <= 1e-6 * Math.max(1, Math.abs(pv), Math.abs(v)) });
      }
    }
    px = x; pv = v;
  }
  return out;
}

const cadd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
const csub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
const cmul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const cdiv = (a, b) => {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};

function polyRootsDK(a) {
  const n = a.length - 1;
  const c = a.map((v) => v / a[n]);
  const ev = (z) => { let r = { re: 0, im: 0 }; for (let k = n; k >= 0; k--) r = cadd(cmul(r, z), { re: c[k], im: 0 }); return r; };
  let roots = [];
  let w = { re: 1, im: 0 };
  for (let i = 0; i < n; i++) { roots.push(w); w = cmul(w, { re: 0.4, im: 0.9 }); }
  for (let iter = 0; iter < 800; iter++) {
    let maxStep = 0;
    const next = roots.map((z, i) => {
      let den = { re: 1, im: 0 };
      roots.forEach((o, j) => { if (j !== i) den = cmul(den, csub(z, o)); });
      const delta = cdiv(ev(z), den);
      if (!Number.isFinite(delta.re) || !Number.isFinite(delta.im)) return z;
      maxStep = Math.max(maxStep, Math.hypot(delta.re, delta.im));
      return csub(z, delta);
    });
    roots = next;
    if (maxStep < 1e-15) break;
  }
  return roots;
}

function squarefree(n) {
  for (let k = Math.floor(Math.sqrt(n)); k >= 1; k--) if (n % (k * k) === 0) return { k, m: n / (k * k) };
  return { k: 1, m: n };
}

function quadraticRoots(a, b, c) {
  if (a < 0) { a = -a; b = -b; c = -c; }
  const D = b * b - 4 * a * c;
  const d = 2 * a;
  if (D === 0) return [{ re: -b / d, im: 0, exact: ratStr(-b, d), double: true }];
  const { k, m } = squarefree(Math.abs(D));
  const imag = D < 0;
  if (m === 1) {
    if (!imag) return [{ re: (-b + k) / d, im: 0, exact: ratStr(-b + k, d) }, { re: (-b - k) / d, im: 0, exact: ratStr(-b - k, d) }];
    const re = -b / d, im = k / d;
    return [{ re, im, exact: `${ratStr(-b, d)} + ${ratStr(k, d)}i` }, { re, im: -im, exact: `${ratStr(-b, d)} − ${ratStr(k, d)}i` }];
  }
  const g = gcd(gcd(b, k), d) || 1;
  const B = -b / g, K = k / g, Dn = d / g;
  const R = `${imag ? 'i' : ''}√${m}`;
  const term = (K === 1 ? '' : String(K)) + R;
  const numText = (sign) => (B === 0 ? (sign > 0 ? term : `${MINUS}${term}`)
    : `${String(B).replace('-', MINUS)} ${sign > 0 ? '+' : MINUS} ${term}`);
  const wrap = (s) => (Dn === 1 ? s : `(${s})/${Dn}`);
  const root = Math.sqrt(Math.abs(D)) / d;
  const re = -b / d;
  return [
    { re: imag ? re : re + root, im: imag ? root : 0, exact: wrap(numText(1)) },
    { re: imag ? re : re - root, im: imag ? -root : 0, exact: wrap(numText(-1)) },
  ];
}

function solvePolyCoeffs(coeffs) {
  const c = coeffs.slice();
  while (c.length > 1 && Math.abs(c[c.length - 1]) < 1e-13) c.pop();
  const deg = c.length - 1;
  if (deg === 0) return Math.abs(c[0]) < 1e-13 ? { identity: true, roots: [] } : { roots: [] };
  if (deg === 1) { const r = -c[0] / c[1]; return { roots: [{ re: r, im: 0, exact: toFraction(r) }] }; }
  if (deg === 2) {
    const [C, B, A] = c;
    if (Number.isInteger(A) && Number.isInteger(B) && Number.isInteger(C)) return { roots: quadraticRoots(A, B, C) };
    const disc = B * B - 4 * A * C;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      const q = -0.5 * (B + (B >= 0 ? s : -s));
      const r1 = q / A, r2 = q === 0 ? r1 : C / q;
      return { roots: [{ re: r1, im: 0 }, { re: r2, im: 0 }] };
    }
    const re = -B / (2 * A), im = Math.sqrt(-disc) / (2 * Math.abs(A));
    return { roots: [{ re, im, exact: null }, { re, im: -im, exact: null }] };
  }
  const roots = polyRootsDK(c).map((z) => {
    const im = Math.abs(z.im) < 1e-7 * (1 + Math.abs(z.re)) ? 0 : z.im;
    return { re: z.re, im, exact: im === 0 ? toFraction(z.re, 1e-9) : null };
  });
  return { roots };
}

function rootText(v, r) {
  if (r.im !== 0) {
    if (r.exact) return `${v} = ${r.exact}`;
    const mag = Math.abs(r.im);
    const imText = Math.abs(mag - 1) < 1e-9 ? '' : approx(mag);
    if (Math.abs(r.re) < 1e-9) return `${v} = ${r.im < 0 ? MINUS : ''}${imText}i`;
    const sign = r.im < 0 ? MINUS : '+';
    return `${v} ≈ ${approx(r.re)} ${sign} ${imText}i`;
  }
  if (r.exact && !/√/.test(r.exact)) return `${v} = ${String(r.exact).replace(/-/g, MINUS)}`;
  if (r.exact) return `${v} = ${r.exact} (≈ ${approx(r.re)})`;
  return `${v} ≈ ${approx(r.re)}`;
}

/* ---------------- relations and intervals ---------------- */
const relHolds = (op, val) => {
  switch (op) {
    case '=': return Math.abs(val) < 1e-9;
    case '<': return val < 0;
    case '<=': return val <= 1e-12;
    case '>': return val > 0;
    case '>=': return val >= -1e-12;
    default: return false;
  }
};

function intervalText(f, op, pts) {
  const nonstrict = op === '<=' || op === '>=';
  const cuts = [-Infinity, ...pts.map((p) => p.x), Infinity];
  const seq = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const lo = cuts[i], hi = cuts[i + 1];
    const mid = lo === -Infinity ? (hi === Infinity ? 0 : hi - 1) : hi === Infinity ? lo + 1 : (lo + hi) / 2;
    const val = f(mid);
    seq.push({ type: 'int', lo, hi, ok: Number.isFinite(val) && relHolds(op, val) });
    if (i < pts.length) seq.push({ type: 'pt', x: pts[i].x, ok: nonstrict && pts[i].root });
  }
  const ranges = [];
  let cur = null;
  for (const e of seq) {
    if (e.ok) {
      if (!cur) cur = { lo: e.type === 'int' ? e.lo : e.x, loClosed: e.type === 'pt' };
      cur.hi = e.type === 'int' ? e.hi : e.x;
      cur.hiClosed = e.type === 'pt';
    } else if (cur) { ranges.push(cur); cur = null; }
  }
  if (cur) ranges.push(cur);
  if (!ranges.length) return null;
  if (ranges.length === 1 && ranges[0].lo === -Infinity && ranges[0].hi === Infinity) return 'all real numbers';
  return ranges.map((r) => {
    const lo = r.lo === -Infinity ? `${MINUS}∞` : fmtNum(r.lo);
    const hi = r.hi === Infinity ? '∞' : fmtNum(r.hi);
    return `${r.loClosed ? '[' : '('}${lo}, ${hi}${r.hiClosed ? ']' : ')'}`;
  }).join(' ∪ ');
}

function uniqueSorted(values, tol = 1e-7) {
  const sorted = values.slice().sort((a, b) => a - b);
  const out = [];
  for (const v of sorted) if (!out.length || Math.abs(v - out[out.length - 1]) > tol * (1 + Math.abs(v))) out.push(v);
  return out;
}

/* ---------------- linear and nonlinear systems ---------------- */
function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let i = c + 1; i < n; i++) if (Math.abs(M[i][c]) > Math.abs(M[p][c])) p = i;
    if (Math.abs(M[p][c]) < 1e-14) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let i = 0; i < n; i++) {
      if (i === c) continue;
      const f = M[i][c] / M[c][c];
      for (let j = c; j <= n; j++) M[i][j] -= f * M[c][j];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

function gaussNewton(F, start, iterations = 80) {
  let p = start.slice();
  const n = p.length;
  const cost = (q) => F(q).reduce((s, v) => s + v * v, 0);
  for (let it = 0; it < iterations; it++) {
    const r = F(p), m = r.length;
    if (cost(p) < 1e-22) break;
    const J = Array.from({ length: m }, () => new Array(n).fill(0));
    for (let j = 0; j < n; j++) {
      const h = 1e-7 * Math.max(1, Math.abs(p[j]));
      const pp = p.slice(), pm = p.slice();
      pp[j] += h; pm[j] -= h;
      const rp = F(pp), rm = F(pm);
      for (let i = 0; i < m; i++) J[i][j] = (rp[i] - rm[i]) / (2 * h);
    }
    const A = Array.from({ length: n }, () => new Array(n).fill(0));
    const g = new Array(n).fill(0);
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < n; j++) {
        g[j] -= J[i][j] * r[i];
        for (let k = 0; k < n; k++) A[j][k] += J[i][j] * J[i][k];
      }
    }
    const d = solveLinear(A, g);
    if (!d || d.some((v) => !Number.isFinite(v))) break;
    const c0 = cost(p);
    let lambda = 1, moved = false;
    for (let tries = 0; tries < 25; tries++) {
      const q = p.map((v, j) => v + lambda * d[j]);
      const cq = cost(q);
      if (Number.isFinite(cq) && cq < c0) { p = q; moved = true; break; }
      lambda /= 2;
    }
    if (!moved) break;
  }
  return p;
}

function solveNumeric(F, n) {
  const grid = n === 1 ? [-10, -7.5, -5, -2.5, -1, 0, 1, 2.5, 5, 7.5, 10] : [-5, -2, 0, 2, 5];
  const found = [];
  const starts = n === 1 ? grid.map((a) => [a]) : grid.flatMap((a) => grid.map((b) => [a, b]));
  for (const s of starts) {
    const p = gaussNewton(F, s);
    const res = F(p);
    if (!p.every(Number.isFinite) || res.some((v) => Math.abs(v) > 1e-7)) continue;
    if (!found.some((q) => q.every((v, j) => Math.abs(v - p[j]) < 1e-6 * (1 + Math.abs(v))))) found.push(p);
  }
  return found;
}

/* ---------------- analysis helpers ---------------- */
function solveForVar(poly, v) {
  let deg = 0;
  for (const t of poly.values()) deg = Math.max(deg, t.e[v] || 0);
  if (deg !== 1) return null;
  let coef = null;
  const rest = new Map();
  for (const [k, t] of poly) {
    const power = t.e[v] || 0;
    if (power === 0) rest.set(k, t);
    else if (Object.keys(t.e).length === 1) coef = t.c;
    else return null;
  }
  if (coef === null || coef === 0) return null;
  return formatPoly(pScale(rest, -1 / coef));
}

function circleText(poly) {
  const keys = new Set(['x^2', 'y^2', 'x^1', 'y^1', '', 'x^1*y^1']);
  for (const k of poly.keys()) if (!keys.has(k)) return null;
  if (poly.has('x^1*y^1')) return null;
  const coef = (k) => (poly.get(k) ? poly.get(k).c : 0);
  const a = coef('x^2');
  if (!a || Math.abs(a - coef('y^2')) > 1e-12) return null;
  const b1 = coef('x^1'), b2 = coef('y^1'), c = coef('');
  const cx = -b1 / (2 * a), cy = -b2 / (2 * a);
  const r2 = (b1 * b1 + b2 * b2) / (4 * a * a) - c / a;
  if (r2 > 1e-12) return `Circle: center (${fmtNum(cx)}, ${fmtNum(cy)}), radius ${approx(Math.sqrt(r2))}`;
  return null;
}

function trimmed(coeffs) {
  const c = coeffs.slice();
  while (c.length > 1 && Math.abs(c[c.length - 1]) < 1e-13) c.pop();
  return c;
}

function numericText(value) {
  const rounded = Math.round(value);
  return Math.abs(value - rounded) < 1e-9 ? String(rounded) : `≈ ${approx(value)}`;
}

function describeExplicit(ast, result) {
  const f = compile(ast);
  const poly = toPoly(ast);
  const coeffs = poly && univariateCoeffs(poly, 'x');
  if (coeffs) {
    const c = trimmed(coeffs);
    if (c.length === 1) result.answers.push(`Constant: y = ${fmtNum(c[0])}`);
    if (c.length === 2) result.answers.push(`Straight line. Slope ${fmtNum(c[1])}, y-intercept ${fmtNum(c[0])}.`);
    if (c.length === 3) {
      const [c0, c1, c2] = c;
      const vx = -c1 / (2 * c2), vy = c0 - (c1 * c1) / (4 * c2);
      result.answers.push(`Parabola with vertex (${fmtNum(vx)}, ${fmtNum(vy)}), opening ${c2 > 0 ? 'up' : 'down'}.`);
    }
  }
  const y0 = f(0, 0, 0);
  if (Number.isFinite(y0)) result.answers.push(`y-intercept: y = ${fmtNum(y0)}`);
  let xs;
  if (coeffs && trimmed(coeffs).length === 3) xs = solvePolyCoeffs(trimmed(coeffs)).roots.filter((r) => r.im === 0).map((r) => r.re);
  else xs = scanCrossings((x) => f(x, 0, 0), -100, 100).filter((c) => c.root).map((c) => c.x);
  xs = uniqueSorted(xs);
  if (xs.length) {
    const shown = xs.slice(0, 8).map((x) => `x ≈ ${approx(x)}`).join(', ');
    result.answers.push(`x-intercepts: ${shown}${xs.length > 8 ? `, …and ${xs.length - 8} more between −100 and 100` : ''}`);
  }
  else result.answers.push('x-intercepts: none found between −100 and 100.');
  result.series.push({ kind: 'marks', pts: xs.map((x) => ({ x, y: 0 })), label: result.source });
}

function implicitSeries(F, op, label) {
  const f = compile(F);
  const rel = { '=': 'eq', '<': 'lt', '<=': 'le', '>': 'gt', '>=': 'ge' }[op];
  return { kind: 'implicit', rel, F: (x, y) => f(x, y, 0), label };
}

function explicitSeries(ast, label, extra = {}) {
  const f = compile(ast);
  return { kind: 'explicit', f: (x) => f(x, 0, 0), label, ...extra };
}

/* ---------------- problem handlers ---------------- */
function analyzeRelation(st, ctx, result, solveMode = false) {
  const op = st.op;
  let L = prep(st.left, ctx), R = prep(st.right, ctx);
  if (op === '=' && isVar(R, 'y') && !isVar(L, 'y')) [L, R] = [R, L];
  if (op === '=' && isVar(L, 'y') && !freeVars(R).has('y')) {
    checkVars(R);
    result.kind = solveMode ? 'Solve · explicit curve' : 'Graph · y = f(x)';
    result.series.push(explicitSeries(R, result.source));
    describeExplicit(R, result);
    return;
  }
  const F = { t: 'bin', op: '-', a: L, b: R };
  const vars = checkVars(F);
  const hasX = vars.has('x'), hasY = vars.has('y');
  if (!hasX && !hasY) {
    const value = compile(F)(0, 0, 0);
    result.kind = 'Statement';
    result.answers.push(relHolds(op, value) ? 'True' : 'False');
    return;
  }
  const kind = op === '=' ? 'Equation' : 'Inequality';
  result.series.push(implicitSeries(F, op, result.source));
  if (hasX !== hasY) {
    const v = hasX ? 'x' : 'y';
    result.kind = `${kind} · solve for ${v}`;
    solveUnivariate(F, v, op, result);
    return;
  }
  result.kind = `${kind} · graph`;
  if (op === '=') {
    const poly = toPoly(F);
    if (poly) {
      const circle = circleText(poly);
      if (circle) result.answers.push(circle);
      for (const v of ['y', 'x']) {
        const sol = solveForVar(poly, v);
        if (sol) result.answers.push(`Solved for ${v}: ${v} = ${sol}`);
      }
    }
    if (!result.answers.length) result.answers.push('A curve in the plane. It is drawn on the graph.');
  } else {
    result.answers.push('A shaded region. It is drawn on the graph; the boundary is included for ≤ and ≥.');
  }
}

function solveUnivariate(F, v, op, result) {
  const poly = toPoly(F);
  const coeffs = poly && univariateCoeffs(poly, v);
  const f = compile(F);
  const val = (t) => (v === 'x' ? f(t, 0, 0) : f(0, t, 0));
  if (op === '=') {
    if (coeffs) {
      const sol = solvePolyCoeffs(coeffs);
      if (sol.identity) { result.answers.push(`Every ${v} is a solution.`); return; }
      if (!sol.roots.length) { result.answers.push('No solution.'); return; }
      const real = sol.roots.filter((r) => r.im === 0);
      const complex = sol.roots.filter((r) => r.im !== 0);
      if (!real.length) result.answers.push('No real solutions.');
      real.forEach((r) => result.answers.push(rootText(v, r)));
      if (complex.length) result.answers.push(`Complex solutions: ${complex.map((r) => rootText(v, r)).join(', ')}`);
      result.series.push({ kind: 'marks', label: result.source, pts: real.map((r) => (v === 'x' ? { x: r.re, y: 0 } : { x: 0, y: r.re })) });
      return;
    }
    const roots = uniqueSorted(scanCrossings(val, -100, 100).filter((c) => c.root).map((c) => c.x));
    if (!roots.length) result.answers.push(`No solution found between −100 and 100 (numerical search).`);
    const LIMIT = 8;
    roots.slice(0, LIMIT).forEach((r) => result.answers.push(`${v} ≈ ${approx(r)}`));
    if (roots.length > LIMIT) result.answers.push(`…and ${roots.length - LIMIT} more between −100 and 100.`);
    result.notes.push('Not a polynomial, so solutions come from a numerical search over −100 ≤ ' + v + ' ≤ 100.');
    result.series.push({ kind: 'marks', label: result.source, pts: roots.map((r) => (v === 'x' ? { x: r, y: 0 } : { x: 0, y: r })) });
    return;
  }
  let pts;
  if (coeffs) {
    const sol = solvePolyCoeffs(coeffs);
    if (sol.identity) { result.answers.push(op === '<=' || op === '>=' ? `Every ${v} works.` : `No ${v} works.`); return; }
    pts = uniqueSorted(sol.roots.filter((r) => r.im === 0).map((r) => r.re)).map((x) => ({ x, root: true }));
  } else {
    pts = scanCrossings(val, -100, 100);
    result.notes.push('Not a polynomial, so the breakpoints come from a numerical search over −100 to 100.');
  }
  const text = intervalText(val, op, pts);
  result.answers.push(text ? `${v} ∈ ${text}` : `No ${v} satisfies this.`);
}

function analyzeSystem(parts, ctx, result) {
  result.kind = 'System of equations';
  const eqs = parts.map((p) => {
    const st = parseStatement(p);
    if (!st.op) fail('Each part of a system needs an “=”.');
    if (st.op !== '=') fail('Systems use “=”. Graph inequalities on their own line.');
    return { t: 'bin', op: '-', a: prep(st.left, ctx), b: prep(st.right, ctx), text: p.trim() };
  });
  if (eqs.length <= 4) for (const F of eqs) result.series.push(implicitSeries(F, '=', F.text));
  const vars = new Set();
  for (const F of eqs) for (const v of checkVars(F)) vars.add(v);
  const names = ['x', 'y'].filter((v) => vars.has(v));
  if (!names.length) fail('No unknowns found. Use x and/or y.');
  const polys = eqs.map((F) => toPoly(F));
  const linear = polys.every((p) => p && [...p.values()].every((t) => degOf(t.e) <= 1));
  if (linear) {
    const A = polys.map((p) => names.map((v) => {
      const t = [...p.values()].find((term) => degOf(term.e) === 1 && term.e[v] === 1);
      return t ? t.c : 0;
    }));
    const b = polys.map((p) => -(p.get('') ? p.get('').c : 0));
    const n = names.length;
    const rank = (M) => {
      const R = M.map((row) => row.slice());
      const width = M[0].length;
      let r = 0;
      for (let c = 0; c < width && r < R.length; c++) {
        let p = r;
        for (let i = r + 1; i < R.length; i++) if (Math.abs(R[i][c]) > Math.abs(R[p][c])) p = i;
        if (Math.abs(R[p][c]) < 1e-12) continue;
        [R[r], R[p]] = [R[p], R[r]];
        for (let i = 0; i < R.length; i++) {
          if (i === r) continue;
          const f = R[i][c] / R[r][c];
          for (let j = c; j < width; j++) R[i][j] -= f * R[r][j];
        }
        r++;
      }
      return r;
    };
    const aug = A.map((row, i) => [...row, b[i]]);
    const rA = rank(A), rAug = rank(aug);
    if (rAug > rA) { result.answers.push('No solution: the equations are inconsistent.'); return; }
    if (rA < n) {
      result.answers.push('Infinitely many solutions: the equations describe the same line.');
      const sol = names.map((v) => v);
      result.answers.push(`Free variables: ${sol.slice(rA).join(', ')} (any value works).`);
      return;
    }
    const x = solveLinear(A, b);
    if (!x) { result.answers.push('No unique solution.'); return; }
    names.forEach((v, i) => result.answers.push(`${v} = ${fmtNum(x[i])}`));
    if (names.length === 2) result.series.push({ kind: 'marks', label: result.source, pts: [{ x: x[0], y: x[1] }] });
    return;
  }
  const g = eqs.map((F) => compile(F));
  const F = (vals) => {
    const xv = names.includes('x') ? vals[names.indexOf('x')] : 0;
    const yv = names.includes('y') ? vals[names.indexOf('y')] : 0;
    return g.map((fn) => fn(xv, yv, 0));
  };
  if (eqs.length < names.length) fail('Need at least as many equations as unknowns.');
  const sols = solveNumeric(F, names.length);
  result.notes.push('Some equations are not linear, so solutions come from a numerical search.');
  if (!sols.length) result.answers.push('No real solution found by numerical search.');
  sols.forEach((p, i) => result.answers.push(`Solution ${i + 1}: ${names.map((v, j) => `${v} ≈ ${approx(p[j])}`).join(', ')}`));
  if (names.length === 2 && sols.length) result.series.push({ kind: 'marks', label: result.source, pts: sols.map((p) => ({ x: p[0], y: p[1] })) });
}

function analyzeDerivative(body, v0, ctx, result) {
  let expr = body, at = null;
  const m = /^(.*?)\s+(?:at|when)\s+(?:([a-z])\s*=\s*)?(.+)$/.exec(body);
  if (m) { expr = m[1]; at = { name: m[2] || v0, value: constValue(prep(parseExpr(m[3]), ctx)) }; }
  const v = at ? at.name : v0;
  const ast = prep(parseExpr(expr), ctx);
  const vars = freeVars(ast);
  for (const name of vars) if (name !== v) fail(`Derivatives here use one variable. Found “${name}”.`);
  result.kind = `Derivative · d/d${v}`;
  const poly = toPoly(ast);
  let d = null;
  if (poly) {
    const dp = pDiff(poly, v);
    d = polyToAst(dp);
    result.answers.push(`d/d${v} = ${formatPoly(dp)}`);
  } else {
    try {
      d = diffAst(ast, v);
      result.answers.push(`d/d${v} = ${printNode(d)}`);
    } catch (err) {
      if (!(err instanceof MathError)) throw err;
      result.answers.push('No symbolic rule for this function yet. The slope is computed numerically at points.');
    }
  }
  if (at) {
    let value;
    if (d) value = compile(subst(d, v, num(at.value)))(0, 0, 0);
    else {
      const f = compile(ast);
      const h = 1e-6;
      value = (f(...(v === 'x' ? [at.value + h, 0, 0] : [0, at.value + h, 0])) - f(...(v === 'x' ? [at.value - h, 0, 0] : [0, at.value - h, 0]))) / (2 * h);
    }
    result.answers.push(`At ${v} = ${fmtNum(at.value)}: d/d${v} = ${numericText(value)}`);
  }
  const plottable = [...vars].every((name) => name === 'x') && vars.size > 0;
  if (plottable) {
    result.series.push(explicitSeries(ast, `f: ${printNode(ast)}`));
    if (d) result.series.push(explicitSeries(d, `d/d${v}: ${printNode(ast)}`, { dashed: true }));
  }
}

function analyzeIntegral(body, ctx, result) {
  let s = body.trim().replace(/^of\s+/, ''), a = null, b = null, v = 'x';
  let m = /^from\s+(.+?)\s+to\s+(.+?)\s+(?:of\s+)?(.+)$/.exec(s);
  if (m) { a = m[1]; b = m[2]; s = m[3]; } else if ((m = /^(.+?)\s+from\s+(.+?)\s+to\s+(.+)$/.exec(s))) { s = m[1]; a = m[2]; b = m[3]; }
  const dm = /(\s|\))d([a-z])\s*$/.exec(s);
  if (dm) { v = dm[2]; s = s.slice(0, dm.index) + dm[1]; }
  const ast = prep(parseExpr(s), ctx);
  const others = [...freeVars(ast)].filter((name) => name !== v);
  if (others.length) fail(`Integrate in one variable. “${others[0]}” needs a value first.`);
  const poly = toPoly(ast);
  const coeffs = poly && univariateCoeffs(poly, v);
  const f = compile(ast);
  const val = (t) => (v === 'x' ? f(t, 0, 0) : f(0, t, 0));
  result.kind = `Integral · d${v}`;
  if (a !== null) {
    const A = constValue(prep(parseExpr(a), ctx)), B = constValue(prep(parseExpr(b), ctx));
    let value;
    if (coeffs && Number.isFinite(A) && Number.isFinite(B)) {
      const P = pIntegrate(poly, v);
      const evalAt = (t) => [...P.values()].reduce((sum, term) => sum + term.c * Math.pow(t, term.e[v] || 0), 0);
      value = evalAt(B) - evalAt(A);
    } else {
      value = adaptiveSimpson(val, A, B);
    }
    if (!Number.isFinite(value)) result.answers.push('The integral is not defined on this range. The integrand is undefined or it does not converge.');
    else {
      result.answers.push(`∫ from ${a.trim()} to ${b.trim()} of ${printNode(ast)} d${v} = ${numericText(value)}`);
    }
    if (v === 'x' && Number.isFinite(A) && Number.isFinite(B)) {
      result.series.push(explicitSeries(ast, `${printNode(ast)}`));
      result.series.push({ kind: 'area', f: (x) => f(x, 0, 0), a: A, b: B, label: result.source });
    }
    return;
  }
  if (coeffs) {
    const P = pIntegrate(poly, v);
    result.answers.push(`∫ ${printNode(ast)} d${v} = ${formatPoly(P)} + C`);
  } else {
    result.answers.push(`No closed form here. Add limits for a numeric value, like: integral from 0 to 1 of ${printNode(ast)}`);
  }
  if (v === 'x') result.series.push(explicitSeries(ast, `${printNode(ast)}`));
}

function analyzeLimit(v, aText, body, ctx, result) {
  const aAst = prep(parseExpr(aText), ctx);
  const a = constValue(aAst);
  let ast = prep(parseExpr(body), ctx);
  result.kind = `Limit · ${v} → ${aText}`;
  let cancelled = false;
  if (ast.t === 'bin' && ast.op === '/') {
    const N = toPoly(ast.a), D = toPoly(ast.b);
    const nc = N && univariateCoeffs(N, v), dc = D && univariateCoeffs(D, v);
    if (nc && dc && dc.some((c) => c !== 0)) {
      const { q, rem } = polyDivmod(nc, dc);
      if (rem.every((r) => Math.abs(r) < 1e-9)) { ast = polyToAst(pFromCoeffs(q, v)); cancelled = true; }
    }
  }
  const f = compile(ast);
  const at = (t) => (v === 'x' ? f(t, 0, 0) : f(0, t, 0));
  if (cancelled && Number.isFinite(a)) {
    const value = at(a);
    if (Number.isFinite(value)) {
      result.answers.push(`lim = ${fmtNum(value)}`);
      result.notes.push('The common factor cancels, so the value comes from the simplified expression.');
      return;
    }
  }
  if (Number.isFinite(a)) {
    const right = [1e-4, 1e-6, 1e-8].map((h) => at(a + h));
    const left = [1e-4, 1e-6, 1e-8].map((h) => at(a - h));
    const R = right[right.length - 1], L = left[left.length - 1];
    if (Number.isFinite(R) && Number.isFinite(L) && Math.abs(R - L) < 1e-5 * (1 + Math.abs(R))) {
      result.answers.push(`lim = ${fmtNum((R + L) / 2)}${Number.isInteger(Math.round((R + L) / 2)) ? '' : ` ≈ ${approx((R + L) / 2)}`}`);
    } else if (Math.abs(R) > 1e6 || Math.abs(L) > 1e6) {
      result.answers.push(`The values grow without bound (left ≈ ${approx(L)}, right ≈ ${approx(R)}).`);
    } else {
      result.answers.push(`The limit does not exist: left-hand ≈ ${approx(L)}, right-hand ≈ ${approx(R)}.`);
    }
  } else {
    const big = a > 0 ? [1e4, 1e6, 1e8] : [-1e4, -1e6, -1e8];
    const values = big.map(at);
    const last = values[values.length - 1];
    if (Number.isFinite(last) && Math.abs(last - values[1]) < 1e-5 * (1 + Math.abs(last))) result.answers.push(`lim ≈ ${approx(last)}`);
    else result.answers.push('The values do not settle to a single number.');
  }
}

function polyDivmod(nA, dA) {
  const r = nA.slice();
  const dl = dA[dA.length - 1];
  const q = new Array(Math.max(1, nA.length - dA.length + 1)).fill(0);
  for (let i = r.length - dA.length; i >= 0; i--) {
    const c = r[i + dA.length - 1] / dl;
    q[i] = c;
    for (let j = 0; j < dA.length; j++) r[i + j] -= c * dA[j];
  }
  return { q, rem: r.slice(0, Math.max(0, dA.length - 1)) };
}

function analyzeFactor(body, ctx, result) {
  const ast = prep(parseExpr(body), ctx);
  const poly = toPoly(ast);
  result.kind = 'Factor';
  if (!poly) fail('Factoring works on polynomials. Try “expand” or “simplify” for other expressions.');
  const vars = polyVars(poly);
  if (vars.size > 1) fail('Factoring works in one variable here.');
  const v = vars.size ? [...vars][0] : 'x';
  const coeffs = trimmed(univariateCoeffs(poly, v));
  const deg = coeffs.length - 1;
  if (deg < 1) { result.answers.push(formatPoly(poly)); return; }
  const lead = coeffs[deg];
  const roots = solvePolyCoeffs(coeffs).roots.flatMap((r) => (r.double ? [r, { ...r }] : [r]));
  const used = new Array(roots.length).fill(false);
  const factors = [];
  roots.forEach((r, i) => {
    if (used[i] || r.im !== 0) return;
    let mult = 0;
    roots.forEach((o, j) => {
      if (!used[j] && o.im === 0 && Math.abs(o.re - r.re) < 1e-6 * (1 + Math.abs(r.re))) { used[j] = true; mult++; }
    });
    const text = r.re < 0 ? `(${v} + ${fmtNum(-r.re)})` : `(${v} ${MINUS} ${fmtNum(r.re)})`;
    factors.push(mult > 1 ? `${text}^${mult}` : text);
  });
  roots.forEach((r, i) => {
    if (used[i] || r.im <= 0) return;
    const j = roots.findIndex((o, k) => k !== i && !used[k] && Math.abs(o.re - r.re) < 1e-6 && Math.abs(o.im + r.im) < 1e-6);
    used[i] = true;
    if (j >= 0) used[j] = true;
    const p = -2 * r.re, q = r.re * r.re + r.im * r.im;
    const pTxt = p < 0 ? `${MINUS} ${fmtNum(-p)}${v}` : `+ ${fmtNum(p)}${v}`;
    const qTxt = q < 0 ? `${MINUS} ${fmtNum(-q)}` : `+ ${fmtNum(q)}`;
    factors.push(`(${v}^2 ${pTxt} ${qTxt})`);
  });
  const pref = `${lead < 0 ? MINUS : ''}${Math.abs(lead) === 1 ? '' : fmtNum(Math.abs(lead))}`;
  const text = `${pref}${factors.join('')}` || fmtNum(lead);
  result.answers.push(`${text}`);
  if (!factors.length) result.notes.push('No real roots, so the polynomial does not factor over the real numbers.');
  else result.notes.push('Real factorization. Complex pairs appear as quadratic factors.');
}

function analyzeExpand(body, ctx, result) {
  const ast = prep(parseExpr(body), ctx);
  result.kind = 'Expand · simplify';
  const poly = toPoly(ast);
  if (poly) { result.answers.push(formatPoly(poly)); return; }
  if (ast.t === 'bin' && ast.op === '/') {
    const N = toPoly(ast.a), D = toPoly(ast.b);
    const nc = N && univariateCoeffs(N, 'x'), dc = D && univariateCoeffs(D, 'x');
    if (nc && dc && dc.some((c) => c !== 0)) {
      const { q, rem } = polyDivmod(nc, dc);
      if (rem.every((r) => Math.abs(r) < 1e-9)) {
        result.answers.push(formatPoly(pFromCoeffs(q, 'x')));
        result.notes.push('The common factor cancels. The original expression is undefined where the denominator is zero.');
        return;
      }
    }
  }
  result.answers.push(printNode(ast));
  result.notes.push('This is not a polynomial, so it is shown in a tidied form.');
  if ([...freeVars(ast)].every((name) => name === 'x') && freeVars(ast).size) result.series.push(explicitSeries(ast, result.source));
}

function analyzeEvaluate(body, ctx, result) {
  let expr = body, assigns = '';
  const m = /^(.*?)\s+(?:at|with|when|for|where)\s+(.+)$/.exec(body);
  if (m) { expr = m[1]; assigns = m[2]; }
  let ast = prep(parseExpr(expr), ctx);
  if (assigns) {
    for (const part of splitTop(assigns.replace(/\s+and\s+/g, ','), ',')) {
      const q = /^([a-z])\s*=\s*(.+)$/.exec(part);
      if (!q) fail('Write values like x = 3, or y = 2.');
      ast = subst(ast, q[1], num(constValue(prep(parseExpr(q[2]), ctx))));
    }
  }
  result.kind = 'Evaluate';
  const vars = freeVars(ast);
  if (vars.size) {
    const name = [...vars][0];
    result.answers.push(`Still depends on ${[...vars].join(', ')}. Add a value, like: evaluate ${expr} at ${name} = 3`);
    if ([...vars].every((n) => n === 'x')) result.series.push(explicitSeries(ast, result.source));
    return;
  }
  const value = compile(ast)(0, 0, 0);
  result.answers.push(`${printNode(ast)} = ${fmtNum(value)}${Number.isInteger(Math.round(value * 1e9) / 1e9) || Math.abs(value) < 1e-13 ? '' : ` ≈ ${approx(value)}`}`);
}

function analyzeSolve(body, forVar, ctx, result) {
  const parts = splitSystem(body);
  if (parts) return analyzeSystem(parts, ctx, result);
  const st = parseStatement(body);
  if (!st.op) return analyzeRelation({ op: '=', left: st.expr, right: num(0) }, ctx, result, true);
  return analyzeRelation(st, ctx, result, true);
}

function analyzePolar(body, ctx, result) {
  const ast = prep(parseExpr(body), ctx);
  if (freeVars(ast).has('x') || freeVars(ast).has('y')) fail('In polar form, use theta, not x or y. Example: r = 1 + cos(theta)');
  const f = compile(ast);
  result.kind = 'Polar curve';
  result.answers.push(`r = ${printNode(ast)}, drawn for θ from 0 to 2π`);
  result.series.push({ kind: 'polar', R: (th) => f(0, 0, th), label: result.source });
}

function analyzeParametric(xText, yText, ctx, result) {
  const X = prep(parseExpr(xText), ctx), Y = prep(parseExpr(yText), ctx);
  const names = new Set([...freeVars(X), ...freeVars(Y)]);
  if (names.has('x') || names.has('y')) fail('In parametric form, use t only, for example: x = cos(t), y = sin(t)');
  const fx = compile(X), fy = compile(Y);
  result.kind = 'Parametric curve';
  result.answers.push(`x(t) = ${printNode(X)}, y(t) = ${printNode(Y)}, for t from 0 to 2π`);
  result.series.push({ kind: 'param', X: (t) => fx(0, 0, t), Y: (t) => fy(0, 0, t), t0: 0, t1: 2 * Math.PI, label: result.source });
}

function analyzeData(body, ctx, result) {
  const pts = extractPairs(body);
  if (!pts.length) fail('No (x, y) pairs found. Example: points: (0,1) (1,3) (2,5)');
  const dataset = { pts };
  ctx.data = dataset;
  result.kind = 'Data points';
  result.dataset = dataset;
  result.series.push({ kind: 'points', pts, label: result.source });
}

function extractPairs(text) {
  const pairs = [];
  for (const seg of text.split(/[;)\n]/)) {
    const nums = (seg.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi) || []).map(Number);
    for (let i = 0; i + 1 < nums.length; i += 2) pairs.push({ x: nums[i], y: nums[i + 1] });
  }
  return pairs;
}

function finishDataset(result) {
  const pts = result.dataset.pts;
  result.answers = [`${pts.length} point${pts.length === 1 ? '' : 's'} plotted.`];
  if (pts.length < 2) { result.notes.push('Add at least two points for a best-fit line.'); return; }
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n, my = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of pts) { sxx += (p.x - mx) ** 2; sxy += (p.x - mx) * (p.y - my); syy += (p.y - my) ** 2; }
  if (sxx < 1e-12) { result.notes.push('All x-values are the same, so no best-fit line can be drawn.'); return; }
  const m = sxy / sxx, b = my - m * mx;
  const r2 = syy < 1e-12 ? 1 : (sxy * sxy) / (sxx * syy);
  result.answers.push(`Best-fit line: y = ${fmtNum(m, { exact: false })}x ${b < 0 ? MINUS : '+'} ${approx(Math.abs(b))}`);
  result.answers.push(`r² = ${approx(r2)}`);
  result.series.push({ kind: 'line', m, b, label: `best fit: ${result.source}`, dashed: true });
}

function defineFunction(name, arg, bodyText, ctx, result) {
  const raw = parseExpr(bodyText);
  const probe = prep(subst(raw, arg, { t: 'var', n: 'x' }), ctx);
  if ([...freeVars(probe)].some((v) => v !== 'x')) fail(`A function takes one variable: write ${name}(x) = …`);
  ctx.fns.set(name, { arg, body: raw });
  result.kind = 'Function';
  result.answers.push(`${name}(${arg}) = ${printNode(probe)}`);
  result.series.push(explicitSeries(probe, `${name}(x) = ${printNode(probe)}`));
  describeExplicit(probe, result);
}

function defineParam(name, ast, ctx, result) {
  const value = constValue(ast);
  ctx.params.set(name, value);
  result.kind = 'Constant';
  result.answers.push(`${name} = ${fmtNum(value)}`);
}

function splitSystem(s) {
  let parts = splitTop(s.replace(/\s+and\s+/g, ';'), ';');
  if (parts.length < 2) {
    parts = splitTop(s, ',');
    if (parts.length < 2) return null;
  }
  const ok = parts.every((p) => (p.match(/=/g) || []).length === 1 && !/[<>]/.test(p));
  return ok ? parts : null;
}

function analyze(source, ctx, result) {
  const s = normalize(source);
  let m;
  if (PAIR_LINE.test(s) && ctx.data) { ctx.data.pts.push(...extractPairs(s)); result.skip = true; return; }
  if ((m = /^(?:points?|data)\b\s*[:=]?\s*(.*)$/.exec(s))) return analyzeData(m[1], ctx, result);
  if (PAIR_LINE.test(s)) return analyzeData(s, ctx, result);
  if ((m = /^d\s*\/\s*d([a-z])\s*(?:of\s+)?(.+)$/.exec(s))) return analyzeDerivative(m[2], m[1], ctx, result);
  if ((m = /^(?:derivative|differentiate|diff)\b\s*(?:of\s+)?(.*)$/.exec(s))) {
    if (!m[1].trim() || m[1].trim() === 'of') fail('Say what to differentiate, like: derivative of x^3 sin(x)');
    return analyzeDerivative(m[1], 'x', ctx, result);
  }
  if ((m = /^(?:integral|integrate)\b\s*(.*)$/.exec(s))) return analyzeIntegral(m[1], ctx, result);
  if ((m = /^(?:limit|lim)\b\s*(?:as\s+)?([a-z])\s*(?:->|to)\s*(.+?)\s*(?:of\s+|:\s*)(.+)$/.exec(s))) return analyzeLimit(m[1], m[2], m[3], ctx, result);
  if ((m = /^factor\b\s*:?\s*(.+)$/.exec(s))) return analyzeFactor(m[1], ctx, result);
  if ((m = /^(?:expand|simplify)\b\s*:?\s*(.+)$/.exec(s))) return analyzeExpand(m[1], ctx, result);
  if ((m = /^(?:evaluate|eval|value of)\b\s*:?\s*(.+)$/.exec(s))) return analyzeEvaluate(m[1], ctx, result);
  if ((m = /^solve\b\s*(?:for\s+([a-z])\s*[:,]?\s*)?(.+)$/.exec(s))) return analyzeSolve(m[2], m[1] || null, ctx, result);
  if ((m = /^r\s*(?:\(\s*(?:theta|t)\s*\))?\s*=\s*(.+)$/.exec(s))) return analyzePolar(m[1], ctx, result);
  if ((m = /^x\s*(?:\(\s*t\s*\))?\s*=\s*(.+?)\s*,\s*y\s*(?:\(\s*t\s*\))?\s*=\s*(.+)$/.exec(s))) return analyzeParametric(m[1], m[2], ctx, result);
  if (/^\(.*\)$/.test(s)) {
    const inner = splitTop(s.slice(1, -1), ',');
    if (inner.length === 2) {
      const parsed = inner.map((p) => parseExpr(p));
      const names = [...freeVars(parsed[0]), ...freeVars(parsed[1])];
      if (names.includes('t') && !names.some((v) => v === 'x' || v === 'y')) return analyzeParametric(inner[0], inner[1], ctx, result);
    }
  }
  const parts = splitSystem(s);
  if (parts) return analyzeSystem(parts, ctx, result);
  if ((m = /^([a-z])\s*\(\s*([a-z])\s*\)\s*=\s*(.+)$/.exec(s)) && !RESERVED.has(m[1])) return defineFunction(m[1], m[2], m[3], ctx, result);
  if ((m = /^([a-z])\s*=\s*(.+)$/.exec(s)) && !RESERVED.has(m[1]) && !/[<>=]/.test(m[2])) {
    const ast = prep(parseExpr(m[2]), ctx);
    if (freeVars(ast).size === 0) return defineParam(m[1], ast, ctx, result);
  }
  const st = parseStatement(s);
  if (st.op) return analyzeRelation(st, ctx, result);
  return analyzeExpression(st.expr, ctx, result);
}

function analyzeExpression(raw, ctx, result) {
  const ast = prep(raw, ctx);
  const vars = freeVars(ast);
  if (!vars.size) {
    const value = compile(ast)(0, 0, 0);
    result.kind = 'Value';
    result.answers.push(`${printNode(ast)} = ${fmtNum(value)}${Number.isInteger(Math.round(value * 1e9) / 1e9) || !Number.isFinite(value) ? '' : ` ≈ ${approx(value)}`}`);
    return;
  }
  checkVars(ast);
  if (vars.has('y')) fail('Add “= 0” or write a relation, such as x^2 + y^2 = 25.');
  result.kind = 'Function · graph';
  result.series.push(explicitSeries(ast, result.source));
  describeExplicit(ast, result);
}

/* ---------------- tables ---------------- */
const TABLE_LETTERS = 'ABCDFGHIJKLMNOPQRSTUVWXYZ'; // E is skipped so the letter e stays the constant
const NUMBER_CELL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const SEPARATOR_CELL = /^:?-{2,}:?$/;

function cellValue(raw) {
  const t = String(raw).trim().replace(/^\$/, '').replace(/,/g, '').replace(/%$/, '');
  return NUMBER_CELL.test(t) ? Number(t) : String(raw).trim();
}

function tableKind(line) {
  if (line.includes('=')) return null;
  const pipes = (line.match(/\|/g) || []).length;
  if (pipes >= 2 && (pipes >= 3 || (line.startsWith('|') && line.endsWith('|')))) return 'pipe';
  if (line.includes('\t') && line.split('\t').length >= 2) return 'tab';
  if (!/[()<>;]/.test(line) && line.includes(',') && line.split(',').every((c) => c.trim().split(/\s+/).length <= 4)) return 'csv';
  return null;
}

function splitRow(line, kind) {
  if (kind === 'pipe') {
    let cells = line.split('|');
    if (cells[0].trim() === '') cells = cells.slice(1);
    if (cells.length && cells[cells.length - 1].trim() === '') cells = cells.slice(0, -1);
    return cells.map((c) => c.trim());
  }
  return (kind === 'tab' ? line.split('\t') : line.split(',')).map((c) => c.trim());
}

function buildTable(rawRows, kind) {
  const rows = rawRows.filter((r) => r.length && !r.every((c) => c === '' || SEPARATOR_CELL.test(c)));
  if (!rows.length) return null;
  const hasHeader = rows.length >= 2 && rows[0].some((c) => c !== '' && typeof cellValue(c) === 'string');
  if (kind === 'csv' && !hasHeader) return null;
  const width = Math.max(...rows.map((r) => r.length));
  if (width < 2) return null;
  const data = hasHeader ? rows.slice(1) : rows;
  const cols = [];
  for (let j = 0; j < width; j++) {
    const letter = TABLE_LETTERS[j];
    if (!letter) fail('Tables can have up to 22 columns.');
    const header = hasHeader ? (rows[0][j] || '') : '';
    const name = header || `Column ${letter}`;
    const values = data.map((r) => cellValue(r[j] ?? ''));
    const numeric = values.some((v) => typeof v === 'number') && values.every((v) => typeof v === 'number' || v === '');
    cols.push({ letter, name, label: `${letter} · ${name}`, numeric, values });
  }
  return { cols, nrows: data.length, result: null };
}

const dec = (v) => {
  const r = Math.round(v * 1e9) / 1e9;
  return (Number.isInteger(r) ? String(r) : String(Number(r.toPrecision(6)))).replace('-', MINUS);
};
const showCell = (v) => (typeof v === 'number' ? (Number.isFinite(v) ? dec(v) : '—') : v);
const displayTable = (table) => ({
  headers: table.cols.map((c) => c.label),
  rows: Array.from({ length: table.nrows }, (_, i) => table.cols.map((c) => showCell(c.values[i]))),
});

function resolveColumn(table, raw) {
  const key = String(raw).trim().toLowerCase().replace(/^(?:the\s+|column\s+)/, '').replace(/\s+/g, ' ');
  if (!key) return null;
  if (key.length === 1) {
    const byLetter = table.cols.find((c) => c.letter.toLowerCase() === key);
    if (byLetter) return byLetter;
  }
  const stem = (s) => s.toLowerCase().trim().replace(/s$/, '');
  return table.cols.find((c) => stem(c.name) === stem(key)) || null;
}

const STAT_NAMES = { sum: 'sum', total: 'sum', mean: 'mean', average: 'mean', avg: 'mean', max: 'max', maximum: 'max', min: 'min', minimum: 'min', median: 'median', count: 'count', range: 'range' };
function statValue(kind, values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) fail('There are no numbers in this column yet.');
  const sum = nums.reduce((s, v) => s + v, 0);
  const mid = nums.length >> 1;
  const median = nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
  return { sum, mean: sum / nums.length, max: nums[nums.length - 1], min: nums[0], median, count: nums.length, range: nums[nums.length - 1] - nums[0] }[kind];
}
function statsText(values) {
  return ['count', 'sum', 'mean', 'median', 'min', 'max'].map((k) => {
    try { return `${k} ${dec(statValue(k, values))}`; } catch { return null; }
  }).filter(Boolean).join(' · ');
}

function rowsWithBoth(xc, yc) {
  const idx = [];
  for (let i = 0; i < xc.values.length; i++) {
    if (Number.isFinite(xc.values[i]) && Number.isFinite(yc.values[i])) idx.push(i);
  }
  return idx;
}

function fitLine(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); syy += (ys[i] - my) ** 2;
  }
  if (sxx < 1e-12) return null;
  const m = sxy / sxx, b = my - m * mx;
  let maxRes = 0;
  for (let i = 0; i < n; i++) maxRes = Math.max(maxRes, Math.abs(ys[i] - (m * xs[i] + b)));
  const scale = Math.max(1, ...ys.map((v) => Math.abs(v)));
  const r2 = syy < 1e-12 ? 1 : (sxy * sxy) / (sxx * syy);
  return { m, b, r2, exact: maxRes < 1e-9 * scale };
}

function linearText(yName, xName, f) {
  const { m, b } = f;
  if (Math.abs(m) < 1e-12) return `${yName} = ${dec(b)}`;
  const coef = Math.abs(m - 1) < 1e-12 ? '' : Math.abs(m + 1) < 1e-12 ? MINUS : `${dec(m)}·`;
  const tail = Math.abs(b) < 1e-12 ? '' : ` ${b < 0 ? MINUS : '+'} ${dec(Math.abs(b))}`;
  return `${yName} = ${coef}${xName}${tail}`;
}

function colList(table) { return table.cols.map((c) => c.label).join(', '); }

function analyzeTable(table, ctx, result) {
  ctx.table = table;
  table.result = result;
  result.kind = 'Table';
  result.source = `Table · ${table.nrows} row${table.nrows === 1 ? '' : 's'} × ${table.cols.length} column${table.cols.length === 1 ? '' : 's'}`;
  result.table = displayTable(table);
  const numeric = table.cols.filter((c) => c.numeric);
  result.answers.push(`${numeric.length} of ${table.cols.length} column${table.cols.length === 1 ? '' : 's'} numeric. Ask about them, for example: sum of ${numeric[0] ? numeric[0].name : 'a column'}.`);
  for (const c of numeric) result.answers.push(`${c.name}: ${statsText(c.values)}`);
  if (numeric.length < 2) { result.notes.push('Add a second numeric column to fit a line.'); return; }
  const xc = numeric[0];
  for (const yc of numeric.slice(1)) {
    const idx = rowsWithBoth(xc, yc);
    const xs = idx.map((i) => xc.values[i]), ys = idx.map((i) => yc.values[i]);
    const fit = fitLine(xs, ys);
    if (!fit) { result.notes.push(`${yc.name} vs ${xc.name}: the ${xc.name} values are all the same, so no line can be fitted.`); continue; }
    result.answers.push(`${linearText(yc.name, xc.name, fit)} ${fit.exact ? '(exact for every row)' : `(best fit · R² = ${approx(fit.r2)})`}`);
    result.series.push({ kind: 'points', pts: xs.map((x, k) => ({ x, y: ys[k] })), label: `${yc.name} vs ${xc.name}` });
    result.series.push({ kind: 'line', m: fit.m, b: fit.b, label: `${yc.name} fit`, dashed: true });
  }
}

function analyzeTableQuery(s, ctx, result) {
  const table = ctx.table;
  let m = /^(sum|total|mean|average|avg|max|maximum|min|minimum|median|count|range)\s+(?:of\s+)?([a-z][a-z ]*)$/.exec(s);
  if (m) {
    const col = resolveColumn(table, m[2]);
    if (!col) fail(`I can't find a column called “${m[2].trim()}”. Columns: ${colList(table)}.`);
    const stat = STAT_NAMES[m[1]];
    if (!col.numeric) fail(`${col.name} is text, so it has no ${stat}.`);
    result.kind = 'Table · statistic';
    result.answers.push(`${stat} of ${col.name} = ${dec(statValue(stat, col.values))}`);
    return true;
  }
  m = /^(?:(?:value|find|what is|what's)\s+(?:of\s+)?)?([a-z][a-z ]*?)\s+(?:when|at|where|if|for)\s+([a-z][a-z ]*?)\s*=\s*([+-]?\d+(?:\.\d+)?)$/.exec(s);
  if (m) {
    const target = resolveColumn(table, m[1]), given = resolveColumn(table, m[2]);
    if (!target || !given) fail(`I can't find a column called “${(!target ? m[1] : m[2]).trim()}”. Columns: ${colList(table)}.`);
    const v = Number(m[3]);
    result.kind = 'Table · lookup';
    const row = given.values.findIndex((x) => typeof x === 'number' && Math.abs(x - v) < 1e-9);
    if (row >= 0) {
      result.answers.push(`${target.name} when ${given.name} = ${dec(v)}: ${showCell(target.values[row])}`);
      result.notes.push('Found in the table.');
      return true;
    }
    const idx = rowsWithBoth(given, target);
    const fit = fitLine(idx.map((i) => given.values[i]), idx.map((i) => target.values[i]));
    if (!fit) fail(`There are not enough numeric rows to predict ${target.name} from ${given.name}.`);
    const pred = fit.m * v + fit.b;
    result.answers.push(`${target.name} when ${given.name} = ${dec(v)}: ${dec(pred)}`);
    const line = linearText(target.name, given.name, fit);
    result.notes.push(fit.exact ? `Not in the table. Every row follows ${line}, so this is exact.` : `Not in the table. Predicted from the best-fit line ${line} (R² = ${approx(fit.r2)}).`);
    result.series.push({ kind: 'marks', label: `${target.name} when ${given.name}`, pts: [{ x: v, y: pred }] });
    return true;
  }
  return false;
}

function analyzeDerivedColumn(s, ctx, result) {
  const table = ctx.table;
  const m = /^([a-z])\s*=\s*(.+)$/.exec(s);
  if (!m) return false;
  const ast = parseExpr(m[2]);
  const refs = [...freeVars(ast)];
  const colRefs = refs.filter((v) => table.cols.some((c) => c.letter.toLowerCase() === v));
  if (!colRefs.length) return false;
  const unknown = refs.filter((v) => !colRefs.includes(v) && !(v in CONST));
  if (unknown.length) fail(`A column formula uses column letters (${table.cols.map((c) => c.letter).join(', ')}) and numbers. “${unknown[0]}” is not a column.`);
  for (const v of colRefs) {
    const col = table.cols.find((c) => c.letter.toLowerCase() === v);
    if (!col.numeric) fail(`${col.name} is text, so it cannot be used in a formula.`);
  }
  const letter = m[1].toUpperCase();
  if (letter === 'E') fail('Column E is skipped, so the letter e stays the constant e.');
  if (table.cols.some((c) => c.letter === letter)) fail(`Column ${letter} already exists.`);
  const values = [];
  for (let i = 0; i < table.nrows; i++) {
    let node = ast;
    let ok = true;
    for (const v of colRefs) {
      const val = table.cols.find((c) => c.letter.toLowerCase() === v).values[i];
      if (typeof val !== 'number' || !Number.isFinite(val)) { ok = false; break; }
      node = subst(node, v, num(val));
    }
    if (!ok) { values.push(NaN); continue; }
    const p = prep(node, ctx);
    values.push(freeVars(p).size ? NaN : compile(p)(0, 0, 0));
  }
  const formula = m[2].trim();
  table.cols.push({ letter, name: formula, label: `${letter} = ${formula.toUpperCase()}`, numeric: true, values });
  if (table.result) table.result.table = displayTable(table);
  result.kind = 'Table · new column';
  result.answers.push(`Added column ${letter} = ${formula.toUpperCase()}: ${values.map(showCell).join(', ')}`);
  result.table = displayTable(table);
  return true;
}

/* ---------------- word problems (linear models) ---------------- */
const MATH_WORDS = new Set(['derivative', 'differentiate', 'diff', 'integral', 'integrate', 'limit', 'lim', 'factor', 'expand', 'simplify', 'evaluate', 'eval', 'solve', 'points', 'point', 'data', 'from', 'to', 'of', 'at', 'when', 'for', 'and', 'pi', 'theta', 'inf', 'tau', 'value']);
const OUTPUT_WORDS = [['cost', 'C'], ['price', 'P'], ['total', 'T'], ['revenue', 'R'], ['profit', 'P'], ['earnings', 'E'], ['pay', 'P'], ['charge', 'C'], ['fee', 'F'], ['amount', 'A'], ['value', 'V']];
const OUTPUT_RE = new RegExp(`\\b(?:${OUTPUT_WORDS.map(([w]) => w).join('|')})`);
const INPUT_RE = /\b(?:hours?|hrs?|days?|weeks?|months?|miles?|items?|units?|people|minutes?|tickets?|pieces?|visits?|jobs?|number|quantity|count)\b/;
const QUESTION_RE = /\b(?:how much|how many|how long|find|determine|calculate|compute|what is|what's|what will|solve|evaluate)\b/i;
const FIXED_RE = /\b(?:base|fee|fixed|flat|initial|setup|set-up|service|call|deposit|minimum|starting|start|upfront|one-time|trip)\b/i;
const NEG_RE = /\b(?:less|minus|discount|off|subtract|reduc\w*|decreas\w*|deduct\w*|credit)\b/i;
const RATE_RE = /^\s*(?:(less|minus|off)\s+)?(?:dollars?|usd)?\s*(?:per|each|every|for each)\s+([a-z]+)|^\s*(?:dollars?)?\s*\/\s*([a-z]+)/i;
const RATE_A_RE = /^\s*(?:dollars?)?\s*an?\s+([a-z]+)/i;
const UNIT_RE = /^\s*-?\s*([a-z]+)/i;
const NOT_UNIT = new Set(['and', 'or', 'to', 'of', 'for', 'the', 'a', 'an', 'per', 'dollars', 'dollar', 'is', 'are', 'in', 'on', 'at', 'with', 'plus', 'by']);
const PAIR_RE = /(\$\s?)?(\d[\d,]*(?:\.\d+)?)\s*(?:dollars?)?\s+(?:for|in|over|on)\s+(\d+(?:\.\d+)?)[ -]?([a-z]+)/gi;

function isProse(line) {
  const words = (line.toLowerCase().match(/[a-z]{2,}/g) || []).filter((w) => !MATH_WORDS.has(w) && !NAMES.includes(w));
  return words.length >= 4;
}

function wordClauses(flat) {
  const out = [];
  for (const sm of flat.matchAll(/[^.?!;]+[.?!;]?/g)) {
    const start = sm.index, text = sm[0];
    let last = 0;
    for (const cm of text.matchAll(/,\s+and\s+|,\s+(?=(?:find|determine|calculate|compute|how|what)\b)/gi)) {
      out.push({ start: start + last, end: start + cm.index, text: text.slice(last, cm.index) });
      last = cm.index + cm[0].length;
    }
    out.push({ start: start + last, end: start + text.length, text: text.slice(last) });
  }
  return out.filter((c) => c.text.trim()).map((c) => ({ ...c, question: QUESTION_RE.test(c.text) }));
}

const unitKey = (u) => String(u || '').toLowerCase().replace(/^hrs?$/, 'hour').replace(/s$/, '');
const pluralize = (unit, n) => { const base = String(unit || 'unit').replace(/s$/, ''); return n === 1 ? base : `${base}s`; };
function fmtMoney(v) {
  const r = Math.round(v * 100) / 100;
  const body = Math.abs(r).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(r) ? 0 : 2, maximumFractionDigits: 2 });
  return `${r < 0 ? MINUS : ''}$${body}`;
}

function analyzeWordProblem(text, ctx, result) {
  const flat = text.replace(/\s+/g, ' ').trim();
  const lower = flat.toLowerCase();
  const clauses = wordClauses(flat);
  const clauseAt = (i) => clauses.find((c) => i >= c.start && i < c.end) || clauses[clauses.length - 1];

  const pairs = [];
  const consumed = [];
  for (const m of flat.matchAll(PAIR_RE)) {
    if (clauseAt(m.index).question) continue;
    pairs.push({ money: Number(m[2].replace(/,/g, '')), x: Number(m[3]), unit: m[4].toLowerCase() });
    consumed.push([m.index, m.index + m[0].length]);
  }

  const rates = [], intercepts = [], targets = [], inputs = [];
  for (const m of flat.matchAll(/(\$\s?)?(\d[\d,]*(?:\.\d+)?)/g)) {
    const i = m.index;
    if (consumed.some(([a, b]) => i >= a && i < b)) continue;
    const clause = clauseAt(i);
    const money = Boolean(m[1]);
    const value = Number(m[2].replace(/,/g, ''));
    const follow = flat.slice(i + m[0].length, clause.end);
    const before = flat.slice(Math.max(clause.start, i - 30), i);
    if (clause.question) {
      if (money) { targets.push(value); continue; }
      const u = UNIT_RE.exec(follow);
      inputs.push({ value, unit: u && !NOT_UNIT.has(u[1].toLowerCase()) ? u[1].toLowerCase() : null });
      continue;
    }
    const rateM = RATE_RE.exec(follow);
    const rateA = !rateM && money ? RATE_A_RE.exec(follow) : null;
    if (rateM) {
      rates.push({ value, unit: (rateM[2] || rateM[3]).toLowerCase(), neg: Boolean(rateM[1]) || NEG_RE.test(before) });
      continue;
    }
    if (rateA) {
      rates.push({ value, unit: rateA[1].toLowerCase(), neg: NEG_RE.test(before) });
      continue;
    }
    intercepts.push({ value, context: `${before} ${follow.slice(0, 30)}` });
  }

  let m, b, rateUnit = null;
  if (pairs.length >= 2) {
    const first = pairs[0];
    const second = pairs.find((p) => p.x !== first.x);
    if (!second) fail('The two prices use the same number of hours, so the slope cannot be found.');
    m = (second.money - first.money) / (second.x - first.x);
    b = first.money - m * first.x;
    rateUnit = first.unit;
    result.notes.push(`The rate comes from the two prices: ${fmtMoney(first.money)} for ${dec(first.x)} ${pluralize(first.unit, first.x)} and ${fmtMoney(second.money)} for ${dec(second.x)} ${pluralize(second.unit, second.x)}.`);
  } else {
    const moneyText = flat.includes('$') || /\b(?:cost|price|charge|fee|bill|pay)\b/i.test(flat);
    if (!rates.length && !(moneyText && intercepts.length === 1)) fail('I could not find a rate such as “$50 per hour”, or two prices such as “$120 for 2 hours and $180 for 4 hours”.');
    if (rates.length > 1) fail(`I found ${rates.length} rates. A linear model needs one rate, so write the problem with one input.`);
    const keyed = intercepts.filter((c) => FIXED_RE.test(c.context));
    const pool = keyed.length ? keyed : intercepts;
    if (pool.length > 1) fail(`I found several amounts (${pool.map((p) => dec(p.value)).join(', ')}) and cannot tell which is the fixed charge. Label it, like “$25 base fee”.`);
    if (rates.length) {
      const r = rates[0];
      m = (r.neg ? -1 : 1) * r.value;
      rateUnit = r.unit;
    } else {
      m = 0;
      rateUnit = null;
      result.notes.push('There is no per-unit rate, so the total is the same for any amount of input.');
    }
    b = pool.length ? (NEG_RE.test(pool[0].context) ? -1 : 1) * pool[0].value : 0;
  }

  const outFound = OUTPUT_WORDS.find(([w]) => new RegExp(`\\b${w}`).test(lower));
  let outPhrase = /\btotal\s+cost\b/.test(lower) ? 'total cost' : (outFound ? outFound[0] : 'value');
  let outL = null, inL = null;
  const unassigned = [];
  for (const p of [...flat.matchAll(/\(\s*([A-Za-z])\s*\)/g)]) {
    const context = lower.slice(Math.max(0, p.index - 40), p.index);
    const letter = p[1];
    if (!outL && OUTPUT_RE.test(context)) {
      outL = letter;
      const named = [...context.matchAll(/\b(cost|price|total|revenue|profit|earnings|pay|charge|fee|amount|value)\b/g)];
      if (/\btotal\s+cost\s*$/.test(context.trimEnd())) outPhrase = 'total cost';
      else if (named.length) outPhrase = named[named.length - 1][1];
    }
    else if (!inL && INPUT_RE.test(context)) inL = letter;
    else unassigned.push(letter);
  }
  for (const letter of unassigned) {
    if (!outL) outL = letter;
    else if (!inL && letter !== outL) inL = letter;
  }
  if (!outL) outL = outFound ? outFound[1] : 'y';
  if (!inL) inL = rateUnit ? rateUnit[0].toLowerCase() : 'x';
  if (inL === outL) inL = outL.toLowerCase() === 'x' ? 'y' : 'x';
  const moneyish = flat.includes('$') || /\b(?:cost|price|revenue|profit|earnings|pay|charge|fee|bill)\b/.test(lower);
  const mny = (v) => (moneyish ? fmtMoney(v) : dec(v));

  const constant = Math.abs(m) < 1e-12;
  const eq = constant
    ? `${outL} = ${dec(b)}`
    : `${outL} = ${Math.abs(m - 1) < 1e-12 ? '' : Math.abs(m + 1) < 1e-12 ? MINUS : dec(m)}${inL}${Math.abs(b) < 1e-12 ? '' : ` ${b < 0 ? MINUS : '+'} ${dec(Math.abs(b))}`}`;
  const chosen = inputs.find((i) => rateUnit && unitKey(i.unit) === unitKey(rateUnit)) || inputs.find((i) => i.unit) || inputs[0] || null;
  const unitName = (chosen && chosen.unit) || rateUnit || 'unit';
  result.kind = 'Word problem · linear model';
  result.answers.push(`Linear equation: ${eq}`);
  if (!constant) result.notes.push(`${mny(m)} is the rate: each extra ${pluralize(rateUnit, 1)} changes the ${outPhrase} by ${mny(Math.abs(m))}.`);
  if (!constant && Math.abs(b) > 1e-12) result.notes.push(`${mny(b)} is the fixed starting amount, the value when ${inL} = 0.`);

  let marks = null;
  if (chosen && constant) {
    result.answers.push(`So the ${outPhrase} is ${mny(b)} for any number of ${pluralize(unitName, 2)}.`);
    marks = null;
  } else if (chosen) {
    const xv = chosen.value, yv = m * xv + b;
    result.answers.push(`For ${inL} = ${dec(xv)}: ${outL} = ${dec(m)}(${dec(xv)})${Math.abs(b) < 1e-12 ? '' : ` ${b < 0 ? MINUS : '+'} ${dec(Math.abs(b))}`} = ${mny(yv)}`);
    result.answers.push(`So for ${dec(xv)} ${pluralize(unitName, xv)}, the ${outPhrase} is ${mny(yv)}.`);
    marks = { x: xv, y: yv };
  } else if (targets.length && /\b(?:how many|how long)\b/.test(lower)) {
    const T = targets[0];
    const xv = (T - b) / m;
    const numer = Math.abs(b) < 1e-12 ? mny(T) : `(${mny(T)} ${b < 0 ? '+' : MINUS} ${dec(Math.abs(b))})`;
    result.answers.push(`${inL} = ${numer} / ${dec(m)} = ${dec(xv)}`);
    result.answers.push(`So ${mny(T)} corresponds to ${dec(xv)} ${pluralize(unitName, xv)}.`);
    marks = { x: xv, y: T };
  } else {
    result.notes.push(`Add a question with a value, like “how much for 8 ${pluralize(unitName, 8)}?”, to get a number.`);
  }

  const expr = constant ? `${b}` : `${m}*x${b < 0 ? '-' : '+'}${Math.abs(b)}`;
  const ast = prep(parseExpr(expr), { params: new Map(), fns: new Map(), data: null });
  result.series.push(explicitSeries(ast, eq));
  if (marks) result.series.push({ kind: 'marks', label: eq, pts: [marks] });
}

/* ---------------- splitting a paste into units ---------------- */
function splitUnits(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim());
  const units = [];
  for (let i = 0; i < lines.length;) {
    const src = lines[i];
    if (!src || /^(#|\/\/|%)/.test(src)) { i++; continue; }
    const kind = tableKind(src);
    if (kind) {
      let j = i;
      const block = [];
      while (j < lines.length && lines[j] && tableKind(lines[j]) === kind) block.push(lines[j++]);
      const table = block.length >= 2 ? buildTable(block.map((l) => splitRow(l, kind)), kind) : null;
      if (table) { units.push({ type: 'table', table, text: block.join('\n') }); i = j; continue; }
    }
    if (isProse(src)) {
      let j = i;
      const block = [];
      while (j < lines.length && lines[j] && isProse(lines[j])) block.push(lines[j++]);
      units.push({ type: 'prose', text: block.join(' ') });
      i = j;
      continue;
    }
    units.push({ type: 'line', text: src });
    i++;
  }
  return units;
}

/* ---------------- running a whole paste ---------------- */
function run(text) {
  const ctx = { params: new Map(), fns: new Map(), data: null, table: null };
  const results = [];
  for (const unit of splitUnits(text)) {
    const result = { source: unit.type === 'table' ? '' : unit.text, kind: '', answers: [], notes: [], series: [], error: '' };
    try {
      if (unit.type === 'table') analyzeTable(unit.table, ctx, result);
      else if (unit.type === 'prose') analyzeWordProblem(unit.text, ctx, result);
      else {
        const handled = ctx.table && (analyzeTableQuery(normalize(unit.text), ctx, result) || analyzeDerivedColumn(normalize(unit.text), ctx, result));
        if (!handled) analyze(unit.text, ctx, result);
      }
    } catch (err) {
      if (err instanceof MathError) result.error = err.message;
      else { result.error = 'That line could not be read. Check the notation, for example x^2 for x², sqrt(x), pi, or e.'; }
      result.kind = 'Needs a fix';
    }
    if (result.skip) continue;
    if (!result.kind && !result.error) result.kind = 'Note';
    results.push(result);
  }
  for (const r of results) if (r.dataset) finishDataset(r);
  const series = [];
  for (const r of results) for (const s of r.series) series.push(s);
  series.forEach((s, i) => { s.color = COLORS[i % COLORS.length]; });
  return { results, series };
}

/* ============================================================
   Browser interface: graph drawing and the paste panel
   ============================================================ */
const drafts = {};
const SAMPLES = {
  solve: [
    '2x + 3 = 11',
    'x^2 - 5x + 6 = 0',
    'x^2 + 2x - 2 = 0',
    'x^2 + y^2 = 25',
    '2x + y = 7; x - y = 2',
    'derivative of x^3 sin(x)',
    'integral from 0 to pi of sin(x)',
    'factor x^2 - 5x + 6',
    'limit x->2 of (x^2 - 4)/(x - 2)',
    'f(x) = x^2 - 4',
    'f(3)',
    'An electrician charges a $25 base service call fee plus $50 per hour of labor. Write a linear equation for the total cost (C) based on the number of hours worked (h), and find out how much an 8-hour job costs.',
    '| hours | cost |',
    '|---|---|',
    '| 1 | 75 |',
    '| 2 | 125 |',
    '| 4 | 225 |',
    'cost when hours = 6',
    'sum of cost',
    'd = 50a + 25',
  ].join('\n'),
  graph: [
    'y = sin(x)',
    'y = x^2/4 - 2',
    'y > x^2 - 4',
    'x^2 + y^2 <= 9',
    'x = 2cos(t), y = 3sin(t)',
    'r = 1 + cos(theta)',
    'points: (0,1) (1,3) (2,5) (3,7.2)',
  ].join('\n'),
};
const HINTS = {
  solve: 'One problem per line, or a word problem as a paragraph. Examples: 2x+3=11 · x^2-5x+6=0 · 2x+y=7; x-y=2 · integral from 0 to 1 of x^2 · limit x->0 of sin(x)/x. Add a table with | rows | or comma rows, then ask: sum of cost · cost when hours = 6.',
  graph: 'One graph per line. Examples: y = sin(x) · y > x^2 - 4 · x^2 + y^2 <= 9 · x = 2cos(t), y = 3sin(t) · r = 1 + cos(theta) · points: (0,1) (1,3). Type f(x) = … to name a function and reuse it.',
};

function h(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'class') node.className = v;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid === undefined || kid === null || kid === false) continue;
    node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

const SAT = {
  lt: (v) => v < 0, le: (v) => v <= 0, gt: (v) => v > 0, ge: (v) => v >= 0,
};

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m < 2 ? 1 : m < 5 ? 2 : 5) * p;
}

function themeOf() {
  const cs = getComputedStyle(document.documentElement);
  const pick = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
  return { bg: pick('--panel', '#201b29'), grid: pick('--line', '#38303f'), ink: pick('--ink', '#f0eaf5'), muted: pick('--muted', '#aea3b8') };
}

function withAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function drawGraph(g, W, H, dpr, view, series, hover, theme) {
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  g.fillStyle = theme.bg;
  g.fillRect(0, 0, W, H);
  const geo = {
    W, H, view,
    toX: (px) => view.cx + (px - W / 2) / view.s,
    toY: (py) => view.cy - (py - H / 2) / view.s,
    px: (x) => W / 2 + (x - view.cx) * view.s,
    py: (y) => H / 2 - (y - view.cy) * view.s,
  };
  drawGrid(g, geo, theme);
  const sampled = [];
  for (const s of series) {
    if (s.kind === 'explicit') sampled.push({ s, ys: drawExplicit(g, geo, s) });
    else if (s.kind === 'implicit') drawImplicit(g, geo, s);
    else if (s.kind === 'param' || s.kind === 'polar') drawCurve(g, geo, s);
    else if (s.kind === 'points') drawPoints(g, geo, s, theme);
    else if (s.kind === 'line') drawFitLine(g, geo, s);
    else if (s.kind === 'area') drawArea(g, geo, s);
    else if (s.kind === 'marks') drawMarks(g, geo, s.pts, s.color || theme.ink, theme);
  }
  drawAutoMarks(g, geo, sampled, theme);
  drawAxes(g, geo, theme);
  if (hover) drawHover(g, geo, hover, sampled, theme);
}

function drawGrid(g, geo, theme) {
  const step = niceStep(90 / geo.view.s);
  g.save();
  g.strokeStyle = theme.grid;
  g.globalAlpha = 0.45;
  g.lineWidth = 1;
  g.beginPath();
  const x0 = Math.ceil(geo.toX(0) / step), x1 = Math.floor(geo.toX(geo.W) / step);
  for (let k = x0; k <= x1; k++) { const px = Math.round(geo.px(k * step)) + 0.5; g.moveTo(px, 0); g.lineTo(px, geo.H); }
  const y0 = Math.ceil(geo.toY(geo.H) / step), y1 = Math.floor(geo.toY(0) / step);
  for (let k = y0; k <= y1; k++) { const py = Math.round(geo.py(k * step)) + 0.5; g.moveTo(0, py); g.lineTo(geo.W, py); }
  g.stroke();
  g.restore();
}

function drawAxes(g, geo, theme) {
  const step = niceStep(90 / geo.view.s);
  const ax = geo.px(0), ay = geo.py(0);
  g.save();
  g.strokeStyle = theme.muted;
  g.lineWidth = 1.5;
  g.beginPath();
  if (ax >= 0 && ax <= geo.W) { g.moveTo(Math.round(ax) + 0.5, 0); g.lineTo(Math.round(ax) + 0.5, geo.H); }
  if (ay >= 0 && ay <= geo.H) { g.moveTo(0, Math.round(ay) + 0.5); g.lineTo(geo.W, Math.round(ay) + 0.5); }
  g.stroke();
  g.fillStyle = theme.muted;
  g.font = '11px Inter, DM, sans-serif';
  const baseY = Math.min(Math.max(ay + 14, 14), geo.H - 6);
  const baseX = Math.min(Math.max(ax - 6, 6), geo.W - 6);
  const x0 = Math.ceil(geo.toX(0) / step), x1 = Math.floor(geo.toX(geo.W) / step);
  g.textAlign = 'center';
  for (let k = x0; k <= x1; k++) {
    if (k === 0) continue;
    const px = geo.px(k * step);
    if (px < 14 || px > geo.W - 14) continue;
    g.fillText(fmtNum(k * step, { exact: false }), px, baseY);
  }
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  const y0 = Math.ceil(geo.toY(geo.H) / step), y1 = Math.floor(geo.toY(0) / step);
  for (let k = y0; k <= y1; k++) {
    if (k === 0) continue;
    const py = geo.py(k * step);
    if (py < 10 || py > geo.H - 10) continue;
    g.fillText(fmtNum(k * step, { exact: false }), baseX, py);
  }
  g.restore();
}

function drawExplicit(g, geo, s) {
  const { W, H } = geo;
  const ys = new Float64Array(W + 1);
  for (let px = 0; px <= W; px++) ys[px] = s.f(geo.toX(px));
  g.save();
  g.strokeStyle = s.color;
  g.lineWidth = 2.2;
  if (s.dashed) g.setLineDash([7, 5]);
  g.beginPath();
  let started = false, prev = 0;
  for (let px = 0; px <= W; px++) {
    const y = ys[px];
    if (!Number.isFinite(y) || Math.abs(y) > 1e7) { started = false; continue; }
    const py = geo.py(y);
    if (!started || Math.abs(py - prev) > H * 1.5) g.moveTo(px, py); else g.lineTo(px, py);
    prev = py;
    started = true;
  }
  g.stroke();
  g.restore();
  return ys;
}

function drawAutoMarks(g, geo, sampled, theme) {
  const marks = [];
  for (const { s, ys } of sampled) {
    for (let px = 0; px < ys.length - 1 && marks.length < 160; px++) {
      const a = ys[px], b = ys[px + 1];
      if (!Number.isFinite(a) || !Number.isFinite(b) || (a < 0) === (b < 0) || a === 0) continue;
      const f = s.f;
      const x = bisect(f, geo.toX(px), geo.toX(px + 1));
      const fx = f(x);
      if (Math.abs(fx) <= 1e-6 * (1 + Math.abs(a) + Math.abs(b))) marks.push({ x, y: 0 });
    }
  }
  const explicit = sampled.slice(0, 6);
  for (let i = 0; i < explicit.length; i++) {
    for (let j = i + 1; j < explicit.length; j++) {
      const f = (x) => explicit[i].s.f(x) - explicit[j].s.f(x);
      const A = explicit[i].ys, B = explicit[j].ys;
      for (let px = 0; px < geo.W && marks.length < 240; px++) {
        const d1 = A[px] - B[px], d2 = A[px + 1] - B[px + 1];
        if (!Number.isFinite(d1) || !Number.isFinite(d2) || (d1 < 0) === (d2 < 0) || d1 === 0) continue;
        const x = bisect(f, geo.toX(px), geo.toX(px + 1));
        if (Math.abs(f(x)) <= 1e-6 * (1 + Math.abs(A[px]) + Math.abs(B[px]))) marks.push({ x, y: explicit[i].s.f(x) });
      }
    }
  }
  drawMarks(g, geo, marks, theme.ink, theme);
}

function drawMarks(g, geo, pts, color, theme) {
  g.save();
  for (const p of pts) {
    const px = geo.px(p.x), py = geo.py(p.y);
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
    g.beginPath();
    g.arc(px, py, 4.5, 0, Math.PI * 2);
    g.fillStyle = theme.bg;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = color;
    g.stroke();
  }
  g.restore();
}

function drawImplicit(g, geo, s) {
  const c = 4;
  const nx = Math.ceil(geo.W / c) + 1, ny = Math.ceil(geo.H / c) + 1;
  const vals = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) vals[j * nx + i] = s.F(geo.toX(i * c), geo.toY(j * c));
  if (s.rel !== 'eq') {
    const sat = SAT[s.rel];
    g.save();
    g.fillStyle = withAlpha(s.color, 0.17);
    g.beginPath();
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = vals[j * nx + i], b = vals[j * nx + i + 1], d = vals[(j + 1) * nx + i], e = vals[(j + 1) * nx + i + 1];
        if (sat(a) && sat(b) && sat(d) && sat(e)) g.rect(i * c, j * c, c, c);
      }
    }
    g.fill();
    g.restore();
  }
  const edge = (va, vb, xa, ya, xb, yb) => {
    if ((va < 0) === (vb < 0) || !Number.isFinite(va) || !Number.isFinite(vb)) return null;
    const t = va / (va - vb);
    return [xa + (xb - xa) * t, ya + (yb - ya) * t];
  };
  g.save();
  g.strokeStyle = s.color;
  g.lineWidth = 2;
  g.beginPath();
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const x0 = i * c, x1 = (i + 1) * c, y0 = j * c, y1 = (j + 1) * c;
      const tl = vals[j * nx + i], tr = vals[j * nx + i + 1], br = vals[(j + 1) * nx + i + 1], bl = vals[(j + 1) * nx + i];
      const pts = [edge(tl, tr, x0, y0, x1, y0), edge(tr, br, x1, y0, x1, y1), edge(bl, br, x0, y1, x1, y1), edge(tl, bl, x0, y0, x0, y1)].filter(Boolean);
      if (pts.length === 2) { g.moveTo(pts[0][0], pts[0][1]); g.lineTo(pts[1][0], pts[1][1]); }
      else if (pts.length === 4) {
        g.moveTo(pts[0][0], pts[0][1]); g.lineTo(pts[1][0], pts[1][1]);
        g.moveTo(pts[2][0], pts[2][1]); g.lineTo(pts[3][0], pts[3][1]);
      }
    }
  }
  g.stroke();
  g.restore();
}

function drawCurve(g, geo, s) {
  const N = 1800;
  g.save();
  g.strokeStyle = s.color;
  g.lineWidth = 2.2;
  g.beginPath();
  let started = false;
  for (let k = 0; k <= N; k++) {
    const t = s.t0 !== undefined ? s.t0 + ((s.t1 - s.t0) * k) / N : (2 * Math.PI * k) / N;
    let x, y;
    if (s.kind === 'param') { x = s.X(t); y = s.Y(t); }
    else { const r = s.R(t); x = r * Math.cos(t); y = r * Math.sin(t); }
    if (!Number.isFinite(x) || !Number.isFinite(y)) { started = false; continue; }
    const px = geo.px(x), py = geo.py(y);
    if (!started) { g.moveTo(px, py); started = true; } else g.lineTo(px, py);
  }
  g.stroke();
  g.restore();
}

function drawPoints(g, geo, s, theme) {
  g.save();
  for (const p of s.pts) {
    const px = geo.px(p.x), py = geo.py(p.y);
    if (px < -6 || px > geo.W + 6 || py < -6 || py > geo.H + 6) continue;
    g.beginPath();
    g.arc(px, py, 4.5, 0, Math.PI * 2);
    g.fillStyle = s.color;
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = theme.bg;
    g.stroke();
  }
  g.restore();
}

function drawFitLine(g, geo, s) {
  g.save();
  g.strokeStyle = s.color;
  g.lineWidth = 1.8;
  g.setLineDash([6, 5]);
  g.beginPath();
  g.moveTo(0, geo.py(s.m * geo.toX(0) + s.b));
  g.lineTo(geo.W, geo.py(s.m * geo.toX(geo.W) + s.b));
  g.stroke();
  g.restore();
}

function drawArea(g, geo, s) {
  const N = 500;
  g.save();
  g.fillStyle = withAlpha(s.color, 0.22);
  g.beginPath();
  g.moveTo(geo.px(s.a), geo.py(0));
  for (let k = 0; k <= N; k++) {
    const x = s.a + ((s.b - s.a) * k) / N;
    const y = s.f(x);
    if (Number.isFinite(y)) g.lineTo(geo.px(x), geo.py(y));
  }
  g.lineTo(geo.px(s.b), geo.py(0));
  g.closePath();
  g.fill();
  g.restore();
}

function drawHover(g, geo, hover, sampled, theme) {
  const wx = geo.toX(hover.px);
  g.save();
  g.strokeStyle = theme.muted;
  g.globalAlpha = 0.6;
  g.setLineDash([3, 4]);
  g.beginPath();
  g.moveTo(Math.round(hover.px) + 0.5, 0); g.lineTo(Math.round(hover.px) + 0.5, geo.H);
  g.stroke();
  g.restore();
  const rows = [`x = ${fmtNum(wx, { exact: false })}`];
  for (const { s } of sampled.slice(0, 5)) {
    const y = s.f(wx);
    if (Number.isFinite(y)) rows.push(`${s.label.slice(0, 22)}: ${fmtNum(y, { exact: false })}`);
  }
  g.save();
  g.font = '12px Inter, DM, sans-serif';
  const width = Math.max(...rows.map((r) => g.measureText(r).width)) + 18;
  const height = rows.length * 17 + 10;
  const bx = Math.min(hover.px + 14, geo.W - width - 6), by = Math.max(6, Math.min(hover.py + 14, geo.H - height - 6));
  g.globalAlpha = 0.92;
  g.fillStyle = theme.bg;
  g.strokeStyle = theme.grid;
  g.beginPath();
  if (g.roundRect) g.roundRect(bx, by, width, height, 6); else g.rect(bx, by, width, height);
  g.fill();
  g.globalAlpha = 1;
  g.stroke();
  g.fillStyle = theme.ink;
  g.textBaseline = 'top';
  rows.forEach((r, i) => g.fillText(r, bx + 9, by + 6 + i * 17));
  g.restore();
}

const TABLE_TEMPLATE = '| hours | cost |\n|---|---|\n| 1 | 75 |\n| 2 | 125 |\n| 4 | 225 |';

function renderTable(table) {
  return h('div', { class: 'lab-table-wrap' },
    h('table', { class: 'lab-table' },
      h('thead', {}, h('tr', {}, table.headers.map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', {}, table.rows.map((row) => h('tr', {}, row.map((c) => h('td', {}, String(c))))))));
}

function renderResults(root, results) {
  root.replaceChildren();
  if (!results.length) {
    root.append(h('p', { class: 'lab-empty' }, 'Paste a problem above, or load the examples, to see answers here.'));
    return;
  }
  for (const r of results) {
    const card = h('article', { class: `lab-result${r.error ? ' is-error' : ''}` },
      h('p', { class: 'lab-kind' }, r.kind || (r.error ? 'Needs a fix' : 'Note')),
      h('h3', { class: 'lab-source' }, r.source),
      r.answers.map((a) => h('p', { class: 'lab-answer' }, a)),
      r.table ? renderTable(r.table) : null,
      r.notes.map((n) => h('p', { class: 'lab-note' }, n)),
      r.error ? h('p', { class: 'lab-error' }, r.error) : null);
    root.append(card);
  }
}

let current = null;

function mount(root, mode, options = {}) {
  close();
  const isSolve = mode === 'solve';
  const sample = SAMPLES[isSolve ? 'solve' : 'graph'];
  const title = isSolve ? 'Problem Solver' : 'Graph Lab';
  root.replaceChildren();

  const input = h('textarea', {
    class: 'lab-input', rows: '10', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off',
    'aria-label': 'Problems or equations to solve and graph, one per line',
  });
  input.value = drafts[mode] ?? sample;
  const status = h('p', { class: 'lab-status', role: 'status', 'aria-live': 'polite' });
  const results = h('div', { class: 'lab-results', 'aria-label': 'Answers' });
  const legend = h('div', { class: 'lab-legend', role: 'group', 'aria-label': 'Graph layers. Select a layer to show or hide it.' });
  const canvas = h('canvas', { class: 'lab-canvas', tabindex: '0', role: 'img', 'aria-label': 'Interactive graph. Drag to pan, scroll or use plus and minus to zoom, arrow keys to pan.' });
  const readout = h('p', { class: 'lab-readout' }, 'Drag to pan · scroll, or use + and − to zoom · move the pointer for values · arrow keys pan on the graph.');

  const state = { view: { cx: 0, cy: 0, s: 40 }, series: [], hidden: new Set(), hover: null, drag: null };
  let timer = 0, frame = 0, resizer = null;

  const dpr = () => window.devicePixelRatio || 1;
  const size = () => ({ W: canvas.clientWidth, H: canvas.clientHeight });
  const resetView = () => {
    const { W } = size();
    state.view = { cx: 0, cy: 0, s: Math.max(20, W / 20) };
  };
  function draw() {
    cancelAnimationFrame(frame);
    const { W, H } = size();
    if (W < 20 || H < 20) return;
    const ratio = dpr();
    if (canvas.width !== Math.round(W * ratio) || canvas.height !== Math.round(H * ratio)) {
      canvas.width = Math.round(W * ratio);
      canvas.height = Math.round(H * ratio);
    }
    if (!state.view) resetView();
    const g = canvas.getContext('2d');
    if (!g) return;
    drawGraph(g, W, H, ratio, state.view, state.series.filter((s) => !state.hidden.has(s.label)), state.hover, themeOf());
  }
  const scheduleDraw = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); };

  function renderLegend() {
    legend.replaceChildren();
    const seen = new Set();
    for (const s of state.series) {
      if (seen.has(s.label) || !s.label) continue;
      seen.add(s.label);
      const on = !state.hidden.has(s.label);
      const chip = h('button', { type: 'button', class: 'lab-chip', 'aria-pressed': on ? 'true' : 'false', title: s.label,
        onclick: () => {
          if (state.hidden.has(s.label)) state.hidden.delete(s.label); else state.hidden.add(s.label);
          renderLegend(); scheduleDraw();
        } },
      h('span', { class: 'lab-swatch', 'aria-hidden': 'true' }), h('span', { class: 'lab-chip-text' }, s.label.length > 38 ? `${s.label.slice(0, 36)}…` : s.label));
      chip.style.setProperty('--chip', s.color || '#a855f7');
      legend.append(chip);
    }
    if (!legend.childElementCount) legend.append(h('p', { class: 'lab-legend-empty' }, 'Graphs appear here as you write them.'));
  }

  function run() {
    clearTimeout(timer);
    drafts[mode] = input.value;
    const out = api.run(input.value);
    state.series = out.series;
    renderResults(results, out.results);
    const solved = out.results.filter((r) => !r.error).length;
    const errors = out.results.filter((r) => r.error).length;
    const graphs = out.series.length;
    status.textContent = `${solved} solved · ${graphs} layer${graphs === 1 ? '' : 's'} graphed${errors ? ` · ${errors} line${errors === 1 ? '' : 's'} need a fix` : ''}. Runs in this browser: no AI, no network.`;
    renderLegend();
    scheduleDraw();
  }

  const zoomAt = (px, py, factor) => {
    const { W, H } = size();
    const v = state.view;
    const wx = v.cx + (px - W / 2) / v.s, wy = v.cy - (py - H / 2) / v.s;
    const s = Math.min(1e7, Math.max(1e-6, v.s * factor));
    v.s = s;
    v.cx = wx - (px - W / 2) / s;
    v.cy = wy + (py - H / 2) / s;
    scheduleDraw();
  };
  const fit = () => {
    const pts = [];
    for (const s of state.series) {
      if (state.hidden.has(s.label)) continue;
      if (s.kind === 'points') pts.push(...s.pts);
      if (s.kind === 'marks') pts.push(...s.pts);
    }
    if (!pts.length) { resetView(); scheduleDraw(); return; }
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const { W, H } = size();
    const spanX = Math.max(maxX - minX, 1e-3), spanY = Math.max(maxY - minY, 1e-3);
    const s = Math.min((W * 0.8) / spanX, (H * 0.8) / spanY);
    state.view = { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, s: Math.min(s, 1e6) };
    scheduleDraw();
  };

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture?.(e.pointerId);
    state.drag = { x: e.clientX, y: e.clientY, cx: state.view.cx, cy: state.view.cy };
  });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    state.hover = { px: e.clientX - r.left, py: e.clientY - r.top };
    if (state.drag) {
      state.view.cx = state.drag.cx - (e.clientX - state.drag.x) / state.view.s;
      state.view.cy = state.drag.cy + (e.clientY - state.drag.y) / state.view.s;
    }
    scheduleDraw();
  });
  const endDrag = () => { state.drag = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => { state.hover = null; scheduleDraw(); });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
  canvas.addEventListener('keydown', (e) => {
    const step = 40;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      state.view.cx += moves[e.key][0] / state.view.s;
      state.view.cy -= moves[e.key][1] / state.view.s;
    } else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(size().W / 2, size().H / 2, 1.25); return; }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomAt(size().W / 2, size().H / 2, 0.8); return; }
    else if (e.key === '0') { e.preventDefault(); resetView(); }
    else return;
    scheduleDraw();
  });

  const button = (label, onclick, extra = {}) => h('button', { type: 'button', class: 'soft-button', onclick, ...extra }, label);
  const tools = h('div', { class: 'lab-tools' },
    button('+', () => zoomAt(size().W / 2, size().H / 2, 1.25), { 'aria-label': 'Zoom in' }),
    button('−', () => zoomAt(size().W / 2, size().H / 2, 0.8), { 'aria-label': 'Zoom out' }),
    button('Fit', fit),
    button('Reset', () => { resetView(); scheduleDraw(); }),
    button('Save PNG', () => canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: 'sreon-graph.png' });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png')));

  const bar = h('div', { class: 'player-bar' },
    h('button', { type: 'button', class: 'soft-button', onclick: () => options.onExit?.() }, '← All games'),
    h('h2', {}, title),
    h('span', {}, 'No AI · runs in this browser'));
  const hint = h('p', { class: 'lab-hint' }, HINTS[isSolve ? 'solve' : 'graph']);
  const addTable = () => {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const before = input.value.slice(0, start);
    const insert = `${before && !before.endsWith('\n') ? '\n' : ''}${TABLE_TEMPLATE}\n`;
    input.value = before + insert + input.value.slice(end);
    const pos = (before + insert).length;
    input.setSelectionRange(pos, pos);
    input.focus();
    run();
  };
  const actions = h('div', { class: 'lab-actions' },
    h('button', { type: 'button', class: 'connect-button', onclick: run }, isSolve ? 'Solve & graph' : 'Graph it'),
    h('button', { type: 'button', class: 'soft-button', onclick: addTable }, 'Add table'),
    h('button', { type: 'button', class: 'soft-button', onclick: () => { input.value = sample; run(); } }, 'Load examples'),
    h('button', { type: 'button', class: 'soft-button', onclick: () => { input.value = ''; run(); input.focus(); } }, 'Clear'));
  const left = h('div', { class: 'lab-side' }, hint, input, actions, status, results);
  const right = h('div', { class: 'lab-main' }, legend, h('div', { class: 'lab-canvas-wrap' }, canvas), tools, readout);
  root.append(bar, h('div', { class: 'lab-grid' }, left, right));

  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 400); });
  if (typeof ResizeObserver !== 'undefined') { resizer = new ResizeObserver(() => scheduleDraw()); resizer.observe(canvas); }
  current = { destroy() { clearTimeout(timer); cancelAnimationFrame(frame); resizer?.disconnect(); } };
  run();
  return current;
}

function close() {
  if (current) { current.destroy(); current = null; }
}

const api = { run, mount, close, MathError };
if (typeof window !== 'undefined') window.MathLab = api;
})();
