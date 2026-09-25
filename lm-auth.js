/* lukemodel.com 계정·소유권 모듈 (window.LukeAuth)
   - Supabase Auth: 익명 로그인(방문자가 처음 올리거나 만들 때 조용히 발급) + 선택 로그인(GitHub · 이메일 링크 · Google)으로
     같은 계정을 다른 기기에서도 사용(linkIdentity / updateUser({email})로 익명 계정에 연결 → 기존 작품 소유권 유지).
   - 자동 기능 감지: shared_media 에 owner_id·face_id 열이 있을 때만 켜짐(= /workspace/lukemodel-owner-setup.sql 실행 후).
     그 전에는 아무 것도 불러오지 않고 기존(익명 anon 키) 동작 그대로. LUKE_SHARED.auth=false 면 강제로 끔.
   - supabase-js 는 필요할 때만 CDN(jsDelivr, 버전 고정 + SRI)에서 불러옴.
   의존: /shared-config.js */
'use strict';
(function(){
const CFG=window.LUKE_SHARED||{};
const SB=String(CFG.url||'').replace(/\/$/,''), KEY=CFG.anonKey||'';
const OK=!!(SB&&KEY&&/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SB))&&CFG.auth!==false;
const TABLE=CFG.table||'shared_media';
const SDK_URL='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1/dist/umd/supabase.js';
const SDK_SRI='sha384-K1nraABOP/zFehpLIUksXebbs7jMpB8gYMlb+uhVKZcWT/9Vkq1+qhv6ndC+1Yuz';
const REF=(SB.match(/^https:\/\/([a-z0-9-]+)\./i)||[])[1]||'x';
const STORE_KEY='sb-'+REF+'-auth-token';
const S={schemaV2:false,checked:false,settings:null,client:null,session:null,err:null,notice:null};
const subs=new Set();
function emit(ev){ [...subs].forEach(f=>{ try{ f(ev,api); }catch(e){ console.warn(e); } }); }
function baseHeaders(){ const h={apikey:KEY}; if(/^eyJ/.test(KEY)) h.Authorization='Bearer '+KEY; return h; }
const hasStored=()=>{ try{ return !!localStorage.getItem(STORE_KEY); }catch(e){ return false; } };
function authParams(){ try{ const u=new URL(location.href); const h=new URLSearchParams(u.hash.replace(/^#/,''));
  return {code:u.searchParams.get('code'),err:u.searchParams.get('error_description')||h.get('error_description')||u.searchParams.get('error')||h.get('error'),hashTok:h.has('access_token'),msg:h.get('message')}; }catch(e){ return {}; } }
function cleanUrl(){ try{ const u=new URL(location.href); let ch=false;
  ['code','error','error_code','error_description','sb'].forEach(k=>{ if(u.searchParams.has(k)){ u.searchParams.delete(k); ch=true; } });
  if(/(^#|&)(access_token|error|error_description|message)=/.test(u.hash)){ u.hash=''; ch=true; }
  if(ch) history.replaceState(history.state,'',u.pathname+(u.search||'')+(u.hash||'')); }catch(e){} }

/* ── 1) 기능 감지: owner_id/face_id 열 존재 여부 ── */
let detectP=null;
function detect(){
  if(detectP) return detectP;
  detectP=(async()=>{
    if(!OK) return false;
    try{ const r=await fetch(SB+'/rest/v1/'+TABLE+'?select=owner_id,face_id&limit=1',{headers:baseHeaders()}); S.schemaV2=r.ok; }catch(e){ S.schemaV2=false; }
    S.checked=true; emit('detect');
    if(S.schemaV2){ const p=authParams(); if(hasStored()||p.code||p.err||p.hashTok||p.msg){ try{ await boot(); }catch(e){ console.warn('auth boot',e); } } }
    return S.schemaV2;
  })();
  return detectP;
}
async function settings(){
  if(S.settings) return S.settings;
  try{ const r=await fetch(SB+'/auth/v1/settings',{headers:baseHeaders()}); S.settings=r.ok?await r.json():{external:{}}; }catch(e){ S.settings={external:{}}; }
  return S.settings;
}

/* ── 2) supabase-js 지연 로드 ── */
let sdkP=null;
function loadSdk(){
  if(window.supabase&&window.supabase.createClient) return Promise.resolve(window.supabase);
  if(sdkP) return sdkP;
  sdkP=new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=SDK_URL; s.integrity=SDK_SRI; s.crossOrigin='anonymous'; s.async=true;
    s.onload=()=>window.supabase&&window.supabase.createClient?res(window.supabase):rej(new Error('supabase-js 로드 실패'));
    s.onerror=()=>{ sdkP=null; rej(new Error('supabase-js 를 불러오지 못했습니다')); }; document.head.appendChild(s); });
  return sdkP;
}
let bootP=null;
function boot(){
  if(bootP) return bootP;
  bootP=(async()=>{
    const lib=await loadSdk();
    const p=authParams();
    const c=lib.createClient(SB,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce',storageKey:STORE_KEY}});
    S.client=c;
    c.auth.onAuthStateChange((ev,session)=>{ const before=S.session&&S.session.user&&S.session.user.id; S.session=session||null;
      const after=S.session&&S.session.user&&S.session.user.id; if(before!==after||ev!=='TOKEN_REFRESHED') setTimeout(()=>emit(ev),0); });
    const {data,error}=await c.auth.getSession();
    S.session=(data&&data.session)||null;
    if(p.err){ S.notice={kind:'err',text:friendly(p.err)}; }
    else if(p.code&&S.session){ S.notice={kind:'ok',text:'계정 연결/로그인 완료 — 이제 다른 기기에서도 같은 계정으로 내 작품을 관리할 수 있습니다'}; }
    else if(p.msg){ S.notice={kind:'ok',text:p.msg}; }
    if(error) S.err=error.message;
    cleanUrl(); emit('boot');
    return c;
  })().catch(e=>{ bootP=null; S.err=e.message; throw e; });
  return bootP;
}
function friendly(m){ m=String(m||'');
  if(/already.*(linked|exists)|identity_already_exists/i.test(m)) return '이 계정은 이미 다른 사용자에 연결되어 있습니다. 「기존 계정으로 로그인」을 이용하세요 (이 브라우저의 익명 작품은 익명 계정에 남습니다)';
  if(/manual linking/i.test(m)) return '계정 연결이 아직 꺼져 있습니다 (운영자: Supabase Auth 설정의 Manual linking 을 켜야 함)';
  if(/anonymous/i.test(m)&&/disabled/i.test(m)) return '익명 로그인이 아직 꺼져 있습니다';
  if(/rate limit|too many/i.test(m)) return '요청이 너무 많습니다. 잠시 후 다시 시도하세요 (무료 메일 발송 한도가 시간당 몇 통뿐입니다)';
  return m; }

/* ── 3) 세션 보장: 처음 올리거나 만들 때 익명 계정 자동 발급 ── */
let ensureP=null;
async function ensure(){
  if(!(await detect())) return null;
  if(ensureP) return ensureP;
  ensureP=(async()=>{
    try{
      const c=await boot();
      const {data}=await c.auth.getSession(); S.session=(data&&data.session)||null;   /* 만료 시 자동 갱신 */
      if(S.session) return S.session;
      const st=await settings(); if(!(st.external&&st.external.anonymous_users)) return null;
      const r=await c.auth.signInAnonymously();
      if(r.error){ S.err=friendly(r.error.message); console.warn('anonymous sign-in',r.error); return null; }
      S.session=r.data.session||null; emit('SIGNED_IN'); return S.session;
    }catch(e){ S.err=e.message; return null; }
    finally{ ensureP=null; }
  })();
  return ensureP;
}

/* ── 4) 동기 헬퍼 ── */
const user=()=>S.session&&S.session.user||null;
function headers(extra){ const h={apikey:KEY}; const t=S.session&&S.session.access_token; const exp=S.session&&S.session.expires_at;
  if(t&&(!exp||exp*1000>Date.now()+5000)) h.Authorization='Bearer '+t; else if(/^eyJ/.test(KEY)) h.Authorization='Bearer '+KEY; return Object.assign(h,extra||{}); }
const isMine=row=>{ const u=user(); return !!(S.schemaV2&&u&&row&&row.owner_id&&row.owner_id===u.id); };
const isAnon=()=>{ const u=user(); return !!(u&&(u.is_anonymous||!(u.email||(u.identities||[]).length))); };
function label(){ const u=user(); if(!u) return '로그인'; if(isAnon()) return '익명 계정'; const ids=(u.identities||[]).map(i=>i.provider);
  return u.email||(u.user_metadata&&(u.user_metadata.user_name||u.user_metadata.name))||(ids[0]||'계정'); }
const redirectTo=()=>location.origin+location.pathname+location.search;

/* ── 5) 계정 연결 / 로그인 / 로그아웃 ── */
async function linkOAuth(provider){ const c=await boot(); if(!user()){ await ensure(); }
  if(!user()) throw new Error(S.err||'익명 계정을 만들 수 없습니다');
  const r=await c.auth.linkIdentity({provider,options:{redirectTo:redirectTo()}}); if(r.error) throw new Error(friendly(r.error.message)); return r; }
async function signInOAuth(provider){ const c=await boot(); const r=await c.auth.signInWithOAuth({provider,options:{redirectTo:redirectTo()}}); if(r.error) throw new Error(friendly(r.error.message)); return r; }
async function linkEmail(email){ const c=await boot(); if(!user()) await ensure(); if(!user()) throw new Error(S.err||'익명 계정을 만들 수 없습니다');
  const r=await c.auth.updateUser({email},{emailRedirectTo:redirectTo()}); if(r.error) throw new Error(friendly(r.error.message)); return r; }
async function signInEmail(email){ const c=await boot(); const r=await c.auth.signInWithOtp({email,options:{emailRedirectTo:redirectTo(),shouldCreateUser:true}}); if(r.error) throw new Error(friendly(r.error.message)); return r; }
async function signOut(){ const c=await boot(); await c.auth.signOut(); S.session=null; emit('SIGNED_OUT'); }

/* ── 6) UI: 계정 칩 + 모달 (페이지 CSS 와 무관하게 자체 스타일) ── */
const CSS=`.lma-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:9px;border:1px solid #2a2e38;background:#1c1f26;color:#dfe3ec;font:600 12.5px/1.3 system-ui,sans-serif;cursor:pointer;white-space:nowrap}
.lma-chip:hover{border-color:#4f7cff}.lma-chip i{width:8px;height:8px;border-radius:50%;background:#8d94a5;display:inline-block}.lma-chip.anon i{background:#ffb86c}.lma-chip.perm i{background:#7de2a8}
.lma-ov{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:16px}
.lma-box{background:#15171c;color:#eceef3;border:1px solid #2a2e38;border-radius:16px;width:min(460px,100%);max-height:92vh;overflow:auto;padding:20px;font:14px/1.6 system-ui,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}
.lma-box h3{font-size:17px;margin:0 0 6px}.lma-box p{color:#c3c8d4;font-size:13px;margin:0 0 10px}.lma-box small{color:#8d94a5;font-size:12px}
.lma-box .st{background:#1c1f26;border:1px solid #2a2e38;border-radius:10px;padding:10px 12px;margin:8px 0 12px;font-size:13px}
.lma-box .row{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0}
.lma-box button{font:700 13px system-ui,sans-serif;padding:8px 13px;border-radius:9px;border:1px solid #2a2e38;background:#1c1f26;color:#eceef3;cursor:pointer}
.lma-box button.pri{background:#d1fe17;color:#111;border-color:#d1fe17}.lma-box button:disabled{opacity:.45;cursor:not-allowed}
.lma-box input{width:100%;box-sizing:border-box;background:#1c1f26;border:1px solid #2a2e38;border-radius:9px;padding:9px 11px;color:#eceef3;font:14px system-ui,sans-serif;margin:4px 0}
.lma-box .sec{border-top:1px solid #2a2e38;margin-top:12px;padding-top:12px}.lma-box .msg{font-size:12.5px;margin-top:6px}.lma-box .msg.err{color:#ffb3b3}.lma-box .msg.ok{color:#7de2a8}`;
function ensureCss(){ if(document.getElementById('lma-css')) return; const s=document.createElement('style'); s.id='lma-css'; s.textContent=CSS; document.head.appendChild(s); }
const el=(tag,props,...kids)=>{ const n=document.createElement(tag); if(props) for(const k in props){ const v=props[k]; if(v==null||v===false) continue; if(k==='class') n.className=v; else if(k==='text') n.textContent=v; else if(k.startsWith('on')) n.addEventListener(k.slice(2),v); else n.setAttribute(k,v===true?'':v); } kids.flat().forEach(c=>{ if(c==null||c===false) return; n.appendChild(typeof c==='string'?document.createTextNode(c):c); }); return n; };
const PNAME={github:'GitHub',google:'Google',kakao:'카카오'};
function chip(){
  ensureCss(); const b=el('button',{type:'button',class:'lma-chip',title:'내 작품 관리 계정','aria-label':'내 계정'}); b.hidden=true;
  const draw=()=>{ b.hidden=!S.schemaV2; if(b.hidden) return; const u=user(); b.className='lma-chip'+(u?(isAnon()?' anon':' perm'):''); b.textContent=''; b.append(el('i'),u?(isAnon()?'내 계정 · 익명':'내 계정 · '+label()):'로그인'); };
  b.addEventListener('click',()=>openAccount()); const f=()=>{ if(b._mounted&&!b.isConnected){ subs.delete(f); return; } draw(); }; subs.add(f); setTimeout(()=>{ b._mounted=true; },0);
  draw(); detect(); return b;
}
async function openAccount(){
  ensureCss(); if(!(await detect())) return;
  const ov=el('div',{class:'lma-ov',role:'dialog','aria-modal':'true','aria-label':'내 계정'}); const box=el('div',{class:'lma-box'}); ov.appendChild(box);
  const close=()=>{ ov.remove(); document.removeEventListener('keydown',esc); }; const esc=e=>{ if(e.key==='Escape') close(); };
  ov.addEventListener('click',e=>{ if(e.target===ov) close(); }); document.addEventListener('keydown',esc); document.body.appendChild(ov);
  const msg=el('div',{class:'msg'}); const say=(t,k)=>{ msg.textContent=t||''; msg.className='msg '+(k||''); };
  box.append(el('h3',{text:'내 계정 · 내 작품 관리'}),el('p',{text:'불러오는 중…'}));
  try{ await boot(); }catch(e){ box.lastChild.textContent='계정 기능을 불러오지 못했습니다: '+e.message; return; }
  const st=await settings(); const ext=st.external||{};
  const oauth=['github','google','kakao'].filter(p=>ext[p]); const email=!!ext.email;
  const draw=()=>{
    box.textContent=''; const u=user();
    box.append(el('h3',{text:'내 계정 · 내 작품 관리'}));
    if(!u){ box.append(el('div',{class:'st'},'아직 이 브라우저에 계정이 없습니다.',el('br'),el('small',{text:'이미지·영상을 올리거나 만들면 자동으로 익명 계정이 생겨 내 작품을 직접 삭제할 수 있습니다.'})));
      box.append(el('div',{class:'sec'},el('b',{text:'기존 계정으로 로그인'}),el('p',{text:'다른 기기에서 연결해 둔 계정이 있으면 로그인해 그 계정의 작품을 관리하세요.'}),loginRow())); }
    else if(isAnon()){
      box.append(el('div',{class:'st'},el('b',{text:'익명 계정 (이 브라우저 전용)'}),el('br'),el('small',{text:'ID '+u.id.slice(0,8)+'… · 이 브라우저에서 올리거나 만든 작품은 언제든 직접 삭제할 수 있습니다. 브라우저 데이터를 지우면 삭제 권한을 잃으니, 아래에서 계정을 연결해 두세요.'})));
      const sec=el('div',{class:'sec'},el('b',{text:'계정 연결 (작품 소유권 유지)'}),el('p',{text:'연결하면 지금까지의 작품이 그대로 내 계정에 남고, 다른 기기에서 같은 방법으로 로그인해 관리할 수 있습니다.'}));
      const row=el('div',{class:'row'}); oauth.forEach(p=>row.appendChild(el('button',{type:'button',class:'pri',text:PNAME[p]+'로 연결',onclick:async()=>{ say('이동 중…'); try{ await linkOAuth(p); }catch(e){ say(e.message,'err'); } }})));
      if(oauth.length) sec.appendChild(row);
      if(email){ const inp=el('input',{type:'email',placeholder:'이메일 주소',autocomplete:'email','aria-label':'연결할 이메일'});
        sec.append(inp,el('div',{class:'row'},el('button',{type:'button',text:'이메일로 연결 (확인 메일)',onclick:async()=>{ const v=inp.value.trim(); if(!/^\S+@\S+\.\S+$/.test(v)){ say('이메일 주소를 확인하세요','err'); return; } say('보내는 중…'); try{ await linkEmail(v); say('확인 메일을 보냈습니다. 메일의 링크를 이 브라우저에서 열면 연결이 끝납니다. (무료 메일 발송은 시간당 몇 통으로 제한됩니다)','ok'); }catch(e){ say(e.message,'err'); } }}))); }
      if(!oauth.length&&!email) sec.appendChild(el('p',{text:'아직 연결 가능한 로그인 방법이 켜져 있지 않습니다.'}));
      box.append(sec,el('div',{class:'sec'},el('b',{text:'다른 기기에서 쓰던 계정이 있나요?'}),el('p',{text:'기존 계정으로 로그인하면 이 브라우저의 익명 작품은 익명 계정에 남습니다(합쳐지지 않음).'}),loginRow()));
    } else {
      const ids=(u.identities||[]).map(i=>PNAME[i.provider]||i.provider).filter(x=>x!=='anonymous');
      box.append(el('div',{class:'st'},el('b',{text:'로그인됨: '+label()}),el('br'),el('small',{text:(ids.length?'연결: '+ids.join(', ')+' · ':'')+'다른 기기에서도 같은 방법으로 로그인하면 내 작품을 삭제·관리할 수 있습니다.'})));
      const more=oauth.filter(p=>!(u.identities||[]).some(i=>i.provider===p));
      if(more.length){ const row=el('div',{class:'row'}); more.forEach(p=>row.appendChild(el('button',{type:'button',text:PNAME[p]+' 추가 연결',onclick:async()=>{ try{ await linkOAuth(p); }catch(e){ say(e.message,'err'); } }}))); box.appendChild(row); }
      box.appendChild(el('div',{class:'row'},el('button',{type:'button',text:'로그아웃',onclick:async()=>{ await signOut(); draw(); say('로그아웃했습니다','ok'); }})));
    }
    box.append(msg,el('div',{class:'row',style:'justify-content:flex-end;margin-top:12px'},el('button',{type:'button',text:'닫기',onclick:close})));
    if(S.notice){ say(S.notice.text,S.notice.kind); S.notice=null; }
  };
  function loginRow(){ const w=el('div'); const row=el('div',{class:'row'}); oauth.forEach(p=>row.appendChild(el('button',{type:'button',text:PNAME[p]+'로 로그인',onclick:async()=>{ say('이동 중…'); try{ await signInOAuth(p); }catch(e){ say(e.message,'err'); } }}))); w.appendChild(row);
    if(email){ const inp=el('input',{type:'email',placeholder:'이메일 주소 (로그인 링크 받기)',autocomplete:'email','aria-label':'로그인 이메일'});
      w.append(inp,el('div',{class:'row'},el('button',{type:'button',text:'로그인 링크 보내기',onclick:async()=>{ const v=inp.value.trim(); if(!/^\S+@\S+\.\S+$/.test(v)){ say('이메일 주소를 확인하세요','err'); return; } say('보내는 중…'); try{ await signInEmail(v); say('로그인 링크를 보냈습니다. 메일의 링크를 이 브라우저에서 여세요.','ok'); }catch(e){ say(e.message,'err'); } }}))); }
    if(!oauth.length&&!email) w.appendChild(el('p',{text:'아직 로그인 방법이 켜져 있지 않습니다.'})); return w; }
  subs.add(function f(){ if(!ov.isConnected){ subs.delete(f); return; } draw(); });
  draw();
}
/* 로그인·연결 직후 돌아왔을 때 결과 알림 */
function takeNotice(){ const n=S.notice; S.notice=null; return n; }

const api={detect,ensure,boot,settings,headers,isMine,isAnon,user,label,chip,openAccount,linkOAuth,signInOAuth,linkEmail,signInEmail,signOut,takeNotice,
  onChange:f=>{ subs.add(f); return ()=>subs.delete(f); },
  enabled:()=>S.schemaV2, get schemaV2(){ return S.schemaV2; }, get checked(){ return S.checked; }, get error(){ return S.err; }, _S:S};
window.LukeAuth=api;
if(OK) detect();
})();
