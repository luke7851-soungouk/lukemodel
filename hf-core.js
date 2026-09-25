/* lukemodel.com 공용 Higgsfield · Supabase 모듈 (window.LukeHF)
   - /higgsfield/ 스튜디오와 얼굴 상세 페이지(「이 얼굴로 힉스필드 제작」)가 함께 사용합니다.
   - 생성: 방문자 본인의 Higgsfield 키(localStorage 'lukehf.key') → platform.higgsfield.ai 직접 호출.
   - 저장: 완성된 결과 파일을 Supabase public-media 버킷에 복사하고 shared_media 행을 추가(홈 공개 갤러리).
     얼굴 상세에서 만든 결과는 제목 끝에 ' #face:<얼굴키>' 태그를 붙여 얼굴별로 다시 불러옵니다.
   독립 구현(OpenHiggsfield 코드 복사 없음). 의존성 없음. */
'use strict';
(function(){
const API='https://platform.higgsfield.ai';
const LS_KEY='lukehf.key';
const POLL_MS=4000, DEADLINE_MS=10*60*1000;
const uid=()=>(crypto.randomUUID?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g,()=>(Math.random()*16|0).toString(16)));

/* ───────── 모델 카탈로그 (엔드포인트 = Higgsfield platform API 경로) ───────── */
const IMG_AR=['1:1','4:3','3:4','16:9','9:16','3:2','2:3'];
const VID_AR=['16:9','9:16','1:1'];
const SD_AR=['16:9','4:3','1:1','3:4','9:16','21:9'];
const img=(id,label,path,extra)=>Object.assign({id,label,kind:'image',t:path,roles:{},s:{ar:IMG_AR,res:['1k','2k','4k']}},extra||{});
const vid=(id,label,t,i,extra)=>Object.assign({id,label,kind:'video',t,i,roles:i?{start:1}:{},s:{ar:VID_AR,res:['720p','1080p'],dur:[5,8,10]}},extra||{});
const t2v=p=>[p,p.replace(/text-to-video$/,'image-to-video')];
/* Soul: 참고 이미지가 있으면 higgsfield-ai/soul/reference (image_reference_url, 720p/1080p, batch 1|4) */
const soul=(id,label,path)=>({id,label,kind:'image',t:path,r:'higgsfield-ai/soul/reference',roles:{ref:1},refNote:'Soul Reference',s:{ar:['9:16','16:9','4:3','3:4','1:1','2:3','3:2'],res:['720p','1080p'],batchNative:true},
  body:(p,s)=>{ const b={prompt:p.prompt,batch_size:s.batch>1?4:1,resolution:s.res,aspect_ratio:s.ar,enhance_prompt:false}; if(p.refs.length) b.image_reference_url=p.refs[0]; return b; }});
const seed=(id,label,prefix,res)=>({id,label,kind:'video',t:prefix+'/text-to-video',i:prefix+'/image-to-video',roles:{start:1,end:1},s:{ar:SD_AR,res,dur:[4,5,8,10,12,15],audio:true},
  body:(p,s)=>{ const b={prompt:p.prompt,resolution:s.res,duration:+s.dur,generate_audio:!!s.audio}; if(p.start){ b.image_url=p.start; if(p.end) b.end_image_url=p.end; } else b.aspect_ratio=s.ar; return b; }});
const kling3=(id,label,prefix)=>({id,label,kind:'video',t:prefix+'/text-to-video',i:prefix+'/image-to-video',roles:{start:1,end:1},s:{ar:VID_AR,dur:[5,8,10,15],audio:true},
  body:(p,s)=>{ const b={prompt:p.prompt,sound:s.audio?'on':'off',duration:+s.dur,cfg_scale:0.5,multi_shots:false}; if(p.start){ b.image_url=p.start; if(p.end) b.last_image_url=p.end; } else b.aspect_ratio=s.ar; return b; }});
const MODELS=[
  soul('soul-2','Soul 2','higgsfield-ai/soul/v2/standard'),
  soul('soul-cinema','Soul Cinema','higgsfield-ai/soul/cinema'),
  img('z-image-turbo','Z-Image Turbo','z-image/turbo'),
  img('flux-2','Flux 2 Pro','flux-2-pro'),
  /* Ideogram 4.0: image_url + image_weight(1–100), 해상도 파라미터 없음 */
  {id:'ideogram-4',label:'Ideogram 4.0',kind:'image',t:'ideogram/v4.0',roles:{ref:1},s:{ar:['1:1','4:3','3:4','16:9','9:16','3:2','2:3','4:5','5:4'],weight:[20,40,60,80,100]},
    body:(p,s)=>{ const b={prompt:p.prompt,aspect_ratio:s.ar,rendering_speed:'DEFAULT'}; if(p.refs.length){ b.image_url=p.refs[0]; b.image_weight=+s.weight||60; } return b; }},
  img('recraft-4.1','Recraft 4.1','recraft/v4.1/text-to-image'),
  /* Qwen Image 3: 참고 이미지가 있으면 alibaba/qwen-image-3/edit (image_urls 1–3) */
  {id:'qwen-image-3',label:'Qwen Image 3',kind:'image',t:'alibaba/qwen-image-3/text-to-image',r:'alibaba/qwen-image-3/edit',roles:{ref:3},s:{ar:['1:1','4:3','3:4','16:9','9:16','3:2','2:3','21:9'],res:['1k','2k']},
    body:(p,s)=>{ const b={prompt:p.prompt,resolution:s.res,aspect_ratio:s.ar}; if(p.refs.length) b.image_urls=p.refs.slice(0,3); return b; }},
  img('grok-imagine-2','Grok Imagine 2.0','xai/grok-imagine-image-2.0'),
  seed('seedance-2.5','Seedance 2.5','bytedance/seedance-2.5',['480p','720p']),
  seed('seedance-2','Seedance 2.0','bytedance/seedance-2.0',['480p','720p','1080p']),
  seed('seedance-2-fast','Seedance 2.0 Fast','bytedance/seedance-2.0/fast',['480p','720p']),
  {id:'kling-3-turbo',label:'Kling 3.0 Turbo',kind:'video',t:'kling-video/v3.0-turbo/text-to-video',i:'kling-video/v3.0-turbo/image-to-video',roles:{start:1},s:{ar:VID_AR,res:['720p','1080p'],dur:[5,8,10,15]},
    body:(p,s)=>{ const b={prompt:p.prompt,duration:+s.dur,resolution:s.res}; if(p.start) b.image_url=p.start; else b.aspect_ratio=s.ar; return b; }},
  kling3('kling-3-std','Kling 3.0 Standard','kling-video/v3.0/std'),
  kling3('kling-3-pro','Kling 3.0 Pro','kling-video/v3.0/pro'),
  vid('kling-2.6','Kling 2.6 Pro',...t2v('kling-video/v2.6/pro/text-to-video')),
  {id:'kling-2.5-turbo-pro',label:'Kling 2.5 Turbo Pro',kind:'video',t:'kling-video/v2.5-turbo/pro/text-to-video',i:'kling-video/v2.5-turbo/pro/image-to-video',roles:{start:1},s:{dur:[5,10]},
    body:(p,s)=>{ const b={prompt:p.prompt,duration:+s.dur,cfg_scale:0.5}; if(p.start) b.image_url=p.start; return b; }},
  {id:'hailuo-2.3',label:'MiniMax Hailuo 2.3',kind:'video',t:'minimax/hailuo-2.3/standard/text-to-video',i:'minimax/hailuo-2.3/standard/image-to-video',roles:{start:1},s:{dur:[6,10]},
    body:(p,s)=>{ const b={prompt:p.prompt,duration:+s.dur,prompt_optimizer:true}; if(p.start) b.image_url=p.start; return b; }},
  vid('minimax-h3','MiniMax H3',...t2v('minimax/h3/text-to-video')),
  vid('wan-3','Wan 3.0',...t2v('alibaba/wan-3.0/text-to-video')),
  vid('wan-3-prime','Wan 3.0 Prime',...t2v('alibaba/wan-3.0-prime/text-to-video')),
  vid('wan-2.6','Wan 2.6',...t2v('wan/v2.6/text-to-video')),
  vid('pixverse-6','PixVerse 6',...t2v('pixverse/v6/text-to-video')),
  vid('ltx-2.5-fast','LTX 2.5 Fast','lightricks/ltx-2.5/text-to-video/fast','lightricks/ltx-2.5/image-to-video/fast'),
  vid('happy-horse-1.1','Happy Horse 1.1',...t2v('alibaba/happy-horse/v1.1/text-to-video')),
  {id:'dop',label:'Higgsfield DoP (이미지→영상)',kind:'video',t:null,i:'higgsfield-ai/dop/lite',roles:{start:1},needStart:true,s:{ar:VID_AR,res:['720p','1080p'],dur:[5,8,10]}},
];
const modelById=id=>MODELS.find(m=>m.id===id)||MODELS[0];
function defaultsFor(m){ const s=m.s; return {ar:s.ar?s.ar[0]:null,res:s.res?s.res[0]:null,dur:s.dur?String(s.dur.includes(5)?5:s.dur[0]):null,audio:!!s.audio,batch:1,weight:s.weight?'60':null}; }
/* 저장된 설정을 모델이 허용하는 값으로 보정 */
function fixSettings(m,saved){ const d=defaultsFor(m); const s=Object.assign({},d,saved||{});
  if(m.s.ar&&!m.s.ar.includes(s.ar)) s.ar=d.ar; if(m.s.res&&!m.s.res.includes(s.res)) s.res=d.res; if(m.s.weight&&!m.s.weight.map(String).includes(String(s.weight))) s.weight=d.weight; if(m.s.dur&&!m.s.dur.map(String).includes(String(s.dur))) s.dur=d.dur; return s; }
const REF_MODELS=()=>MODELS.filter(m=>m.kind==='image'&&m.roles.ref).map(m=>m.label).join(', ');
/* media: {start:{url,uploading}, end:{…}, ref:[{url,uploading}…]} → {path, body} */
function buildRequest(m,prompt,media,s){
  const all=[media.start,media.end,...(media.ref||[])].filter(Boolean);
  if(all.some(x=>x.uploading)) throw new Error('입력 이미지를 업로드하는 중입니다. 잠시 후 다시 누르세요');
  const refs=m.roles.ref?(media.ref||[]).slice(0,m.roles.ref).map(x=>x.url):[];
  const p={prompt,start:m.roles.start&&media.start&&media.start.url,end:m.roles.end&&media.end&&media.end.url,refs};
  if(m.needStart&&!p.start) throw new Error(m.label+' 모델은 시작 프레임(이미지)이 필요합니다');
  const path=(p.refs.length&&m.r)?m.r:(p.start&&m.i)?m.i:(m.t||m.i);
  if(!path) throw new Error('이 모델의 엔드포인트가 없습니다');
  let body;
  if(m.body) body=m.body(p,s);
  else{ body={prompt}; if(s.ar&&!p.start) body.aspect_ratio=s.ar; if(s.res) body.resolution=s.res; if(s.dur&&m.kind==='video') body.duration=+s.dur;
    if(p.start&&m.i) body.image_url=p.start; }
  return {path,body};
}

/* ───────── 키 (스튜디오와 같은 localStorage 키) ───────── */
const getKey=()=>{ try{return (localStorage.getItem(LS_KEY)||'').trim();}catch(e){return '';} };
const validKey=v=>/^[^:\s]+:[^:\s]+$/.test(String(v||'').trim());
function setKey(v){ v=String(v||'').trim(); try{ v?localStorage.setItem(LS_KEY,v):localStorage.removeItem(LS_KEY); }catch(e){} }

/* ───────── Higgsfield API ───────── */
function authHeaders(json){ const h={Authorization:'Key '+getKey()}; if(json) h['Content-Type']='application/json'; return h; }
function errText(status,j){ if(j&&typeof j.detail==='string') return j.detail; if(j&&Array.isArray(j.detail)) return j.detail.map(d=>(d.loc?d.loc.slice(-1)[0]+': ':'')+(d.msg||'')).join(' · '); if(status===401) return '키가 올바르지 않습니다 (Invalid credentials)'; if(status===402) return '크레딧 부족'; if(status===429) return '요청이 너무 많습니다. 잠시 후 다시 시도'; return '요청 실패 ('+status+')'; }
async function hfFetch(url,opts){ const r=await fetch(url,opts); const txt=await r.text(); let j=null; try{ j=txt?JSON.parse(txt):null; }catch(e){ j={detail:txt.slice(0,200)}; } if(!r.ok){ const e=new Error(errText(r.status,j)); e.status=r.status; throw e; } return j; }
async function hfSubmit(path,body){ return hfFetch(API+'/'+path,{method:'POST',headers:authHeaders(true),body:JSON.stringify(body)}); }
async function hfStatus(id){ return hfFetch(API+'/requests/'+encodeURIComponent(id)+'/status',{headers:authHeaders(false)}); }
async function hfUpload(file){
  const ct=file.type==='image/jpg'?'image/jpeg':file.type;
  if(!/^(image\/(jpeg|png|webp|gif)|video\/mp4|audio\/(wav|x-wav))$/.test(ct)) throw new Error('Higgsfield 입력은 JPG/PNG/WEBP/GIF/MP4만 지원합니다');
  let up=null, lastErr=null;
  for(const base of [API,'https://api.higgsfield.ai']){ try{ up=await hfFetch(base+'/files/generate-upload-url',{method:'POST',headers:authHeaders(true),body:JSON.stringify({content_type:ct})}); break; }catch(e){ lastErr=e; if(e.status===401) break; } }
  if(!up) throw lastErr||new Error('업로드 URL 발급 실패');
  const r=await fetch(up.upload_url,{method:'PUT',headers:up.upload_headers||{'Content-Type':ct},body:file});
  if(!r.ok) throw new Error('파일 전송 실패 ('+r.status+')');
  return up.public_url;
}
/* 상태 응답 해석: {state:'done',urls,kind} | {state:'failed',error} | {state:'pending',phase} */
function readStatus(j){
  const st=String(j&&j.status||'').toLowerCase();
  if(st==='completed'){ const urls=[]; (j.images||[]).forEach(x=>x&&x.url&&urls.push(x.url)); if(j.video&&j.video.url) urls.push(j.video.url);
    if(!urls.length) return {state:'failed',error:'결과 URL이 없습니다'};
    return {state:'done',urls,kind:j.video&&j.video.url?'video':'image'}; }
  if(st==='failed'||st==='nsfw'||st==='canceled'||st==='cancelled') return {state:'failed',error:st==='nsfw'?'안전 필터(NSFW)로 거부됨 — 크레딧 환불':st==='failed'?'생성 실패 — 크레딧 환불':'취소됨'};
  return {state:'pending',phase:st};
}
/* 완료될 때까지 폴링. opts.alive()가 false면 중단(null 반환), opts.onPhase(phase) */
async function waitForResult(requestId,since,opts){
  opts=opts||{}; const start=since||Date.now(); const poll=opts.pollMs||POLL_MS;
  while(Date.now()-start<DEADLINE_MS){
    await new Promise(z=>setTimeout(z,poll));
    if(opts.alive&&!opts.alive()) return null;
    let j; try{ j=await hfStatus(requestId); }catch(e){ if(e.status===401||e.status===404) throw e; continue; }
    const r=readStatus(j);
    if(r.state==='done') return r;
    if(r.state==='failed') throw new Error(r.error);
    if(opts.onPhase) opts.onPhase(r.phase);
  }
  throw new Error('10분 시간 초과 (나중에 다시 확인하세요)');
}

/* ───────── Supabase 공개 저장소 ───────── */
const CFG=window.LUKE_SHARED||{};
const shared=!!(CFG.url&&CFG.anonKey&&/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(String(CFG.url).replace(/\/$/,'')));
const SB=shared?String(CFG.url).replace(/\/$/,''):'';
const BUCKET=CFG.bucket||'public-media', TABLE=CFG.table||'shared_media';
const MAX_IMG=(CFG.maxImageMB||10)*1048576, MAX_VID=(CFG.maxVideoMB||50)*1048576;
const OK_MIME={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','video/mp4':'mp4','video/webm':'webm','video/quicktime':'mov'};
function sbHeaders(extra){ const h={apikey:CFG.anonKey}; if(/^eyJ/.test(CFG.anonKey||'')) h.Authorization='Bearer '+CFG.anonKey; return Object.assign(h,extra||{}); }
const pubUrl=path=>SB+'/storage/v1/object/public/'+encodeURIComponent(BUCKET)+'/'+String(path).split('/').map(encodeURIComponent).join('/');
const itemUrl=x=>x.path?pubUrl(x.path):(/^https:\/\//.test(x.external_url||'')?x.external_url:null);
async function sniff(file){ const b=new Uint8Array(await file.slice(0,16).arrayBuffer()); const hex=[...b].map(x=>x.toString(16).padStart(2,'0')).join(''); const asc=String.fromCharCode(...b);
  if(hex.startsWith('ffd8ff')) return 'image/jpeg'; if(hex.startsWith('89504e47')) return 'image/png'; if(asc.startsWith('GIF8')) return 'image/gif';
  if(asc.startsWith('RIFF')&&asc.slice(8,12)==='WEBP') return 'image/webp'; if(hex.startsWith('1a45dfa3')) return 'video/webm';
  if(asc.slice(4,8)==='ftyp') return asc.slice(8,10)==='qt'?'video/quicktime':'video/mp4'; return null; }
async function validateUpload(file){
  const real=await sniff(file); if(!real||!OK_MIME[real]) throw new Error('허용 형식: JPG·PNG·WEBP·GIF 이미지, MP4·WEBM·MOV 영상 (실행 파일·기타 형식 불가)');
  const isVid=real.startsWith('video/'); if(file.size>(isVid?MAX_VID:MAX_IMG)) throw new Error((isVid?'영상':'이미지')+' 최대 '+Math.round((isVid?MAX_VID:MAX_IMG)/1048576)+'MB');
  return {mime:real,kind:isVid?'video':'image',ext:OK_MIME[real]};
}
/* 버킷 정책상 경로는 YYYY/MM/<uuid>.<ext> 형식만 허용 */
function newPath(ext){ const d=new Date(); return d.getUTCFullYear()+'/'+String(d.getUTCMonth()+1).padStart(2,'0')+'/'+uid()+'.'+ext; }
async function putObject(file,v){
  const path=newPath(v.ext);
  const r=await fetch(SB+'/storage/v1/object/'+encodeURIComponent(BUCKET)+'/'+path,{method:'POST',headers:sbHeaders({'Content-Type':v.mime,'x-upsert':'false','cache-control':'31536000'}),body:file});
  if(!r.ok){ let t=''; try{t=(await r.json()).message||'';}catch(e){} throw new Error('업로드 실패 ('+r.status+') '+t); }
  return path;
}
async function insertRow(row){
  const r=await fetch(SB+'/rest/v1/'+TABLE,{method:'POST',headers:sbHeaders({'Content-Type':'application/json',Prefer:'return=minimal'}),body:JSON.stringify(row)});
  if(!r.ok){ let t=''; try{t=(await r.json()).message||'';}catch(e){} const e=new Error('목록 등록 실패 ('+r.status+') '+t); e.status=r.status; throw e; }
}
/* ── 얼굴 태그: 제목(최대 80자) 끝에 ' #face:<key>' ── */
const FACE_TAG_RE=/\s*#face:[a-z0-9-]{1,40}$/;
const cleanKey=k=>String(k||'').toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,40);
const faceTag=k=>' #face:'+cleanKey(k);
function makeTitle(text,faceKey){ const clean=String(text||'').replace(/[\u0000-\u001f<>]/g,'').trim();
  if(!faceKey) return clean.slice(0,80); const tag=faceTag(faceKey); return clean.replace(FACE_TAG_RE,'').slice(0,80-tag.length).trim()+tag; }
const displayTitle=t=>String(t||'').replace(FACE_TAG_RE,'').trim();
const faceOf=t=>{ const m=String(t||'').match(/#face:([a-z0-9-]{1,40})$/); return m?m[1]:null; };
/* 공개 갤러리에 파일 + 목록 행 등록 (shared 모드 전용) */
async function publish(file,title,source,faceKey){
  if(!shared) throw new Error('공유 저장소가 설정되지 않았습니다');
  const v=await validateUpload(file); const path=await putObject(file,v);
  await insertRow({path,kind:v.kind,mime:v.mime,size:file.size,title:makeTitle(title,faceKey)||null,source:source||'upload'});
  return {path,kind:v.kind,mime:v.mime,size:file.size};
}
/* 참고/시작 이미지용: 파일만 올리고(갤러리 행 없음) 공개 URL 반환. 저장소 미설정 시 Higgsfield 업로드 */
async function uploadInput(file){
  if(!/^image\/(jpeg|jpg|png|webp|gif)$/.test(file.type)) throw new Error('JPG·PNG·WEBP·GIF 이미지만 가능합니다');
  if(file.size>MAX_IMG) throw new Error('이미지 최대 '+Math.round(MAX_IMG/1048576)+'MB');
  if(shared){ const v=await validateUpload(file); return pubUrl(await putObject(file,v)); }
  if(!getKey()) throw new Error('파일 업로드에는 Higgsfield 키가 필요합니다(공유 저장소 미설정)');
  return hfUpload(file);
}
/* 완성된 결과(Higgsfield URL)를 공개 갤러리에 등록: 파일 복사 우선, 실패 시 원본 링크(external_url) 행.
   반환 {share:'done',path} | {share:'external',why}. 둘 다 실패하면 throw */
async function shareResult(o){
  if(!shared) throw new Error('공유 저장소가 설정되지 않았습니다');
  const title=makeTitle(o.title,o.faceKey);
  let blob=null, why='';
  try{ const resp=await fetch(o.url,{mode:'cors',cache:'no-store'}); if(!resp.ok) throw new Error('HTTP '+resp.status);
    const len=+resp.headers.get('content-length')||0; if(len&&len>(o.kind==='video'?MAX_VID:MAX_IMG)) throw new Error('파일이 너무 큼 ('+(len/1048576).toFixed(1)+'MB)');
    blob=await resp.blob(); }
  catch(e){ why=e.message||'fetch 실패'; }
  if(blob){ try{ const res=await publish(new File([blob],'result',{type:blob.type}),title,'studio'); return {share:'done',path:res.path,mime:res.mime,size:res.size}; }catch(e){ why=e.message; } }
  try{ await insertRow({path:null,external_url:o.url,kind:o.kind,mime:o.kind==='video'?'video/mp4':'image/png',size:1,title,source:'studio'}); return {share:'external',why}; }
  catch(e){ const err=new Error(why||e.message); err.why=why; throw err; }
}
/* 얼굴별 목록 (최신순). before: created_at 키셋 */
async function listByFace(faceKey,opts){
  opts=opts||{}; if(!shared) return [];
  let q=SB+'/rest/v1/'+TABLE+'?select=*&hidden=eq.false&title=like.*'+encodeURIComponent(faceTag(faceKey).trim())+'&order=created_at.desc,id.desc&limit='+(opts.limit||24);
  if(opts.before) q+='&created_at=lt.'+encodeURIComponent(opts.before);
  if(opts.after) q+='&created_at=gt.'+encodeURIComponent(opts.after);
  const r=await fetch(q,{headers:sbHeaders()}); if(!r.ok) throw new Error('목록 불러오기 실패 ('+r.status+')');
  const rows=await r.json(); rows.forEach(x=>{ x.url=itemUrl(x); }); return rows.filter(x=>x.url);
}

/* ───────── 다운로드 (실제 파일 저장) ───────── */
function fname(it,i){ const ext=(it.mime&&OK_MIME[it.mime])||(it.kind==='video'?'mp4':(String(it.url||'').match(/\.(png|jpe?g|webp|gif)(\?|$)/i)||[,'png'])[1]); return 'lukemodel-'+(it.model||it.source||'media')+'-'+new Date(it.createdAt||it.created_at||Date.now()).toISOString().slice(0,19).replace(/[:T]/g,'')+(i!=null?'-'+(i+1):'')+'.'+ext; }
function saveBlob(b,name){ const u=URL.createObjectURL(b); const a=document.createElement('a'); a.href=u; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(u),4000); }
/* Supabase 파일은 ?download= (서버가 attachment로 응답) → 새 탭 없이 파일 저장. 그 외는 blob으로 받아 저장, 실패 시 새 탭 */
async function download(it,i){
  const name=fname(it,i);
  if(it.blob){ saveBlob(it.blob,name); return true; }
  if(it.path&&shared){ const a=document.createElement('a'); a.href=pubUrl(it.path)+'?download='+encodeURIComponent(name); a.rel='noopener'; document.body.appendChild(a); a.click(); a.remove(); return true; }
  try{ const r=await fetch(it.url,{mode:'cors'}); if(!r.ok) throw new Error(r.status); saveBlob(await r.blob(),name); return true; }
  catch(e){ window.open(it.url,'_blank','noopener'); return false; }
}

window.LukeHF={API,LS_KEY,POLL_MS,DEADLINE_MS,uid,MODELS,modelById,defaultsFor,fixSettings,REF_MODELS,buildRequest,
  getKey,setKey,validKey,hfFetch,hfSubmit,hfStatus,hfUpload,readStatus,waitForResult,
  CFG,shared,SB,MAX_IMG,MAX_VID,OK_MIME,sbHeaders,pubUrl,itemUrl,sniff,validateUpload,insertRow,publish,uploadInput,shareResult,listByFace,
  faceTag,makeTitle,displayTitle,faceOf,cleanKey,fname,saveBlob,download};
})();
