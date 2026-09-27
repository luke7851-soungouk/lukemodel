'use strict';
(() => {
  const $ = id => document.getElementById(id);
  let apiKey = '', history = [], busy = false, controller = null, recognition = null, listening = false, generation = 0;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const status = text => { $('status').textContent = text; };
  function stop() {
    generation++;
    if (controller) controller.abort();
    controller = null;
    if (recognition) recognition.abort();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    busy = false; $('send').disabled = !apiKey; status('중지했어.');
  }
  function add(role, text) {
    const p = document.createElement('p'); p.className = 'bubble ' + role; p.textContent = text;
    $('messages').appendChild(p); $('messages').scrollTop = $('messages').scrollHeight;
  }
  function speak(text) {
    if (!$('speak').checked || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 2500));
    utterance.lang = 'ko-KR'; utterance.rate = 1;
    const voice = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('ko'));
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  }
  async function request(path, key, options = {}) {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/' + path, {
      ...options, headers: {'Content-Type':'application/json', 'x-goog-api-key':key}, credentials:'omit', referrerPolicy:'no-referrer'
    });
    if (!response.ok) throw new Error(response.status === 429 ? '사용량 한도에 도달했어. 잠시 후 다시 시도하거나 Google 계정의 할당량을 확인해 줘.' : [400,401,403].includes(response.status) ? '키 또는 API 접근 권한을 확인해 줘.' : 'AI 연결에 실패했어 (' + response.status + '). 다시 시도해 줘.');
    return response.json();
  }
  $('connect').onclick = async () => {
    const key = $('key').value.trim(); if (!key) { $('connection').textContent = '본인 API 키를 입력해 줘.'; return; }
    stop(); const token = generation;
    $('connect').disabled = true; $('connection').textContent = '연결 확인 중…';
    const pending = new AbortController(); controller = pending; const timer = setTimeout(() => pending.abort(), 20000);
    try {
      const data = await request('models?pageSize=1000', key, {signal:controller.signal});
      if (token !== generation) return;
      const models = (data.models || []).filter(m => m.supportedGenerationMethods?.includes('generateContent') && /^models\/gemini-[\w.-]+$/.test(m.name) && !/image|tts|robotics|embedding/.test(m.name));
      if (!models.length) throw new Error('사용 가능한 대화 모델이 없어. Google AI Studio에서 권한을 확인해 줘.');
      models.sort((a,b) => (a.name.includes('flash') ? -1 : 1) - (b.name.includes('flash') ? -1 : 1));
      $('model').replaceChildren(...models.map(m => new Option(m.displayName || m.name, m.name)));
      if (models.some(m => m.name === 'models/gemini-2.5-flash')) $('model').value = 'models/gemini-2.5-flash';
      apiKey = key; $('key').value = ''; $('model').disabled = false; $('send').disabled = false; $('disconnect').hidden = false;
      $('connection').textContent = '연결됐어. 키는 이 페이지를 닫거나 새로고침하면 사라져.'; $('settings').open = false; status('이제 이야기를 보내 봐.');
    } catch(e) { if (token === generation) $('connection').textContent = e.name === 'AbortError' ? '연결 시간이 초과됐어. 다시 시도해 줘.' : e.message; }
    finally { clearTimeout(timer); $('connect').disabled = false; }
  };
  $('disconnect').onclick = () => { stop(); apiKey = ''; history = []; $('messages').replaceChildren(); $('key').value = ''; $('prompt').value = ''; $('send').disabled = true; $('model').disabled = true; $('disconnect').hidden = true; $('connection').textContent = '연결과 대화 내용을 지웠어.'; $('settings').open = true; };
  $('stop').onclick = stop;
  $('clear').onclick = () => { stop(); history = []; $('messages').replaceChildren(); $('prompt').value = ''; status('대화를 지웠어.'); };
  $('speak').onchange = () => { if (!$('speak').checked) window.speechSynthesis?.cancel(); };
  $('form').onsubmit = async event => {
    event.preventDefault(); const text = $('prompt').value.trim(); if (!text || busy || !apiKey) return;
    if (recognition) recognition.abort(); window.speechSynthesis?.cancel();
    const token = ++generation; busy = true; $('send').disabled = true; $('prompt').value = ''; add('user', text); status('초이가 답변을 생각하고 있어…');
    const pending = new AbortController(); controller = pending; const timer = setTimeout(() => pending.abort(), 45000);
    const contents = [...history.slice(-12), {role:'user',parts:[{text}]}];
    try {
      const data = await request($('model').value + ':generateContent', apiKey, {method:'POST', signal:controller.signal, body:JSON.stringify({
        systemInstruction:{parts:[{text:'너는 페이스루크(lukemodel.com)의 AI 대화 도우미 초이다. 한국어로 친근하고 간결하게 답하고 사용자의 언어를 따른다. 이미지와 영상 프롬프트를 도와준다. 실제 인물이 아님을 속이지 않는다. 사이트를 직접 조작하거나 파일을 생성했다고 주장하지 않는다. 사이트는 얼굴 모델 탐색, /higgsfield/ 이미지·영상 제작 기능을 제공한다. 계정 키나 비밀번호를 요구하지 않는다.'}]}, contents, generationConfig:{maxOutputTokens:2048}
      })});
      if (token !== generation) return;
      const answer = data.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text || '').join('').trim();
      if (!answer) throw new Error('답변을 생성하지 못했어. 질문을 바꿔서 다시 보내 줘.');
      history = [...contents,{role:'model',parts:[{text:answer}]}].slice(-12); add('assistant', answer); status('답변이 도착했어.'); speak(answer);
    } catch(e) { if (token === generation) { $('prompt').value = text; status(e.name === 'AbortError' ? '응답 시간이 초과됐어. 다시 보내 줘.' : e.message); } }
    finally { clearTimeout(timer); if (token === generation) { busy = false; $('send').disabled = !apiKey; controller = null; } }
  };
  if (!SpeechRecognition) { $('mic').disabled = true; $('mic').textContent = '이 브라우저는 음성 입력 미지원'; }
  else {
    recognition = new SpeechRecognition(); recognition.lang = 'ko-KR'; recognition.interimResults = false; recognition.continuous = false;
    recognition.onresult = e => { $('prompt').value = ( $('prompt').value + ' ' + e.results[0][0].transcript).trim().slice(0,4000); status('인식한 내용을 확인하고 보내기를 눌러 줘.'); };
    recognition.onerror = e => status(e.error === 'not-allowed' ? '마이크 권한이 필요해. 브라우저 설정에서 허용하거나 글로 입력해 줘.' : '음성을 인식하지 못했어. 다시 말하거나 글로 입력해 줘.');
    recognition.onend = () => { listening = false; $('mic').textContent = '마이크로 말하기'; $('mic').setAttribute('aria-pressed','false'); };
    $('mic').onclick = () => { if (listening) { recognition.stop(); return; } window.speechSynthesis?.cancel(); try { recognition.start(); listening = true; $('mic').textContent = '듣기 중지'; $('mic').setAttribute('aria-pressed','true'); status('듣고 있어…'); } catch { status('마이크를 시작하지 못했어. 다시 시도해 줘.'); } };
  }
  if (!window.speechSynthesis) { $('speak').checked = false; $('speak').disabled = true; }
  window.addEventListener('pagehide', () => { stop(); apiKey = ''; history = []; $('key').value = ''; });
})();
