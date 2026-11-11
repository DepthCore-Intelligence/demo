// Scene selection is fixed to the common evaluation rule, independent of display styling.
export function selectScenes(manifest){
 const rows=manifest.by_scene.filter(r=>r.filter==='edge1px');
 return manifest.scenes.filter(s=>{
  const ours=rows.find(r=>r.scene===s.scene&&r.method==='nsl_tile4');
  const lingbot=rows.find(r=>r.scene===s.scene&&r.method==='lingbot_tile4');
  return Number.isFinite(ours?.mae_mm)&&Number.isFinite(lingbot?.mae_mm)&&ours.mae_mm<=20&&ours.mae_mm<=lingbot.mae_mm;
 });
}
export function summarizeScenes(manifest,scenes,method,filter){
 const ids=new Set(scenes.map(s=>s.scene));
 const rows=manifest.by_scene.filter(r=>ids.has(r.scene)&&r.method===method&&r.filter===filter);
 const valid=rows.reduce((n,r)=>n+r.valid_pixels,0),gt=rows.reduce((n,r)=>n+r.gt_pixels,0);
 return {method,filter,scenes:rows.length,valid_pixels:valid,gt_pixels:gt,
  mae_mm:valid?rows.reduce((n,r)=>n+r.mae_mm*r.valid_pixels,0)/valid:null,
  rmse_mm:valid?Math.sqrt(rows.reduce((n,r)=>n+r.rmse_mm**2*r.valid_pixels,0)/valid):null,
  coverage_pct:gt?100*valid/gt:null};
}
