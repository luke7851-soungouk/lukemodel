'use strict';
(() => {
  const $=id=>document.getElementById(id),server=window.LUKE_SHARED?.hairBackendUrl,auth=window.LukeAuth;
  const el=(tag,text,cls)=>{const x=document.createElement(tag);if(text)x.textContent=text;if(cls)x.className=cls;return x;};
  async function call(action,body){
    await auth.ensure();if(!auth.user()||auth.isAnon())throw new Error('운영자 계정으로 로그인해 주세요.');
    const response=await fetch(server+'?action='+action,{method:body?'POST':'GET',headers:{...auth.headers(),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'요청에 실패했습니다.');return result;
  }
  async function load(){
    $('summary').textContent='승인 신청을 확인하는 중…';$('cards').replaceChildren();
    try{const result=await call('access-list');const rows=result.requests||[],pending=rows.filter(r=>r.status==='pending');$('summary').textContent=`대기 ${pending.length}건 · 전체 ${rows.length}건`;
      if(!rows.length){$('cards').append(el('p','아직 승인 신청이 없습니다.'));return;}
      for(const row of rows){const card=el('article',null,'card'),h=el('h2',row.email),badge=el('span',row.status,'status '+row.status),meta=el('p',`${row.resource_type==='all'?'전체 자료':row.resource_type+' / '+row.resource_id} · ${new Date(row.created_at).toLocaleString('ko-KR')}`,'meta'),purpose=el('p',row.purpose||'사용 목적 미기재','purpose'),actions=el('div',null,'actions');h.append(' ',badge);card.append(h,meta,purpose);
        if(row.status==='pending'){for(const [decision,label,cls] of [['approved','승인','approve'],['rejected','반려','']] ){const button=el('button',label,cls);button.type='button';button.onclick=async()=>{button.disabled=true;try{await call('access-decision',{id:row.id,decision});await load();}catch(e){$('summary').textContent=e.message;button.disabled=false;}};actions.append(button);}card.append(actions);} $('cards').append(card);}
    }catch(e){$('summary').textContent=e.message;$('cards').append(el('p','로그인 상태를 확인하거나 사이트에서 운영자 계정으로 로그인해 주세요.'));}
  }
  $('refresh').onclick=load;auth?.onChange?.(load);load();
})();
