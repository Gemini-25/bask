// 경기 중 선수 머리 위 이름표 (보기만 바뀐다): 등번호 / 이름 / 끔. 브라우저에 기억한다
export type LabelMode = 'number' | 'name' | 'off';
const KEY = 'bask.labels';
const MODES: LabelMode[] = ['number', 'name', 'off'];

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

/** 번호 → 이름 → 끔 → 번호 */
export function nextLabelMode(): LabelMode {
  const m = MODES[(MODES.indexOf(LABELS.mode) + 1) % MODES.length];
  setLabelMode(m);
  return m;
}
