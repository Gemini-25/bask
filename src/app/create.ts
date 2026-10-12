// 선수 만들기 (M1~M5): 배경 + 자유 포인트 배분, 몸, 겉모습, 학교. 랜덤 요소 없음.
import { Rng, randomSeed } from '../core/rng';
import { koreanName, type Gender } from '../data/names';
import { overall, POSITION_LABEL, POSITIONS, type Look, type Player, type Position } from '../data/player';
import { grade, RATING_GROUPS, RATING_KEYS, type RatingKey } from '../data/ratings';
import { BACKGROUNDS, backgroundById, GROWTH_TYPES } from '../career/backgrounds';
import type { LegacyBonus } from '../career/legacy';
import { traitDef, TRAITS, type TraitId } from '../career/personality';
import { moneyText } from '../career/money';
import { applyAlloc, baseHeight, BUILD_LABEL, CREATE_CAP, creationBase, HEIGHT_RANGE, type Build, type CreateSpec } from '../career/career';
import { SCHOOLS, schoolById } from '../career/schools';
import { HAIR, SHOE, SKIN } from '../view/character';
import { numberColorFor } from '../view/pixel';
import { $, esc } from './dom';
import { figureCanvas } from './figure';

const HAIR_LABEL = ['짧은 머리', '스포츠머리', '아프로', '뾰족 머리', '묶은 머리', '민머리', '모히칸'];
const LOOK_ROWS: { k: keyof Look; label: string; n: number; names?: string[]; colors?: string[] }[] = [
  { k: 'skin', label: '피부', n: SKIN.length, colors: SKIN },
  { k: 'hair', label: '머리 모양', n: HAIR_LABEL.length, names: HAIR_LABEL },
  { k: 'hairColor', label: '머리색', n: HAIR.length, colors: HAIR },
  { k: 'shoe', label: '신발', n: SHOE.length, colors: SHOE },
];

function stars(strength: number) {
  const n = Math.max(1, Math.min(5, Math.round(strength + 17)));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

export function renderCreate(onDone: (spec: CreateSpec, seed: number) => void, onCancel: () => void, legacy?: LegacyBonus) {
  const rng = new Rng(randomSeed());
  // 2세는 부모 성을 물려받는다
  const nameFor = (g: Gender) => (legacy ? legacy.parent[0] + koreanName(rng, g).slice(1) : koreanName(rng, g));
  let autoName = nameFor('M');
  const st: CreateSpec = {
    name: autoName,
    number: 7,
    gender: 'M',
    prefPos: 'SG',
    background: 'ordinary',
    growth: 'normal',
    heightDelta: 0,
    build: 'normal',
    look: { skin: 0, hair: 0, hairColor: 0, shoe: 2, headband: false, sleeve: false },
    alloc: {},
    school: 'HANB',
    legacy,
    trait: 'diligent',
  };
  const free = (b: { bg: { freePoints: number } }): number => b.bg.freePoints + (legacy?.points ?? 0);

  const root = $('scr-create');
  const opt = (group: string, value: string, label: string, sub = '') => `<button type="button" class="opt" data-g="${group}" data-v="${value}">${label}${sub ? `<small>${sub}</small>` : ''}</button>`;
  root.innerHTML = `
  <div class="create">
    <div class="cform">
      ${legacy ? `<section class="csec legacy"><h2>${legacy.generation}대째 농구 가문</h2><p>${esc(legacy.parent)}${legacy.spouse ? `와(과) ${esc(legacy.spouse)}` : ''}의 피를 이어받았다. 자유 포인트 <b>+${legacy.points}</b> · 잠재력 <b>+${legacy.potential}</b>${legacy.money ? ` · 용돈 <b>${moneyText(legacy.money)} 원</b>` : ''}</p></section>` : ''}
      <section class="csec"><h2>1. 기본</h2>
        <div class="row"><label for="cName">이름</label><input id="cName" maxlength="8" value="${esc(st.name)}" /><button type="button" id="cNameRnd" title="다른 이름">🎲</button>
          <label for="cNum">등번호</label><input id="cNum" type="number" min="0" max="99" value="${st.number}" class="num" /></div>
        <div class="row"><span class="lab">성별</span>${opt('gender', 'M', '남자')}${opt('gender', 'F', '여자')}<small class="muted">리그가 따로 있다 (상대도 같은 성별)</small></div>
        <div class="row"><span class="lab">선호 포지션</span>${POSITIONS.map((p) => opt('pos', p, p, POSITION_LABEL[p])).join('')}</div>
        <p class="hint">선호 포지션은 시작 능력치를 정한다. 실제 경기 포지션은 감독이 팀 사정에 맞춰 정한다.</p>
      </section>
      <section class="csec"><h2>2. 출신 배경</h2>
        <div class="cards">${BACKGROUNDS.map((b) => `<button type="button" class="card opt" data-g="bg" data-v="${b.id}"><b>${b.label}</b><span>${b.desc}</span><small>잠재력 ${b.potential} · 자유 포인트 ${b.freePoints}${b.height ? ` · 키 +${b.height}cm` : ''}</small></button>`).join('')}</div>
      </section>
      <section class="csec"><h2>3. 성장 타입과 성격</h2>
        <div class="row">${GROWTH_TYPES.map((g) => opt('growth', g.id, g.label, g.desc)).join('')}</div>
        <div class="row traits"><span class="lab">성격</span>${TRAITS.map((t) => opt('trait', t.id, t.label, t.desc)).join('')}</div>
        <p class="hint">성격은 커리어 중 이벤트로 하나 더 생길 수 있다 (두 개까지).</p>
      </section>
      <section class="csec"><h2>4. 몸</h2>
        <div class="row"><label for="cHeight">키</label><input id="cHeight" type="range" min="${-HEIGHT_RANGE}" max="${HEIGHT_RANGE}" step="1" value="0" /><b id="cHeightVal"></b></div>
        <p class="hint">기본보다 크면 스피드·가속·민첩성이 줄고 블록·리바운드·포스트 수비가 오른다. 작으면 반대.</p>
        <div class="row"><span class="lab">체형</span>${(Object.keys(BUILD_LABEL) as Build[]).map((b) => opt('build', b, BUILD_LABEL[b])).join('')}</div>
      </section>
      <section class="csec"><h2>5. 겉모습</h2>
        <div class="looks">${LOOK_ROWS.map((r) => `<div class="lrow"><span class="lab">${r.label}</span><button type="button" data-look="${r.k}" data-d="-1" aria-label="${r.label} 이전">◀</button><span class="lv" id="look-${r.k}"></span><button type="button" data-look="${r.k}" data-d="1" aria-label="${r.label} 다음">▶</button></div>`).join('')}
          <div class="lrow"><span class="lab">소품</span>${opt('headband', '1', '헤어밴드')}${opt('sleeve', '1', '팔토시')}</div></div>
      </section>
      <section class="csec"><h2>6. 학교</h2>
        <div class="cards schools">${SCHOOLS.map((s) => `<button type="button" class="card opt" data-g="school" data-v="${s.id}"><b><i class="sw" style="background:${s.color}"></i>${s.city} ${s.name}</b><span>${s.blurb}</span><small>전력 ${stars(s.strength)}</small></button>`).join('')}</div>
        <p class="hint">강한 학교일수록 선배들이 잘해서 출전 시간 얻기가 어렵다.</p>
      </section>
    </div>
    <aside class="cside">
      <div class="cprev"><canvas class="px" id="cFig"></canvas><div id="cSummary"></div></div>
      <div class="calloc">
        <div class="ahead"><h2>7. 자유 포인트</h2><b id="cLeft"></b></div>
        <div class="row"><button type="button" id="cAuto">자동 배분</button><button type="button" id="cReset">초기화</button><small class="muted">Shift+클릭 = 5씩</small></div>
        <div id="cAlloc"></div>
      </div>
      <div class="cgo"><button type="button" id="cCancel">취소</button><button type="button" class="primary big" id="cGo">이 선수로 시작</button></div>
    </aside>
  </div>`;

  const base = () => creationBase(st);
  const preview = (): Player => {
    const b = base();
    const { r } = applyAlloc(b.r, st.alloc, free(b));
    return { id: 'me', name: st.name, number: st.number, pos: st.prefPos, body: b.body, r, look: st.look };
  };
  const kit = () => {
    const s = schoolById(st.school);
    return { jersey: s.color, trim: numberColorFor(s.color) };
  };

  /** 배경·몸이 바뀌어 상한이나 총량이 줄면 배분을 줄인다 */
  const normalize = () => {
    const b = base();
    let left = free(b);
    for (const k of RATING_KEYS) {
      const room = Math.max(0, CREATE_CAP - b.r[k]);
      const v = Math.min(st.alloc[k] ?? 0, room, left);
      if (v > 0) st.alloc[k] = v;
      else delete st.alloc[k];
      left -= v;
    }
  };

  const used = () => RATING_KEYS.reduce((n, k) => n + (st.alloc[k] ?? 0), 0);

  const refresh = () => {
    normalize();
    const b = base();
    const p = preview();
    for (const el of root.querySelectorAll<HTMLElement>('.opt')) {
      const g = el.dataset.g!;
      const v = el.dataset.v!;
      const on =
        (g === 'gender' && st.gender === v) ||
        (g === 'pos' && st.prefPos === v) ||
        (g === 'bg' && st.background === v) ||
        (g === 'growth' && st.growth === v) ||
        (g === 'trait' && st.trait === v) ||
        (g === 'build' && st.build === v) ||
        (g === 'school' && st.school === v) ||
        (g === 'headband' && st.look.headband) ||
        (g === 'sleeve' && st.look.sleeve);
      el.classList.toggle('on', on);
    }
    for (const r of LOOK_ROWS) {
      const v = st.look[r.k] as number;
      $(`look-${r.k}`).innerHTML = r.colors ? `<i class="sw big" style="background:${r.colors[v]}"></i>${v + 1}/${r.n}` : `${r.names![v]}`;
    }
    const bh = baseHeight(st.prefPos, st.gender, st.background);
    $('cHeightVal').textContent = `${bh + st.heightDelta}cm (기본 ${bh}cm ${st.heightDelta >= 0 ? '+' : ''}${st.heightDelta})`;
    const genius = st.background === 'genius';
    const ovr = overall(p, st.prefPos);
    const bestPos = POSITIONS.reduce((a, q) => (overall(p, q) > overall(p, a) ? q : a), st.prefPos);
    const gt = GROWTH_TYPES.find((g) => g.id === st.growth)!;
    $('cSummary').innerHTML = `
      <b class="pname">#${st.number} ${esc(st.name || '이름없음')}</b>
      <span>${st.gender === 'F' ? '여자' : '남자'} · ${POSITION_LABEL[st.prefPos]} · ${esc(backgroundById(st.background).label)}</span>
      <div class="kv"><span>종합</span><b class="ovr">${ovr.toFixed(0)}</b>${bestPos !== st.prefPos ? `<small>(${bestPos} ${overall(p, bestPos).toFixed(0)})</small>` : ''}</div>
      <div class="kv"><span>키 / 윙스팬</span><b>${p.body.heightCm} / ${p.body.wingspanCm}cm</b></div>
      <div class="kv"><span>체중</span><b>${p.body.weightKg}kg</b></div>
      <div class="kv"><span>고교 동안 클 키</span><b>+${b.bg.growth}cm 안팎</b></div>
      <div class="kv"><span>잠재력</span><b>${Math.min(99, b.bg.potential + (legacy?.potential ?? 0))}</b><small>넘으면 비싸진다</small></div>
      <div class="kv"><span>성장 타입</span><b>${gt.label}</b></div>
      <div class="kv"><span>성격</span><b>${st.trait ? traitDef(st.trait).label : '-'}</b></div>`;
    const left = free(b) - used();
    $('cLeft').textContent = genius ? '천재: 전부 99' : `남은 포인트 ${left} / ${free(b)}`;
    $('cAlloc').innerHTML = genius
      ? '<p class="hint">천재는 모든 능력치가 99로 시작한다. 자유 포인트는 필요 없다.</p>'
      : RATING_GROUPS.map(
          (g) =>
            `<div class="ag"><h4>${g.label}</h4>${g.items
              .map(([k, label]) => {
                const a = st.alloc[k] ?? 0;
                const v = b.r[k] + a;
                const gr = grade(v);
                return `<div class="arow${a ? ' up' : ''}"><span class="al">${label}</span><span class="gr g${gr}">${gr}</span><span class="av">${v}${a ? `<small>+${a}</small>` : ''}</span><button type="button" data-k="${k}" data-d="-1" ${a ? '' : 'disabled'} aria-label="${label} 내리기">−</button><button type="button" data-k="${k}" data-d="1" ${v >= CREATE_CAP || left <= 0 ? 'disabled' : ''} aria-label="${label} 올리기">+</button></div>`;
              })
              .join('')}</div>`,
        ).join('');
    $('cGo').toggleAttribute('disabled', !st.name.trim());
  };

  root.onclick = (e) => {
    const t = e.target as HTMLElement;
    const o = t.closest('.opt') as HTMLElement | null;
    if (o) {
      const v = o.dataset.v!;
      switch (o.dataset.g) {
        case 'gender':
          st.gender = v as Gender;
          if (st.name === autoName) {
            autoName = nameFor(st.gender);
            st.name = autoName;
            ($('cName') as HTMLInputElement).value = st.name;
          }
          break;
        case 'pos':
          st.prefPos = v as Position;
          break;
        case 'bg':
          st.background = v as CreateSpec['background'];
          break;
        case 'growth':
          st.growth = v as CreateSpec['growth'];
          break;
        case 'trait':
          st.trait = v as TraitId;
          break;
        case 'build':
          st.build = v as Build;
          break;
        case 'school':
          st.school = v;
          break;
        case 'headband':
          st.look.headband = !st.look.headband;
          break;
        case 'sleeve':
          st.look.sleeve = !st.look.sleeve;
          break;
      }
      return refresh();
    }
    const lk = t.closest('[data-look]') as HTMLElement | null;
    if (lk) {
      const row = LOOK_ROWS.find((r) => r.k === lk.dataset.look)!;
      const cur = st.look[row.k] as number;
      (st.look as unknown as Record<string, number>)[row.k] = (cur + Number(lk.dataset.d) + row.n) % row.n;
      return refresh();
    }
    const ab = t.closest('[data-k]') as HTMLButtonElement | null;
    if (ab && !ab.disabled) {
      const k = ab.dataset.k as RatingKey;
      const step = Number(ab.dataset.d) * ((e as MouseEvent).shiftKey ? 5 : 1);
      const b = base();
      const left = free(b) - used();
      const cur = st.alloc[k] ?? 0;
      const next = Math.max(0, Math.min(cur + Math.min(step, left), CREATE_CAP - b.r[k]));
      st.alloc[k] = next;
      return refresh();
    }
  };
  ($('cName') as HTMLInputElement).oninput = (e) => {
    st.name = (e.target as HTMLInputElement).value;
    refresh();
  };
  $('cNameRnd').onclick = () => {
    autoName = nameFor(st.gender);
    st.name = autoName;
    ($('cName') as HTMLInputElement).value = st.name;
    refresh();
  };
  ($('cNum') as HTMLInputElement).oninput = (e) => {
    const n = Math.round(Number((e.target as HTMLInputElement).value));
    st.number = Number.isFinite(n) ? Math.max(0, Math.min(99, n)) : 0;
    refresh();
  };
  ($('cHeight') as HTMLInputElement).oninput = (e) => {
    st.heightDelta = Number((e.target as HTMLInputElement).value);
    refresh();
  };
  $('cAuto').onclick = () => {
    // 선호 포지션 종합 능력치가 가장 많이 오르는 곳부터
    const b = base();
    st.alloc = {};
    const p = preview();
    for (let left = free(b); left > 0; left--) {
      let best: RatingKey | null = null;
      let bv = -1;
      for (const k of RATING_KEYS) {
        if (p.r[k] >= CREATE_CAP) continue;
        const o = overall(p, st.prefPos);
        p.r[k]++;
        const v = overall(p, st.prefPos) - o + (st.alloc[k] ? 0 : 0.001);
        p.r[k]--;
        if (v > bv) {
          bv = v;
          best = k;
        }
      }
      if (!best) break;
      p.r[best]++;
      st.alloc[best] = (st.alloc[best] ?? 0) + 1;
    }
    refresh();
  };
  $('cReset').onclick = () => {
    st.alloc = {};
    refresh();
  };
  $('cCancel').onclick = onCancel;
  $('cGo').onclick = () => {
    normalize();
    onDone(JSON.parse(JSON.stringify(st)) as CreateSpec, randomSeed());
  };
  figureCanvas($('cFig') as HTMLCanvasElement, () => ({ pl: preview(), kit: kit() }));
  refresh();
}
