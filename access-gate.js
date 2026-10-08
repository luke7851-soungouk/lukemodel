/* Member approval for downloading and using LUKE MODEL materials. */
'use strict';
(() => {
  const endpoint=window.LUKE_SHARED?.hairBackendUrl;
  let state='unknown',owner=false,loadedAt=0,loading=null,dialog=null;
  const auth=()=>window.LukeAuth;
  const el=(tag,props={},...children)=>{const node=document.createElement(tag);for(const [key,value] of Object.entries(props)){if(key==='text')node.textContent=value;else if(key==='class')node.className=value;else if(key==='onclick')node.onclick=value;else node.setAttribute(key,value);}children.forEach(child=>node.append(child));return node;};
  async function call(action,init={}){
    const a=auth();if(!a||!endpoint)throw new Error('회원 승인 서버가 연결되지 않았습니다.');
    await a.ensure();if(!a.user()||a.isAnon())throw new Error('먼저 회원으로 로그인해 주세요.');
    const response=await fetch(endpoint+'?action='+action,{...init,headers:{...a.headers(),...(init.headers||{})}});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||'승인 상태를 확인하지 못했습니다.');
    return result;
  }
  async function check(force=false){
    if(!force&&Date.now()-loadedAt<30000)return state;
    if(loading)return loading;
    loading=(async()=>{try{const result=await call('access-status');state=result.status||'none';owner=!!result.owner;loadedAt=Date.now();return state;}catch(e){state='unknown';loadedAt=0;return state;}finally{loading=null;}})();
    return loading;
  }
  function show(message=''){
    if(dialog?.isConnected){if(message)dialog.querySelector('[data-message]').textContent=message;return;}
    const overlay=el('div',{class:'luke-access-overlay'}),box=el('section',{class:'luke-access-dialog',role:'dialog','aria-modal':'true','aria-label':'자료 사용 승인'});
    const close=el('button',{type:'button',class:'luke-access-close',text:'×','aria-label':'닫기',onclick:()=>{overlay.remove();dialog=null;}});
    const heading=el('h2',{text:'자료 사용 승인'}),desc=el('p',{text:'회원 가입은 바로 할 수 있습니다. 모델·상품·갤러리 자료를 다운로드하거나 제작에 사용하려면 운영자의 승인이 필요합니다.'});
    const msg=el('p',{'data-message':'',class:'luke-access-message',text:message||({pending:'승인 요청을 보냈습니다. 운영자가 확인 중입니다.',rejected:'요청이 반려되었습니다. 사용 목적을 다시 적어 신청할 수 있습니다.',unknown:'로그인과 승인 상태를 확인해 주세요.'}[state]||'사용 목적을 적어 승인 요청을 보내 주세요.')});
    const area=el('textarea',{placeholder:'사용 목적을 적어 주세요 (예: 쇼핑몰 상품 사진 제작)','aria-label':'사용 목적',maxlength:'500'});
    const send=el('button',{type:'button',class:'luke-access-send',text:state==='pending'?'승인 대기 중':'승인 요청 보내기'});send.disabled=state==='pending';
    send.onclick=async()=>{send.disabled=true;msg.textContent='요청을 보내는 중입니다…';try{const result=await call('access-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'all',id:'*',purpose:area.value.trim()})});state=result.status||'pending';loadedAt=Date.now();msg.textContent='승인 요청을 보냈습니다. 운영자가 확인 후 이용할 수 있습니다.';send.textContent='승인 대기 중';}catch(e){msg.textContent=e.message;send.disabled=false;}};
    const actions=el('div',{class:'luke-access-actions'});actions.append(send,el('button',{type:'button',text:'닫기',onclick:()=>{overlay.remove();dialog=null;}}));
    box.append(close,heading,desc,msg,area,actions);overlay.append(box);overlay.onclick=e=>{if(e.target===overlay){overlay.remove();dialog=null;}};
    if(!document.getElementById('luke-access-style')){const style=el('style',{id:'luke-access-style'});style.textContent='.luke-access-overlay{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:#05060bc9;padding:18px}.luke-access-dialog{position:relative;width:min(460px,100%);padding:27px;background:#171b25;color:#fff;border:1px solid #50596b;border-radius:18px;box-shadow:0 25px 80px #0008;font:15px system-ui}.luke-access-dialog h2{margin:0 0 10px;font-size:23px}.luke-access-dialog p{line-height:1.6;color:#d2d7e1}.luke-access-message{background:#263024;border-radius:10px;padding:11px}.luke-access-dialog textarea{box-sizing:border-box;width:100%;min-height:90px;padding:11px;background:#10141d;color:#fff;border:1px solid #596273;border-radius:9px;font:15px system-ui}.luke-access-actions{display:flex;gap:9px;margin-top:13px}.luke-access-dialog button{cursor:pointer;border-radius:9px;border:1px solid #555f71;background:#30384a;color:#fff;padding:10px 14px}.luke-access-dialog button:disabled{opacity:.55}.luke-access-dialog .luke-access-send{background:#c9fb68;color:#152009;font-weight:800}.luke-access-close{position:absolute;right:15px;top:12px;font-size:23px}';document.head.append(style);}
    document.body.append(overlay);dialog=overlay;area.focus();
  }
  async function requireApproval(){
    const a=auth();if(!a){show('회원 인증을 불러오지 못했습니다. 새로고침해 주세요.');return false;}
    await a.ensure();if(!a.user()||a.isAnon()){a.openAccount();return false;}
    const current=await check();if(current==='approved')return true;show();return false;
  }
  function guardedTarget(target){
    const node=target instanceof Element?target.closest('a,button,[role="button"]'):null;
    if(!node)return null;
    if(node.matches('[download],.hs-dl,.hs-use,.md-dl,.dlbtn,.cast-dl,.cast-go,.cast-vid,[data-requires-approval]'))return node;
    if(node.closest('#model-studio-panel')&&/생성|만들기|적용|다운로드/.test(node.textContent||''))return node;
    if(node.closest('#grid,#modal,#selbar')&&/다운로드|재사용|참고 이미지로 사용/.test(node.textContent||''))return node;
    if(node.closest('#composer')&&/생성/.test(node.textContent||''))return node;
    return null;
  }
  document.addEventListener('click',event=>{if(!guardedTarget(event.target)||state==='approved')return;event.preventDefault();event.stopImmediatePropagation();requireApproval();},true);
  auth()?.onChange?.(()=>{state='unknown';loadedAt=0;check(true);});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>check());else check();
  window.LukeAccess={check,require:requireApproval,show,get status(){return state;},get owner(){return owner;}};
})();
