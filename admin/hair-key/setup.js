(function(){
  'use strict';
  const form=document.getElementById('key-form');
  const input=document.getElementById('api-key');
  const save=document.getElementById('save');
  const login=document.getElementById('login');
  const status=document.getElementById('status');
  const api=String(window.LUKE_SHARED?.url||'').replace(/\/$/,'')+'/functions/v1/hair-generate';
  const setStatus=message=>{status.textContent=message;};
  async function call(action,options={}){
    const response=await fetch(api+'?action='+action,{
      ...options,
      headers:{...window.LukeAuth.headers({'Content-Type':'application/json'}),...options.headers}
    });
    const body=await response.json().catch(()=>({}));
    if(!response.ok){const error=new Error(body.error||'서버 연결을 확인해 주세요.');error.httpStatus=response.status;throw error;}
    return body;
  }
  async function check(){
    form.hidden=true;login.hidden=true;
    if(!window.LukeAuth||!window.LUKE_SHARED?.url){setStatus('사이트 로그인 설정이 없습니다.');return;}
    try{
      await window.LukeAuth.boot();
      const user=window.LukeAuth.user();
      if(!user||window.LukeAuth.isAnon()){
        login.hidden=false;setStatus('운영자 계정으로 로그인해 주세요.');return;
      }
      const result=await call('key-status');
      form.hidden=false;
      setStatus(result.configured?'키가 서버에 등록되어 있습니다. 새 키를 입력하면 교체됩니다.':'등록된 키가 없습니다. 키를 입력하고 저장해 주세요.');
    }catch(error){
      if(error.httpStatus===403)setStatus('이 계정은 운영자 계정이 아닙니다. 운영자 계정으로 로그인해 주세요.');
      else setStatus('키 저장 서버가 아직 준비되지 않았습니다. Supabase Edge Function과 SQL 배포가 필요합니다.');
    }
  }
  login.addEventListener('click',()=>window.LukeAuth.openAccount());
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const key=input.value.trim();
    if(!/^[^:\s]+:[^:\s]+$/.test(key)||key.length>512){setStatus('key-id:key-secret 형식으로 입력해 주세요.');return;}
    save.disabled=true;setStatus('서버에 암호화 저장하는 중…');
    try{
      await call('save-key',{method:'POST',body:JSON.stringify({key})});
      input.value='';setStatus('키가 서버에 저장되었습니다.');
    }catch(error){setStatus(error.message||'저장에 실패했습니다.');}
    finally{save.disabled=false;}
  });
  window.LukeAuth?.onChange?.(()=>{void check();});
  void check();
})();
