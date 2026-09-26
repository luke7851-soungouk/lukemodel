/* 일관성 참고 이미지 자동 생성 (window.LukeAngles)
   한 사람(원본 작품 또는 공개 얼굴)마다 따로따로 4장: 정면 · 왼쪽 · 오른쪽 · 뒷모습 — 같은 얼굴·머리·옷, 밝은 회색 배경, 3:4(768×1024).
   이미지·영상 만들 때 이 4장을 참고 이미지/시작 프레임으로 자동으로 넣어 인물 일관성을 유지 (face-hf.js).
   - 무료 엔진(허깅페이스 ZeroGPU)만 자동. 유료(힉스필드)는 절대 자동 호출 안 함(버튼 + 확인 창으로만, face-hf.js).
   - 올린 직후: 새 행(hf-core insertRow → 'lukemedia:inserted') → 그 사람의 뿌리(원본)에 각도가 없으면 올린 사람 브라우저에서 생성
   - 볼 때: 작품 페이지(/?m=)·공개 얼굴 상세에서 뿌리의 각도가 빠져 있으면 그 방문자 브라우저에서 빠진 것만(정면→왼쪽→오른쪽→뒷모습 순)
   - 뿌리: face_id='m-<부모 id>' 를 따라 올라간 맨 위 작품(m-<id>) 또는 얼굴 키(r-…). 파생 작품은 뿌리의 각도를 물려받음(따로 만들지 않음)
   - 저장: 각도마다 기존 업로드 경로(LukeHF.publish)로 shared_media 행 1개, 제목 표식 「[각도·정면]」 등, face_id=뿌리 키. 스키마 변경 없음
   - 각도 이미지 자체와 캐릭터 시트에는 다시 만들지 않음. 잠금(각도별 15분) + 저장 직전 재확인. 한도·대기열·꺼짐은 조용히 실패 + 쿨다운
   의존: /hf-core.js, /vendor/gradio-client-2.7.0.js(필요할 때만) */
'use strict';
(function(){
const H=window.LukeHF; if(!H) return;
const COMMON='Keep the identical face and facial features, skin tone, hairstyle and hair color, body shape, and the exact same outfit, accessories and colors as the reference image. '
 +'Keep the art style of the reference: photorealistic stays photorealistic, anime or illustration stays the same drawn style. '
 +'Plain light grey seamless studio background, soft even lighting, no props, no text, no watermark, only this one person, one single image (not a collage, not a grid). '
 +'Portrait framing from the top of the head down to the knees, person centered, the whole head visible with a little space above it. ';
const ANGLES=[
  {id:'front',ko:'정면',prompt:'Front view: the same person standing and facing the camera directly, looking straight at the camera, neutral relaxed pose, arms relaxed at the sides. '},
  {id:'left',ko:'왼쪽',prompt:'Left side profile view: the same person turned 90 degrees so the camera sees the left side of their face and body; they face toward the left edge of the image, neutral relaxed standing pose. '},
  {id:'right',ko:'오른쪽',prompt:'Right side profile view: the same person turned 90 degrees so the camera sees the right side of their face and body; they face toward the right edge of the image, neutral relaxed standing pose. '},
  {id:'back',ko:'뒷모습',prompt:'Back view: the same person seen from directly behind, facing away from the camera; show the back of the head, the hair from behind and the back of the outfit; the face is not visible. '}];
const ANGLE_BY_ID=Object.fromEntries(ANGLES.map(a=>[a.id,a])), ANGLE_BY_KO=Object.fromEntries(ANGLES.map(a=>[a.ko,a]));
const promptFor=id=>ANGLE_BY_ID[id].prompt+COMMON;
const MARK=a=>'[각도·'+a.ko+']', TITLE=a=>MARK(a)+' 일관성 참고 이미지';
const ANGLE_RE=/\[각도·(정면|왼쪽|오른쪽|뒷모습)\]/;
const angleOf=x=>{ const m=String((typeof x==='string'?x:x&&x.title)||'').match(ANGLE_RE); return m?ANGLE_BY_KO[m[1]].id:null; };
const isAngle=x=>!!angleOf(x), isSheet=x=>/캐릭터 시트/.test(String((typeof x==='string'?x:x&&x.title)||''));
const SIZE={width:768,height:1024};
const LS_TOKEN='lukehf.hftoken', LS_COOL='lukeangle.cooldown', LS_LOCK='lukeangle.lock.', LS_FAIL='lukeangle.fail.';
const LOCK_MS=15*60000, FAIL_MS=60*60000, HOUR=60*60000, BUSY_MS=10*60000, UPLOAD_QUEUE_MAX=5;
const lsGet=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } };
const lsSet=(k,v)=>{ try{ v==null?localStorage.removeItem(k):localStorage.setItem(k,String(v)); }catch(e){} };
const TABLE=()=>(H.CFG.table||'shared_media');

/* ── 허깅페이스 무료 엔진: Space 여러 개를 차례로 시도 (앞 Space 가 고장 → 다음 Space) ──────────────────
   ZeroGPU 한도는 사람(IP/토큰) 기준이라 Space 를 바꿔도 공유됨 → 한도 초과는 다음 Space 로 넘기지 않고 멈춤.
   고장(ZeroGPU worker error·GPU task aborted·꺼짐)은 그 Space 를 3시간 건너뜀 → 다음 방문엔 바로 다음 Space 로.
   · qwen-fast : Qwen-Image-Edit-2511 + Lightning 4단계 (Apache-2.0) · 1장 예약 60초 · 결과 768×1024
   · kontext   : FLUX.1 Kontext [dev] 공식 Space (비상업 가중치 라이선스 — 결과물 사용은 BFL 라이선스 확인) · 1장 예약 90초 · 24단계 ≈ 25초
                 결과 크기는 원본 비율을 따름 (9:16 원본 → 768×1360) */
const KEEP='Keep the exact same face, facial features, skin tone, hairstyle, hair color and the same outfit unchanged. Plain light grey studio background, soft even lighting, photorealistic unless the reference is a drawing. ';
const KONTEXT_PROMPT={
  front:'Show the same person standing and facing the camera directly, front view, looking straight at the camera, arms relaxed at the sides. '+KEEP+'Framed from the top of the head to the knees.',
  left:'Show the same person from their left side in a full side profile view, body and head turned 90 degrees so they face the left edge of the image. '+KEEP+'Framed from the top of the head to the knees.',
  right:'Show the same person from their right side in a full side profile view, body and head turned 90 degrees so they face the right edge of the image. '+KEEP+'Framed from the top of the head to the knees.',
  back:'Show the same person seen from directly behind, facing away from the camera, so we see the back of their head, their hair from behind and the back of the outfit; the face is not visible. Keep the same hairstyle, hair color and outfit unchanged. Plain light grey studio background, soft even lighting. Framed from the top of the head to the knees.'};
const HF_SPACES=[
  {id:'qwen-fast',space:'linoyts/Qwen-Image-Edit-2511-Fast',gpu:60,label:'Qwen-Image-Edit-2511',
    args:(hf,{src,prompt,width,height})=>({images:[{image:hf(src),caption:null}],prompt,seed:0,randomize_seed:true,true_guidance_scale:1,num_inference_steps:4,height:height||SIZE.height,width:width||SIZE.width,rewrite_prompt:false}),
    pick:out=>{ const f=out&&out[0]&&out[0][0]; return f&&(f.image?f.image.url:f.url); }},
  {id:'kontext',space:'black-forest-labs/FLUX.1-Kontext-Dev',gpu:90,label:'FLUX.1 Kontext',
    args:(hf,{src,prompt,angle})=>({input_image:hf(src),prompt:(angle&&KONTEXT_PROMPT[angle])||prompt,seed:0,randomize_seed:true,guidance_scale:2.5,steps:24}),
    pick:out=>{ const f=out&&out[0]; return f&&(f.url||(f.image&&f.image.url)); }}];
const LS_BAD='lukeangle.bad.', BAD_MS=3*HOUR;
const spaceBad=sp=>{ const t=+(lsGet(LS_BAD+sp.id)||0); return t&&Date.now()<t; };
let gradioMod=null; const loadGradio=()=>gradioMod||(gradioMod=import('/vendor/gradio-client-2.7.0.js').catch(e=>{ gradioMod=null; throw e; }));
function hfToken(){ const t=lsGet(LS_TOKEN)||''; return /^hf_[A-Za-z0-9]{20,}$/.test(t)?t:''; }
function setHfToken(v){ lsSet(LS_TOKEN,v||null); }
function waitMs(m){ const w=(String(m).match(/try again in (\d+):(\d+):(\d+)/i)||[]); return w.length?((+w[1])*3600+(+w[2])*60+(+w[3]))*1000:0; }
function hfErrorText(e){
  const m=String((e&&(e.message||e.title||e.detail))||e||''); const ms=waitMs(m);
  const wait=ms?(ms>=HOUR?Math.floor(ms/HOUR)+'시간 '+Math.round(ms%HOUR/60000)+'분':Math.max(1,Math.round(ms/60000))+'분'):'';
  if(/quota|exceeded your (?:gpu|zerogpu)|gpu (?:time|limit)|zerogpu.*limit|runs limit/i.test(m)) return {kind:'quota',wait:ms,text:'오늘 무료 GPU 사용량(허깅페이스)이 다 찼습니다'+(wait?' — 약 '+wait+' 뒤 다시 가능':'')+'. 허깅페이스 토큰(무료 계정 하루 5분)을 넣거나 힉스필드(유료)로 만드세요.'};
  if(/queue.*full|too many|rate.?limit|429/i.test(m)) return {kind:'busy',text:'무료 서버 대기열이 가득 찼습니다. 잠시 뒤 다시 하거나 힉스필드(유료)로 만드세요.'};
  if(/zerogpu worker error|gpu task aborted|illegal duration|larger than the maximum allowed|^runtimeerror|: runtimeerror/i.test(m)) return {kind:'broken',text:'무료 서버(허깅페이스 Space)가 지금 고장 나 있습니다 (ZeroGPU worker error). 다른 무료 서버로 다시 해 보고, 안 되면 나중에 하거나 힉스필드(유료)로 만드세요.'};
  if(/paused|sleep|not found|404|503|502|could not (?:resolve|connect)|failed to fetch|connection|runtime error|building|space.*(?:down|error)|timed? ?out/i.test(m)) return {kind:'down',text:'무료 서버(허깅페이스 Space)가 지금 꺼져 있거나 응답하지 않습니다. 나중에 다시 하거나 힉스필드(유료)로 만드세요.'};
  return {kind:'error',text:'무료 생성 실패: '+m.slice(0,160)};
}
async function hfRun(job){
  const {Client,handle_file}=await loadGradio(); const tok=hfToken(); let lastErr=null;
  const list=HF_SPACES.filter(sp=>!spaceBad(sp)); if(!list.length) list.push(...HF_SPACES);   /* 전부 고장 표시면 그래도 다시 시도 */
  for(const sp of list){
    try{
      job.onPhase&&job.onPhase('무료 서버 연결 중…'+(sp!==HF_SPACES[0]?' ('+sp.label+')':''));
      const app=await Client.connect(sp.space,Object.assign({events:['data','status']},tok?{hf_token:tok}:{}));   /* events 에 status 가 없으면 대기열·오류 메시지가 안 옴 */
      job.onPhase&&job.onPhase('무료 GPU 대기열…');
      const sub=app.submit('/infer',sp.args(handle_file,job));
      let out=null;
      for await(const msg of sub){
        if(msg.type==='status'){ if(msg.stage==='error') throw new Error([msg.title,msg.message].filter(Boolean).join(': ')||'error'); if(msg.stage==='pending') job.onPhase&&job.onPhase(msg.position!=null?'대기 '+(msg.position+1)+'번째…':'대기열…'); if(msg.stage==='generating') job.onPhase&&job.onPhase('그리는 중…'); }
        if(msg.type==='data'){ out=msg.data; break; } }
      const u=sp.pick(out);
      if(!u) throw new Error(out?'결과 이미지가 없습니다':'무료 서버 응답이 끊겼습니다 (connection closed)');
      const r=await fetch(u,tok?{headers:{Authorization:'Bearer '+tok}}:{}); if(!r.ok) throw new Error('결과 받기 실패 ('+r.status+')');
      const blob=await r.blob(); try{ blob.engine=sp.id; }catch(e){} lsSet(LS_BAD+sp.id,null); return blob;
    }catch(e){ lastErr=e; const k=hfErrorText(e).kind;
      if(k==='broken'||k==='down'){ lsSet(LS_BAD+sp.id,Date.now()+BAD_MS); continue; }   /* 고장 → 다음 Space */
      break; }   /* 한도·대기열·기타 → 멈춤 (한도는 Space 를 바꿔도 같음) */
  }
  throw lastErr||new Error('무료 서버를 찾을 수 없습니다');
}

/* ── 엔진 목록 (교체·추가 가능): {id,label,badge,free?,note,run?({src,prompt,width,height,onPhase})→Blob, start?(st)}
   자동 생성은 free && run 엔진만 (localStorage 'lukeangle.engine' 으로 우선 엔진 지정 가능, 기본 hf).
   내 PC 로컬 AI(ComfyUI) 예:  LukeAngleEngines.register({id:'local',label:'내 PC · 로컬 AI',badge:'무료',free:true,
     run:async({src,prompt,width,height,onPhase})=>{ const base=localStorage.getItem('lukehf.localurl'); onPhase('내 PC 로 보내는 중…');
       const fd=new FormData(); fd.append('image',src,'ref.png'); fd.append('prompt',prompt); fd.append('width',width); fd.append('height',height);
       const r=await fetch(base+'angle',{method:'POST',body:fd}); if(!r.ok) throw new Error('내 PC 응답 '+r.status); return r.blob(); }}) */
const engines=[];
function register(e){ const i=engines.findIndex(x=>x.id===e.id); if(i>=0) engines[i]=e; else engines.push(e); }
const engineById=id=>engines.find(e=>e.id===id)||null;
function autoEngine(){ const free=engines.filter(e=>e.free&&e.run); return free.find(e=>e.id===lsGet('lukeangle.engine'))||free[0]||null; }
register({id:'hf',label:'무료 · 허깅페이스',badge:'무료',free:true,note:'Qwen-Image-Edit-2511 → 고장 시 FLUX.1 Kontext (허깅페이스 무료 GPU · 하루 사용량 제한)',run:hfRun});

/* ── 읽기 전용 조회 ── */
async function detect(){ const A=window.LukeAuth; if(A&&A.detect){ try{ await A.detect(); }catch(e){} } }
/* 뿌리 키의 각도 세트: {front:row, left:row, …} (각도별 최신 1장) */
async function findAngles(rootKey){
  const out={}; if(!H.shared||!rootKey) return out; rootKey=H.cleanKey(rootKey); await detect();
  const filt=H.schemaV2()?'face_id=eq.'+encodeURIComponent(rootKey)+'&title=like.'+encodeURIComponent('*[각도·*')
    :'title=like.'+encodeURIComponent('*[각도·*'+H.faceTag(rootKey).trim());
  const r=await fetch(H.SB+'/rest/v1/'+TABLE()+'?select=*&hidden=eq.false&'+filt+'&order=created_at.desc&limit=24',{headers:H.sbHeaders()});
  if(!r.ok) throw new Error('참고 이미지 확인 실패 ('+r.status+')');
  (await r.json()).forEach(x=>{ const a=angleOf(x); x.url=H.itemUrl(x); if(a&&x.url&&!out[a]) out[a]=x; });
  return out;
}
/* 뿌리 찾기: m-<id> 를 따라 올라감. 반환 {key, item|null, face:boolean} */
const rootCache=new Map();
async function rootOf(item){
  if(!item) return null; const seen=new Set(); let cur=item;
  for(let d=0;d<10;d++){
    if(seen.has(cur.id)) break; seen.add(cur.id);
    const pk=cur.face_id||H.faceOf(cur.title)||'';
    if(!pk) return {key:'m-'+H.cleanKey(cur.id),item:cur,face:false};
    if(pk.indexOf('m-')!==0) return {key:pk,item:null,face:true};
    const pid=pk.slice(2); let p=rootCache.get(pid);
    if(p===undefined){ try{ p=await H.getItem(pid); }catch(e){ p=null; } rootCache.set(pid,p||null); }
    if(!p) return {key:'m-'+H.cleanKey(cur.id),item:cur,face:false};   /* 부모가 사라졌으면 여기가 뿌리 */
    cur=p; }
  return {key:'m-'+H.cleanKey(cur.id),item:cur,face:false};
}
const publicRoot=k=>/^m-/.test(k)||/^r-/.test(k);   /* 내 기기에만 있는 얼굴(u-/x-)은 자동 공개 안 함 */

/* ── 원본 → Blob ── */
async function blobFromUrl(url){
  url=String(url||''); if(!url) throw new Error('원본 주소 없음');
  if(/^data:/i.test(url)) return new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>{ const c=document.createElement('canvas'); c.width=i.naturalWidth; c.height=i.naturalHeight; c.getContext('2d').drawImage(i,0,0); c.toBlob(b=>b?res(b):rej(new Error('변환 실패')),'image/png'); }; i.onerror=()=>rej(new Error('이미지 읽기 실패')); i.src=url; });
  const r=await fetch(url,{mode:'cors'}); if(!r.ok) throw new Error('원본 받기 실패 ('+r.status+')'); return r.blob();
}
const srcOf=(url,kind)=>{ let p=null; return ()=>p||(p=(kind==='video'?H.videoFrame(url,'first'):blobFromUrl(url)).catch(e=>{ p=null; throw e; })); };   /* 4장이 같은 원본을 한 번만 받음 */

/* ── 쿨다운·잠금 ── */
const cooldownLeft=()=>Math.max(0,(+lsGet(LS_COOL)||0)-Date.now());
const mine=new Set();
const lockKey=(k,a)=>LS_LOCK+k+'.'+a;
const lockedByOther=(k,a)=>{ const t=+lsGet(lockKey(k,a))||0; return t&&Date.now()-t<LOCK_MS&&!mine.has(k+'.'+a); };
const failedRecently=k=>{ const t=+lsGet(LS_FAIL+k)||0; return t&&Date.now()-t<FAIL_MS; };
function botLike(){ const n=navigator; return /bot|crawl|spider|slurp|facebookexternalhit|lighthouse|preview/i.test(n.userAgent||'')||!!(n.connection&&n.connection.saveData); }
const QUIET={quota:'무료 한도가 차서 나머지는 나중에 자동으로 만들어요',busy:'무료 서버가 붐벼서 나중에 자동으로 만들어요',down:'무료 서버가 쉬는 중이라 나중에 자동으로 만들어요',broken:'무료 서버가 고장이라 나중에 자동으로 만들어요',error:'자동 생성이 잘 안 됐어요 — 나중에 다시 시도해요'};

/* ── 상태 (뿌리 키별): {state, angles:{front:{state:'done'|'running'|'wait'|'failed', item?, phase?}}, quiet?, text?} ── */
const status=new Map();
function emit(key){ const s=status.get(key); try{ window.dispatchEvent(new CustomEvent('lukeangle:state',{detail:s})); }catch(e){} return s; }
function setState(key,patch){ const prev=status.get(key)||{key,angles:{}}; const s=Object.assign({},prev,patch,{key,at:Date.now()}); if(patch.angles) s.angles=Object.assign({},prev.angles,patch.angles); status.set(key,s); return emit(key); }
function setAngle(key,a,v){ const prev=status.get(key)||{key,angles:{}}; const angles=Object.assign({},prev.angles,{[a]:v}); const patch={angles}; if(v.state==='done'&&v.item) patch.found=Object.assign({},prev.found,{[a]:v.item}); return setState(key,patch); }
const stateOf=key=>status.get(H.cleanKey(key))||null;
function fromFound(found){ const angles={}; ANGLES.forEach(a=>{ angles[a.id]=found[a.id]?{state:'done',item:found[a.id]}:{state:'wait'}; }); return angles; }
const complete=found=>ANGLES.every(a=>found[a.id]);

/* ── 실행: 페이지 안에서는 한 번에 하나(직렬), 뿌리 키별 중복 합침 ── */
let chain=Promise.resolve(); const jobs=new Map();
/* job: {key(뿌리), getSrc, manual?:bool, only?:[각도], force?:bool(있어도 다시), from?:'view'|'upload'} */
function run(job){
  const key=H.cleanKey(job.key); if(!key) return Promise.resolve(null);
  if(jobs.has(key)) return jobs.get(key);
  if(!job.manual){ const s=status.get(key); if(s&&s.state==='complete'&&Date.now()-s.at<10*60000) return Promise.resolve(s); }
  const p=chain.then(()=>exec(Object.assign({},job,{key}))).catch(e=>setState(key,{state:'failed',kind:'error',quiet:QUIET.error,text:String(e&&e.message||e)})).finally(()=>jobs.delete(key));
  jobs.set(key,p); chain=p.then(()=>{},()=>{}); if(!status.get(key)) setState(key,{state:'queued'});
  return p;
}
/* 현재 상태만 읽기(생성 없음) — 패널이 처음 그릴 때 */
async function refresh(key){ key=H.cleanKey(key); try{ const f=await findAngles(key); return setState(key,{state:complete(f)?'complete':(status.get(key)||{}).state==='running'?'running':'partial',angles:fromFound(f),found:f}); }catch(e){ return status.get(key)||null; } }
async function exec(job){
  const key=job.key, manual=!!job.manual;
  if(!H.shared) return setState(key,{state:'off'});
  const eng=autoEngine(); if(!eng) return setState(key,{state:'off'});
  if(!manual){
    if(!publicRoot(key)) return setState(key,{state:'manual'});
    if(botLike()) return setState(key,{state:'skipped'});
  }
  setState(key,{state:'checking'});
  let found=await findAngles(key); setState(key,{angles:fromFound(found),found});
  const todo=ANGLES.filter(a=>(job.only?job.only.includes(a.id):true)&&(job.force||!found[a.id]));
  if(!todo.length) return setState(key,{state:'complete'});
  if(!manual){
    const cl=cooldownLeft(); if(cl) return setState(key,{state:'cooldown',until:Date.now()+cl,quiet:QUIET[lsGet(LS_COOL+'.kind')||'quota']||QUIET.quota});
    if(failedRecently(key)) return setState(key,{state:'failed',kind:'error',quiet:QUIET.error});
  }
  let src=null;
  for(const a of todo){
    if(!manual&&lockedByOther(key,a.id)){ setAngle(key,a.id,{state:'elsewhere'}); continue; }
    lsSet(lockKey(key,a.id),Date.now()); mine.add(key+'.'+a.id);
    try{
      setState(key,{state:'running',current:a.id,from:job.from}); setAngle(key,a.id,{state:'running',phase:'원본 준비 중…'});
      if(!src) src=await job.getSrc();
      let phase=''; const blob=await eng.run({src,prompt:promptFor(a.id),angle:a.id,width:SIZE.width,height:SIZE.height,onPhase:ph=>{ if(ph!==phase){ phase=ph; setAngle(key,a.id,{state:'running',phase:ph}); } }});
      if(!job.force){ const again=await findAngles(key).catch(()=>({})); if(again[a.id]){ setAngle(key,a.id,{state:'done',item:again[a.id]}); found=again; continue; } }   /* 저장 직전 재확인 */
      setAngle(key,a.id,{state:'running',phase:'저장 중…'});
      const ext=(blob.type||'').includes('jpeg')?'jpg':(blob.type||'').includes('webp')?'webp':'png';
      try{ await H.publish(new File([blob],'angle-'+a.id+'.'+ext,{type:blob.type||'image/png'}),TITLE(a),'studio',key);
        found=await findAngles(key).catch(()=>found); setAngle(key,a.id,found[a.id]?{state:'done',item:found[a.id],fresh:true}:{state:'local',blob,url:URL.createObjectURL(blob)}); }
      catch(e){ setAngle(key,a.id,{state:'local',blob,url:URL.createObjectURL(blob),text:'저장 실패: '+(e.message||e)}); }
    }catch(e){
      const x=eng.id==='hf'?hfErrorText(e):{kind:'error',text:'생성 실패: '+(e.message||e)};
      if(x.kind==='quota'){ lsSet(LS_COOL,Date.now()+(x.wait||HOUR)); lsSet(LS_COOL+'.kind','quota'); }
      else if(x.kind==='busy'){ lsSet(LS_COOL,Date.now()+BUSY_MS); lsSet(LS_COOL+'.kind','busy'); }
      else if(x.kind==='down'||x.kind==='broken'){ lsSet(LS_COOL,Date.now()+HOUR); lsSet(LS_COOL+'.kind',x.kind); }
      else lsSet(LS_FAIL+key,Date.now());
      setAngle(key,a.id,{state:'wait'});
      return setState(key,{state:'failed',current:null,kind:x.kind,quiet:QUIET[x.kind]||QUIET.error,text:x.text,manual,from:job.from});   /* 남은 각도는 다음 방문 때 이어서 */
    }finally{ lsSet(lockKey(key,a.id),null); mine.delete(key+'.'+a.id); }
  }
  lsSet(LS_FAIL+key,null);
  return setState(key,{state:ANGLES.every(a=>found[a.id])?'complete':'partial',current:null,from:job.from,justDone:true});
}

/* ── 페이지가 한가해진 뒤 실행 (렌더링을 막지 않음) ── */
function whenIdle(fn,minDelay){
  const go=()=>setTimeout(()=>{ if('requestIdleCallback' in window) requestIdleCallback(()=>fn(),{timeout:5000}); else setTimeout(fn,300); },minDelay==null?1200:minDelay);
  if(document.readyState==='complete') go(); else window.addEventListener('load',go,{once:true});
}
function autoView(key,getSrc){ whenIdle(()=>run({key,getSrc,from:'view'})); }

/* ── 올린 직후: 새 행의 뿌리에 각도가 없으면 올린 사람 브라우저에서 ── */
let uploadQueued=0;
window.addEventListener('lukemedia:inserted',ev=>{
  const row=ev.detail||{}; if(isAngle(row.title)||isSheet(row.title)||!/^(image|video)$/.test(row.kind||'')) return;
  if(uploadQueued>=UPLOAD_QUEUE_MAX) return; uploadQueued++;
  whenIdle(async()=>{
    try{ const col=row.path?'path':'external_url', val=row.path||row.external_url; if(!val) return;
      const r=await fetch(H.SB+'/rest/v1/'+TABLE()+'?select=*&'+col+'=eq.'+encodeURIComponent(val)+'&order=created_at.desc&limit=1',{headers:H.sbHeaders()});
      const x=r.ok?(await r.json())[0]:null; if(!x||isAngle(x)||isSheet(x)) return; x.url=H.itemUrl(x);
      const root=await rootOf(x); if(!root||!publicRoot(root.key)) return;
      if(!root.item) return;   /* 공개 얼굴이 뿌리면 그 얼굴 페이지에서 만듦 */
      const src=srcOf(root.item.url||H.itemUrl(root.item),root.item.kind);
      await run({key:root.key,getSrc:src,from:'upload'}); }
    catch(e){} finally{ uploadQueued--; } },1500);
});

/* ── 올린 직후 자동 생성용 작은 알림 (구석, 방해하지 않게) ── */
let pill=null, pillT=0;
function showPill(text,ms){ if(!document.body) return; if(!pill){ pill=document.createElement('div'); pill.id='lukeAnglePill'; pill.setAttribute('role','status'); pill.style.cssText='position:fixed;left:12px;bottom:12px;z-index:800;max-width:min(320px,calc(100vw - 24px));background:rgba(20,23,31,.94);color:#cdd2df;border:1px solid #2a2f3d;border-radius:10px;padding:7px 11px;font-size:12px;line-height:1.45;box-shadow:0 4px 16px rgba(0,0,0,.35);pointer-events:none'; document.body.appendChild(pill); }
  pill.textContent=text; pill.hidden=false; clearTimeout(pillT); if(ms) pillT=setTimeout(()=>{ if(pill) pill.hidden=true; },ms); }
window.addEventListener('lukeangle:state',ev=>{ const s=ev.detail; if(!s||s.from!=='upload') return;
  if(s.state==='running'){ const a=ANGLE_BY_ID[s.current]; showPill('🧍 올린 인물의 일관성 참고 이미지(정면·왼쪽·오른쪽·뒷모습) 자동 생성 중…'+(a?' '+a.ko:'')); }
  else if(s.justDone&&(s.state==='complete'||s.state==='partial')) showPill('✓ 일관성 참고 이미지 저장됨 — 작품 페이지에서 볼 수 있어요',5000);
  else if(s.state==='failed') showPill(s.quiet||QUIET.error,6000);
  else if(s.state==='cooldown'||s.state==='complete'){ if(pill) pill.hidden=true; } });

window.LukeAngles={ANGLES,ANGLE_BY_ID,SIZE,MARK,TITLE,promptFor,angleOf,isAngle,isSheet,hfToken,setHfToken,hfErrorText,hfRun,findAngles,rootOf,publicRoot,
  run,refresh,autoView,whenIdle,srcOf,blobFromUrl,stateOf,cooldownLeft,engines:()=>engines.slice(),engineById,autoEngine,register,QUIET};
window.LukeAngleEngines={register,list:()=>engines.slice()};
})();
