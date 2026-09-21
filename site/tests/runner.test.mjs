import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const code = readFileSync(new URL('../assets/modules/module-07.js', import.meta.url), 'utf8');
function fixture(level) {
  const keys = new Set();
  const saved = new Map();
  const context = vm.createContext({ window:{}, localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,String(v))}, clamp:(v,a,b)=>Math.max(a,Math.min(b,v)), Input:{pointer:{},held:()=>false,pressed:k=>keys.has(k)}, Sound:new Proxy({}, {get:()=>()=>{}}), FX:new Proxy({}, {get:()=>()=>{}}) });
  vm.runInContext(code,context);
  const definition = context.window.GAME_PACK_7[0];
  const state = {w:760,h:460,score:0,time:0}; definition.init(state); state.startLevel(state,level);
  return {state,definition,keys,saved};
}
test('4 toggles autoplay, completes all ten levels, and labels assisted runs', () => {
  for (let level=0;level<10;level++) {
    const {state,definition,keys,saved} = fixture(level);
    keys.add('4'); definition.update(state,1/60); keys.clear();
    assert.equal(state.autoPlay,true);
    let frames=0;
    while(!state.selMode && frames++ < 4000) { definition.update(state,1/60); assert.equal(state.dead,false); }
    assert.equal(state.selMode,true,`Level ${level+1} must finish`);
    assert.equal(saved.get(`sreon_gd_best_${level}`),'100');
    assert.match(state.completed,/Assisted/);
    assert.equal(state.score,0);
  }
});
test('square blocks are safe platforms even when approached from the side', () => {
  const {state} = fixture(0);
  state.lvl.obs=[{type:'block',x:3,w:1.3,h:1}]; state.py=0;
  assert.equal(state.checkHit(state,state.lvl.obs[0],2.5),false);
  state.resolvePlatforms(state,2.5);
  assert.equal(state.py,1); assert.equal(state.grounded,true); assert.equal(state.dead,false);
});
test('square flight walls do not kill and spikes still matter in manual play', () => {
  const {state} = fixture(8);
  for(const type of ['shipBlockTop','shipBlockBot','waveWallTop','waveWallBot']) assert.equal(state.checkHit(state,{type,x:3,w:2,y:1,h:2},3),false);
  state.py=0;
  assert.equal(state.checkHit(state,{type:'spike',x:3},3),true);
  state.kill(state); assert.equal(state.dead,true);
});
test('autoplay can take over after a death and can be switched off', () => {
  const {state,definition,keys} = fixture(0);
  state.kill(state); keys.add('4'); definition.update(state,1/60); keys.clear();
  assert.equal(state.dead,false); assert.equal(state.autoPlay,true);
  keys.add('4'); definition.update(state,1/60); keys.clear(); assert.equal(state.autoPlay,false);
});
