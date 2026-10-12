// 타이틀: 저장 슬롯 3개 (K5), 세이브 파일 불러오기, 프로 경기 관람 데모
import { Rng } from '../core/rng';
import { generatePlayer } from '../data/player';
import { ACT } from '../sim/types';
import { slotInfo, SLOTS } from '../career/save';
import { $, esc } from './dom';
import { trainingCanvas } from './figure';

export interface TitleActions {
  continueSlot(slot: number): void;
  newCareer(slot: number): void;
  importTo(slot: number): void;
  deleteSlot(slot: number): void;
  exhibition(): void;
}

function when(ms: number) {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function renderTitle(act: TitleActions) {
  const root = $('scr-title');
  const slots = Array.from({ length: SLOTS }, (_, i) => slotInfo(i));
  root.innerHTML = `
    <div class="title">
      <div class="hero">
        <canvas class="px" id="titleCanvas"></canvas>
        <div>
          <h1 class="logo">BASK</h1>
          <p class="tag">고1 신입생부터 시작하는 농구 선수 키우기</p>
        </div>
      </div>
      <div class="slots">
        ${slots
          .map((s, i) =>
            s
              ? `<div class="slot"><div class="sh">슬롯 ${i + 1}</div>
                 <b>${esc(s.name)}</b><span>${esc(s.school)} · ${esc(s.date)}</span><small>저장 ${when(s.savedAt)}</small>
                 <div class="sa"><button type="button" class="primary" data-act="continue" data-slot="${i}">이어하기</button><button type="button" data-act="delete" data-slot="${i}">지우기</button></div></div>`
              : `<div class="slot empty"><div class="sh">슬롯 ${i + 1}</div><span>비어 있음</span>
                 <div class="sa"><button type="button" class="primary" data-act="new" data-slot="${i}">새 선수 만들기</button><button type="button" data-act="import" data-slot="${i}">파일 불러오기</button></div></div>`,
          )
          .join('')}
      </div>
      <div class="tfoot">
        <button type="button" data-act="exhibition">프로 리그 경기 관람 (데모)</button>
        <p class="hint">저장은 이 브라우저 안에 된다. 다른 컴퓨터로 옮기거나 백업하려면 홈 화면의 '파일로 내보내기'를 써. 새 버전 파일은 같은 폴더에 같은 이름으로 덮어쓰면 저장이 그대로 이어진다.</p>
      </div>
    </div>`;
  root.onclick = (e) => {
    const b = (e.target as HTMLElement).closest('button[data-act]') as HTMLButtonElement | null;
    if (!b) return;
    const slot = Number(b.dataset.slot);
    switch (b.dataset.act) {
      case 'continue':
        return act.continueSlot(slot);
      case 'new':
        return act.newCareer(slot);
      case 'import':
        return act.importTo(slot);
      case 'delete':
        return act.deleteSlot(slot);
      case 'exhibition':
        return act.exhibition();
    }
  };
  const pl = generatePlayer(new Rng(23), 'SG', 10, 23);
  pl.look = { skin: 1, hair: 3, hairColor: 0, shoe: 2, headband: true, sleeve: false };
  trainingCanvas($('titleCanvas') as HTMLCanvasElement, pl, { jersey: '#ffb545', trim: '#1d1406' }, ACT.SHOOT, '');
}
