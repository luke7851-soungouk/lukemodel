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

  // 카테고리: [아이콘, 이름, 사이트 상품 카테고리] — 세부 스펙은 spec.js(LUKE_PRODUCT_SPEC)
  const CATS = [
    ['🧴', '스킨케어', '뷰티·스킨케어'], ['💄', '색조 / 메이크업', '메이크업'], ['🧖', '헤어 / 바디', '헤어·바디'],
    ['🌸', '향수 / 프래그런스', '향수'], ['💊', '건강기능식품', '식품·음료'], ['🥤', '음료 / F&B', '식품·음료'],
    ['🎧', '테크 / 가전', '디지털·가전'], ['👜', '패션 잡화', '가방·잡화'], ['🕯️', '리빙 / 홈', '리빙·인테리어'],
    ['🐾', '펫', '기타'], ['', '기타', '기타'],
  ];
  const POSITION = ['매스', '매스티지', '프리미엄', '럭셔리', '니치'];
  const MOODS = ['미니멀·클린', '럭셔리·프리미엄', '내추럴·오가닉', '클리니컬·더마', '테크·퓨처', '플레이풀·팝', '빈티지·레트로', '웜·코지'];
  const MOOD_MAX = 4;
  // 두 엔진 × 2장 (힉스필드 견적: GPT Image 2.5 장당 0.25 · Seedream 5.0 Pro 장당 2.5)
  const ENGINES = [{ id: 'gpt_image_2_5', name: 'GPT Image 2.5', cost: 0.25 }, { id: 'seedream_v5_pro', name: 'Seedream 5.0 Pro', cost: 2.5 }];
  const PER_ENGINE = 2;
  const COST = Math.round(ENGINES.reduce((n, e) => n + e.cost * PER_ENGINE, 0) * 100) / 100;
  const BRIEF_TEMPLATE = `# 브랜드 기획안 양식

## 브랜드
- 브랜드 / 제품 이름:
- 카테고리: (스킨케어 / 색조 / 헤어·바디 / 향수 / 건강기능식품 / 음료 / 테크 / 패션 잡화 / 리빙 / 펫)
- 타깃 고객:
- 가격대: (매스 / 매스티지 / 프리미엄 / 럭셔리 / 니치)
- 핵심 키워드 3개:

## 제품
- 품목:
- 패키지 형태:
- 소재 / 마감:
- 컬러:
- 라인 구성: (단품 / 라인)

## 무드
- 브랜드 무드 (최대 4개):
- 참고 브랜드·이미지:

## 컷 (키비주얼)
1. 컷 이름 / 앵글 / 비율 / 모델 유무 / 장면 설명
2.
3.
`;

  const SPEC = () => window.LUKE_PRODUCT_SPEC || {};
  const css = `.pdx{position:fixed;inset:0;z-index:9000;overflow:auto;background:#0b0b0e;color:#f1f2f7;padding:0 20px 120px;font:15px Pretendard,system-ui,sans-serif}.pdx *{box-sizing:border-box}.pdx [hidden]{display:none!important}
  .pdx-top{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:12px;max-width:1120px;margin:0 auto;padding:16px 0;background:#0b0b0e}.pdx-brand{font-weight:900;letter-spacing:.06em;font-size:14px}
  .pdx-steps{display:flex;gap:6px;align-items:center}.pdx-steps span{display:flex;align-items:center;gap:8px;color:#6d7385;font:700 13px Pretendard,system-ui;padding:6px 8px}.pdx-steps span i{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:#1d1f27;font-style:normal;font-size:12px}.pdx-steps span.on{color:#fff}.pdx-steps span.on i{background:#2a2c3a}.pdx-steps em{width:26px;height:1px;background:#2a2d38}
  .pdx button{font:inherit;cursor:pointer}.pdx-ghost{background:#1f2129;border:1px solid #30333e;color:#fff;border-radius:10px;padding:9px 13px;font-size:13px!important;font-weight:700!important;white-space:nowrap;flex:0 0 auto}
  .pdx-grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:18px;max-width:1120px;margin:10px auto 0;align-items:start}.pdx-grid.one{grid-template-columns:minmax(0,760px);justify-content:center}
  .pdx-main{padding:24px;background:#141418;border:1px solid #23252e;border-radius:16px}.pdx-main h1{font-size:26px;margin:0 0 6px}.pdx-main>p{color:#9aa0b5;font-size:13px;margin:0 0 20px;line-height:1.6}
  .pdx-label{font-size:13px;font-weight:700;color:#d9dbe6;margin:0 0 8px}
  .pdx-cats{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin-bottom:18px}.pdx-cat{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:72px;padding:8px 6px;background:rgba(255,255,255,.03);border:1px solid #23252e;border-radius:10px;color:#c9cbd8;font-size:14px;text-align:center}.pdx-cat b{font-size:17px;font-weight:400}.pdx-cat.on{background:rgba(109,125,255,.14);border-color:#7b7fe0;color:#fff}
  .pdx-in{width:100%;background:#0f1016;border:1px solid #23252e;border-radius:10px;color:#fff;padding:12px 14px;font:14px Pretendard,system-ui}textarea.pdx-in{min-height:130px;resize:vertical;line-height:1.6}
  .pdx-sum{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px 14px;background:rgba(130,140,255,.07);border:1px solid rgba(150,160,255,.14);border-radius:10px;margin:18px 0 16px}.pdx-sum small{display:block;color:#a9abc2;font-size:13px;margin-bottom:4px}.pdx-sum strong{font-size:15.5px}
  .pdx-more{border:1px solid #1f212b;border-radius:10px;padding:14px}.pdx-more summary{cursor:pointer;display:flex;gap:10px;align-items:center;list-style:none;font-size:13px}.pdx-more summary::-webkit-details-marker{display:none}.pdx-more summary::before{content:'▸';color:#8c92a3;font-size:10px}.pdx-more[open] summary::before{content:'▾'}.pdx-more summary small{color:#7c8294;font-size:11.5px}
  .pdx-box{margin-top:14px;padding:16px;background:rgba(130,140,255,.05);border:1px solid rgba(150,160,255,.12);border-radius:10px}.pdx-box p{color:#8c92a3;font-size:11.5px;margin:4px 0 10px;line-height:1.6}.pdx-row{display:flex;justify-content:space-between;align-items:center;gap:10px}.pdx-auto{max-width:620px}.pdx-auto a{color:#c7c9ff;text-decoration:underline;cursor:pointer}
  .pdx-refs{display:flex;gap:10px;flex-wrap:wrap}.pdx-ref{position:relative;width:66px;height:66px;border-radius:10px;overflow:hidden;background:#101116}.pdx-ref img{width:100%;height:100%;object-fit:cover}.pdx-ref button{position:absolute;top:3px;right:3px;width:20px;height:20px;border-radius:50%;border:0;background:#000a;color:#fff;font-size:12px;padding:0}.pdx-tile{width:66px;height:66px;border:1px dashed #3a3d4c;border-radius:10px;display:grid;place-items:center;color:#8c92a3;font-size:20px;background:none}
  .pdx-side{position:sticky;top:70px;max-height:calc(100vh - 170px);overflow:auto;padding:18px 16px;background:rgba(130,140,255,.07);border:1px solid rgba(150,160,255,.14);border-radius:12px}.pdx-side-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;font-size:14px}.pdx-side-head button{background:none;border:0;color:#fff;font-size:13px}
  .pdx-grp{margin:0 0 16px}.pdx-chips{display:flex;flex-wrap:wrap;gap:6px}.pdx-chip{background:transparent;border:1px solid rgba(150,160,255,.14);color:#a9abc2;font:500 14px Pretendard,system-ui!important;padding:0 12px;height:28px;border-radius:96px}.pdx-chip i{font-style:normal;font-size:7px;opacity:.55;margin-left:5px;vertical-align:2px}.pdx-chip.on{background:#12121c;border-color:#12121c;color:#fff}.pdx-chip.multi.on{background:#6d7dff;border-color:#6d7dff}
  .pdx-bar{position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:7;display:flex;gap:18px;align-items:center;justify-content:center;width:min(760px,calc(100% - 24px));padding:12px;background:#0f1016;border:1px solid #23252e;border-radius:16px;box-shadow:0 10px 30px #0008}.pdx-bar .pdx-lib{background:none;border:0;color:#fff;font-weight:700}.pdx-primary{min-width:270px;border:0;border-radius:10px;padding:13px 20px;color:#fff;font-weight:800!important;background:linear-gradient(135deg,#6d7cff,#9b5cff)}.pdx-primary:disabled{opacity:.45;cursor:not-allowed}
  .pdx-note{margin-top:12px;font-size:12.5px;color:#c9cbff;background:#151628;border-radius:10px;padding:10px 12px;line-height:1.6}
  .pdx-cands{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:16px}.pdx-cand{position:relative;border:2px solid #22242c;border-radius:14px;overflow:hidden;background:#18191f;padding:0;color:#fff;text-align:left}.pdx-cand.on{border-color:#7c6cff}.pdx-cand img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover}.pdx-cand span{position:absolute;left:8px;top:8px;font-size:11px;background:#000a;padding:2px 7px;border-radius:6px}.pdx-wait{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;aspect-ratio:4/5;border-radius:14px;background:#18191f;color:#aab;font-size:12px;text-align:center;padding:8px}
  .pdx-confirm{display:grid;grid-template-columns:260px 1fr;gap:22px;align-items:start}.pdx-confirm img{width:100%;border-radius:14px}
  @media(max-width:900px){.pdx-grid{grid-template-columns:1fr}.pdx-side{position:static;max-height:none}.pdx-cats{grid-template-columns:repeat(3,minmax(0,1fr))}.pdx-cands{grid-template-columns:repeat(2,minmax(0,1fr))}.pdx-confirm{grid-template-columns:1fr}.pdx-steps span b{display:none}}`;

  function openDesigner() {
    if (!X() || !window.LukeAuth?.isSiteAdmin?.()) return msg('운영자 계정으로 로그인해 주세요.');
    if (!document.getElementById('pdx-css')) document.head.append(el('style', { id: 'pdx-css', text: css }));
    const st = { step: 1, cat: CATS[0], item: '', form: '', material: '', color: '', line: '', position: '프리미엄', moods: ['미니멀·클린'], detail: '', name: '', brief: '', briefName: '', refs: [], side: false, more: {}, jobs: [], pick: null, note: '', autoBusy: false };
    const spec = () => SPEC()[st.cat[1]] || { items: [], forms: [] };
    const formRow = () => spec().forms.find(f => f[0] === st.form) || spec().forms[0] || ['', [], [], []];
    // 카테고리·패키지를 바꾸면 그 조합에서 가능한 첫 값으로 맞춘다
    function fit(resetForm) {
      const s = spec();
      if (resetForm || !s.forms.some(f => f[0] === st.form)) st.form = s.forms[0]?.[0] || '';
      const [, mats, cols, lines] = formRow();
      if (resetForm || !mats.includes(st.material)) st.material = mats[0] || '';
      if (resetForm || !cols.includes(st.color)) st.color = cols[0] || '';
      if (resetForm || !lines.includes(st.line)) st.line = lines[0] || '';
      if (st.item && !s.items.includes(st.item)) st.item = '';
    }
    // 처음 화면은 참고 사이트와 같은 조합(드로퍼 / 앰플 · 프로스티드 글래스)으로 시작
    st.form = '드로퍼 / 앰플'; st.material = '프로스티드 글래스'; fit(false); st.line = '';
    const summary = () => [st.form, st.material, st.color].filter(Boolean).join(' · ') + ` — ${st.moods.join('·')} 무드 — ${st.position} ${st.cat[1]}` + (st.line ? ' · ' + st.line : '') + (st.item ? ' · ' + st.item : '');

    const root = el('div', { class: 'pdx', role: 'dialog', 'aria-modal': 'true', 'aria-label': '새 제품 디자인' });
    document.body.append(root);
    const close = () => root.remove();
    const briefIn = el('input', { type: 'file', accept: '.md,.txt,text/plain,text/markdown', hidden: true });
    const refIn = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, hidden: true });
    root.append(briefIn, refIn);
    briefIn.onchange = async () => { const f = briefIn.files[0]; briefIn.value = ''; if (!f) return; if (f.size > 200000) { st.note = '200KB 이하 문서만 넣을 수 있어요.'; return draw(); } st.brief = (await f.text()).replace(/\u0000/g, '').slice(0, 3000); st.briefName = f.name; draw(); };
    refIn.onchange = async () => { for (const f of [...refIn.files].slice(0, 4 - st.refs.length)) { try { st.refs.push((await X().call('/upload', f, f.type)).url); } catch (e) { st.note = e.message; } } refIn.value = ''; draw(); };

    const chip = (text, on, onclick, opts = {}) => el('button', { type: 'button', class: 'pdx-chip' + (opts.multi ? ' multi' : '') + (on ? ' on' : ''), onclick }, text, opts.dot ? el('i', { text: '●' }) : null);
    function group(title, list, cur, set, opts = {}) {
      if (!list.length) return null;
      const limit = opts.limit && !st.more[title] && list.length > opts.limit + 1 ? opts.limit : list.length;
      const shown = list.slice(0, limit);
      if (cur && !shown.includes(cur) && list.includes(cur)) shown[shown.length - 1] = cur; // 고른 값은 접혀도 보이게
      return el('div', { class: 'pdx-grp' }, el('div', { class: 'pdx-label', text: title }),
        el('div', { class: 'pdx-chips' }, ...shown.map(v => chip(v, Array.isArray(cur) ? cur.includes(v) : v === cur, () => { set(v); draw(); }, opts)),
          limit < list.length ? el('button', { type: 'button', class: 'pdx-chip', text: `더 보기 +${list.length - limit}`, onclick: () => { st.more[title] = true; draw(); } }) : null));
    }

    // 기획안으로 자동 설정: Claude가 브리프를 읽고 칩을 골라 준다 (크레딧 없음)
    async function autoFromBrief() {
      if (!st.brief.trim()) { st.note = '먼저 브랜드 브리프를 첨부하거나 붙여 넣어 주세요. 「양식 받기」로 받은 양식을 채워 넣으면 가장 정확해요.'; return draw(); }
      st.autoBusy = true; st.note = 'Claude가 기획안을 읽고 설정을 고르고 있어요… (보통 30초~1분)'; draw();
      try {
        const options = Object.fromEntries(Object.entries(SPEC()).map(([c, v]) => [c, { items: v.items, forms: v.forms.map(f => ({ form: f[0], materials: f[1], colors: f[2], lines: f[3] })) }]));
        let job = await X().submit({ type: 'analyze', task: 'brief', images: [], title: X().tag('design', 'analyze'), context: JSON.stringify({ brief: st.brief.slice(0, 2500), options, positions: POSITION, moods: MOODS }) });
        while (!['done', 'failed'].includes(job.status)) { await new Promise(r => setTimeout(r, 3000)); job = await X().call('/job/' + job.id); if (!root.isConnected) return; }
        if (job.status === 'failed') throw new Error(job.error || '기획안을 읽지 못했어요');
        const r = JSON.parse(job.text);
        const cat = CATS.find(c => c[1] === r.category);
        if (cat) { st.cat = cat; st.more = {}; }
        st.form = r.form || ''; fit(false);
        if (formRow()[1].includes(r.material)) st.material = r.material;
        if (formRow()[2].includes(r.color)) st.color = r.color;
        if (formRow()[3].includes(r.line)) st.line = r.line;
        if (spec().items.includes(r.item)) st.item = r.item;
        if (POSITION.includes(r.position)) st.position = r.position;
        const m = (r.moods || []).filter(x => MOODS.includes(x)).slice(0, MOOD_MAX); if (m.length) st.moods = m;
        if (r.name && !st.name) st.name = String(r.name).slice(0, 40);
        if (r.detail) st.detail = String(r.detail).slice(0, 300);
        st.note = '기획안에 맞춰 설정을 골랐어요. 「바꾸기」에서 확인하고 고칠 수 있어요.'; st.side = true;
      } catch (e) { st.note = e.message; }
      st.autoBusy = false; draw();
    }

    async function generate() {
      const prompt = [
        `Original product design concept for a fictional brand (do not copy any existing brand): ${st.cat[1]} product${st.item ? ` (${st.item})` : ''}.`,
        `Package form: ${st.form}. Material / finish: ${st.material}. Colorway: ${st.color}.${st.line ? ` Line: ${st.line}${st.line.startsWith('라인') ? ' — show 2-3 variants of the same design with accent color variations' : ''}.` : ''}`,
        `Positioning: ${st.position}. Brand mood: ${st.moods.join(', ')}.`,
        st.name ? `Print the product/brand name "${st.name}" on the packaging as clean logo typography.` : 'No readable brand text on the packaging, or only a subtle abstract mark.',
        st.detail ? 'Extra details: ' + st.detail : '',
        st.brief ? 'Brand brief (follow its tone and positioning):\n' + st.brief.slice(0, 1500) : '',
        st.refs.length ? 'The reference images are a moodboard: follow their design language and finish, but create an original design.' : '',
        'Premium e-commerce product shot: centered on a seamless light studio background, soft diffused light, realistic materials, 4:5 framing, no extra props, no text other than the packaging typography.',
      ].filter(Boolean).join('\n');
      st.jobs = []; st.pick = null; st.note = ''; st.step = 2; draw();
      for (const e of ENGINES) {
        try { st.jobs.push({ engine: e, job: await X().submit({ type: 'image', model: e.id, aspect: '4:5', count: PER_ENGINE, refs: st.refs, prompt, title: X().tag('design', 'product', e.name) }) }); }
        catch (err) { st.note = err.message; }
      }
      draw();
      while (root.isConnected && st.jobs.some(j => !['done', 'failed'].includes(j.job.status))) {
        await new Promise(r => setTimeout(r, 4000));
        for (const j of st.jobs) if (!['done', 'failed'].includes(j.job.status)) { try { j.job = await X().call('/job/' + j.job.id); } catch {} }
        draw();
      }
    }
    async function register() {
      const name = st.name.trim();
      if (!name) { st.note = '제품 이름을 적어 주세요.'; return draw(); }
      try {
        const d = await P().api('products-create', { name: name.slice(0, 80), category: st.cat[2], description: `${summary()}${st.brief ? ' · 브리프: ' + st.brief.replace(/\s+/g, ' ').slice(0, 250) : ''}`.slice(0, 500), image_url: st.pick });
        close(); await P().reload();
        if (d.product?.id != null) P().open(d.product.id);
        msg('제품을 확정했어요. 이제 키비주얼·연출컷·모션 루프를 만들 수 있어요.');
      } catch (e) { st.note = e.message; draw(); }
    }

    function stepper() {
      return el('nav', { class: 'pdx-steps', 'aria-label': '제품 만들기 단계' }, ...[['1', '제품 스펙'], ['2', '제품 이미지'], ['3', '제품 확정']].flatMap(([n, t], i) => [i ? el('em') : null, el('span', { class: +n === st.step ? 'on' : '' }, el('i', { text: n }), el('b', { text: t }))]));
    }
    function step1() {
      const s = spec(), [, mats, cols, lines] = formRow();
      const nameIn = el('input', { class: 'pdx-in', maxlength: '40', placeholder: '예: GLOW SERUM, AURA…' }); nameIn.value = st.name;
      nameIn.oninput = () => { st.name = nameIn.value; sumEl.textContent = summary(); };
      const sumEl = el('strong', { text: summary() });
      const briefTa = el('textarea', { class: 'pdx-in', placeholder: '예: 20대 타깃 비건 스킨케어 런칭. 투명성·미니멀·클린뷰티가 핵심 키워드…' }); briefTa.value = st.brief; briefTa.oninput = () => { st.brief = briefTa.value; };
      const template = el('a', { text: '양식 받기', onclick: () => { const a = el('a', { href: URL.createObjectURL(new Blob([BRIEF_TEMPLATE], { type: 'text/markdown' })), download: 'lukemodel-기획안-양식.md' }); document.body.append(a); a.click(); a.remove(); } });
      const main = el('section', { class: 'pdx-main' },
        el('h1', { text: '어떤 제품을 만들까요?' }),
        el('p', { text: '조건을 설정하면 여러 이미지 모델이 제품 이미지를 만들어 비교시켜 드려요. 넣은 레퍼런스 이미지는 그대로 생성에 함께 전달돼요.' }),
        el('div', { class: 'pdx-label', text: '카테고리' }),
        el('div', { class: 'pdx-cats' }, ...CATS.map(c => el('button', { type: 'button', class: 'pdx-cat' + (c === st.cat ? ' on' : ''), onclick: () => { st.cat = c; st.more = {}; st.item = ''; fit(true); draw(); } }, c[0] ? el('b', { text: c[0] }) : null, c[1]))),
        el('div', { class: 'pdx-label', text: '제품 / 브랜드 이름 (선택 — 넣으면 패키지에 로고 타이포로 들어갑니다)' }), nameIn,
        el('div', { class: 'pdx-sum' }, el('div', {}, el('small', { text: '이렇게 만들게요' }), sumEl), el('button', { type: 'button', class: 'pdx-ghost', text: st.side ? '닫기' : '바꾸기', onclick: () => { st.side = !st.side; draw(); } })),
        el('details', { class: 'pdx-more', open: true }, el('summary', {}, el('b', { text: '기획안 · 브리프 · 레퍼런스 (선택)' }), el('small', { text: '기획안으로 자동 설정 · 브랜드 브리프 · 레퍼런스 사진' })),
          el('div', { class: 'pdx-box pdx-row' }, el('div', { class: 'pdx-auto' }, el('b', { text: '기획안으로 자동 설정' }), el('p', {}, '칩을 하나씩 고르는 대신 기획안(브리프)만 첨부해서 시작할 수 있어요.', el('br'), '기획안에 컷(씬)이 있으면 제품을 확정한 뒤 그 컷들이 앵글·비율·모델까지 맞춰 키비주얼로 들어가요 · ', template)),
            el('button', { type: 'button', class: 'pdx-ghost', text: st.autoBusy ? '읽는 중…' : '자동으로', disabled: st.autoBusy, onclick: autoFromBrief })),
          el('div', { class: 'pdx-box' }, el('div', { class: 'pdx-row' }, el('b', { text: '브랜드 브리프 (선택)' }), el('button', { type: 'button', class: 'pdx-ghost', text: st.briefName ? '📄 ' + st.briefName : '.md / .txt 파일 첨부', onclick: () => briefIn.click() })),
            el('p', { text: '브랜드 기획서를 넣으면 디자인·키비주얼 컨셉까지 브리프에 맞춰 전개합니다.' }), briefTa),
          el('div', { class: 'pdx-box' }, el('b', { text: '레퍼런스 / 무드보드 이미지 (선택, 최대 4장)' }), el('p', { text: '참고 제품·패키지 무드보드를 넣으면 이미지가 그대로 생성에 레퍼런스로 전달돼요. 그 결의 오리지널 디자인으로 만들어요.' }),
            el('div', { class: 'pdx-refs' }, ...st.refs.map((u, i) => el('div', { class: 'pdx-ref' }, el('img', { src: u, alt: '' }), el('button', { type: 'button', text: '×', 'aria-label': '빼기', onclick: () => { st.refs.splice(i, 1); draw(); } }))),
              st.refs.length < 4 ? el('button', { type: 'button', class: 'pdx-tile', text: '+', onclick: () => refIn.click() }) : null))),
        st.note ? el('div', { class: 'pdx-note', text: st.note }) : null);
      const detailTa = el('textarea', { class: 'pdx-in', placeholder: '예: 뚜껑에 은은한 골드 포인트, 라벨은 세로 정렬…', style: 'min-height:80px' }); detailTa.value = st.detail; detailTa.oninput = () => { st.detail = detailTa.value; };
      const side = st.side ? el('aside', { class: 'pdx-side' },
        el('div', { class: 'pdx-side-head' }, el('b', { text: '바꾸기' }), el('button', { type: 'button', text: '닫기', onclick: () => { st.side = false; draw(); } })),
        group('품목', s.items, st.item, v => { st.item = st.item === v ? '' : v; }),
        group('패키지 형태', s.forms.map(f => f[0]), st.form, v => { st.form = v; fit(false); }, { dot: true, limit: 9 }),
        group('소재 / 마감', mats, st.material, v => { st.material = v; }, { dot: true, limit: 9 }),
        group('컬러웨이', cols, st.color, v => { st.color = v; }, { dot: true, limit: 3 }),
        group('라인 구성', lines, st.line, v => { st.line = v; }, { dot: true }),
        group('가격대 / 포지셔닝', POSITION, st.position, v => { st.position = v; }),
        group(`브랜드 무드 (최대 ${MOOD_MAX}개)`, MOODS, st.moods, v => { if (st.moods.includes(v)) { if (st.moods.length > 1) st.moods = st.moods.filter(x => x !== v); } else if (st.moods.length < MOOD_MAX) st.moods = [...st.moods, v]; }, { multi: true }),
        el('div', { class: 'pdx-grp' }, el('div', { class: 'pdx-label', text: '추가 디테일 (선택)' }), detailTa)) : null;
      return [el('div', { class: 'pdx-grid' + (st.side ? '' : ' one') }, main, side),
        el('div', { class: 'pdx-bar' }, el('button', { type: 'button', class: 'pdx-lib', text: '라이브러리로', onclick: close }),
          el('button', { type: 'button', class: 'pdx-primary', text: `제품 이미지 생성 (2엔진 ×${PER_ENGINE}) ✦ ${COST}`, onclick: generate }))];
    }
    function step2() {
      const cards = [];
      for (const { engine, job } of st.jobs) {
        if (job.status === 'done') (job.results || []).forEach(u => cards.push(el('button', { type: 'button', class: 'pdx-cand' + (st.pick === u ? ' on' : ''), onclick: () => { st.pick = u; draw(); } }, el('img', { src: u, alt: '' }), el('span', { text: engine.name }))));
        else if (job.status === 'failed') cards.push(el('div', { class: 'pdx-wait' }, el('b', { text: engine.name + ' 실패' }), el('small', { text: job.error || '' })));
        else for (let i = 0; i < PER_ENGINE; i++) cards.push(el('div', { class: 'pdx-wait' }, el('div', { class: 'lmx-spin' }), el('span', { text: `${engine.name} · 만드는 중…` }), job.note ? el('small', { text: job.note }) : null));
      }
      const running = st.jobs.some(j => !['done', 'failed'].includes(j.job.status));
      return [el('section', { class: 'pdx-main', style: 'max-width:1120px;margin:10px auto 0' },
        el('h1', { text: '제품 이미지를 고르세요' }), el('p', { text: `${summary()} · 두 엔진이 만든 이미지를 비교하고 마음에 드는 디자인을 고르세요.` }),
        el('div', { class: 'pdx-cands' }, ...cards), st.note ? el('div', { class: 'pdx-note', text: st.note }) : null),
        el('div', { class: 'pdx-bar' }, el('button', { type: 'button', class: 'pdx-lib', text: '← 스펙 바꾸기', onclick: () => { st.step = 1; draw(); } }),
          el('button', { type: 'button', class: 'pdx-ghost', text: `다시 만들기 ✦ ${COST}`, disabled: running, onclick: generate }),
          el('button', { type: 'button', class: 'pdx-primary', text: '이 디자인으로 확정 →', disabled: !st.pick, onclick: () => { st.step = 3; draw(); } }))];
    }
    function step3() {
      const nameIn = el('input', { class: 'pdx-in', maxlength: '80', placeholder: '제품 이름 *' }); nameIn.value = st.name; nameIn.oninput = () => { st.name = nameIn.value; };
      return [el('section', { class: 'pdx-main', style: 'max-width:900px;margin:10px auto 0' },
        el('h1', { text: '제품을 확정할까요?' }), el('p', { text: '확정하면 상품 목록에 저장되고, 이 제품으로 키비주얼·연출컷·모션 루프를 만들 수 있어요.' }),
        el('div', { class: 'pdx-confirm' }, el('img', { src: st.pick, alt: '' }),
          el('div', {}, el('div', { class: 'pdx-label', text: '제품 이름' }), nameIn, el('div', { class: 'pdx-label', style: 'margin-top:14px', text: '스펙' }), el('p', { style: 'color:#c9cbd8;font-size:13.5px;line-height:1.7', text: summary() }),
            el('div', { class: 'pdx-label', style: 'margin-top:14px', text: '카테고리' }), el('p', { style: 'color:#c9cbd8;font-size:13.5px', text: st.cat[2] }))),
        st.note ? el('div', { class: 'pdx-note', text: st.note }) : null),
        el('div', { class: 'pdx-bar' }, el('button', { type: 'button', class: 'pdx-lib', text: '← 이미지 다시 고르기', onclick: () => { st.step = 2; draw(); } }),
          el('button', { type: 'button', class: 'pdx-primary', text: '제품 등록하고 스튜디오 열기', onclick: register }))];
    }
    function draw() {
      const scroll = root.scrollTop, sideScroll = root.querySelector('.pdx-side')?.scrollTop || 0;
      root.replaceChildren(briefIn, refIn,
        el('div', { class: 'pdx-top' }, el('span', { class: 'pdx-brand', text: 'LUKE MODEL' }), stepper(), el('button', { type: 'button', class: 'pdx-ghost', text: '← 상품 목록', onclick: close })),
        ...(st.step === 1 ? step1() : st.step === 2 ? step2() : step3()));
      root.scrollTop = scroll;
      const sd = root.querySelector('.pdx-side'); if (sd) sd.scrollTop = sideScroll;
    }
    root.onkeydown = e => { if (e.key === 'Escape') close(); };
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
