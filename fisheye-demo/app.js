import {selectScenes,summarizeScenes} from './scene-selection.mjs';
import {createDemoDisplay,DEMO_COLORMAP,DEMO_HOLE,DEMO_EDGE} from './demo-display.mjs?v=original-1';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const [M,OBJECT_NAMES]=await Promise.all(['manifest.json','object-names.json'].map(p=>fetch(p).then(r=>r.json()))), W=M.width,H=M.height,N=W*H;
const SCENES=selectScenes(M);
const objectName=id=>OBJECT_NAMES[id];
if(!SCENES.length)throw Error('没有满足筛选条件的场景');
let nativeMap=null,mapPromise=null;const fisheye=()=>coordinates==='native';
async function getNativeMap(){if(nativeMap)return nativeMap;if(!mapPromise)mapPromise=(async()=>{let r=await fetch('native-remap.bin.gz');if(!r.ok)throw Error('鱼眼映射读取失败');let b=await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();if(b.byteLength!==N*8)throw Error('鱼眼映射尺寸不符');return nativeMap={index:new Int32Array(b,0,N),factor:new Float32Array(b,N*4,N)}})();return mapPromise}
const AVAIL={nsl:['tile4'],lingbot:['tile4'],da2:['tile4'],sgbm:['rect']};
const NAMES={ir:'IR 输入',gt:'真值',nsl:'NSL',lingbot:'LingBot-Depth',sgbm:'SGBM',da2:'DA2'};
const COLORS={ir:'#FAF9F5',gt:'#488AF3',nsl:'#02A982',lingbot:'#D9A62E',sgbm:'#A8A49A',da2:'#9972E2'};
const demoDisplay=createDemoDisplay(W,H),CMAP=DEMO_COLORMAP;
const depthGradient="linear-gradient(90deg,rgb(94,79,162) 0.0%,rgb(63,150,182) 12.5%,rgb(137,207,164) 25.1%,rgb(216,239,154) 37.6%,rgb(254,254,189) 50.2%,rgb(253,210,127) 62.7%,rgb(248,139,81) 75.3%,rgb(219,72,76) 87.8%,rgb(158,1,66) 100%)";
document.documentElement.style.setProperty('--depth-gradient',depthGradient);
const q=new URLSearchParams(location.search);let scene=SCENES.some(s=>s.scene===q.get('scene'))?q.get('scene'):SCENES[0].scene;
let routes={nsl:'tile4',lingbot:'tile4',da2:'tile4',sgbm:'rect'},scale=1,panX=0,panY=0,lo=450,hi=2600,seq=0,ready=false,csrc='gt';
let coordinates=q.get('view')==='native'?'native':'rect';const rawDepth={},depth={},mask={},displayMask={},lines={},cleanupStats={},cache=new Map(),panels={};let inputImage=null;const methods=['nsl','lingbot','da2','sgbm'],active=['ir','gt',...methods];
$('#scenes').innerHTML=SCENES.map(s=>`<button data-id="${s.scene}" aria-pressed="${s.scene===scene}">${objectName(s.scene)}</button>`).join('');
function buildGrid(){
 $('#grid').innerHTML=active.map(f=>`<div class="tile" data-family="${f}" style="--accent:${COLORS[f]}"><canvas width="${W}" height="${H}" aria-label="${NAMES[f]}${f==='ir'?'':' 深度视图'}"></canvas><span class="name">${NAMES[f]}</span><span class="readout"${AVAIL[f]?'':' hidden'}>—</span></div>`).join('');
 for(const f of active){let el=$(`[data-family="${f}"]`);panels[f]={el,canvas:el.querySelector('canvas'),source:Object.assign(document.createElement('canvas'),{width:W,height:H})};installPointer(el)}
}
function clamp(){if(scale===1)panX=panY=0;panX=Math.max(-W*(scale-1)/2,Math.min(W*(scale-1)/2,panX));panY=Math.max(-H*(scale-1)/2,Math.min(H*(scale-1)/2,panY))}
function transform(){clamp();$('#stage').classList.toggle('zoomed',scale>1);for(const f of active){let c=panels[f].canvas.getContext('2d');c.fillStyle='#182430';c.fillRect(0,0,W,H);c.imageSmoothingEnabled=false;c.drawImage(panels[f].source,W*(1-scale)/2+panX,H*(1-scale)/2+panY,W*scale,H*scale)}$$('#zooms button').forEach(b=>b.setAttribute('aria-pressed',Math.abs(+b.dataset.z-scale)<.05));showStats()}
let rangeTimer,lastView='';
function draw(){transform();const sig=[scale,panX,panY].join();if(sig===lastView)return;lastView=sig;clearTimeout(rangeTimer);rangeTimer=setTimeout(()=>{if(autoRange()){paint();transform()}},140)}
function zoom(v,cx=0,cy=0){v=Math.max(1,Math.min(4,v));let r=v/scale;panX=cx-(cx-panX)*r;panY=cy-(cy-panY)*r;scale=v;draw()}
function contentRect(el){let r=el.getBoundingClientRect(),w=Math.min(r.width,r.height*W/H),h=w*H/W;return {left:r.left+(r.width-w)/2,top:r.top+(r.height-h)/2,width:w,height:h,el:r}}
function installPointer(el){
 let last=null;
 const at=e=>{let r=contentRect(el);return[(e.clientX-r.left)*W/r.width-W/2,(e.clientY-r.top)*H/r.height-H/2]};
 el.addEventListener('pointerdown',e=>{if(scale===1&&e.pointerType==='touch')return;last=[e.clientX,e.clientY];el.setPointerCapture(e.pointerId)});
 el.addEventListener('pointermove',e=>{if(!last)return;let r=contentRect(el);panX+=(e.clientX-last[0])*W/r.width;panY+=(e.clientY-last[1])*H/r.height;last=[e.clientX,e.clientY];draw()});
 const end=()=>last=null;el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
 el.addEventListener('dblclick',e=>{e.preventDefault();zoom(scale>=4?1:scale*2,...at(e))});
 el.addEventListener('wheel',e=>{if(!e.ctrlKey&&scale===1)return;e.preventDefault();zoom(scale*(e.deltaY<0?1.12:1/1.12),...at(e))},{passive:false});
}
function showStats(){if(!ready)return;
 for(const f of methods){const st=stat(f),read=panels[f].el.querySelector('.readout');
  read.innerHTML=`<span>平均绝对误差（MAE） <b>${fmt(st?.mae_mm)}</b> mm</span><span>有效深度覆盖率 <b>${fmt(st?.coverage_pct)}</b>%</span>`;
 }
}

function edge(d){let b=new Uint8Array(N),out=new Uint8Array(N);for(let y=0;y<H;y++)for(let x=0;x<W;x++){let i=y*W+x;if(!(d[i]>0))continue;if(x<W-1&&d[i+1]>0&&Math.abs(d[i]-d[i+1])>100)b[i]=b[i+1]=1;if(y<H-1&&d[i+W]>0&&Math.abs(d[i]-d[i+W])>100)b[i]=b[i+W]=1}for(let y=0;y<H;y++)for(let x=0;x<W;x++){let i=y*W+x;if(!b[i])continue;for(let yy=Math.max(0,y-1);yy<=Math.min(H-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(W-1,x+1);xx++)out[yy*W+xx]=1}return out}
function makeMasks(){
 for(const f of [...methods,'gt']){const d=rawDepth[f];if(!d)continue;
  const evaluationMask=AVAIL[f]?edge(d):null;
  if(!fisheye()){depth[f]=d;mask[f]=evaluationMask;}
  else {
   const out=new Float32Array(N),filtered=evaluationMask?new Uint8Array(N):null;
   for(let i=0;i<N;i++){const j=nativeMap.index[i];if(j<0)continue;if(d[j]>0)out[i]=d[j]*nativeMap.factor[i];if(filtered)filtered[i]=evaluationMask[j];}
   depth[f]=out;mask[f]=filtered;
  }
  displayMask[f]=f==='gt'?null:mask[f];
  let removed=0,validCount=0;for(let i=0;i<N;i++)if(depth[f][i]>0){validCount++;if(displayMask[f]?.[i])removed++;}
  cleanupStats[f]={removed,valid:validCount};
  lines[f]=f==='gt'?null:demoDisplay.outline(depth[f],displayMask[f]);
 }
}
function shown(f,i){return depth[f]?.[i]>0&&Number.isFinite(depth[f][i])&&!displayMask[f]?.[i]}
function autoRange(){
 const f=csrc;if(!depth[f])return false;
 const r=demoDisplay.visibleRange(depth[f],displayMask[f],{scale,panX,panY,near:lo,far:hi});
 lo=r.near;hi=r.far;return r.changed;
}

function paint(){
 if(!depth.gt)return;
 for(const f of active){
  let ctx=panels[f].source.getContext('2d');
  if(f==='ir'){ctx.drawImage(inputImage,0,0,W,H);continue}
  let im=ctx.createImageData(W,H),p=im.data,d=depth[f];
  for(let i=0;i<N;i++){
   const ok=shown(f,i);let col=DEMO_HOLE;
   if(ok)col=CMAP[Math.max(0,Math.min(255,Math.floor((d[i]-lo)/(hi-lo)*256)))];
   else if(f!=='gt'&&lines[f]?.[i])col=DEMO_EDGE;
   const j=i*4;p[j]=col[0];p[j+1]=col[1];p[j+2]=col[2];p[j+3]=255;
  }
  ctx.putImageData(im,0,0);
 }
 $('#lowLabel').textContent=`${lo} mm`;$('#highLabel').textContent=`${hi} mm`;
}
function fmt(x){return x==null?'—':x.toFixed(2)}
function stat(f,all=false){const method=`${f}_${routes[f]}`,filter='edge1px';return all?summarizeScenes(M,SCENES,method,filter):M.by_scene.find(r=>r.method===method&&r.filter===filter&&r.scene===scene)}
function updateTable(){$('#metrics').innerHTML=methods.map(f=>{const s=stat(f,true);return`<tr><td>${NAMES[f]}</td><td>${fmt(s?.mae_mm)}</td><td>${fmt(s?.coverage_pct)}</td></tr>`}).join('')}
function decode(buf){if(buf.byteLength!==N*4)throw Error('深度数据尺寸不符');let b=new Uint8Array(buf),u=new Uint32Array(N);for(let y=0;y<H;y++){let prev=0;for(let x=0;x<W;x++){let i=y*W+x;prev^=b[i]|b[N+i]<<8|b[2*N+i]<<16|b[3*N+i]<<24;u[i]=prev}}return new Float32Array(u.buffer)}
async function getDepth(s,k){let key=s+'/'+k;if(cache.has(key))return cache.get(key);const r=await fetch(`data/${s}/${k}.bin.gz`);if(!r.ok)throw Error('深度文件读取失败');const a=decode(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());cache.set(key,a);if(cache.size>22)cache.delete(cache.keys().next().value);return a}
async function getImage(s){const im=new Image();await new Promise((resolve,reject)=>{im.onload=resolve;im.onerror=()=>reject(Error('IR 输入读取失败'));im.src=`data/${s}/${fisheye()?'native':'ir'}.png`});return im}
async function load(reset=true){const token=++seq,s=scene;ready=false;$('#loading').hidden=false;$('#loading').textContent='正在加载深度…';try{if(fisheye())await getNativeMap();if(token!==seq)return;let fs=[...methods,'gt'],keys=Object.fromEntries(fs.map(f=>[f,f==='gt'?'gt_mm':`${f}_${routes[f]}`]));let [result,image]=await Promise.all([Promise.all(fs.map(async f=>[f,await getDepth(s,keys[f])])),getImage(s)]);if(token!==seq)return;inputImage=image;Object.assign(rawDepth,Object.fromEntries(result));makeMasks();if(reset){clearTimeout(rangeTimer);scale=1;panX=panY=0;lo=450;hi=2600;lastView=[1,0,0].join()}autoRange();paint();ready=true;transform();updateTable();$('#caption').textContent=objectName(s);$('#loading').hidden=true;$('#stage').dataset.loaded=s;let url=new URL(location);url.searchParams.set('scene',s);url.searchParams.set('view',coordinates);history.replaceState(null,'',url)}catch(e){if(token===seq){$('#loading').textContent=`载入失败：${e.message}。请通过本地 HTTP 服务打开页面。`;console.error(e)}}}
function selectScene(id){
 if(!SCENES.some(s=>s.scene===id))return;
 scene=id;$('#scenes').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.id===id));load();
}
$('#scenes').addEventListener('click',e=>{const b=e.target.closest('button');if(b)selectScene(b.dataset.id)});
$('#zooms').addEventListener('click',e=>{const b=e.target.closest('button');if(b)zoom(+b.dataset.z)});
$('#colorSource').addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;csrc=b.dataset.src;
 $('#colorSource').querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b));
 if(ready&&autoRange()){paint();transform()}
});
buildGrid();load();
window.addEventListener('resize',()=>{if(ready)transform()});
