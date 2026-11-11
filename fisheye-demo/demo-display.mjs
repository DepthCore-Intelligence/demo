/** Directly reused from https://depthcore-intelligence.github.io/demo/ .
 * Original function bodies are retained verbatim; only dimensions/state are injected.
 * These masks and colours are for display. They do not change the evaluation masks.
 */
export const DEMO_HOLE=[24,36,48], DEMO_EDGE=[140,185,180];
export const DEMO_COLORMAP='5e4fa25c51a35a53a45855a55757a6555aa7535ca8515ea95060aa4e63ab4c65ac4b67ad4969ae476caf456eb04470b14272b24075b43e77b53d79b63b7bb7397db83880b93682ba3484bb3286bc3389bc358bbb378dba398fb93b92b83d94b73f96b64199b5439bb5459db4479fb349a2b24ba4b14da6b04fa8af51abae53adad55afac57b2ab59b4aa5bb6a95db8a85fbba761bda663bfa566c2a568c3a46bc4a46ec5a470c6a473c7a476c8a478c9a47bcaa47ecba481cca483cda486cea489cfa48bd0a48ed1a491d2a493d3a496d5a499d6a49cd7a49ed8a4a1d9a4a4daa4a6dba4a9dca4acdda3aedea3b0dfa2b3e0a2b5e1a1b7e2a1bae3a0bce4a0bee5a0c0e59fc3e69fc5e79ec7e89ecae99dccea9dceeb9cd1ec9cd3ed9bd5ee9bd8ef9adaf09adcf199dff299e1f398e3f498e6f598e6f599e7f59be8f69ce9f69eeaf69febf7a1ecf7a2edf8a4eef8a5eff8a7f0f9a8f1f9aaf2faabf3faadf4faaef5fbb0f6fbb2f7fcb3f8fcb5f9fcb6fafdb8fbfdb9fcfebbfdfebcfefebefefebdfefdbbfefbb9fefab7fef9b5fef8b3fef7b1fef5affef4adfef3abfef2a9fef1a7feefa5feeea3feeda1feec9ffeea9dfee99bfee899fee797fee695fee493fee391fee28ffee18dfee08bfdde89fddc87fdda86fdd884fdd682fdd481fdd27ffdd07dfdce7cfdcc7afdca78fdc877fdc675fdc473fdc272fdc070fdbe6ffdbc6dfdba6bfdb86afdb668fdb466fdb265fdb063fdae61fcac60fcaa5ffca75efba55cfba25bfb9f5afa9d59fa9a58fa9857f99555f99354f89053f88e52f88b51f7894ff7864ef7834df6814cf67e4bf67c4af57948f57747f57446f47245f46f44f46d43f26b43f16943f06744ef6544ed6345ec6145eb6046ea5e46e95c47e75a47e65848e55648e45549e25349e1514ae04f4adf4d4bde4b4bdc494bdb484cda464cd9444dd8424dd6404ed53e4ed33c4ed13a4ecf384dcd354dcb334cc9304cc62e4bc42c4bc2294ac0274abe2449bc2249ba2048b71d48b51b47b31847b11646af1446ad1145aa0f45a80c44a60a44a40843a20543a003429e0142'.match(/.{6}/g).map(h=>[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)));
export function createDemoDisplay(width,height){
 const W=width,H=height,N=W*H,data={},masks={};
 let scale=1,px=0,py=0,lo=450,hi=2600,csrc='reference';
function edge(d, t, r){
  const b = new Uint8Array(N);
  for (let y=0;y<H;y++) for (let x=0;x<W;x++){ const i=y*W+x; if(!(d[i]>0&&isFinite(d[i]))) continue;
    for (const j of [x<W-1?i+1:-1, y<H-1?i+W:-1]) if (j>=0&&d[j]>0&&isFinite(d[j])&&Math.abs(d[i]-d[j])>t){ b[i]=1; b[j]=1; } }
  if (!r) return b;
  const sum = new Int32Array((W+1)*(H+1)), out = new Uint8Array(N);
  for (let y=0;y<H;y++){ let row=0; for (let x=0;x<W;x++){ row+=b[y*W+x]; sum[(y+1)*(W+1)+x+1]=sum[y*(W+1)+x+1]+row; } }
  for (let y=0;y<H;y++) for (let x=0;x<W;x++){ const a=Math.max(0,x-r), bb=Math.min(W,x+r+1), c=Math.max(0,y-r), dd=Math.min(H,y+r+1);
    out[y*W+x] = sum[dd*(W+1)+bb]-sum[c*(W+1)+bb]-sum[dd*(W+1)+a]+sum[c*(W+1)+a] > 0; }
  return out;
}
function outline(depth, mask){
  const valid = new Uint8Array(N), line = new Uint8Array(N);
  for (let i=0;i<N;i++) valid[i] = !mask?.[i] && Number.isFinite(depth[i]) && depth[i] > 0;
  for (let i=0;i<N;i++){ if (valid[i]) continue; const x=i%W;
    line[i] = (x>0&&valid[i-1]) || (x+1<W&&valid[i+1]) || (i>=W&&valid[i-W]) || (i+W<N&&valid[i+W]); }
  return line;
}
function openContour(valid, radius){
  let a = valid.slice(), b = new Uint8Array(N);
  for (const erode of [true,false]) for (let pass=0; pass<radius; pass++){
    const square = (erode ? pass : radius-1-pass) % 2 === 1;
    for (let y=0;y<H;y++){ const top=Math.max(0,y-1)*W, row=y*W, bot=Math.min(H-1,y+1)*W;
      for (let x=0;x<W;x++){ const i=row+x; if (a[i]!==Number(erode)){ b[i]=a[i]; continue; }
        const l=Math.max(0,x-1), r=Math.min(W-1,x+1);
        const s = a[top+x]+a[bot+x]+a[row+l]+a[row+r] + (square ? a[top+l]+a[top+r]+a[bot+l]+a[bot+r] : 0);
        b[i] = erode ? s === (square?8:4) : s > 0; } }
    [a,b] = [b,a];
  }
  return a;
}
function smoothNsl(base, strength){
  const valid = new Uint8Array(N), out = base.slice();
  for (let i=0;i<N;i++) valid[i] = !base[i] && Number.isFinite(data.nsl[i]) && data.nsl[i] > 0;
  for (let y=0;y<H;y++){ const up=Math.max(0,y-1)*W, row=y*W, dn=Math.min(H-1,y+1)*W;
    for (let x=0;x<W;x++){ if (!valid[row+x]) continue; const l=Math.max(0,x-1), r=Math.min(W-1,x+1);
      if (valid[up+l]+valid[up+x]+valid[up+r]+valid[row+l]+valid[row+x]+valid[row+r]+valid[dn+l]+valid[dn+x]+valid[dn+r] < 5) out[row+x]=1; } }
  for (let i=0;i<N;i++) valid[i] = valid[i] && !out[i];
  const opened = openContour(valid, strength);
  for (let i=0;i<N;i++) if (valid[i] && !opened[i]) out[i]=1;
  return out;
}
function computeRange(){
  const d = data[csrc], m = masks[csrc], v = [];
  for (let y=0;y<H;y+=2) for (let x=0;x<W;x+=2){ const sx=W*(1-scale)/2+px+x*scale, sy=H*(1-scale)/2+py+y*scale, i=y*W+x;
    if (sx>=0&&sx<W&&sy>=0&&sy<H&&d[i]>0&&isFinite(d[i])&&!(m&&m[i])) v.push(d[i]); }
  if (!v.length) return false;
  v.sort((a,b) => a-b);
  const n = Math.floor(v[Math.floor(v.length*.02)]), f = Math.max(n+1, Math.ceil(v[Math.floor(v.length*.98)]));
  if (n === lo && f === hi) return false;
  lo = n; hi = f; return true;
}
 function displayMask(method,depth){
  if(method==='nsl'){data.nsl=depth;return smoothNsl(edge(depth,100,1),4)}
  if(method==='lingbot'||method==='da2')return edge(depth,100,2);
  // FoundationStereo was not in the original demo: keep the experiment's edge1px rule.
  if(method==='foundation')return edge(depth,100,1);
  // SGBM occupies the original raw-depth role. GT is never filtered for display.
  return null;
 }
 function visibleRange(depth,mask,view){
  data[csrc]=depth;masks[csrc]=mask;scale=view.scale;px=view.panX;py=view.panY;lo=view.near;hi=view.far;
  const changed=computeRange();return {near:lo,far:hi,changed};
 }
 return {displayMask,outline,visibleRange};
}
