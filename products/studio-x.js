'use strict';
/* 제품 스튜디오 확장: AI 가상 제품 만들기 · 내 제품 사진 올리기(AI 설명 자동 작성)
   생성·분석은 lm-studio.js(LukeStudioX) → gunbaly.com 대기열 → 운영자 PC 작업기(Higgsfield 월 구독 / Claude). 운영자만. */
(() => {
  const X = () => window.LukeStudioX;
  const P = () => window.LukeProducts;
  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'text') n.textContent = v; else if (k === 'class') n.className = v; else if (k.startsWith('on')) n[k] = v; else n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
    return n;
  };
  const msg = t => { const m = document.getElementById('message'); if (m) m.textContent = t; };

  // 카테고리 → 사이트 카테고리, 기본 형태
  const CATS = [
    ['🧴', '스킨케어', '뷰티·스킨케어', ['드로퍼 / 앰플', '펌프 보틀', '크림 자(jar)', '튜브', '미스트 스프레이']],
    ['💄', '색조 / 메이크업', '메이크업', ['립스틱', '쿠션 팩트', '아이섀도 팔레트', '립 틴트', '파운데이션 보틀']],
    ['🧖', '헤어 / 바디', '헤어·바디', ['펌프 보틀', '튜브', '바디 오일 보틀', '샴푸 바', '미스트']],
    ['🌸', '향수 / 프래그런스', '향수', ['사각 글라스 보틀', '라운드 보틀', '롤온', '디퓨저', '캔들']],
    ['💊', '건강기능식품', '식품·음료', ['알약 보틀', '스틱 파우치', '젤리 박스', '분말 통', '앰플 드링크']],
    ['🥤', '음료 / F&B', '식품·음료', ['캔', '유리병', '페트병', '파우치', '컵']],
    ['🎧', '테크 / 가전', '디지털·가전', ['무선 이어폰', '스마트 스피커', '휴대용 선풍기', '스마트워치', '충전기']],
    ['👜', '패션 잡화', '가방·잡화', ['토트백', '크로스백', '지갑', '모자', '선글라스']],
    ['🕯️', '리빙 / 홈', '리빙·인테리어', ['캔들', '머그컵', '쿠션', '세라믹 화병', '디퓨저']],
    ['🐾', '펫', '기타', ['사료 봉투', '간식 파우치', '장난감', '목줄', '샴푸 보틀']],
    ['✦', '기타', '기타', ['박스 패키지', '보틀', '파우치', '튜브', '케이스']],
  ];
  const MATERIALS = ['프로스티드 글래스', '클리어 글래스', '매트 플라스틱', '유광 플라스틱', '알루미늄', '세라믹', '크라프트 종이', '패브릭'];
  const COLORS = ['미니멀 화이트', '웜 베이지', '파스텔', '딥 그린', '네이비', '블랙', '테라코타', '실버'];
  const MOODS = ['미니멀·클린', '내추럴·보태니컬', '럭셔리', '키치·팝', '클리니컬', '빈티지'];
  // 비교에 쓰는 이미지 모델 (힉스필드 견적: GPT Image 2.5 0.25 · Seedream 5.0 Pro 2.5 / 장)
  const MODELS = [
    { id: 'gpt_image_2_5', name: 'GPT Image 2.5', note: '패키지·타이포 정확', cost: 0.25, count: 2 },
    { id: 'seedream_v5_pro', name: 'Seedream 5.0 Pro', note: '고급 질감·2K', cost: 2.5, count: 1 },
  ];

  function openDesigner() {
    if (!X() || !window.LukeAuth?.isSiteAdmin?.()) return msg('운영자 계정으로 로그인해 주세요.');
    const st = { cat: CATS[0], form: CATS[0][3][0], material: MATERIALS[0], color: COLORS[0], mood: MOODS[0], name: '', brief: '', briefName: '', refs: [], models: new Set(MODELS.map(m => m.id)), open: false, jobs: [], pick: null };
    const ov = el('div', { class: 'lmx-modal', role: 'dialog', 'aria-modal': 'true' });
    const body = el('div', { class: 'lmx-dbody' });
    const foot = el('div', { class: 'lmx-dfoot' });
    ov.append(el('div', { class: 'lmx-dialog' }, el('div', { class: 'lmx-dhead' }, el('span', { text: '새 제품 디자인' }), el('button', { type: 'button', class: 'lmx-btn ghost', text: '✕', onclick: () => ov.remove() })), body, foot));
    document.body.append(ov);
    const briefIn = el('input', { type: 'file', accept: '.md,.txt,text/plain,text/markdown', hidden: true });
    const refIn = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, hidden: true });
    ov.append(briefIn, refIn);
    briefIn.onchange = async () => { const f = briefIn.files[0]; briefIn.value = ''; if (!f) return; if (f.size > 200000) return alertBox('200KB 이하 문서만 넣을 수 있어요.'); st.brief = (await f.text()).slice(0, 3000); st.briefName = f.name; draw(); };
    refIn.onchange = async () => { for (const f of [...refIn.files].slice(0, 4 - st.refs.length)) { try { st.refs.push((await X().call('/upload', f, f.type)).url); } catch (e) { alertBox(e.message); } } refIn.value = ''; draw(); };
    let note = '';
    const alertBox = t => { note = t; draw(); };
    const sumEl = el('div', { class: 'lmx-in', style: 'flex:1' }); // '이렇게 만들게요' 요약 줄

    const summary = () => `${st.form} · ${st.material} · ${st.color} — ${st.mood} 무드 — ${st.cat[1]}${st.name ? ' · ' + st.name : ''}`;
    const chips = (label, list, cur, set) => el('div', {}, el('div', { class: 'lmx-label', text: label }), el('div', { class: 'lmx-chips' }, ...list.map(v => { const b = el('button', { type: 'button', class: 'lmx-chip' + (v === cur ? ' on' : ''), text: v }); b.onclick = () => { set(v); draw(); }; return b; })));
    const cost = () => [...st.models].reduce((n, id) => { const m = MODELS.find(x => x.id === id); return n + m.cost * m.count; }, 0);

    async function run() {
      const prompt = [
        `Original product design concept (fictional brand, do not copy existing brands): a ${st.cat[1]} product, form: ${st.form}, material: ${st.material}, color palette: ${st.color}, mood: ${st.mood}.`,
        st.name ? `Print the product/brand name "${st.name}" on the packaging as clean logo typography.` : 'No readable brand text on the packaging, or only a subtle abstract mark.',
        st.brief ? 'Brand brief (follow its tone and positioning):\n' + st.brief.slice(0, 1500) : '',
        st.refs.length ? 'The reference images are a moodboard: follow their design language and finish, but create an original design.' : '',
        'Premium e-commerce hero shot: the single product centered on a seamless light studio background, soft diffused light, realistic materials, 4:5 framing, no extra props, no text other than the packaging typography.',
      ].filter(Boolean).join('\n');
      st.jobs = [];
      for (const id of st.models) {
        const m = MODELS.find(x => x.id === id);
        try { st.jobs.push({ model: m, job: await X().submit({ type: 'image', model: m.id, aspect: '4:5', count: m.count, refs: st.refs, prompt, title: X().tag('design', 'product', m.name) }) }); }
        catch (e) { alertBox(e.message); }
      }
      draw(); poll();
    }
    async function poll() {
      while (ov.isConnected && st.jobs.some(j => !['done', 'failed'].includes(j.job.status))) {
        await new Promise(r => setTimeout(r, 4000));
        for (const j of st.jobs) if (!['done', 'failed'].includes(j.job.status)) { try { j.job = await X().call('/job/' + j.job.id); } catch {} }
        draw();
      }
    }
    async function confirmPick() {
      const name = st.name.trim() || prompt('제품 이름을 정해 주세요', '');
      if (!name) return;
      try {
        const d = await P().api('products-create', { name: name.slice(0, 80), category: st.cat[2], description: `${summary()}${st.brief ? ' · 브리프: ' + st.brief.replace(/\s+/g, ' ').slice(0, 300) : ''}`.slice(0, 500), image_url: st.pick });
        ov.remove();
        await P().reload();
        if (d.product?.id != null) P().open(d.product.id);
        msg('제품을 확정했어요. 이제 키비주얼·연출컷·모션 루프를 만들 수 있어요.');
      } catch (e) { alertBox(e.message); }
    }

    function draw() {
      sumEl.textContent = summary();
      const candidates = [];
      for (const { model, job } of st.jobs) {
        if (job.status === 'done') (job.results || []).forEach(u => { const c = el('button', { type: 'button', class: 'lmx-card' + (st.pick === u ? ' on' : ''), style: st.pick === u ? 'outline:3px solid #7c6cff' : '' }, el('img', { src: u, alt: '' }), el('span', { text: model.name })); c.onclick = () => { st.pick = u; draw(); }; candidates.push(c); });
        else if (job.status === 'failed') candidates.push(el('div', { class: 'lmx-wait' }, el('b', { text: model.name + ' 실패' }), el('small', { text: job.error || '' })));
        else for (let i = 0; i < model.count; i++) candidates.push(el('div', { class: 'lmx-wait' }, el('div', { class: 'lmx-spin' }), el('span', { text: `${model.name} · 만드는 중…` }), job.note ? el('small', { text: job.note }) : null));
      }
      body.replaceChildren(...[ // 빈 항목(null)은 빼고 넣는다
        el('h2', { style: 'margin:0', text: '어떤 제품을 만들까요?' }),
        el('p', { style: 'color:#8b8fa3;font-size:13px', text: '조건을 설정하면 여러 이미지 모델이 제품 이미지를 만들어 비교시켜 드려요. 넣은 레퍼런스 이미지는 그대로 생성에 함께 전달돼요.' }),
        el('div', { class: 'lmx-label', text: '카테고리' }),
        el('div', { class: 'lmx-chips' }, ...CATS.map(c => { const b = el('button', { type: 'button', class: 'lmx-chip' + (c === st.cat ? ' on' : ''), text: `${c[0]} ${c[1]}` }); b.onclick = () => { st.cat = c; st.form = c[3][0]; draw(); }; return b; })),
        el('div', { class: 'lmx-label', text: '제품 / 브랜드 이름 (선택 — 넣으면 패키지에 로고 타이포로 들어갑니다)' }),
        (() => { const i = el('input', { class: 'lmx-in', maxlength: '40', placeholder: '예: LUMEN' }); i.value = st.name; i.oninput = () => { st.name = i.value; sumEl.textContent = summary(); }; return i; })(),
        el('div', { class: 'lmx-label', text: '이렇게 만들게요' }),
        el('div', { class: 'lmx-row' }, sumEl, el('button', { type: 'button', class: 'lmx-btn ghost', text: st.open ? '닫기' : '바꾸기', onclick: () => { st.open = !st.open; draw(); } })),
        st.open ? el('div', { class: 'lmx-box', style: 'margin-top:8px' }, chips('형태', st.cat[3], st.form, v => st.form = v), chips('소재', MATERIALS, st.material, v => st.material = v), chips('컬러', COLORS, st.color, v => st.color = v), chips('무드', MOODS, st.mood, v => st.mood = v)) : null,
        el('details', { style: 'margin-top:14px' }, el('summary', { style: 'cursor:pointer;font-weight:700', text: '▸ 브리프 · 레퍼런스 (선택)' }),
          el('div', { class: 'lmx-box', style: 'margin-top:8px' },
            el('div', { class: 'lmx-label', style: 'margin-top:0', text: '브랜드 브리프 (.md / .txt)' }),
            el('div', { class: 'lmx-row' }, el('button', { type: 'button', class: 'lmx-btn ghost', text: st.briefName ? '📄 ' + st.briefName : '파일 첨부', onclick: () => briefIn.click() }), st.briefName ? el('button', { type: 'button', class: 'lmx-btn ghost', text: '빼기', onclick: () => { st.brief = ''; st.briefName = ''; draw(); } }) : null),
            el('p', { style: 'color:#8b8fa3;font-size:12px', text: '브랜드 기획서를 넣으면 디자인 톤과 포지셔닝을 브리프에 맞춰 만들어요.' }),
            el('div', { class: 'lmx-label', text: `레퍼런스 / 무드보드 이미지 (최대 4장 · ${st.refs.length}/4)` }),
            el('div', { class: 'lmx-refs' }, ...st.refs.map((u, i) => el('div', { class: 'lmx-ref' }, el('img', { src: u, alt: '' }), el('div', {}, el('button', { type: 'button', text: '빼기', onclick: () => { st.refs.splice(i, 1); draw(); } })))),
              st.refs.length < 4 ? el('button', { type: 'button', class: 'lmx-btn ghost', text: '+', style: 'width:64px;height:64px', onclick: () => refIn.click() }) : null))),
        el('div', { class: 'lmx-label', text: '비교할 이미지 모델' }),
        el('div', { class: 'lmx-models' }, ...MODELS.map(m => { const b = el('button', { type: 'button', class: 'lmx-model' + (st.models.has(m.id) ? ' on' : '') }, el('b', { text: m.name }), el('small', { text: `${m.note} · ${m.count}장 · 약 ${Math.round(m.cost * m.count * 100) / 100}크레딧` })); b.onclick = () => { st.models.has(m.id) ? (st.models.size > 1 && st.models.delete(m.id)) : st.models.add(m.id); draw(); }; return b; })),
        note ? el('div', { class: 'lmx-note', text: note }) : null,
        st.jobs.length ? el('div', { class: 'lmx-sub' }, el('div', { class: 'lmx-label', text: '후보 — 마음에 드는 디자인을 고르세요' }), el('div', { class: 'lmx-grid' }, ...candidates)) : null].filter(Boolean));
      const total = Math.round(cost() * 100) / 100;
      const go = el('button', { type: 'button', class: 'lmx-btn', text: st.jobs.length ? `다시 만들기 ✦ ${total}` : `제품 후보 만들기 ✦ ${total}` });
      go.disabled = st.jobs.some(j => !['done', 'failed'].includes(j.job.status));
      go.onclick = () => { note = ''; st.pick = null; run(); };
      const ok = el('button', { type: 'button', class: 'lmx-btn', text: '이 디자인으로 확정' });
      ok.disabled = !st.pick; ok.onclick = confirmPick;
      foot.replaceChildren(el('button', { type: 'button', class: 'lmx-btn ghost', text: '닫기', onclick: () => ov.remove() }), go, ok);
    }
    draw();
  }

  // 내 제품 사진 올리기: 파일을 고르면 공개 주소를 만들고, Claude가 사진을 읽어 설명을 채운다
  function enhanceOwnerForm() {
    const form = document.getElementById('owner-form');
    if (!form || form.dataset.lmx) return;
    form.dataset.lmx = '1';
    const urlInput = form.querySelector('input[name=image_url]');
    const file = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' });
    const prev = el('img', { alt: '', style: 'display:none;max-width:160px;border-radius:10px;margin:6px 0' });
    const status = el('small', { style: 'display:block;color:#9aa0b5;margin-bottom:10px', text: '사진을 고르면 주소가 자동으로 채워지고, AI가 사진을 보고 설명을 써 줘요(크레딧 없음).' });
    const tips = el('small', { style: 'display:block;color:#9aa0b5;line-height:1.7;margin-bottom:8px', text: '✓ 제품 전체가 보이게  ✓ 라벨·로고가 정면으로  ✓ 배경이 단순한 사진   ✕ 손·다른 물건이 가린 사진  ✕ 흐리거나 어두운 사진' });
    const label = el('label', {}, '제품 사진 (끌어다 놓거나 눌러서 고르기)', file);
    urlInput.closest('label').before(label, prev, tips, status);
    file.onchange = async () => {
      const f = file.files[0]; if (!f || !X()) return;
      status.textContent = '사진 올리는 중…';
      try {
        const url = (await X().call('/upload', f, f.type)).url;
        urlInput.value = url; prev.src = url; prev.style.display = 'block';
        status.textContent = 'AI가 사진을 읽고 있어요… (보통 30초~1분)';
        let job = await X().submit({ type: 'analyze', task: 'product', images: [url], title: X().tag('upload', 'analyze') });
        while (!['done', 'failed'].includes(job.status)) { await new Promise(r => setTimeout(r, 3000)); job = await X().call('/job/' + job.id); }
        if (job.status === 'failed') throw new Error(job.error || '사진을 읽지 못했어요');
        const r = JSON.parse(job.text);
        const desc = form.querySelector('textarea[name=description]');
        if (desc && !desc.value.trim()) desc.value = String(r.summary || '').slice(0, 500);
        const name = form.querySelector('input[name=name]');
        status.textContent = 'AI가 설명을 채웠어요. 고칠 부분이 있으면 고친 뒤 등록하세요.' + (name && !name.value ? ' 상품명을 적어 주세요.' : '');
      } catch (e) { status.textContent = e.message; }
    };
  }

  function addListButtons() {
    const toggle = document.getElementById('owner-toggle');
    if (!toggle || document.getElementById('lmx-design')) return;
    const b = el('button', { type: 'button', id: 'lmx-design', text: '✦ AI 가상 제품 만들기', style: 'border:1px solid #6d7cff;background:#1b1838;color:#d9d4ff;border-radius:8px;padding:9px 13px;margin:0 0 16px 8px', onclick: openDesigner });
    b.hidden = toggle.hidden;
    toggle.after(b);
    new MutationObserver(() => { b.hidden = toggle.hidden; }).observe(toggle, { attributes: true, attributeFilter: ['hidden'] });
  }

  function init() { enhanceOwnerForm(); addListButtons(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.LukeProductX = { openDesigner };
})();
