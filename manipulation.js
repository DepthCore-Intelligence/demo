(() => {
  'use strict';
  const root = document.getElementById('manipulation');
  if (!root) return;
  const $ = s => root.querySelector(s);
  const base = 'media/manipulation/';
  const colors = {nsl:'var(--nsl)',tradsl_d435:'var(--tradsl)',tradsl:'var(--tradsl)',dav2_metric:'var(--da2)',da2:'var(--da2)',gt:'var(--gt)'};
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const time = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;
  let methods = [], fps = 25, duration = 0, active = 0, current = 0, playing = false, speed = 1;
  let lastEvent = '', forced = null, lastFrame = -1;
  let atlas = null, frameRequest = null, initialized = false;
  const playButton = $('#manPlay'), scrub = $('#manScrub'), status = $('#manStatus');

  function pause() {
    if(atlas)current=atlas.ended?duration:Math.min(duration,atlas.currentTime);
    playing = false;
    status.textContent = '';
    atlas?.pause();
    cancelFrame();
    playButton.textContent = '▶';
    playButton.setAttribute('aria-label','播放操作回放');
    drawFrame();render();
  }
  async function play() {
    if (!atlas || !methods.length) return;
    if (current >= duration - .025) seek(0);
    playing = true; forced = null;
    playButton.textContent = 'Ⅱ';
    playButton.setAttribute('aria-label','暂停操作回放');
    atlas.playbackRate = speed;
    try{await atlas.play();if(playing)scheduleFrame();}
    catch(error){pause();status.textContent='回放尚未就绪，请稍后重新播放。';}
  }
  function seek(next, eventIndex = null) {
    current = Math.max(0,Math.min(duration,next));
    forced = eventIndex;
    if(atlas&&Number.isFinite(atlas.duration)){
      atlas.currentTime=Math.min(current,Math.max(0,atlas.duration-1/fps));
      if(playing&&atlas.paused)atlas.play().then(scheduleFrame).catch(()=>pause());
    }
    render(true);
  }
  function eventIndex() {
    const events = methods[active]?.events || [];
    if (forced !== null) return forced;
    const frame = Math.floor(current*fps+.01);
    let found = 0;
    for (let i=0;i<events.length;i++) if (events[i].frame<=frame) found=i;
    return found;
  }
  function select(index) {
    active = index; forced = null; lastEvent = '';
    methods.forEach((m,i) => {
      m.tile.classList.toggle('selected',i===index);
      m.tab.setAttribute('aria-pressed',String(i===index));
      m.select.setAttribute('aria-pressed',String(i===index));
    });
    $('#manAgent').style.setProperty('--active',colors[methods[active].key]||'var(--nsl)');
    render(true);
  }
  // Extract presentation facts only from the recorded source excerpt and receipt.
  function describe(event) {
    const code=event.code || '', receipt=event.receipt || '';
    const first=code.match(/robot\.(goto|grip|gripper|measure|find|look|to_world|to_pixel|camera|state|task|home|wait)\(([^\n]*)/);
    const args=first?.[2] || '';
    const arm=(args.match(/['"](left|right)['"]/)||[])[1];
    const side=arm==='left'?'左臂':arm==='right'?'右臂':'';
    const names={goto:`${side||'机械臂'}位姿移动`,grip:`${side ? side.replace('臂','夹爪') : '夹爪'}控制`,gripper:`${side ? side.replace('臂','夹爪') : '夹爪'}控制`,measure:'深度测量',find:'目标检测',look:'获取画面',to_world:'空间坐标换算',to_pixel:'像素坐标换算',camera:'读取相机参数',state:'读取机器人状态',task:'读取任务',home:'机械臂归位调用',wait:'等待调用'};
    const title=names[first?.[1] || event.calls?.[0]] || event.summary || event.title;
    const lines=receipt.split('\n').filter(Boolean);
    const line=lines.find(x=>/BLOCKED|NOT reachable|short of target/.test(x)) || lines.find(x=>/^Move /.test(x)) || lines[0] || '';
    let m, status='', coords=null, facts=[];
    if ((m=line.match(/^Move (left|right)( \(dry run\))?: (.*)/))) {
      const body=m[3], dry=!!m[2], sideName=m[1]==='left'?'左臂':'右臂';
      const state=/NOT reachable/.test(body)?'不可达':/BLOCKED/.test(body)?'移动受阻':/short of target/.test(body)?'未到达目标':dry?'可达':'位置已返回';
      status=`${sideName} · ${dry?'试运行 · ':''}${state}`;
      const point=body.match(/(target|at) \(([^)]+)\)/);
      if(point) coords={label:point[1]==='target'?'目标坐标':'返回位置',values:point[2].split(',').map(x=>x.trim())};
      const diff=body.match(/(\d+) mm \/ (\d+)° from/), tolerance=body.match(/±(\d+) mm (\d+)°/);
      if(diff) facts.push(`距目标 ${diff[1]} mm / ${diff[2]}°`);
      else if(tolerance) facts.push(`返回偏差 ±${tolerance[1]} mm / ${tolerance[2]}°`);
    } else if ((m=line.match(/^Grip (left|right): (.*)/))) {
      const sideName=m[1]==='left'?'左夹爪':'右夹爪';
      const value=m[2].match(/^open ([\d.]+)/), width=m[2].match(/~([\d.]+) cm/);
      if (/closed on something/.test(m[2])) status=`${sideName} · 返回记录为夹持中`;
      else if(value) status=`${sideName} · 开度 ${value[1]}`;
      else status=line;
      if(width) facts.push(`间隙或夹持宽度约 ${width[1]} cm`);
    } else if ((m=line.match(/^Mask#(\d+) (\S+) '([^']+)' score ([\d.]+)  centroid \(([^)]+)\)/))) {
      status=`检测 ${m[3]} · ${m[2]}`; facts.push(`得分 ${m[4]} · 像素中心 (${m[5]})`);
    } else if (line && !/^step /.test(line)) status=line;
    const budget=line.match(/\[(\d+) steps left\]/) || line.match(/\((\d+) left\)/);
    if(budget) facts.push(`本条返回时剩余预算 ${budget[1]} 步`);
    if(!status && !facts.length) status='本段未保存工具返回摘录';
    return {title,status,coords,facts};
  }
  function firstCall(excerpt) {
    const start=excerpt.search(/robot\.\w+\(/);
    if(start<0)return excerpt.split('\n').find(Boolean)||'无调用摘录';
    let depth=0,quote='',escaped=false;
    for(let i=start;i<excerpt.length;i++){
      const char=excerpt[i];
      if(quote){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char===quote)quote='';continue;}
      if(char==='"'||char==="'")quote=char;
      else if(char==='(')depth++;
      else if(char===')'&&--depth===0)return excerpt.slice(start,i+1);
    }
    return excerpt.slice(start);
  }
  function formatCall(code) {
    const match=code.match(/^(robot\.\w+)\(([\s\S]*)\)$/);
    if(!match) return code;
    const parts=[];let start=0,depth=0,quote='',escaped=false;
    for(let i=0;i<match[2].length;i++){
      const char=match[2][i];
      if(quote){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char===quote)quote='';continue;}
      if(char==='"'||char==="'")quote=char;
      else if('([{'.includes(char))depth++;
      else if(')]}'.includes(char))depth--;
      else if(char===','&&depth===0){parts.push(match[2].slice(start,i).trim());start=i+1;}
    }
    if(depth!==0||quote) return code;
    parts.push(match[2].slice(start).trim());
    if(parts.length<2)return code;
    const rest=parts.slice(1),positional=rest.filter(p=>!/^\w+\s*=/.test(p)),named=rest.filter(p=>/^\w+\s*=/.test(p));
    return `${match[1]}(${parts[0]},\n  ${[positional.join(', '),named.join(', ')].filter(Boolean).join(',\n  ')})`;
  }
  function factFields(facts) {
    const names={'返回偏差':'位姿偏差','距目标':'距目标','本条返回时剩余预算':'返回时剩余预算','间隙或夹持宽度约':'夹爪间隙（约）','得分':'检测得分','执行跨度':'执行跨度','记录调用':'记录调用','最终得分':'最终得分','累计动作':'累计动作'};
    return facts.map(f=>{
      const prefix=Object.keys(names).find(k=>f.startsWith(k));
      return {label:prefix?names[prefix]:'记录数据',value:prefix?f.slice(prefix.length).trim():f};
    });
  }
  function renderEvent() {
    const m = methods[active], events = m.events || [], idx = eventIndex();
    const ended=current>=m.duration-.04;
    const key = `${active}/${idx}/${ended}`;
    if (lastEvent===key) return;
    lastEvent = key;
    const event = events[idx] || {title:'执行记录待补充',frame:0,action:0,calls:[]};
    $('#manTurn').textContent = `记录 ${String(event.turn||idx+1).padStart(2,'0')} / ${events.length}`;
    $('#manLogCount').textContent = `${idx+1} / ${events.length} 条记录`;
    const view = describe(event);
    if(ended){
      view.status=m.success?'任务完成':'任务结束，未达到完成条件';
      view.coords=null;
      view.facts=[`最终得分 ${m.score} / 100`,`累计动作 ${m.actions} 步`];
    }else if(!view.coords&&view.facts.length<2){
      view.facts.push(`执行跨度 ${(event.stepEnd??event.action??0)-(event.action??event.frame??0)} 步`);
      if(view.facts.length<2)view.facts.push(`记录调用 ${(event.calls||[]).length} 次`);
    }
    $('#manEventTitle').textContent = view.title;
    $('#manStep').textContent = `动作 ${event.action ?? event.frame} → ${event.stepEnd ?? event.action ?? event.frame} / ${m.actions}`;
    const excerpt = event.code || event.excerpt || event.output || '';
    $('#manExcerpt').textContent = excerpt || '无调用摘录';
    const call=firstCall(excerpt);
    $('#manInput').textContent = formatCall(call);
    $('#manInput').title=call;
    const groups=[];
    for(const call of event.calls||[]){const last=groups.at(-1);if(last?.name===call)last.count++;else groups.push({name:call,count:1});}
    $('#manTools').innerHTML=groups.slice(0,4).map(g=>`<code>${safe(g.name)}${g.count>1?' ×'+g.count:''}</code>`).join('<span>›</span>')+(groups.length>4?`<small>+${groups.length-4}</small>`:'');
    $('#manTools').title=(event.calls||[]).join(' → ');
    $('#manReceipt').textContent = event.receipt || '无返回摘录';
    $('#manFeedback').innerHTML = `${view.status?`<p class="man-feedback-status">${safe(view.status)}</p>`:''}${view.coords?`<div class="man-coords"><span>${safe(view.coords.label)} <small>/ m</small></span><div>${view.coords.values.map((v,i)=>`<span><small>${'XYZ'[i]}</small><b>${safe(v)}</b></span>`).join('')}</div></div>`:''}<dl class="man-feedback-fields">${factFields(view.facts).map(f=>`<div><dt>${safe(f.label)}</dt><dd>${safe(f.value)}</dd></div>`).join('')}</dl>`;
    $('#manFeedbackLabel').textContent = ended?'最终评估':m.traceOrigin === 'source-run' ? '源执行反馈' : '执行反馈';
    $('#manSourceNote').textContent = m.traceNote || '动作名称为编辑摘要；调用与返回来自原始记录。';
    $('#manPrevEvent').disabled = idx===0;
    $('#manNextEvent').disabled = idx>=events.length-1;
    $('#manAgentState').textContent = `${m.name} · ${current >= m.duration-.04?'已结束':'记录回放'}`;
  }
  function render(force=false) {
    if (!methods.length) return;
    const frame = Math.floor(current*fps);
    scrub.value = current;
    scrub.setAttribute('aria-valuetext',`${time(current)}，动作 ${frame}`);
    $('#manTime').textContent=`${time(current)} / ${time(duration)}`;
    if (force || frame!==lastFrame) {
      methods.forEach(m=>{
        const ended = current>=m.duration-.04;
        m.outcome.classList.toggle('ended',ended);
        m.end.classList.toggle('on',ended);
        m.outcomeText.textContent=ended?(m.success?'成功':'未完成'):`${Math.min(m.actions,frame)} / ${m.actions}`;
      });
      const m=methods[active];
      $('#manAgentState').textContent=`${m.name} · ${current>=m.duration-.04?'已结束':'记录回放'}`;
      lastFrame=frame;
    }
    renderEvent();
  }
  function drawFrame() {
    if(!atlas||atlas.readyState<2)return;
    methods.forEach(m=>{
      const r=m.crops.rgb,d=m.crops.depth;
      m.rgbContext.drawImage(atlas,...r,0,0,640,480);
      m.depthContext.drawImage(atlas,...d,0,0,256,192);
    });
  }
  function cancelFrame(){
    if(frameRequest===null||!atlas)return;
    if(atlas.cancelVideoFrameCallback)atlas.cancelVideoFrameCallback(frameRequest);
    else cancelAnimationFrame(frameRequest);
    frameRequest=null;
  }
  function scheduleFrame(){
    if(!playing||frameRequest!==null)return;
    frameRequest=atlas.requestVideoFrameCallback?atlas.requestVideoFrameCallback(onVideoFrame):requestAnimationFrame(now=>onVideoFrame(now,{mediaTime:atlas.currentTime}));
  }
  function onVideoFrame(now,metadata){
    frameRequest=null;
    if(!playing)return;
    current=Math.min(duration,metadata.mediaTime);
    drawFrame();render();scheduleFrame();
  }
  async function init() {
    try {
      const response = await fetch(base+'data.json');
      if (!response.ok) throw new Error('metadata');
      const data=await response.json();
      fps=data.fps||25;
      methods=data.methods;
      if(data.playback?.type!=='atlas')throw new Error('playback atlas');
      duration=Math.max(...methods.map(m=>m.duration));
      scrub.max=duration;
      $('#manQuad').innerHTML=methods.map((m,i)=>{
        const name=['NSL','TradSL','DA2','GT'][i]; m.name=name;
        const color=colors[m.key]||colors[['nsl','tradsl','da2','gt'][i]];
        return `<article class="tile man-tile" style="--c:${color};--status:${m.success?'#8fd3a8':'#f29c8a'}">
          <canvas class="man-rgb" width="640" height="480" style="background-image:url('${base+safe(m.poster)}')" role="img" aria-label="${name} 操作回放"></canvas>
          <button class="man-select" aria-label="查看 ${name} 的 Agent 执行轨迹" aria-pressed="${i===0}"><span class="tag">${name}<small>${i===2?'Metric depth':i===3?'Ground truth':'Depth input'}</small></span></button>
          <div class="man-inset"><canvas class="man-depth" width="256" height="192" style="background-image:url('${base+safe(m.depthPoster)}')" role="img" aria-label="${name} Spectral_r 深度回放"></canvas><span class="man-inset-label">DEPTH</span></div>
          <span class="man-outcome"><i></i><span class="man-outcome-text">0 / ${m.actions}</span></span><div class="man-ended"><strong>${m.success?'任务成功':'任务未完成'}</strong><small>score ${m.score} / 100</small></div>
        </article>`;
      }).join('');
      $('#manTabs').innerHTML=methods.map((m,i)=>`<button style="--c:${colors[m.key]||colors[['nsl','tradsl','da2','gt'][i]]}" aria-pressed="${i===0}">${m.name}</button>`).join('');
      $('#manResults').innerHTML=methods.map((m,i)=>`<li style="--c:${colors[m.key]||colors[['nsl','tradsl','da2','gt'][i]]}"><b>${m.name}</b>${m.success?'成功':'未完成'}<span class="man-score">${m.score} / 100</span><span class="${m.success?'ok':'no'}">${m.success?'✓':'✗'}</span></li>`).join('');
      methods.forEach((m,i)=>{
        m.tile=$('#manQuad').children[i];m.tab=$('#manTabs').children[i];m.select=m.tile.querySelector('.man-select');m.outcome=m.tile.querySelector('.man-outcome');m.end=m.tile.querySelector('.man-ended');
        m.outcomeText=m.tile.querySelector('.man-outcome-text');
        m.crops=data.playback.crops[m.key];
        m.rgbContext=m.tile.querySelector('.man-rgb').getContext('2d',{alpha:false});
        m.depthContext=m.tile.querySelector('.man-depth').getContext('2d',{alpha:false});
        m.tab.onclick=m.select.onclick=()=>select(i);
      });
      atlas=document.createElement('video');
      atlas.id='manAtlas';atlas.className='man-atlas';atlas.muted=true;atlas.playsInline=true;atlas.preload='auto';atlas.setAttribute('aria-hidden','true');root.append(atlas);
      atlas.addEventListener('seeked',()=>{drawFrame();render();});
      atlas.addEventListener('ended',()=>{current=duration;pause();});
      atlas.addEventListener('error',()=>{status.textContent='视频加载失败。请检查本地素材并刷新。';});
      // One decoded frame supplies all eight canvases. Blob-backed playback also
      // keeps seeking reliable on local servers without HTTP byte ranges.
      const mediaResponse=await fetch(base+data.playback.video);
      if(!mediaResponse.ok)throw new Error('video');
      const blob=await mediaResponse.blob();
      await new Promise((resolve,reject)=>{
        atlas.addEventListener('loadeddata',resolve,{once:true});atlas.addEventListener('error',reject,{once:true});
        atlas.src=URL.createObjectURL(blob);atlas.load();
      });
      drawFrame();
      playButton.disabled=false;
      status.textContent='';
      status.classList.remove('loading');
      select(0);
    } catch(error) {status.classList.remove('loading'); status.textContent='操作素材尚未加载，请稍后刷新。';}
  }
  playButton.onclick=()=>playing?pause():play();
  scrub.addEventListener('input',()=>seek(Number(scrub.value)));
  $('#manSpeed').addEventListener('change',e=>{
    speed=Number(e.target.value);
    if(atlas)atlas.playbackRate=speed;
  });
  for(const [id,delta] of [['manPrevEvent',-1],['manNextEvent',1]]) $("#"+id).onclick=()=>{
    if(!methods[active]?.events?.length)return;
    pause(); const idx=Math.max(0,Math.min(methods[active].events.length-1,eventIndex()+delta));
    seek(methods[active].events[idx].frame/fps,idx);
  };
  $('#manRestart').onclick=()=>{pause();seek(0);};
  function showSource(open) {
    $('#manSource').hidden=!open;
    $('#manSourceOpen').setAttribute('aria-expanded',String(open));
    [...$('#manAgent').children].filter(el=>el!==$('#manSource')).forEach(el=>{el.inert=open;});
    (open?$('#manSourceClose'):$('#manSourceOpen')).focus({preventScroll:true});
  }
  $('#manSourceOpen').onclick=()=>showSource(true);
  $('#manSourceClose').onclick=()=>showSource(false);
  root.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!$('#manSource').hidden){e.preventDefault();showSource(false);return;}
    if(e.code==='Space'&&!e.target.closest('button,input,select,summary')){e.preventDefault();e.stopPropagation();playing?pause():play();}
  });
  function start(){
    if (initialized) return;
    initialized = true;
    status.textContent = '正在加载操作素材';
    status.classList.add('loading');
    init();
  }
  setTimeout(() => new IntersectionObserver((entries, observer) => {
    if (!entries.some(e => e.isIntersecting && e.boundingClientRect.top >= 0)) return;
    observer.disconnect();
    start();
  }, {rootMargin:'0px 0px 600px 0px'}).observe(root), 900);
})();
