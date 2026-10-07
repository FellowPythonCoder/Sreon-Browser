
(function(){
const $=s=>document.getElementById(s);
const wb=$('wb'),stage=$('wb-stage'),cv=$('wb-canvas'),ctx=cv.getContext('2d');
const colorIn=$('wb-color'),sizeIn=$('wb-size'),tw=$('wb-tw'),ti=$('wb-ti');
const cam=$('wb-cam'),video=$('wb-video'),cc=$('wb-cc'),cctx=cc.getContext('2d',{willReadFrequently:true}),modeEl=$('wb-mode'),handBtn=$('wb-hand');
let tool='pen',drawing=false,sx=0,sy=0,snap=null,undo=[],redo=[],W=0,H=0,dpr=1,textAt=null;
let stream=null,raf=0,prev=null,sm=null;

function size(){
  const r=stage.getBoundingClientRect();if(!r.width)return;
  const keep=(W&&H)?cv.toDataURL():null;
  dpr=window.devicePixelRatio||1;W=r.width;H=r.height;
  cv.width=W*dpr;cv.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
  if(keep){const i=new Image();i.onload=()=>ctx.drawImage(i,0,0,W,H);i.src=keep;}
}
function open(){wb.hidden=false;document.body.style.overflow='hidden';requestAnimationFrame(size)}
function close(){commitText();stopCam();wb.hidden=true;document.body.style.overflow=''}
$('wb-open').addEventListener('click',open);$('wb-close').addEventListener('click',close);
addEventListener('resize',()=>{if(!wb.hidden)size()});

function setTool(t){commitText();tool=t;document.querySelectorAll('.wb-t[data-tool]').forEach(b=>b.classList.toggle('on',b.dataset.tool===t));cv.style.cursor=t==='text'||t==='sticky'?'text':'crosshair'}
document.querySelectorAll('.wb-t[data-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
document.querySelectorAll('.wb-sw[data-c]').forEach(e=>e.style.setProperty('--c',e.dataset.c));
function setColor(c){colorIn.value=c;document.querySelectorAll('.wb-sw[data-c]').forEach(s=>s.classList.toggle('on',s.dataset.c.toLowerCase()===c.toLowerCase()))}
document.querySelectorAll('.wb-sw[data-c]').forEach(s=>s.addEventListener('click',()=>setColor(s.dataset.c)));
colorIn.addEventListener('input',()=>setColor(colorIn.value));

const pos=e=>{const r=cv.getBoundingClientRect();const p=e.touches?e.touches[0]:e;return{x:p.clientX-r.left,y:p.clientY-r.top}};
function stroke(t){
  ctx.lineCap=ctx.lineJoin='round';
  ctx.strokeStyle=colorIn.value;ctx.lineWidth=+sizeIn.value;ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  if(t==='highlighter'){ctx.globalAlpha=.3;ctx.lineWidth=+sizeIn.value*3}
  if(t==='eraser'){ctx.globalCompositeOperation='destination-out';ctx.lineWidth=Math.max(+sizeIn.value*3,16)}
}
function reset(){ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over'}
function save(){undo.push(cv.toDataURL());if(undo.length>50)undo.shift();redo=[]}
function restore(d){const i=new Image();i.onload=()=>{ctx.clearRect(0,0,W,H);ctx.drawImage(i,0,0,W,H)};i.src=d}
$('wb-undo').onclick=()=>{if(!undo.length)return;redo.push(cv.toDataURL());restore(undo.pop())};
$('wb-redo').onclick=()=>{if(!redo.length)return;undo.push(cv.toDataURL());restore(redo.pop())};
$('wb-clear').onclick=()=>{if(confirm('Clear the whiteboard?')){save();ctx.clearRect(0,0,W,H)}};
$('wb-grid').onclick=e=>{stage.classList.toggle('grid');e.currentTarget.classList.toggle('on')};
$('wb-save').onclick=()=>{
  const o=document.createElement('canvas');o.width=cv.width;o.height=cv.height;const x=o.getContext('2d');
  x.fillStyle=getComputedStyle(stage).backgroundColor;x.fillRect(0,0,o.width,o.height);x.drawImage(cv,0,0);
  const a=document.createElement('a');a.download='sreon-whiteboard.png';a.href=o.toDataURL('image/png');a.click();
};

function shape(x,y){
  stroke(tool);ctx.beginPath();const w=x-sx,h=y-sy;
  if(tool==='line'){ctx.moveTo(sx,sy);ctx.lineTo(x,y)}
  else if(tool==='rect'){ctx.rect(sx,sy,w,h)}
  else if(tool==='circle'){ctx.ellipse(sx+w/2,sy+h/2,Math.abs(w)/2,Math.abs(h)/2,0,0,Math.PI*2)}
  else if(tool==='arrow'){const a=Math.atan2(h,w),l=14+ +sizeIn.value;ctx.moveTo(sx,sy);ctx.lineTo(x,y);ctx.moveTo(x-l*Math.cos(a-.4),y-l*Math.sin(a-.4));ctx.lineTo(x,y);ctx.lineTo(x-l*Math.cos(a+.4),y-l*Math.sin(a+.4))}
  ctx.stroke();reset();
}
// text + sticky share one inline editor
function placeText(x,y){textAt={x,y,note:tool==='sticky'};tw.style.left=x+'px';tw.style.top=y+'px';tw.hidden=false;
  ti.style.color=textAt.note?'#282335':colorIn.value;ti.style.fontSize=(textAt.note?16:Math.max(16,+sizeIn.value*4))+'px';
  ti.style.background=textAt.note?'#f6e7a1':'transparent';ti.value='';setTimeout(()=>ti.focus(),0)}
function commitText(){
  if(tw.hidden||!textAt)return;const t=ti.value.trim();
  if(t){save();ctx.save();reset();const fs=textAt.note?16:Math.max(16,+sizeIn.value*4);ctx.font=fs+'px "DM Sans",sans-serif';ctx.textBaseline='top';
    if(textAt.note){const pw=190,lines=[];let line='';t.split(/\s+/).forEach(w=>{const n=line?line+' '+w:w;if(ctx.measureText(n).width>pw-24){lines.push(line);line=w}else line=n});lines.push(line);
      const ph=lines.length*(fs*1.35)+24;ctx.shadowColor='rgba(40,35,53,.18)';ctx.shadowBlur=12;ctx.shadowOffsetY=3;ctx.fillStyle='#f6e7a1';ctx.fillRect(textAt.x,textAt.y,pw,ph);ctx.shadowColor='transparent';
      ctx.fillStyle='#282335';lines.forEach((l,i)=>ctx.fillText(l,textAt.x+12,textAt.y+12+i*fs*1.35))}
    else{ctx.fillStyle=colorIn.value;t.split('\n').forEach((l,i)=>ctx.fillText(l,textAt.x,textAt.y+i*fs*1.3))}
    ctx.restore()}
  tw.hidden=true;textAt=null;ti.value='';
}
ti.addEventListener('keydown',e=>{if(e.key==='Escape'||(e.key==='Enter'&&!e.shiftKey)){e.preventDefault();commitText()}});

function down(e){
  const p=pos(e);
  if(!tw.hidden){commitText();return}
  if(tool==='text'||tool==='sticky'){placeText(p.x,p.y);return}
  drawing=true;
  if(['pen','highlighter','eraser'].includes(tool)){save();stroke(tool);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+.01,p.y+.01);ctx.stroke()}
  else{save();snap=ctx.getImageData(0,0,cv.width,cv.height);sx=p.x;sy=p.y;ctx.setTransform(1,0,0,1,0,0);ctx.putImageData(snap,0,0);ctx.setTransform(dpr,0,0,dpr,0,0)}
}
function move(e){
  if(!drawing)return;e.preventDefault();const p=pos(e);
  if(['pen','highlighter','eraser'].includes(tool)){stroke(tool);ctx.lineTo(p.x,p.y);ctx.stroke()}
  else{ctx.setTransform(1,0,0,1,0,0);ctx.putImageData(snap,0,0);ctx.setTransform(dpr,0,0,dpr,0,0);
    shape(p.x,p.y)}
}
function up(){if(!drawing)return;drawing=false;snap=null;reset()}
cv.addEventListener('mousedown',down);addEventListener('mousemove',move);addEventListener('mouseup',up);
cv.addEventListener('touchstart',e=>{e.preventDefault();down(e)},{passive:false});
cv.addEventListener('touchmove',move,{passive:false});cv.addEventListener('touchend',up);

addEventListener('keydown',e=>{
  if(wb.hidden||e.target===ti)return;
  if(e.key==='Escape'){close();return}
  if(e.ctrlKey||e.metaKey){const k=e.key.toLowerCase();if(k==='z'){e.preventDefault();(e.shiftKey?$('wb-redo'):$('wb-undo')).click()}if(k==='y'){e.preventDefault();$('wb-redo').click()}return}
  const m={p:'pen',h:'highlighter',e:'eraser',l:'line',r:'rect',c:'circle',a:'arrow',t:'text',n:'sticky'};
  if(m[e.key]){e.preventDefault();setTool(m[e.key])}
});

/* ---------- Hand drawing: 2 fingers draw, 1 finger erase ---------- */
const skin=(r,g,b)=>{const Y=.299*r+.587*g+.114*b,Cb=-.169*r-.331*g+.5*b+128,Cr=.5*r-.419*g-.081*b+128;return Y>70&&Cb>=80&&Cb<=135&&Cr>=135&&Cr<=180};
function loop(){
  raf=requestAnimationFrame(loop);if(video.readyState<2)return;
  const w=cc.width,h=cc.height;
  cctx.save();cctx.scale(-1,1);cctx.drawImage(video,-w,0,w,h);cctx.restore();
  const d=cctx.getImageData(0,0,w,h).data,mask=new Uint8Array(w*h);let n=0,minY=h,minX=0,maxY=0,sumX=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(skin(d[i],d[i+1],d[i+2])){mask[y*w+x]=1;n++;if(y<minY)minY=y;if(y>maxY)maxY=y}}
  if(n<120){modeEl.textContent='Show your hand';prev=null;sm=null;return}
  // count fingers: separate skin runs across a scanline ~18% below the top of the hand
  const band=Math.min(h-1,minY+Math.max(6,Math.round((maxY-minY)*.18)));let runs=0,inRun=false,tipX=0,cnt=0;
  for(let x=0;x<w;x++){const on=mask[band*w+x]||mask[(band-1)*w+x]||mask[(band+1)*w+x];if(on&&!inRun){runs++;inRun=true}else if(!on)inRun=false}
  for(let y=minY;y<minY+4;y++)for(let x=0;x<w;x++)if(mask[y*w+x]){tipX+=x;cnt++}
  tipX=cnt?tipX/cnt:w/2;
  const fingers=Math.min(runs,5),mode=fingers>=2?'draw':'erase';
  cctx.fillStyle=mode==='draw'?'#68508e':'#d64545';cctx.beginPath();cctx.arc(tipX,minY,6,0,7);cctx.fill();
  modeEl.textContent=mode==='draw'?'Drawing · 2 fingers':'Erasing · 1 finger';
  const r=cv.getBoundingClientRect(),tx=tipX/w*r.width,ty=minY/h*r.height;
  sm=sm?{x:sm.x+(tx-sm.x)*.35,y:sm.y+(ty-sm.y)*.35}:{x:tx,y:ty};
  if(prev&&Math.hypot(sm.x-prev.x,sm.y-prev.y)<160){
    if(!prev.live){save();prev.live=true}
    stroke(mode==='draw'?'pen':'eraser');ctx.beginPath();ctx.moveTo(prev.x,prev.y);ctx.lineTo(sm.x,sm.y);ctx.stroke();reset();
  }
  prev={x:sm.x,y:sm.y,live:prev?prev.live:false};
}

/* ---------- Hand drawing: 2 fingers draw, 1 finger erase (MediaPipe landmarks) ---------- */
const V='0.10.14',CDN='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@'+V;
const MODEL='https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const dot=document.createElement('div');dot.className='wb-dot';stage.appendChild(dot);
let hl=null,hlLoad=null,basic=false,lastT=-1,stableMode=null,stableN=0,live=false;
const BONES=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
function loadTracker(){
  if(hl)return Promise.resolve(hl);
  if(hlLoad)return hlLoad;
  hlLoad=(async()=>{
    const m=await import(CDN+'/+esm');
    const fs=await m.FilesetResolver.forVisionTasks(CDN+'/wasm');
    const make=d=>m.HandLandmarker.createFromOptions(fs,{baseOptions:{modelAssetPath:MODEL,delegate:d},runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:.6,minHandPresenceConfidence:.6,minTrackingConfidence:.6});
    try{hl=await make('GPU')}catch(e){hl=await make('CPU')}
    return hl;
  })();
  hlLoad.catch(()=>{hlLoad=null});
  return hlLoad;
}
// which of index/middle/ring/pinky are straight (works at any hand rotation)
function extended(lm,vw,vh){
  const d=(a,b)=>Math.hypot((a.x-b.x)*vw,(a.y-b.y)*vh),w=lm[0];
  return [[8,6],[12,10],[16,14],[20,18]].map(([t,p])=>d(lm[t],w)>d(lm[p],w)*1.12);
}
function poseOf(e){
  if(e[0]&&e[1]&&!e[2]&&!e[3])return 'draw';
  if(e[0]&&!e[1]&&!e[2]&&!e[3])return 'erase';
  return 'idle';
}
function endStroke(){prev=null;live=false;sm=null}
function trackLoop(){
  raf=requestAnimationFrame(trackLoop);
  if(video.readyState<2||video.currentTime===lastT)return;
  lastT=video.currentTime;
  const vw=video.videoWidth,vh=video.videoHeight,w=cc.width,h=cc.height;
  cctx.save();cctx.scale(-1,1);cctx.drawImage(video,-w,0,w,h);cctx.restore();
  let res;try{res=hl.detectForVideo(video,performance.now())}catch(e){return}
  const lm=res&&res.landmarks&&res.landmarks[0];
  if(!lm){modeEl.textContent='Show your hand';dot.style.display='none';stableMode=null;endStroke();return}
  // skeleton on the preview
  cctx.strokeStyle='rgba(255,255,255,.75)';cctx.lineWidth=1.5;cctx.beginPath();
  BONES.forEach(([a,b])=>{cctx.moveTo((1-lm[a].x)*w,lm[a].y*h);cctx.lineTo((1-lm[b].x)*w,lm[b].y*h)});cctx.stroke();
  const pose=poseOf(extended(lm,vw,vh));
  stableN=pose===stableMode?stableN+1:1;stableMode=pose;
  const mode=stableN>=2?pose:'idle';
  // pointer = index fingertip, mapped from the middle 80% of the camera so edges are reachable
  const r=cv.getBoundingClientRect(),cl=v=>Math.max(0,Math.min(1,(v-.1)/.8));
  const tx=cl(1-lm[8].x)*r.width,ty=cl(lm[8].y)*r.height;
  if(sm){const a=Math.min(.85,.18+Math.hypot(tx-sm.x,ty-sm.y)/90);sm={x:sm.x+(tx-sm.x)*a,y:sm.y+(ty-sm.y)*a}}else sm={x:tx,y:ty};
  dot.style.display='block';dot.className='wb-dot '+mode;dot.style.left=sm.x+'px';dot.style.top=sm.y+'px';
  modeEl.textContent=mode==='draw'?'Drawing · 2 fingers':mode==='erase'?'Erasing · 1 finger':'Paused · raise fingers';
  if(mode==='idle'){endStroke();return}
  if(prev&&prev.mode!==mode)prev=null;
  if(prev){
    if(!live){save();live=true}
    stroke(mode==='draw'?'pen':'eraser');ctx.beginPath();ctx.moveTo(prev.x,prev.y);ctx.lineTo(sm.x,sm.y);ctx.stroke();reset();
  }
  prev={x:sm.x,y:sm.y,mode};
}
handBtn.addEventListener('click',async()=>{
  if(stream){stopCam();return}
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480}}});
  }catch(err){stream=null;alert('Camera unavailable: '+err.message);return}
  video.srcObject=stream;await video.play();
  cc.width=320;cc.height=240;cam.hidden=false;handBtn.classList.add('on');prev=null;sm=null;lastT=-1;stableMode=null;live=false;
  modeEl.textContent='Loading hand tracker…';
  try{await loadTracker();basic=false;if(stream)trackLoop()}
  catch(err){console.warn('Hand tracker failed, using basic mode',err);basic=true;cc.width=160;cc.height=120;modeEl.textContent='Basic mode (tracker unavailable)';if(stream)loop()}
});
function stopCam(){cancelAnimationFrame(raf);if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;cam.hidden=true;handBtn.classList.remove('on');prev=null;sm=null;dot.style.display='none'}
})();
