// 경기 중 선수 머리 위 이름표 (보기만 바뀐다): 등번호 / 이름 / 역할 (M24) / 끔. 브라우저에 기억한다
export type LabelMode = 'number' | 'name' | 'role' | 'off';
const KEY = 'bask.labels';
const MODES: LabelMode[] = ['number', 'name', 'role', 'off'];

function load(): LabelMode {
  try {
    const v = localStorage.getItem(KEY) as LabelMode | null;
    return v && MODES.includes(v) ? v : 'number';
  } catch {
    return 'number';
  }
}

export const LABELS: { mode: LabelMode } = { mode: typeof localStorage === 'undefined' ? 'number' : load() };

export function setLabelMode(m: LabelMode) {
  LABELS.mode = m;
  try {
    localStorage.setItem(KEY, m);
  } catch {
    // 저장이 안 돼도 이번엔 바뀐다
  }
}

/** 번호 → 이름 → 역할 → 끔 → 번호 */
export function nextLabelMode(): LabelMode {
  const m = MODES[(MODES.indexOf(LABELS.mode) + 1) % MODES.length];
  setLabelMode(m);
  return m;
}

// 작전 표시 (M22): 스크린·롤·컷 화살표와 작전 이름. 켬 / 끔
const TKEY = 'bask.tactics';
function loadT(): boolean {
  try {
    return localStorage.getItem(TKEY) !== 'off';
  } catch {
    return true;
  }
}
export const TACTICS: { on: boolean } = { on: typeof localStorage === 'undefined' ? true : loadT() };
export function setTactics(on: boolean) {
  TACTICS.on = on;
  try {
    localStorage.setItem(TKEY, on ? 'on' : 'off');
  } catch {
    // 저장이 안 돼도 이번엔 바뀐다
  }
}
