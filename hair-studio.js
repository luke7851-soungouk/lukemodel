/* Free hair photo editing through the site's existing Hugging Face image editor. */
(function(){
  'use strict';
  let statsPromise;
  const styles=['자연스러운 레이어드','단발 보브','긴 웨이브','허쉬컷','숏컷','가르마 펌','댄디컷','원하는 스타일 직접 입력'];
  const el=(tag,cls,value)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(value!=null)x.textContent=value;return x;};
  const fileUrl=f=>URL.createObjectURL(f);
  function showImage(frame,url){frame.querySelectorAll('img,video,.hair-placeholder').forEach(x=>x.remove());const img=el('img');img.src=url;img.alt=frame.dataset.label||'사진';frame.appendChild(img);}
  function loadRecent(box){
    const c=window.LUKE_SHARED;if(!c||!c.url||!c.anonKey){box.textContent='아직 공개된 결과가 없습니다.';return;}
    const q=c.url+'/rest/v1/'+(c.table||'shared_media')+'?select=title,path,external_url,created_at&title=ilike.*%23hair*&hidden=eq.false&order=created_at.desc&limit=8';
    fetch(q,{headers:{apikey:c.anonKey,Authorization:'Bearer '+c.anonKey}}).then(r=>r.ok?r.json():[]).then(rows=>{
      box.textContent='';rows.forEach(row=>{const url=row.external_url||(row.path?c.url+'/storage/v1/object/public/'+encodeURIComponent(c.bucket)+'/'+String(row.path).split('/').map(encodeURIComponent).join('/'):null);if(!url)return;
        const a=el('a');a.href=url+'?download=hair-after.png';a.rel='noopener';a.download='hair-after.png';const img=el('img');img.src=url;img.alt='최근 공개된 헤어 변경 결과';img.loading='lazy';a.append(img,el('span','',String(row.title||'헤어 변경').replace(/#hair\b/i,'').trim()));box.appendChild(a);});
      if(!box.children.length)box.textContent='아직 공개된 결과가 없습니다.';
    }).catch(()=>{box.textContent='최근 결과를 불러오지 못했습니다.'});
  }
  function render(app){
    const stats=el('div','hair-stats');stats.setAttribute('aria-label','사이트 통계');
    const metrics=[['오늘 방문자','todayCounts','uv'],['누적 방문자','totals','uv'],['AI 제작','events','generate']];
    const nums=metrics.map(([label])=>{const item=el('span','',label),n=el('strong','','—');item.appendChild(n);stats.appendChild(item);return n;});
    if(window.FaceLookTraffic){statsPromise=statsPromise||FaceLookTraffic.loadStats();statsPromise.then(s=>metrics.forEach(([,key,field],i)=>{nums[i].textContent=Number(s[key][field]||0).toLocaleString('ko-KR')})).catch(()=>{statsPromise=null});}
    const statsLink=el('a','','통계 자세히 →');statsLink.href='/stats.html';stats.appendChild(statsLink);app.appendChild(stats);

    const section=el('section','hair-studio');section.id='hair-studio';
    const head=el('div','hair-heading'),copy=el('div');copy.append(el('div','hair-kicker','AI HAIR STUDIO'),el('h2','','내 사진으로 헤어스타일 바꾸기'),el('p','','사진을 올리고 원하는 머리 스타일을 선택하세요. 변경 전후를 함께 확인하고 결과를 내려받을 수 있습니다.'));
    head.append(copy,el('div','hair-price','무료 · 사진 1장씩'));section.appendChild(head);
    const layout=el('div','hair-layout'),left=el('div','hair-panel'),right=el('div','hair-panel');left.appendChild(el('h3','','1. 원본과 스타일 선택'));
    const drop=el('label','hair-drop'),dropText=el('span','hair-placeholder','사진 선택 · 클릭해서 업로드'),input=el('input');input.type='file';input.accept='image/jpeg,image/png,image/webp';input.setAttribute('aria-label','원본 사진');drop.append(dropText,input);left.append(drop,el('p','hair-hint','JPG, PNG, WebP · 최대 10MB. 무료 AI 처리를 위해 선택한 사진이 Hugging Face 서버로 전송됩니다. 영상 변환은 아직 지원하지 않습니다.'));
    left.appendChild(el('label','hair-field','바꿀 헤어스타일'));const select=el('select','hair-select');styles.forEach(s=>{const o=el('option','',s);o.value=s;select.appendChild(o)});left.appendChild(select);
    left.appendChild(el('label','hair-field','추가 요청'));const prompt=el('textarea','hair-prompt');prompt.placeholder='예: 어깨 길이의 자연스러운 웨이브, 앞머리 없이';prompt.maxLength=500;left.appendChild(prompt);
    const voice=el('button','hair-voice','🎙 말로 스타일 설명');voice.type='button';left.appendChild(voice);
    right.appendChild(el('h3','','2. 변경 전 · 변경 후'));const compare=el('div','hair-result'),before=el('div','hair-frame'),after=el('div','hair-frame');before.dataset.label='변경 전';after.dataset.label='변경 후';before.append(el('span','','변경 전'),el('div','hair-placeholder','원본 미리보기'));after.append(el('span','','변경 후'),el('div','hair-placeholder','무료 AI 결과가 여기에 표시됩니다'));compare.append(before,after);right.appendChild(compare);
    const actions=el('div','hair-action'),generate=el('button','','무료로 머리 변경하기'),download=el('a','','결과 다운로드');generate.type='button';download.hidden=true;download.download='hair-after.png';actions.append(generate,download);right.appendChild(actions);
    const shareLabel=el('label','hair-share'),share=el('input');share.type='checkbox';shareLabel.append(share,el('span','',' 결과를 사이트에 공개 등록 (선택)'));right.appendChild(shareLabel);
    const status=el('div','hair-status','사진을 선택하면 무료 AI 편집을 시작할 수 있습니다. 무료 서버 대기열과 사용 한도가 적용됩니다.');status.setAttribute('role','status');right.appendChild(status);
    layout.append(left,right);section.appendChild(layout);const recent=el('div','hair-recent'),recentList=el('div','hair-recent-list');recent.append(el('h3','','최근 공개된 헤어 변경 · 최신순'),recentList);section.appendChild(recent);app.appendChild(section);loadRecent(recentList);

    let selected=null,originalUrl=null,resultUrl=null;
    input.onchange=()=>{const f=input.files&&input.files[0];if(!f)return;if(!/^image\/(jpeg|png|webp)$/.test(f.type)||f.size>10*1048576){status.textContent='JPG, PNG, WebP 사진을 10MB 이하로 선택해 주세요.';input.value='';return;}
      if(originalUrl)URL.revokeObjectURL(originalUrl);if(resultUrl){URL.revokeObjectURL(resultUrl);resultUrl=null;}selected=f;originalUrl=fileUrl(f);showImage(before,originalUrl);after.querySelectorAll('img,video,.hair-placeholder').forEach(x=>x.remove());after.appendChild(el('div','hair-placeholder','변경 결과 대기 중'));download.hidden=true;dropText.textContent=f.name;status.textContent='스타일을 확인하고 무료로 변경하기를 누르세요.';};
    voice.onclick=()=>{const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Speech){status.textContent='이 브라우저는 음성 입력을 지원하지 않습니다. 요청란에 직접 적어주세요.';return;}const rec=new Speech();rec.lang='ko-KR';rec.onresult=e=>{prompt.value=(prompt.value+' '+e.results[0][0].transcript).trim();status.textContent='음성 설명을 입력했습니다.'};rec.onerror=()=>{status.textContent='음성을 인식하지 못했습니다. 직접 적거나 다시 시도해 주세요.'};rec.start();};
    generate.onclick=async()=>{
      if(!selected){status.textContent='원본 사진을 먼저 선택해 주세요.';return;}if(!window.LukeAngles||!LukeAngles.hfRun){status.textContent='무료 AI 편집기를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.';return;}
      generate.disabled=true;download.hidden=true;status.textContent='무료 서버에 연결하는 중입니다…';
      const instruction='Change only the hairstyle of the person in this photo to '+select.value+'. '+prompt.value.trim()+'. Keep the same person, facial features, skin tone, expression, clothing, pose, background, framing, and lighting. Natural realistic hair, one image, no text.';
      try{
        const blob=await LukeAngles.hfRun({src:selected,prompt:instruction,width:768,height:1024,onPhase:t=>{status.textContent=t}});
        if(resultUrl)URL.revokeObjectURL(resultUrl);resultUrl=fileUrl(blob);showImage(after,resultUrl);download.href=resultUrl;download.hidden=false;status.textContent='완료되었습니다. 전후를 비교하고 결과를 다운로드하세요.';
        if(window.FaceLookTraffic)FaceLookTraffic.trackEvent('generate');
        if(share.checked&&window.LukeHF&&LukeHF.shared){try{const out=new File([blob],'hair-after.png',{type:blob.type||'image/png'});await LukeHF.publish(out,select.value+' #hair','hair');status.textContent='완료되었습니다. 결과를 공개 갤러리에 최신순으로 등록했습니다.';loadRecent(recentList);}catch(e){status.textContent='이미지는 완성됐지만 공개 등록에 실패했습니다: '+e.message;}}
      }catch(e){status.textContent=(window.LukeAngles&&LukeAngles.hfErrorText?LukeAngles.hfErrorText(e).text:e.message)||'무료 AI 서버가 응답하지 않았습니다. 잠시 후 다시 시도해 주세요.';}
      finally{generate.disabled=false;}
    };
  }
  window.LukeHair={render};
})();
