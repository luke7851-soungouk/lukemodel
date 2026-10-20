'use strict';
/* LUKE MODEL 스튜디오 확장 (window.LukeStudioX)
   - 모델 상세 3탭: 360° 턴어라운드 · 패션 화보 · 영상 만들기
   - 이미지 보기 창: 영상으로 만들기 · 4K 업스케일
   - 영상 만들기 5단계: 레퍼런스 → 이미지 읽기·스토리라인 → 영상 모델 → 프롬프트 → 생성
   - 내 작업 받기(zip) · 알림함
   생성은 gunbaly.com 대기열로 보내고, 운영자 PC 작업기가 운영자 Higgsfield 월 구독으로 만든다.
   요청에는 이 사이트의 Supabase 로그인 토큰(LukeAuth.headers)만 붙인다. 관리자(luke7851@gmail.com)만 생성 가능. */
(() => {
  const API = 'https://gunbaly.com/api/lm';
  const POLL_MS = 4000;
  const LOOKS = [
    ['비즈니스', 'tailored business suit, modern office or city street'],
    ['캐주얼', 'relaxed everyday casual outfit, sunny cafe terrace'],
    ['스트릿', 'streetwear, sneakers, urban alley with graffiti'],
    ['스포티', 'athleisure sportswear, bright outdoor sports setting'],
    ['드레스업', 'elegant evening dress-up outfit, luxury hotel lobby'],
  ];
  const VIDEO_MODELS = [
    { id: 'seedance_2_0_mini', name: 'Seedance 2.0 Mini', note: '빠르고 저렴 · 소리 포함', cost: d => Math.round(d), dur: [4, 15], res: ['480p', '720p'], audio: true },
    { id: 'seedance_2_0', name: 'Seedance 2.0', note: '고품질 · 인물 일관성', cost: d => Math.round(d * 4.5 * 10) / 10, dur: [4, 15], res: ['720p', '1080p'], audio: true },
    { id: 'kling3_0', name: 'Kling 3.0', note: '자연스러운 동작 · 소리 포함', cost: d => Math.round(d * 2), dur: [5, 10], res: ['720p', '1080p'], audio: true },
  ];
  const ASPECTS = ['9:16', '16:9', '1:1', '4:5'];
  // 힉스필드 견적(get_cost)으로 확인한 값: 시트 2.5 · Soul 2.0 한 번 0.12 · 4K 2 · 영상 Mini 초당 1 · Seedance 2.0 초당 4.5(720p) · Kling 3.0 초당 2
  const COST = { sheet: 2.5, close: 0.12, img: 0.12, upscale: 2 };
  const turnCost = Math.round((2.5 + 0.12) * 10) / 10;

  /* ── 공통 ── */
  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'text') n.textContent = v;
      else if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n[k] = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
    return n;
  };
  const say = (msg, kind) => { try { window.toast ? window.toast(msg, kind) : console.log(msg); } catch { console.log(msg); } };
  const isAdmin = () => !!window.LukeAuth?.isSiteAdmin?.();
  const ls = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

  async function call(path, body, raw) {
    const headers = window.LukeAuth?.headers ? LukeAuth.headers(body && !raw ? { 'Content-Type': 'application/json' } : {}) : {};
    if (raw) headers['Content-Type'] = raw;
    const r = await fetch(API + path, { method: body ? 'POST' : 'GET', headers, body: raw ? body : body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `요청 실패 (${r.status})`);
    return j;
  }
  // 생성에 넣을 공개 https 주소로 바꾼다 (브라우저에만 있는 data:/blob: 사진은 올려서 주소를 받는다)
  async function publicUrl(url) {
    url = String(url || '');
    if (/^https:\/\//.test(url)) return url;
    if (url.startsWith('/')) return location.origin + url;
    const blob = await (await fetch(url)).blob();
    const type = /^(image\/(jpeg|png|webp)|video\/mp4)$/.test(blob.type) ? blob.type : 'image/png';
    return (await call('/upload', blob, type)).url;
  }

  /* ── 작업 목록 (서버) ── */
  let JOBS = [], jobsAt = 0, jobsP = null;
  const subs = new Set();
  async function loadJobs(force) {
    if (!isAdmin()) return [];
    if (!force && Date.now() - jobsAt < 10000) return JOBS;
    jobsP ||= call('/jobs').then(j => { JOBS = j.jobs || []; jobsAt = Date.now(); subs.forEach(f => { try { f(); } catch {} }); return JOBS; }).finally(() => { jobsP = null; });
    return jobsP;
  }
  const tag = (modelId, section, extra) => `m:${modelId}|${section}${extra ? '|' + extra : ''}`;
  const parseTag = t => { const m = String(t || '').match(/^m:([^|]+)\|([^|]+)(?:\|(.*))?$/); return m ? { modelId: m[1], section: m[2], extra: m[3] || '' } : null; };
  const jobsFor = (modelId, section) => JOBS.filter(j => { const t = parseTag(j.title); return t && String(t.modelId) === String(modelId) && (!section || t.section === section); });

  // 작업이 끝날 때까지 지켜본다 (페이지를 옮겨도 서버에서 계속 진행)
  const watching = new Set();
  function watch(job) {
    if (watching.has(job.id) || ['done', 'failed'].includes(job.status)) return;
    watching.add(job.id);
    const tick = async () => {
      try {
        const j = await call('/job/' + job.id);
        const i = JOBS.findIndex(x => x.id === j.id);
        if (i >= 0) JOBS[i] = j; else JOBS.unshift(j);
        subs.forEach(f => { try { f(); } catch {} });
        if (j.status === 'done' || j.status === 'failed') {
          watching.delete(j.id);
          say(j.status === 'done' ? '생성이 끝났어요 · 알림함에서 확인하세요' : '생성 실패: ' + (j.error || ''), j.status === 'done' ? 'ok' : 'err');
          renderBell();
          return;
        }
      } catch {}
      setTimeout(tick, POLL_MS);
    };
    setTimeout(tick, POLL_MS);
  }
  async function submit(body) {
    if (!isAdmin()) throw new Error('관리자(luke7851@gmail.com) 로그인 후 사용할 수 있어요');
    const j = await call('/job', body);
    JOBS.unshift(j);
    subs.forEach(f => { try { f(); } catch {} });
    watch(j);
    workerHint();
    return j;
  }
  async function workerHint() {
    try { const s = await call('/status'); if (!s.workerOnline) say('생성 PC가 꺼져 있어요. 요청은 저장되고 PC가 켜지면 자동으로 만들어져요.', 'err'); } catch {}
  }
  const statusKo = s => ({ pending: '순서 기다리는 중', in_progress: '만드는 중', done: '완료', failed: '실패' })[s] || '처리 중';

  /* ── 스타일 ── */
  const css = `
  .lmx-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:22px 0 18px}
  .lmx-tab{text-align:left;background:#11131a;border:1px solid #232634;border-radius:12px;padding:12px 14px;color:#e8e8ef;cursor:pointer}
  .lmx-tab b{display:block;font-size:14.5px}.lmx-tab small{color:#8b8fa3;font-size:12px}
  .lmx-tab.on{border-color:#7c6cff;background:#171433;box-shadow:0 0 0 1px #7c6cff inset}
  .lmx-pane{display:none}.lmx-pane.on{display:block}
  .lmx-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:12px}
  .lmx-head h2{margin:0;font-size:24px}.lmx-head p{margin:4px 0 0;color:#8b8fa3;font-size:12.5px}
  .lmx-btn{border:0;border-radius:10px;padding:10px 14px;font-weight:700;cursor:pointer;background:linear-gradient(135deg,#6d7cff,#9b5cff);color:#fff;white-space:nowrap}
  .lmx-btn:disabled{opacity:.45;cursor:not-allowed}.lmx-btn.ghost{background:#1b1e29;color:#e8e8ef;border:1px solid #2d3142}
  .lmx-box{background:#0f1117;border:1px solid #232634;border-radius:14px;padding:16px}
  .lmx-empty{color:#9a9fb2;text-align:center;padding:38px 18px;line-height:1.7;font-size:13.5px}
  .lmx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}
  .lmx-grid.wide{grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}
  .lmx-card{position:relative;border:0;padding:0;background:#151823;border-radius:12px;overflow:hidden;cursor:pointer;color:#e8e8ef;text-align:left}
  .lmx-card img,.lmx-card video{display:block;width:100%;aspect-ratio:3/4;object-fit:cover;background:#000}
  .lmx-grid.wide .lmx-card img{aspect-ratio:16/9;object-fit:contain}
  .lmx-card span{position:absolute;left:8px;bottom:8px;font-size:11px;background:rgba(0,0,0,.65);padding:2px 7px;border-radius:6px}
  .lmx-wait{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;aspect-ratio:3/4;background:#151823;border-radius:12px;color:#aab;font-size:12px;text-align:center;padding:10px}
  .lmx-grid.wide .lmx-wait{aspect-ratio:16/9}
  .lmx-spin{width:20px;height:20px;border:2px solid #3a3f55;border-top-color:#8d7bff;border-radius:50%;animation:lmxs 1s linear infinite}@keyframes lmxs{to{transform:rotate(360deg)}}
  .lmx-chips{display:flex;flex-wrap:wrap;gap:6px}
  .lmx-chip{border:1px solid #2d3142;background:#161924;color:#d8d8e2;border-radius:999px;padding:6px 12px;font-size:12.5px;cursor:pointer}
  .lmx-chip.on{background:#6d7cff;border-color:#6d7cff;color:#fff;font-weight:700}
  .lmx-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  .lmx-in{flex:1;min-width:200px;background:#0b0d13;border:1px solid #2a2e3d;border-radius:10px;color:#e8e8ef;padding:10px 12px;font:inherit}
  textarea.lmx-in{min-height:120px;resize:vertical;width:100%;font-size:13px;line-height:1.55}
  .lmx-label{font-size:12px;color:#9aa0b5;margin:12px 0 6px;font-weight:700}
  .lmx-seg{display:flex;gap:4px}.lmx-seg button{width:34px;height:30px;border-radius:8px;border:1px solid #2d3142;background:#161924;color:#ddd;cursor:pointer}.lmx-seg button.on{background:#e8e8ef;color:#111;font-weight:800}
  .lmx-sub{margin-top:18px}
  .lmx-modal{position:fixed;inset:0;background:rgba(5,6,10,.82);z-index:9000;display:flex;align-items:center;justify-content:center;padding:18px}
  .lmx-dialog{background:#0d0f15;border:1px solid #232634;border-radius:16px;width:min(980px,100%);max-height:92vh;display:flex;flex-direction:column}
  .lmx-dhead{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;border-bottom:1px solid #1d2030;font-weight:800}
  .lmx-dbody{overflow:auto;padding:18px 22px}.lmx-dfoot{padding:12px 18px;border-top:1px solid #1d2030;display:flex;justify-content:flex-end;gap:8px}
  .lmx-step{border-bottom:1px solid #1b1e2b;padding:18px 0}
  .lmx-step .n{display:inline-flex;width:26px;height:26px;border-radius:50%;background:#6d7cff;color:#fff;font-weight:800;font-size:12px;align-items:center;justify-content:center;margin-right:8px}
  .lmx-step .k{font-size:10.5px;letter-spacing:.12em;color:#8b8fa3;font-weight:800}
  .lmx-step h3{margin:2px 0 4px;font-size:21px}.lmx-step>p{color:#8b8fa3;font-size:12.5px;margin:0 0 12px}
  .lmx-refs{display:flex;gap:10px;flex-wrap:wrap}
  .lmx-ref{width:128px;border:1px solid #2d3142;border-radius:12px;overflow:hidden;background:#151823;font-size:11.5px}
  .lmx-ref.start{border-color:#7c6cff;box-shadow:0 0 0 1px #7c6cff inset}
  .lmx-ref img{width:100%;aspect-ratio:3/4;object-fit:cover;display:block}.lmx-ref div{padding:6px 8px;display:flex;flex-direction:column;gap:4px}
  .lmx-ref button{border:0;background:#1f2333;color:#cfd2e0;border-radius:6px;font-size:11px;padding:3px 6px;cursor:pointer}
  .lmx-story{border:1px solid #2a2e3d;border-radius:12px;padding:12px 14px;margin-top:8px;cursor:pointer;background:#11131b}
  .lmx-story.on{border-color:#7c6cff;background:#171433}.lmx-story b{display:block;margin-bottom:6px}
  .lmx-story dl{display:grid;grid-template-columns:44px 1fr;gap:3px 8px;margin:0;font-size:12.5px;color:#c8cad6}.lmx-story dt{color:#8b8fa3}
  .lmx-models{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}
  .lmx-model{border:1px solid #2a2e3d;border-radius:12px;padding:12px;background:#11131b;cursor:pointer;text-align:left;color:#e8e8ef}
  .lmx-model.on{border-color:#7c6cff;background:#171433}.lmx-model small{display:block;color:#8b8fa3;margin-top:3px}
  .lmx-note{font-size:12px;color:#8b8fa3;background:#121520;border-radius:10px;padding:9px 12px;margin-top:10px;line-height:1.6}
  .lmx-bell{position:relative}.lmx-bell i{position:absolute;top:-5px;right:-5px;background:#ff5a6a;color:#fff;border-radius:999px;font-size:10px;font-style:normal;min-width:17px;height:17px;line-height:17px;text-align:center;padding:0 4px}
  .lmx-inbox{position:fixed;top:64px;right:16px;width:min(380px,calc(100vw - 32px));max-height:70vh;overflow:auto;background:#0d0f15;border:1px solid #232634;border-radius:14px;z-index:9001;box-shadow:0 20px 50px rgba(0,0,0,.5)}
  .lmx-inbox h4{margin:0;padding:12px 14px;border-bottom:1px solid #1d2030}
  .lmx-msg{display:flex;gap:10px;padding:10px 14px;border-bottom:1px solid #161927;cursor:pointer;font-size:13px}
  .lmx-msg img{width:40px;height:52px;object-fit:cover;border-radius:6px;background:#222}.lmx-msg small{display:block;color:#8b8fa3}
  .lmx-msg.unread{background:#141230}
  .lmx-exp-group{margin-top:16px}.lmx-exp-group h3{margin:0 0 8px;font-size:16px;display:flex;justify-content:space-between;align-items:center}
  .lmx-pick{position:relative}.lmx-pick input{position:absolute;top:8px;left:8px;width:18px;height:18px;z-index:1}
  @media(max-width:640px){.lmx-tabs{grid-template-columns:1fr}.lmx-head{flex-direction:column;align-items:flex-start}}`;
  document.head.append(el('style', { text: css }));

  /* ── 결과 카드 ── */
  function resultCards(jobs, opts) {
    const out = [];
    for (const j of jobs) {
      if (j.status === 'done') {
        for (const [i, url] of (j.results || []).entries()) {
          const isVideo = /\.mp4($|\?)/i.test(url);
          const card = el('button', { type: 'button', class: 'lmx-card' },
            isVideo ? el('video', { src: url, muted: true, playsinline: true, preload: 'metadata' }) : el('img', { src: url, alt: '', loading: 'lazy' }),
            el('span', { text: (opts.label?.(j, i)) || '' }));
          card.onclick = () => isVideo ? openVideoViewer(url, opts.name) : openViewer({ id: j.id + '-' + i, name: opts.name, url, kind: opts.label?.(j, i) || '' }, { modelId: opts.modelId, name: opts.name });
          out.push(card);
        }
      } else if (j.status === 'failed') {
        out.push(el('div', { class: 'lmx-wait' }, el('b', { text: '실패' }), el('small', { text: j.error || '' })));
      } else {
        out.push(el('div', { class: 'lmx-wait' }, el('div', { class: 'lmx-spin' }), el('span', { text: statusKo(j.status) + '…' }), j.note ? el('small', { text: j.note }) : null));
      }
    }
    return out;
  }

  /* ── 모델 상세 3탭 ── */
  function mountDetail({ left, turn, modelResults, model }) {
    if (!left || !model) return;
    const tabsEl = el('div', { class: 'lmx-tabs', role: 'tablist' });
    const panes = {};
    const tabs = {};
    const show = key => { Object.entries(tabs).forEach(([k, b]) => b.classList.toggle('on', k === key)); Object.entries(panes).forEach(([k, p]) => p.classList.toggle('on', k === key)); ls.set('lmx.tab', key); };
    const addTab = (key, title) => { const sub = el('small', { text: '' }); const b = el('button', { type: 'button', class: 'lmx-tab', role: 'tab' }, el('b', { text: title }), sub); b.onclick = () => show(key); tabs[key] = b; tabsEl.append(b); panes[key] = el('section', { class: 'lmx-pane' }); return sub; };
    const turnSub = addTab('turn', '360° 턴어라운드');
    const fashionSub = addTab('fashion', '패션 화보');
    const videoSub = addTab('video', '영상 만들기');
    turn.before(tabsEl);
    tabsEl.after(panes.turn, panes.fashion, panes.video);

    /* 1) 턴어라운드 */
    const turnGrid = el('div', { class: 'lmx-grid wide' });
    const closeGrid = el('div', { class: 'lmx-grid' });
    const turnBtn = el('button', { type: 'button', class: 'lmx-btn', text: `턴어라운드 생성 ✦ ${turnCost}` });
    turnBtn.onclick = async () => {
      if (window.LukeAccess && !await LukeAccess.require()) return;
      turnBtn.disabled = true;
      try {
        const ref = await publicUrl(model.photo);
        await submit({ type: 'image', model: 'seedream_v5_pro', aspect: '16:9', quality: '', count: 1, refs: [ref], title: tag(model.id, 'turn', 'sheet'),
          prompt: 'Character turnaround reference sheet of the exact same person shown in the reference photo. One image with four full-body views side by side: front, right side, left side, back. Neutral standing pose, arms relaxed, identical face, hairstyle, body proportions and outfit in every view. Plain light grey studio background, even soft lighting, photorealistic, no text or labels.' });
        await submit({ type: 'image', model: 'soul_2', aspect: '3:4', count: 3, refs: [ref], title: tag(model.id, 'turn', 'close'),
          prompt: 'Close-up portrait of the same person as the reference photo, face and shoulders filling the frame, natural skin texture with real pores, soft studio light, neutral background. Vary the angle: front, three-quarter, profile.' });
        say('턴어라운드를 요청했어요. 4분할 시트 1장 + 클로즈업 3컷', 'ok');
      } catch (e) { say(e.message, 'err'); }
      finally { turnBtn.disabled = false; }
    };
    const legacyWrap = el('div', { class: 'lmx-sub' });
    panes.turn.append(
      el('div', { class: 'lmx-head' }, el('div', {}, el('h2', { text: '360° 턴어라운드' }), el('p', { text: '전신 4분할 시트 1장 (정면·우측·좌측·후면) + 얼굴 클로즈업 3컷 · 2K · 동일 인물 고정' })), turnBtn),
      el('div', { class: 'lmx-box' }, turnGrid, el('div', { class: 'lmx-sub' }, closeGrid)),
      legacyWrap);
    legacyWrap.append(turn); // 예전에 만든 각도 사진도 그대로 보여 준다
    turn.querySelector('.lm-turn-head')?.remove();

    /* 2) 패션 화보 */
    const picked = new Set(['비즈니스']);
    let count = 2;
    const chipBox = el('div', { class: 'lmx-chips' });
    const drawChips = () => { chipBox.replaceChildren(...LOOKS.map(([k]) => { const c = el('button', { type: 'button', class: 'lmx-chip' + (picked.has(k) ? ' on' : ''), text: k }); c.onclick = () => { picked.has(k) ? picked.delete(k) : picked.add(k); drawChips(); }; return c; })); };
    drawChips();
    const custom = el('input', { class: 'lmx-in', placeholder: '예: 빈티지 트렌치코트에 와이드 슬랙스, 가을 톤', maxlength: '200' });
    const seg = el('div', { class: 'lmx-seg' });
    const fashionBtn = el('button', { type: 'button', class: 'lmx-btn' });
    const drawSeg = () => { seg.replaceChildren(...[1, 2, 3, 4].map(n => { const b = el('button', { type: 'button', class: n === count ? 'on' : '', text: String(n) }); b.onclick = () => { count = n; drawSeg(); }; return b; })); fashionBtn.textContent = `패션 이미지 생성 ✦ ${count}컷`; };
    drawSeg();
    fashionBtn.onclick = async () => {
      if (window.LukeAccess && !await LukeAccess.require()) return;
      const looks = LOOKS.filter(([k]) => picked.has(k));
      const desc = custom.value.trim();
      if (!looks.length && !desc) return say('룩을 하나 이상 고르거나 커스텀 룩을 적어 주세요', 'err');
      fashionBtn.disabled = true;
      try {
        const ref = await publicUrl(model.photo);
        const lookText = [desc, ...looks.map(([, en]) => en)].filter(Boolean).join(' / ');
        await submit({ type: 'image', model: 'soul_2', aspect: '3:4', count, refs: [ref], title: tag(model.id, 'fashion', [...picked, desc].filter(Boolean).join(', ').slice(0, 60)),
          prompt: `Fashion editorial photo of the same person as the reference image (identical face and hair). ${count > 1 ? 'Each image shows a different look chosen from: ' : 'Look: '}${lookText}. Full-body or three-quarter shot, professional fashion photography, natural light, safe-for-work.` });
        say('패션 화보를 요청했어요', 'ok');
      } catch (e) { say(e.message, 'err'); }
      finally { fashionBtn.disabled = false; }
    };
    const fashionGrid = el('div', { class: 'lmx-grid' });
    const legacyShoots = el('div', { class: 'lmx-sub' });
    panes.fashion.append(
      el('div', { class: 'lmx-head' }, el('div', {}, el('h2', { text: '패션 화보' }), el('p', { text: '프리셋을 고르거나 원하는 룩을 직접 설명해 주세요 · 최대 4컷' }))),
      el('div', { class: 'lmx-box' }, chipBox,
        el('div', { class: 'lmx-label', text: '커스텀 룩 (선택)' }),
        el('div', { class: 'lmx-row' }, custom, el('div', {}, el('div', { class: 'lmx-label', style: 'margin-top:0', text: '몇 장 뽑을까요' }), seg), fashionBtn)),
      el('div', { class: 'lmx-sub' }, fashionGrid), legacyShoots);
    legacyShoots.append(modelResults); // 예전 화보도 그대로

    /* 3) 영상 */
    const videoGrid = el('div', { class: 'lmx-grid' });
    const startBtn = el('button', { type: 'button', class: 'lmx-btn ghost', text: '프로필 사진으로 시작하기' });
    startBtn.onclick = () => openVideoWizard({ images: [model.photo], modelId: model.id, name: model.name });
    panes.video.append(
      el('div', { class: 'lmx-head' }, el('div', {}, el('h2', { text: '영상' }), el('p', { text: '이미지를 눌러 크게 본 뒤 「영상으로 만들기」를 선택하세요. 프로필 사진으로 바로 시작할 수도 있어요.' }))),
      el('div', { class: 'lmx-row', style: 'margin-bottom:12px' }, startBtn),
      el('div', { class: 'lmx-box' }, videoGrid));

    let shown = false; // 상세 화면은 다 만든 뒤에 붙으므로, 한 번 화면에 붙은 다음에만 '닫힘'을 판단한다
    const draw = () => {
      if (left.isConnected) shown = true;
      else if (shown) { subs.delete(draw); return; }
      const sheet = jobsFor(model.id, 'turn').filter(j => parseTag(j.title).extra === 'sheet');
      const close = jobsFor(model.id, 'turn').filter(j => parseTag(j.title).extra === 'close');
      const fashion = jobsFor(model.id, 'fashion');
      const video = jobsFor(model.id, 'video');
      const ups = jobsFor(model.id, 'upscale');
      turnGrid.replaceChildren(...(sheet.length ? resultCards(sheet.slice(0, 2), { modelId: model.id, name: model.name, label: () => '4분할 시트' }) : [el('div', { class: 'lmx-empty', style: 'grid-column:1/-1', text: '아직 턴어라운드가 없어요. 생성 버튼을 누르면 정면·우측·좌측·후면이 한 장에 담긴 4분할 전신 시트와 얼굴 클로즈업 3컷이 만들어집니다. 시트 한 장만 다운받아 바로 영상 레퍼런스로 쓸 수 있어요.' })]));
      closeGrid.replaceChildren(...resultCards(close.slice(0, 2), { modelId: model.id, name: model.name, label: () => '클로즈업' }));
      fashionGrid.replaceChildren(...(fashion.length ? resultCards(fashion, { modelId: model.id, name: model.name, label: j => parseTag(j.title).extra }) : [el('div', { class: 'lmx-empty', style: 'grid-column:1/-1', text: '아직 패션 화보가 없어요. 비즈니스·캐주얼·스트릿·스포티·드레스업 프리셋으로 시작해 보세요.' })]));
      videoGrid.replaceChildren(...([...video, ...ups].length ? resultCards([...video, ...ups].sort((a, b) => b.created - a.created), { modelId: model.id, name: model.name, label: j => parseTag(j.title).section === 'upscale' ? '4K' : '영상' }) : [el('div', { class: 'lmx-empty', style: 'grid-column:1/-1', text: '아직 만든 영상이 없어요.' })]));
      const doneSheets = sheet.filter(j => j.status === 'done').length;
      turnSub.textContent = doneSheets ? `${doneSheets}회 생성 · 다시 만들기 ${turnCost}크레딧` : `아직 없음 · ${turnCost}크레딧`;
      fashionSub.textContent = fashion.length ? `${fashion.reduce((n, j) => n + (j.results?.length || 0), 0)}컷` : '룩을 골라 시작';
      videoSub.textContent = video.length ? `${video.length}개` : '사진 하나로 시작';
      for (const j of [...sheet, ...close, ...fashion, ...video, ...ups]) watch(j);
    };
    subs.add(draw);
    draw();
    show(ls.get('lmx.tab', 'turn'));
    loadJobs(true).then(draw).catch(() => {});
  }

  /* ── 이미지 보기 창에 버튼 추가 ── */
  function viewerActions(actions, item, ctx) {
    if (!actions || !item?.url) return;
    const toVideo = el('button', { type: 'button', class: 'lm-modal-btn', text: '영상으로 만들기' });
    toVideo.onclick = () => { ctx?.close?.(); openVideoWizard({ images: [item.url], modelId: ctx?.modelId, name: ctx?.name }); };
    const up = el('button', { type: 'button', class: 'lm-modal-btn', text: `4K 업스케일 ✦ ${COST.upscale}` });
    up.style.background = 'linear-gradient(135deg,#6d7cff,#9b5cff)'; up.style.color = '#fff';
    up.onclick = async () => {
      if (window.LukeAccess && !await LukeAccess.require()) return;
      up.disabled = true;
      try { await submit({ type: 'upscale', url: await publicUrl(item.url), title: tag(ctx?.modelId || 'x', 'upscale') }); say('4K 업스케일을 요청했어요 · 「영상 만들기」 탭과 알림함에 결과가 올라와요', 'ok'); }
      catch (e) { say(e.message, 'err'); up.disabled = false; }
    };
    const first = actions.querySelector('.lm-modal-close');
    actions.insertBefore(toVideo, first || null);
    actions.insertBefore(up, first || null);
  }
  function openViewer(item, ctx) {
    const overlay = el('div', { class: 'lm-result-modal', role: 'dialog', 'aria-modal': 'true' });
    const inner = el('div', { class: 'lm-result-modal-inner' });
    const actions = el('div', { class: 'lm-result-modal-actions' });
    const close = el('button', { class: 'lm-modal-close', text: '닫기', onclick: () => overlay.remove() });
    const down = el('a', { class: 'lm-modal-btn', text: '다운로드', href: item.url + (item.url.includes('gunbaly.com/media/') ? '?download=1' : ''), download: 'luke-model.png' });
    const tab = el('button', { class: 'lm-modal-btn', text: '원본 새 탭에서 열기', onclick: () => window.open(item.url, '_blank', 'noopener') });
    actions.append(down, tab, close);
    viewerActions(actions, item, { ...ctx, close: () => overlay.remove() });
    inner.append(el('img', { src: item.url, alt: item.name || '' }), actions);
    overlay.append(inner);
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
    overlay.onkeydown = e => { if (e.key === 'Escape') overlay.remove(); };
    document.body.append(overlay); close.focus();
  }
  function openVideoViewer(url, name) {
    const overlay = el('div', { class: 'lm-result-modal', role: 'dialog', 'aria-modal': 'true' });
    const close = el('button', { class: 'lm-modal-close', text: '닫기', onclick: () => overlay.remove() });
    overlay.append(el('div', { class: 'lm-result-modal-inner' },
      el('video', { src: url, controls: true, autoplay: true, playsinline: true, style: 'max-width:100%;max-height:72vh;display:block;margin:0 auto;background:#000' }),
      el('div', { class: 'lm-result-modal-actions' }, el('a', { class: 'lm-modal-btn', text: '영상 다운로드', href: url + '?download=1', download: (name || 'luke-model') + '.mp4' }), close)));
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
    document.body.append(overlay); close.focus();
  }

  /* ── 영상 만들기 5단계 ── */
  function openVideoWizard({ images, modelId, name }) {
    if (!isAdmin()) return say('관리자(luke7851@gmail.com) 로그인 후 사용할 수 있어요', 'err');
    const st = { refs: (images || []).filter(Boolean).map((url, i) => ({ url, role: i ? 'scene' : 'start' })), read: '', stories: [], pick: 0, mode: 'ai', custom: '', model: VIDEO_MODELS[0], duration: 5, aspect: '9:16', res: '720p', audio: true, prompt: '', analyzing: false, err: '' };
    const overlay = el('div', { class: 'lmx-modal', role: 'dialog', 'aria-modal': 'true' });
    const body = el('div', { class: 'lmx-dbody' });
    const closeAll = () => overlay.remove();
    overlay.append(el('div', { class: 'lmx-dialog' },
      el('div', { class: 'lmx-dhead' }, el('span', { text: '영상으로 만들기' }), el('button', { type: 'button', class: 'lmx-btn ghost', text: '✕', onclick: closeAll })),
      body,
      el('div', { class: 'lmx-dfoot' }, el('button', { type: 'button', class: 'lmx-btn ghost', text: '닫기', onclick: closeAll }))));
    overlay.onkeydown = e => { if (e.key === 'Escape') closeAll(); };
    document.body.append(overlay);
    const file = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', hidden: true });
    overlay.append(file);
    file.onchange = async () => {
      const f = file.files[0]; file.value = '';
      if (!f) return;
      try { say('이미지 올리는 중…'); const url = (await call('/upload', f, f.type)).url; st.refs.push({ url, role: st.refs.length ? 'scene' : 'start' }); st.stories = []; st.read = ''; draw(); analyze(); }
      catch (e) { say(e.message, 'err'); }
    };

    const cacheKey = () => 'lmx.read.' + st.refs.map(r => r.url).join('|').slice(-300);
    async function analyze() {
      if (!st.refs.length) return;
      const cached = ls.get(cacheKey(), null);
      if (cached) { st.read = cached.read; st.stories = cached.stories; draw(); return; }
      st.analyzing = true; st.err = ''; draw();
      try {
        const images = await Promise.all(st.refs.map(r => publicUrl(r.url)));
        let j = await submit({ type: 'analyze', task: 'storyline', images, title: tag(modelId || 'x', 'analyze'), context: name ? '모델 이름: ' + name : '' });
        while (!['done', 'failed'].includes(j.status)) { await new Promise(r => setTimeout(r, 3000)); j = await call('/job/' + j.id); if (!overlay.isConnected) return; }
        if (j.status === 'failed') throw new Error(j.error || '이미지를 읽지 못했어요');
        const r = JSON.parse(j.text);
        st.read = r.read || ''; st.stories = Array.isArray(r.stories) ? r.stories.slice(0, 3) : [];
        ls.set(cacheKey(), { read: st.read, stories: st.stories });
      } catch (e) { st.err = e.message; }
      st.analyzing = false; draw();
    }

    const step = (n, k, title, sub, ...content) => el('section', { class: 'lmx-step' },
      el('div', {}, el('span', { class: 'n', text: String(n).padStart(2, '0') }), el('span', { class: 'k', text: k })),
      el('h3', { text: title }), el('p', { text: sub }), ...content);

    function assemble() {
      const s = st.mode === 'ai' ? st.stories[st.pick] : null;
      const story = s ? `${s.prompt || ''} Opening: ${s.start}. Development: ${s.middle}. Ending: ${s.end}. Camera: ${s.camera}.` : st.custom.trim();
      const scene = st.refs.filter(r => r.role === 'scene').length ? ' Use the additional reference images for the scene, props and outfit details.' : '';
      return `Start exactly from the provided first frame and keep the same person (identical face, hair, body and outfit). ${story}${scene} ${st.aspect} framing, ${st.duration} seconds, smooth realistic motion, cinematic lighting.${st.audio ? ' Natural ambient sound and fitting background music.' : ''}`.replace(/\s+/g, ' ').trim();
    }

    function draw() {
      const ready = st.refs.length && (st.mode === 'custom' ? st.custom.trim() : st.stories.length);
      // 01 레퍼런스
      const refs = el('div', { class: 'lmx-refs' }, ...st.refs.map((r, i) => {
        const role = el('button', { type: 'button', text: r.role === 'start' ? '시작 프레임' : '장면 참조 → 시작으로' });
        role.onclick = () => { st.refs.forEach(x => x.role = 'scene'); r.role = 'start'; st.refs.sort((a, b) => (a.role === 'start' ? -1 : b.role === 'start' ? 1 : 0)); draw(); };
        const del = el('button', { type: 'button', text: '빼기' });
        del.onclick = () => { st.refs.splice(i, 1); if (st.refs.length && !st.refs.some(x => x.role === 'start')) st.refs[0].role = 'start'; st.stories = []; st.read = ''; draw(); };
        return el('div', { class: 'lmx-ref' + (r.role === 'start' ? ' start' : '') }, el('img', { src: r.url, alt: '' }), el('div', {}, el('b', { text: String(i + 1).padStart(2, '0') + ' ' + (r.role === 'start' ? '시작 프레임' : '장면 참조') }), role, del));
      }));
      const addBtn = el('button', { type: 'button', class: 'lmx-btn ghost', text: '+ 이미지 추가', onclick: () => file.click() });
      // 02 이미지 읽기 + 스토리라인
      const modeSeg = el('div', { class: 'lmx-chips' },
        ...[['ai', 'AI 제안'], ['custom', '직접 쓰기']].map(([k, t]) => { const b = el('button', { type: 'button', class: 'lmx-chip' + (st.mode === k ? ' on' : ''), text: t }); b.onclick = () => { st.mode = k; draw(); }; return b; }));
      let storyBox;
      if (st.mode === 'custom') {
        const ta = el('textarea', { class: 'lmx-in', placeholder: '예: 모델이 카메라를 향해 천천히 걸어오다 멈춰 미소 짓고, 카메라는 천천히 다가가며 얼굴 클로즈업으로 끝나요.' });
        ta.value = st.custom; ta.oninput = () => { st.custom = ta.value; };
        storyBox = ta;
      } else if (st.analyzing) {
        storyBox = el('div', { class: 'lmx-box' }, el('div', { class: 'lmx-row' }, el('div', { class: 'lmx-spin' }), el('b', { text: '이미지를 읽는 중이에요' })),
          el('p', { style: 'color:#8b8fa3;font-size:12.5px', text: '세 가지 스토리 방향을 쓰고 있어요. 보통 1~2분 걸려요. 같은 이미지는 한 번 읽은 결과를 저장해 두어서 다음부터는 바로 나와요.' }));
      } else if (st.err) {
        storyBox = el('div', { class: 'lmx-box' }, el('p', { text: '이미지를 읽지 못했어요: ' + st.err }), el('button', { type: 'button', class: 'lmx-btn ghost', text: '다시 읽기', onclick: analyze }));
      } else if (st.stories.length) {
        storyBox = el('div', {}, st.read ? el('div', { class: 'lmx-note', text: '이미지 읽기 · ' + st.read }) : null,
          ...st.stories.map((s, i) => { const c = el('div', { class: 'lmx-story' + (i === st.pick ? ' on' : '') }, el('b', { text: `${i + 1}. ${s.title || ''}` }),
            el('dl', {}, el('dt', { text: '시작' }), el('dd', { text: s.start || '' }), el('dt', { text: '전개' }), el('dd', { text: s.middle || '' }), el('dt', { text: '끝' }), el('dd', { text: s.end || '' }), el('dt', { text: '카메라' }), el('dd', { text: s.camera || '' })));
            c.onclick = () => { st.pick = i; draw(); }; return c; }),
          el('div', { class: 'lmx-note', text: '정지 이미지만으로는 실제 움직임을 보장할 수 없어요. 이 흐름은 이미지에 보이는 자세·물건·환경을 바탕으로 한 제안이에요.' }));
      } else {
        storyBox = el('div', { class: 'lmx-box' }, el('button', { type: 'button', class: 'lmx-btn', text: '이미지 읽고 스토리라인 제안받기', onclick: analyze }));
      }
      // 03 모델
      const models = el('div', { class: 'lmx-models' }, ...VIDEO_MODELS.map(m => {
        const b = el('button', { type: 'button', class: 'lmx-model' + (st.model.id === m.id ? ' on' : '') }, el('b', { text: m.name }), el('small', { text: `${m.note} · 약 ${m.cost(st.duration)}크레딧` }));
        b.onclick = () => { st.model = m; st.duration = Math.min(m.dur[1], Math.max(m.dur[0], st.duration)); if (!m.res.includes(st.res)) st.res = m.res[0]; draw(); };
        return b;
      }));
      const durIn = el('input', { type: 'range', min: String(st.model.dur[0]), max: String(st.model.dur[1]), value: String(st.duration) });
      const durLabel = el('span', { text: `${st.duration}초` });
      durIn.oninput = () => { st.duration = +durIn.value; durLabel.textContent = `${st.duration}초`; };
      durIn.onchange = draw;
      const opt = (label, values, cur, set) => el('div', {}, el('div', { class: 'lmx-label', text: label }), el('div', { class: 'lmx-chips' }, ...values.map(v => { const b = el('button', { type: 'button', class: 'lmx-chip' + (v === cur ? ' on' : ''), text: String(v) }); b.onclick = () => { set(v); draw(); }; return b; })));
      const options = el('div', { class: 'lmx-box', style: 'margin-top:10px' },
        el('div', { class: 'lmx-label', style: 'margin-top:0', text: '길이' }), el('div', { class: 'lmx-row' }, durIn, durLabel),
        opt('비율', ASPECTS, st.aspect, v => st.aspect = v),
        opt('화질', st.model.res, st.res, v => st.res = v),
        opt('소리', ['켜기', '끄기'], st.audio ? '켜기' : '끄기', v => st.audio = v === '켜기'));
      // 04 프롬프트
      const promptTa = el('textarea', { class: 'lmx-in', placeholder: '버튼을 누르면 스토리라인과 옵션으로 프롬프트를 조립해요. 자유롭게 고칠 수 있어요.' });
      promptTa.value = st.prompt; promptTa.oninput = () => { st.prompt = promptTa.value; };
      const build = el('button', { type: 'button', class: 'lmx-btn ghost', text: '프롬프트 생성' });
      build.disabled = !ready;
      build.onclick = () => { st.prompt = assemble(); draw(); };
      // 05 생성
      const go = el('button', { type: 'button', class: 'lmx-btn', text: `영상 생성 ✦ ${st.model.cost(st.duration)}` });
      go.disabled = !st.prompt.trim() || !st.refs.length;
      go.onclick = async () => {
        go.disabled = true;
        try {
          const start = st.refs.find(r => r.role === 'start') || st.refs[0];
          const image = await publicUrl(start.url);
          const refs = await Promise.all(st.refs.filter(r => r !== start).map(r => publicUrl(r.url)));
          await submit({ type: 'video', model: st.model.id, prompt: st.prompt.trim(), image, refs, duration: st.duration, aspect: st.aspect, resolution: st.res, audio: st.audio, title: tag(modelId || 'x', 'video') });
          say('영상 생성을 요청했어요 · 모델 상세의 「영상 만들기」 탭과 알림함에서 확인하세요', 'ok');
          closeAll();
        } catch (e) { say(e.message, 'err'); go.disabled = false; }
      };
      body.replaceChildren(
        el('p', { style: 'color:#8b8fa3;font-size:12.5px;margin:0', text: '레퍼런스를 넣으면 이미지 읽기와 스토리라인을 함께 확인할 수 있어요. 흐름을 고른 뒤 모델과 옵션을 정하고 프롬프트를 생성합니다.' }),
        step(1, 'REFERENCE', '레퍼런스 이미지를 넣으세요', '선택한 이미지가 시작 프레임이에요. 더 넣은 이미지는 장면 참조로 들어가고, 역할은 바꿀 수 있어요.', refs, el('div', { style: 'margin-top:10px' }, addBtn),
          el('div', { class: 'lmx-note', text: '분석할 때 이미지가 운영자 PC의 Claude로 전달돼 읽혀요(크레딧 없음). 생성 요청은 05 단계에서 직접 누를 때만 전송됩니다.' })),
        step(2, 'IMAGE READ + STORYLINE', '이미지 읽기와 스토리라인', '이미지를 읽고 세 가지 스토리 방향을 제안해요. 마음에 드는 게 없으면 ‘직접 쓰기’로 스토리라인을 직접 적을 수 있어요.', modeSeg, el('div', { style: 'margin-top:10px' }, storyBox)),
        step(3, 'MODEL', '영상 모델을 고르세요', '모델을 고르면 그 모델이 지원하는 옵션만 나와요.', models, options),
        step(4, 'PROMPT', '프롬프트 생성', '고르거나 직접 쓴 스토리라인과 모델 옵션을 확인한 다음 버튼을 눌러 조립해요. 만들어진 프롬프트는 자유롭게 고칠 수 있어요.',
          el('div', { class: 'lmx-row', style: 'margin-bottom:8px' }, build, ready ? null : el('small', { style: 'color:#8b8fa3', text: '먼저 스토리라인을 고르거나 직접 써 주세요' })), promptTa),
        step(5, 'GENERATE', '영상 생성', `${st.model.name} · ${st.duration}초 · ${st.aspect} · ${st.res} · 소리 ${st.audio ? '켜기' : '끄기'}`, go,
          el('div', { class: 'lmx-note', text: '운영자 Higgsfield 월 구독 크레딧으로 만들어요. 몇 분 걸릴 수 있고, 창을 닫아도 계속 만들어져요.' })));
    }
    draw();
    analyze();
  }

  /* ── 알림함 ── */
  let bellEl = null;
  const seen = () => new Set(ls.get('lmx.seen', []));
  function unread() { const s = seen(); return JOBS.filter(j => ['done', 'failed'].includes(j.status) && parseTag(j.title)?.section !== 'analyze' && !s.has(j.id)); }
  function renderBell() { if (bellEl) { const n = unread().length; bellEl.querySelector('i')?.remove(); if (n) bellEl.append(el('i', { text: n > 9 ? '9+' : String(n) })); } }
  function openInbox() {
    document.querySelector('.lmx-inbox')?.remove();
    const box = el('div', { class: 'lmx-inbox', role: 'dialog' }, el('h4', { text: '알림함' }));
    const s = seen();
    const list = JOBS.filter(j => parseTag(j.title)?.section !== 'analyze').slice(0, 40);
    if (!list.length) box.append(el('div', { class: 'lmx-empty', text: '아직 알림이 없어요.' }));
    for (const j of list) {
      const t = parseTag(j.title) || {};
      const label = { turn: '턴어라운드', fashion: '패션 화보', video: '영상', upscale: '4K 업스케일', casting: '캐스팅', product: '제품' }[t.section] || '생성';
      const thumb = j.results?.[0];
      const row = el('div', { class: 'lmx-msg' + (s.has(j.id) || !['done', 'failed'].includes(j.status) ? '' : ' unread') },
        thumb && !/\.mp4/.test(thumb) ? el('img', { src: thumb, alt: '' }) : el('div', { style: 'width:40px;height:52px;border-radius:6px;background:#1c2030;display:flex;align-items:center;justify-content:center', text: j.status === 'done' ? '🎬' : '⏳' }),
        el('div', {}, el('b', { text: `${label} ${statusKo(j.status)}` }), el('small', { text: (j.status === 'failed' ? j.error : t.extra) || '' }), el('small', { text: new Date(j.created).toLocaleString('ko-KR') })));
      row.onclick = () => { if (t.modelId && t.modelId !== 'x' && typeof window.go === 'function') { try { window.go('detail', isNaN(+t.modelId) ? t.modelId : +t.modelId); } catch {} } box.remove(); };
      box.append(row);
    }
    ls.set('lmx.seen', [...new Set([...s, ...JOBS.filter(j => ['done', 'failed'].includes(j.status)).map(j => j.id)])].slice(-500));
    renderBell();
    document.body.append(box);
    setTimeout(() => document.addEventListener('click', function off(e) { if (!box.contains(e.target)) { box.remove(); document.removeEventListener('click', off); } }), 0);
  }
  // 로그인 확인이 헤더보다 늦게 끝나므로, 로그인 상태가 바뀔 때마다 다시 채운다
  function headerButtons(container) {
    if (!container) return;
    const box = el('span', { style: 'display:contents' });
    container.append(box);
    const fill = () => {
      if (!box.isConnected) return;
      box.replaceChildren();
      if (!isAdmin()) return;
      bellEl = el('button', { type: 'button', class: 'btn ghost sm lmx-bell', title: '알림', text: '🔔', onclick: e => { e.stopPropagation(); loadJobs(true).then(openInbox); } });
      box.append(el('button', { type: 'button', class: 'btn ghost sm', text: '내 작업 받기', onclick: () => openExport() }), bellEl);
      loadJobs().then(renderBell).catch(() => {});
    };
    fill();
    window.LukeAuth?.onChange?.(fill);
    setTimeout(fill, 2500);
  }

  /* ── 내 작업 받기 (zip) ── */
  async function openExport() {
    await loadJobs(true).catch(() => {});
    const overlay = el('div', { class: 'lmx-modal', role: 'dialog', 'aria-modal': 'true' });
    const body = el('div', { class: 'lmx-dbody' });
    const count = el('span', { text: '0개 선택' });
    const zipBtn = el('button', { type: 'button', class: 'lmx-btn', text: 'zip으로 받기' });
    overlay.append(el('div', { class: 'lmx-dialog' },
      el('div', { class: 'lmx-dhead' }, el('span', { text: '내 작업 받기' }), el('button', { type: 'button', class: 'lmx-btn ghost', text: '✕', onclick: () => overlay.remove() })),
      body, el('div', { class: 'lmx-dfoot' }, count, zipBtn)));
    document.body.append(overlay);
    const picked = new Set();
    const groups = new Map();
    for (const j of JOBS) {
      if (j.status !== 'done' || !j.results?.length) continue;
      const t = parseTag(j.title) || { modelId: 'x', section: '기타' };
      const model = (window.LukeModels?.() || []).find(m => String(m.id) === String(t.modelId));
      const key = model ? model.name : t.modelId === 'x' ? '기타' : '모델 ' + t.modelId;
      if (!groups.has(key)) groups.set(key, []);
      j.results.forEach((u, i) => groups.get(key).push({ url: u, label: ({ turn: '턴어라운드', fashion: '화보', video: '영상', upscale: '4K', casting: '캐스팅', product: '제품' })[t.section] || t.section, name: `${key}-${t.section}-${j.id.slice(0, 6)}-${i + 1}` }));
    }
    const sync = () => { count.textContent = `${picked.size}개 선택`; zipBtn.disabled = !picked.size; };
    body.append(el('p', { style: 'color:#8b8fa3;font-size:12.5px;margin:0', text: '내가 만든 이미지와 영상을 골라서 zip 하나로 받아요.' }));
    if (!groups.size) body.append(el('div', { class: 'lmx-empty', text: '아직 받을 작업이 없어요.' }));
    for (const [key, items] of groups) {
      const all = el('button', { type: 'button', class: 'lmx-btn ghost', text: '모두 고르기' });
      const grid = el('div', { class: 'lmx-grid' });
      const boxes = items.map(it => {
        const cb = el('input', { type: 'checkbox' });
        cb.onchange = () => { cb.checked ? picked.add(it) : picked.delete(it); sync(); };
        grid.append(el('label', { class: 'lmx-card lmx-pick' }, cb, /\.mp4/.test(it.url) ? el('video', { src: it.url, muted: true, preload: 'metadata' }) : el('img', { src: it.url, alt: '', loading: 'lazy' }), el('span', { text: it.label })));
        return [cb, it];
      });
      all.onclick = () => { const on = !boxes.every(([cb]) => cb.checked); boxes.forEach(([cb, it]) => { cb.checked = on; on ? picked.add(it) : picked.delete(it); }); sync(); };
      body.append(el('section', { class: 'lmx-exp-group' }, el('h3', {}, el('span', { text: `${key} · ${items.length}개` }), all), grid));
    }
    sync();
    zipBtn.onclick = async () => {
      zipBtn.disabled = true; zipBtn.textContent = '묶는 중…';
      try {
        if (!window.JSZip) await new Promise((ok, bad) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'; s.integrity = 'sha256-rMfkFFWoB2W1/Zx+4bgHim0WC7vKRVrq6FTeZclH1Z4='; s.crossOrigin = 'anonymous'; s.onload = ok; s.onerror = () => bad(new Error('zip 도구를 불러오지 못했어요')); document.head.append(s); });
        const zip = new JSZip();
        let i = 0;
        for (const it of picked) {
          zipBtn.textContent = `묶는 중… ${++i}/${picked.size}`;
          const b = await (await fetch(it.url)).blob();
          zip.file(it.name.replace(/[\\/:*?"<>|]/g, '_') + (/\.mp4/.test(it.url) ? '.mp4' : /\.webp/.test(it.url) ? '.webp' : /\.jpe?g/.test(it.url) ? '.jpg' : '.png'), b);
        }
        const out = await zip.generateAsync({ type: 'blob' });
        const a = el('a', { href: URL.createObjectURL(out), download: `lukemodel-${new Date().toISOString().slice(0, 10)}.zip` });
        document.body.append(a); a.click(); a.remove();
        say('zip을 받았어요', 'ok');
      } catch (e) { say(e.message, 'err'); }
      zipBtn.textContent = 'zip으로 받기'; zipBtn.disabled = !picked.size;
    };
  }

  window.LukeStudioX = { mountDetail, viewerActions, openVideoWizard, openExport, openInbox, headerButtons, submit, call, publicUrl, loadJobs, jobsFor, tag, parseTag, watch, onJobs: f => { subs.add(f); return () => subs.delete(f); } };
  // 로그인 상태가 바뀌면 진행 중인 작업을 다시 지켜본다
  setTimeout(() => { if (isAdmin()) loadJobs(true).then(js => { js.forEach(watch); renderBell(); }).catch(() => {}); }, 1500);
})();
