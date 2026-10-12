// 인게임 에디터 (M14): 개발자 패널 '에디터' 탭이나 선수 옆 ✏️에서 연다. 바꾸면 바로 반영된다.
// 내 선수를 고치면 🔧 표시, 다른 선수는 이름·등번호·겉모습만 고치면 표시 안 함.
import { Rng } from '../core/rng';
import { ABILITIES, type AbilityId } from '../data/abilities';
import { dunkList, DUNKS } from '../data/dunks';
import { overall, POSITIONS, type Look, type Position } from '../data/player';
import { grade, RATING_GROUPS, RATING_KEYS, type RatingKey } from '../data/ratings';
import { GROWTH_TYPES, type GrowthType } from '../career/backgrounds';
import { MAX_RATING, type Career } from '../career/career';
import { findEditable, isGenerated, marksDev, revertEdit, snapEdit, storeOverride, type EditEntry, type EditSnap } from '../career/edit';
import { teamInfoOf } from '../career/match';
import { TRAITS, type TraitId } from '../career/personality';
import { meet, ROMANCE_LABEL, type RomanceStatus } from '../career/romance';
import { COMBO_LABEL, type ComboKind } from '../sim/engine';
import { DUNK_LABEL } from '../sim/types';
import { HAIR, SHOE, SKIN } from '../view/character';
import { numberColorFor } from '../view/pixel';
import { esc, toast } from './dom';
import { figureCanvas } from './figure';

export interface EditorHost {
  career(): Career | null;
  save(): void;
  refresh(): void;
}

const HAIR_LABEL = ['짧은 머리', '스포츠머리', '아프로', '뾰족 머리', '묶은 머리', '민머리', '모히칸'];
const LOOKS: { k: 'skin' | 'hair' | 'hairColor' | 'shoe'; label: string; n: number; colors?: string[]; names?: string[] }[] = [
  { k: 'skin', label: '피부', n: SKIN.length, colors: SKIN },
  { k: 'hair', label: '머리 모양', n: HAIR_LABEL.length, names: HAIR_LABEL },
  { k: 'hairColor', label: '머리색', n: HAIR.length, colors: HAIR },
  { k: 'shoe', label: '신발', n: SHOE.length, colors: SHOE },
];
const COMBO_KINDS: ComboKind[] = ['alley', 'pnr', 'kick', 'giveGo'];

export class Editor {
  private el: HTMLElement;
  private entry: EditEntry | null = null;
  private snap: EditSnap | null = null;

  constructor(private host: EditorHost) {
    this.el = document.createElement('div');
    this.el.className = 'edwin';
    this.el.hidden = true;
    document.body.appendChild(this.el);
    this.el.addEventListener('input', (e) => this.input(e, false));
    this.el.addEventListener('change', (e) => this.input(e, true));
    this.el.addEventListener('click', (e) => this.click(e));
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        e.stopImmediatePropagation();
        this.close();
      }
    });
  }

  isOpen() {
    return !this.el.hidden;
  }

  open(key: string) {
    const c = this.host.career();
    if (!c) return;
    const e = findEditable(c, key);
    if (!e) return toast('그 선수를 찾을 수 없어');
    this.entry = e;
    this.snap = snapEdit(c, e);
    this.el.hidden = false;
    this.render();
  }

  close() {
    this.el.hidden = true;
    this.el.innerHTML = '';
    this.entry = null;
    this.host.refresh();
  }

  private render() {
    const c = this.host.career();
    const e = this.entry;
    if (!c || !e) return;
    const p = e.player;
    const isMe = e.key === 'me';
    const isMate = e.key.startsWith('mate:');
    const team = teamInfoOf(c, e.team);
    const num = (f: string, label: string, v: number, min: number, max: number) => `<label class="edf"><span>${label}</span><input type="number" data-ef="${f}" value="${Math.round(v)}" min="${min}" max="${max}" /></label>`;
    const sel = (f: string, label: string, opts: [string, string][], v: string) => `<label class="edf"><span>${label}</span><select data-ef="${f}">${opts.map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    const look = LOOKS.map(
      (r) =>
        `<label class="edf"><span>${r.label}</span><select data-elk="${r.k}">${Array.from({ length: r.n }, (_, i) => `<option value="${i}" ${p.look[r.k] === i ? 'selected' : ''} ${r.colors ? `style="background:${r.colors[i]}"` : ''}>${r.names ? r.names[i] : `${i + 1}번`}</option>`).join('')}</select></label>`,
    ).join('');
    const ratings = RATING_GROUPS.map(
      (g) =>
        `<div class="edgrp"><h5>${g.label}</h5>${g.items
          .map(([k, label]) => {
            const v = p.r[k as RatingKey];
            return `<div class="edr"><span>${label}</span><input type="range" data-er="${k}" min="1" max="${MAX_RATING}" value="${v}" /><input type="number" data-er="${k}" min="1" max="${MAX_RATING}" value="${v}" /><b data-eg="${k}" class="g${grade(v)}">${grade(v)}</b></div>`;
          })
          .join('')}</div>`,
    ).join('');
    const abil = ABILITIES.map((a) => {
      const n = p.abilities?.[a.id] ?? 0;
      const opts = (a.bad ? [0, 1] : [0, 1, 2, 3]).map((v) => `<option value="${v}" ${v === n ? 'selected' : ''}>${v === 0 ? '-' : a.bad ? '있음' : '★'.repeat(v)}</option>`).join('');
      return `<label class="edf" title="${esc(a.desc)}"><span class="${a.bad ? 'bad' : ''}">${a.label}</span><select data-eab="${a.id}">${opts}</select></label>`;
    }).join('');
    const traits = isMe
      ? `<div class="edgrp"><h5>성격 <small class="muted">에디터에선 개수 제한 없음</small></h5><div class="edchips">${TRAITS.map((t) => `<label title="${esc(t.desc)}"><input type="checkbox" data-etr="${t.id}" ${(c.traits ?? []).includes(t.id) ? 'checked' : ''} /> ${t.label}</label>`).join('')}</div></div>`
      : '';
    const meBox = isMe
      ? `<div class="edgrp"><h5>성장</h5>
          ${num('potential', '잠재력', c.potential, 30, 99)}${sel('growth', '성장 타입', GROWTH_TYPES.map((g) => [g.id, g.label]), c.growth)}${num('finalHeight', '최종 키', c.finalHeight, 150, 235)}
        </div>
        <div class="edgrp"><h5>연애</h5>${
          c.romance
            ? `<label class="edf"><span>상대</span><input type="text" data-ef="loveName" value="${esc(c.romance.name)}" maxlength="10" /></label>${num('loveAff', '호감도', c.romance.affection, 0, 100)}${sel(
                'loveStatus',
                '관계',
                (Object.keys(ROMANCE_LABEL) as RomanceStatus[]).map((s) => [s, ROMANCE_LABEL[s]]),
                c.romance.status,
              )}<button type="button" data-ea="loveEnd">헤어지기</button>`
            : '<button type="button" data-ea="loveNew">연애 상대 만들기</button>'
        }</div>`
      : '';
    const cb = isMate ? c.combos?.find((x) => x.mate === p.id) : undefined;
    const mateBox = isMate
      ? `<div class="edgrp"><h5>나와의 관계</h5>${num('friend', '친밀도', c.friends[p.id] ?? 20, 0, 100)}${sel('combo', '콤비', [['', '없음'], ...COMBO_KINDS.map((k) => [k, COMBO_LABEL[k]] as [string, string])], cb?.kind ?? '')}</div>`
      : '';
    const dunks = dunkList(p);
    this.el.innerHTML = `
      <div class="edbox" role="dialog" aria-label="선수 에디터">
        <div class="edhead">
          <canvas class="px edfig" id="edFig"></canvas>
          <div class="edtitle"><b>✏️ ${esc(p.name)}</b><small>${esc(team.full)} · ${p.pos}${isGenerated(e.key) ? ' · 상대 학교 선수는 올해만 남는다' : ''}</small>
            <div class="edovr" id="edOvr">${this.ovrHtml()}</div></div>
          <button type="button" data-ea="close" aria-label="닫기">✕</button>
        </div>
        <div class="edcols">
          <div class="edcol">
            <div class="edgrp"><h5>기본</h5>
              <label class="edf"><span>이름</span><input type="text" data-ef="name" value="${esc(p.name)}" maxlength="10" /></label>
              ${num('number', '등번호', p.number, 0, 99)}${sel('pos', isMe ? '선호 포지션' : '포지션', POSITIONS.map((x) => [x, x]), isMe ? c.prefPos : p.pos)}${num('age', '나이', p.age ?? 16, 14, 45)}
              ${num('height', '키 cm', p.body.heightCm, 150, 235)}${num('wingspan', '윙스팬 cm', p.body.wingspanCm, 150, 250)}${num('weight', '체중 kg', p.body.weightKg, 40, 160)}
            </div>
            <div class="edgrp"><h5>겉모습</h5>${look}
              <label class="edf"><span>헤어밴드</span><input type="checkbox" data-elkb="headband" ${p.look.headband ? 'checked' : ''} /></label>
              <label class="edf"><span>슬리브</span><input type="checkbox" data-elkb="sleeve" ${p.look.sleeve ? 'checked' : ''} /></label>
            </div>
            <div class="edgrp"><h5>특수능력</h5>${abil}</div>
            ${traits}${meBox}${mateBox}
            <div class="edgrp"><h5>열린 덩크 <small class="muted">능력치로 정해진다</small></h5><p class="eddunks" id="edDunks">${this.dunkHtml(dunks)}</p></div>
          </div>
          <div class="edcol">
            <div class="edrow"><button type="button" data-ea="all+5">전부 +5</button><button type="button" data-ea="all-5">전부 -5</button><input type="number" id="edAllN" value="75" min="1" max="99" /><button type="button" data-ea="allN">전부 이 값</button></div>
            ${ratings}
          </div>
        </div>
        <div class="edfoot"><span class="muted">${isMe ? '내 선수를 고치면 이 커리어에 🔧 표시가 남는다' : '이름·등번호·겉모습만 고치면 🔧 표시가 안 남는다'}</span><button type="button" data-ea="revert">처음 값으로</button><button type="button" class="primary" data-ea="close">닫기</button></div>
      </div>`;
    figureCanvas(this.el.querySelector('#edFig') as HTMLCanvasElement, () => ({ pl: p, kit: { jersey: team.color, trim: numberColorFor(team.color) } }));
  }

  private ovrHtml() {
    const e = this.entry!;
    const c = this.host.career()!;
    const mine = e.key === 'me' ? c.prefPos : e.player.pos;
    return POSITIONS.map((pos) => `<span class="${pos === mine ? 'on' : ''}">${pos} <b>${overall(e.player, pos).toFixed(1)}</b></span>`).join('');
  }

  private dunkHtml(list: ReturnType<typeof dunkList>) {
    return DUNKS.map((d) => `<span class="${list.includes(d.id) ? 'on' : ''}">${esc(DUNK_LABEL[d.id])}${d.contestOnly ? ' (콘테스트)' : ''}</span>`).join('');
  }

  /** 'input'은 바로 반영, 'change'는 저장까지 */
  private input(ev: Event, commit: boolean) {
    const c = this.host.career();
    const e = this.entry;
    if (!c || !e) return;
    const t = ev.target as HTMLInputElement | HTMLSelectElement;
    const p = e.player;
    const v = Number(t.value);
    let field = '';
    if (t.dataset.er) {
      const k = t.dataset.er as RatingKey;
      if (!Number.isFinite(v)) return;
      p.r[k] = Math.max(1, Math.min(MAX_RATING, Math.round(v)));
      // 슬라이더와 숫자 칸을 맞춘다
      this.el.querySelectorAll<HTMLInputElement>(`[data-er="${k}"]`).forEach((x) => x !== t && (x.value = String(p.r[k])));
      const g = this.el.querySelector(`[data-eg="${k}"]`) as HTMLElement;
      g.textContent = grade(p.r[k]);
      g.className = `g${grade(p.r[k])}`;
      field = 'r';
    } else if (t.dataset.eab) {
      const ab = (p.abilities ??= {});
      if (v > 0) ab[t.dataset.eab as AbilityId] = v;
      else delete ab[t.dataset.eab as AbilityId];
      field = 'abilities';
    } else if (t.dataset.etr) {
      const id = t.dataset.etr as TraitId;
      const on = (t as HTMLInputElement).checked;
      c.traits = (c.traits ?? []).filter((x) => x !== id);
      if (on) c.traits.push(id);
      field = 'traits';
    } else if (t.dataset.elk) {
      p.look = { ...p.look, [t.dataset.elk]: v } as Look;
      field = 'look';
    } else if (t.dataset.elkb) {
      p.look = { ...p.look, [t.dataset.elkb]: (t as HTMLInputElement).checked } as Look;
      field = 'look';
    } else if (t.dataset.ef) {
      field = t.dataset.ef;
      if (!this.setField(c, e, field, t.value)) return;
    } else return;
    if (marksDev(e.key, field)) c.dev = true;
    this.after(c, e, commit);
  }

  private setField(c: Career, e: EditEntry, f: string, raw: string): boolean {
    const p = e.player;
    const v = Number(raw);
    const num = (min: number, max: number) => (Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : null);
    switch (f) {
      case 'name':
        if (!raw.trim()) return false;
        p.name = raw.trim().slice(0, 10);
        // 콤비 이름표도 같이
        for (const cb of c.combos ?? []) if (cb.mate === p.id) cb.name = p.name;
        return true;
      case 'number': {
        const n = num(0, 99);
        if (n === null) return false;
        p.number = n;
        return true;
      }
      case 'pos':
        p.pos = raw as Position;
        if (e.key === 'me') c.prefPos = raw as Position;
        return true;
      case 'age': {
        const n = num(14, 45);
        if (n === null) return false;
        p.age = n;
        return true;
      }
      case 'height': {
        const n = num(150, 235);
        if (n === null) return false;
        p.body = { ...p.body, heightCm: n, wingspanCm: n + (p.body.wingspanCm - p.body.heightCm) };
        if (e.key === 'me') c.finalHeight = Math.max(c.finalHeight, n);
        return true;
      }
      case 'wingspan': {
        const n = num(150, 250);
        if (n === null) return false;
        p.body = { ...p.body, wingspanCm: n };
        return true;
      }
      case 'weight': {
        const n = num(40, 160);
        if (n === null) return false;
        p.body = { ...p.body, weightKg: n };
        return true;
      }
      case 'potential': {
        const n = num(30, 99);
        if (n === null) return false;
        c.potential = n;
        return true;
      }
      case 'growth':
        c.growth = raw as GrowthType;
        return true;
      case 'finalHeight': {
        const n = num(150, 235);
        if (n === null) return false;
        c.finalHeight = Math.max(n, c.me.body.heightCm);
        return true;
      }
      case 'friend': {
        const n = num(0, 100);
        if (n === null) return false;
        c.friends[p.id] = n;
        return true;
      }
      case 'combo':
        c.combos = (c.combos ?? []).filter((x) => x.mate !== p.id);
        if (raw) c.combos.push({ mate: p.id, name: p.name, kind: raw as ComboKind });
        return true;
      case 'loveName':
        if (!c.romance || !raw.trim()) return false;
        c.romance.name = raw.trim().slice(0, 10);
        return true;
      case 'loveAff': {
        const n = num(0, 100);
        if (n === null || !c.romance) return false;
        c.romance.affection = n;
        return true;
      }
      case 'loveStatus':
        if (!c.romance) return false;
        c.romance.status = raw as RomanceStatus;
        return true;
    }
    return false;
  }

  /** 바꾼 뒤: 종합·덩크 표시, 상대 학교 사본, 저장 */
  private after(c: Career, e: EditEntry, commit: boolean) {
    const ovr = this.el.querySelector('#edOvr');
    if (ovr) ovr.innerHTML = this.ovrHtml();
    const dk = this.el.querySelector('#edDunks');
    if (dk) dk.innerHTML = this.dunkHtml(dunkList(e.player));
    if (e.key === 'me') c.dunks = dunkList(c.me);
    if (isGenerated(e.key)) storeOverride(c, e.player);
    if (commit) {
      this.host.save();
      this.host.refresh();
    }
  }

  private click(ev: MouseEvent) {
    const c = this.host.career();
    const e = this.entry;
    const b = (ev.target as HTMLElement).closest('[data-ea]') as HTMLElement | null;
    if (!b || !c || !e) {
      // 바깥 어두운 곳을 누르면 닫는다
      if (ev.target === this.el) this.close();
      return;
    }
    const p = e.player;
    switch (b.dataset.ea) {
      case 'close':
        return this.close();
      case 'revert':
        revertEdit(c, e, this.snap!);
        if (e.key === 'me') c.dunks = dunkList(c.me);
        this.host.save();
        toast('처음 값으로 되돌렸어');
        return this.render();
      case 'all+5':
      case 'all-5': {
        const d = b.dataset.ea === 'all+5' ? 5 : -5;
        for (const k of RATING_KEYS) p.r[k] = Math.max(1, Math.min(MAX_RATING, p.r[k] + d));
        break;
      }
      case 'allN': {
        const n = Math.max(1, Math.min(MAX_RATING, Math.round(Number((this.el.querySelector('#edAllN') as HTMLInputElement).value) || 75)));
        for (const k of RATING_KEYS) p.r[k] = n;
        break;
      }
      case 'loveNew': {
        const rng = Rng.fromState(c.rng);
        meet(c, rng);
        c.rng = rng.state;
        break;
      }
      case 'loveEnd':
        c.romance = null;
        break;
      default:
        return;
    }
    c.dev = true;
    this.after(c, e, true);
    this.render();
  }
}
