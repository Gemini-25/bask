// 저장 (K4, K5): 브라우저 저장 슬롯 3개 + 세이브 파일 내보내기·불러오기.
// 버전 번호를 넣어서 나중 버전에서도 예전 세이브를 읽을 수 있게 한다.
import { Rng } from '../core/rng';
import { dateText, SAVE_VERSION, setCalendar, type Career } from './career';
import { dunkList } from '../data/dunks';
import { emptyStats, startAbilities } from './abilities';
import { coachName, createMentor, createRival } from './people';
import { schoolById } from './schools';
import { leagueTeam, type League } from './league';

const teamTitle = (L: League, id: string) => {
  const t = leagueTeam(L, id)?.info;
  return t ? `${t.city} ${t.name}` : id;
};

export const SLOTS = 3;
const KEY = (slot: number) => `bask.save.${slot}`;
const LAST = 'bask.lastSlot';

export interface SlotInfo {
  slot: number;
  name: string;
  school: string;
  date: string;
  savedAt: number;
}

function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveCareer(slot: number, c: Career): boolean {
  const s = store();
  if (!s) return false;
  c.savedAt = Date.now();
  try {
    s.setItem(KEY(slot), JSON.stringify(c));
    s.setItem(LAST, String(slot));
    return true;
  } catch {
    return false;
  }
}

export function loadCareer(slot: number): Career | null {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(KEY(slot));
    return raw ? migrate(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function deleteSlot(slot: number) {
  try {
    store()?.removeItem(KEY(slot));
  } catch {
    // 지우기 실패는 무시
  }
}

export function lastSlot(): number | null {
  try {
    const v = store()?.getItem(LAST);
    return v === null || v === undefined ? null : Number(v);
  } catch {
    return null;
  }
}

export function slotInfo(slot: number): SlotInfo | null {
  const c = loadCareer(slot);
  if (!c) return null;
  setCalendar(c);
  const date = dateText(c.week);
  setCalendar(null);
  return { slot, name: c.me.name, school: schoolById(c.school).name, date, savedAt: c.savedAt };
}

/** 세이브 파일 내용 (JSON 텍스트) */
export function exportCareer(c: Career): string {
  return JSON.stringify({ app: 'bask', v: c.v, career: c }, null, 1);
}

export function importCareer(text: string): Career {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('세이브 파일을 읽을 수 없어 (JSON이 아님)');
  }
  const d = data as { app?: string; career?: unknown };
  if (d.app !== 'bask' || !d.career) throw new Error('BASK 세이브 파일이 아니야');
  return migrate(d.career);
}

/** 예전 버전 세이브를 지금 형식으로 맞춘다 */
export function migrate(raw: unknown): Career {
  const c = raw as Career;
  if (!c || typeof c !== 'object' || !c.me || typeof c.week !== 'number') throw new Error('세이브 내용이 망가졌어');
  if (c.v > SAVE_VERSION) throw new Error(`더 새로운 버전(v${c.v})의 세이브야. 게임 파일을 최신으로 바꿔줘`);
  c.xp ??= {};
  c.counts ??= {};
  c.log ??= [];
  c.games ??= [];
  if (c.v < 2) {
    // v1 → v2: 공식 대회, 감독 신뢰도, 친밀도
    const old = c.pendingGame as unknown as string | null;
    c.pendingGame = typeof old === 'string' ? { kind: 'practice', opponent: old, label: '연습경기', home: c.games.length % 2 === 0 } : null;
    for (const g of c.games) {
      g.kind ??= 'practice';
      g.label ??= '연습경기';
    }
    c.season ??= null;
    c.trust ??= 40;
    c.friends ??= Object.fromEntries(c.roster.map((e) => [e.player.id, 25]));
    c.coach ??= coachName(c.seed);
    c.mentor ??= createMentor(new Rng(c.seed ^ 77));
    c.rival ??= createRival(c, new Rng(c.seed ^ 99));
    c.seenEvents ??= {};
    c.pendingEvent ??= null;
    c.stats ??= emptyStats();
    c.dunks ??= dunkList(c.me);
    c.me.abilities ??= startAbilities(c.background);
  }
  if (c.v < 3) {
    // v2 → v3: 프로, 돈, 인기
    const y = Math.floor(c.week / 48);
    c.yearOf ??= c.week % 48 !== 0 || c.season?.year === y || c.week === 0 ? y : y - 1;
    c.pro ??= null;
    c.league ??= null;
    c.gameQueue ??= [];
    c.draft ??= null;
    c.contractPending ??= false;
    c.money ??= 0;
    c.items ??= [];
    c.popularity ??= 0;
    c.sns ??= [];
    c.me.age ??= 16 + y;
  }
  if (c.v < 4) {
    // v3 → v4: 시상, 올스타, 국가대표, 해외 리그, 은퇴, 2세
    c.trophies ??= [];
    c.ceremony ??= null;
    c.overseas ??= false;
    c.homeLeague ??= null;
    c.abroadLeague ??= null;
    c.allStar ??= null;
    c.national ??= null;
    c.teamHistory ??= c.pro && c.league ? [{ team: c.pro.team, name: teamTitle(c.league, c.pro.team), season: 0 }] : [];
    c.peakOvr ??= 0;
    c.retirePending ??= null;
    c.retired ??= null;
    c.legacy ??= null;
  }
  if (c.v < 5) {
    // v4 → v5: 대학, 성격
    c.college ??= null;
    c.hsSchool ??= c.school;
    c.proFromYear ??= 3;
    c.pathPending ??= null;
    c.traits ??= [];
  }
  if (c.v < 6) {
    // v5 → v6: 콤비, 포지션 전향, 전지훈련, 3x3, 연애, 설정
    c.combos ??= [];
    c.posOffer ??= null;
    c.campPending ??= false;
    c.streetPending ??= false;
    c.romance ??= null;
    c.settings ??= { romance: true, minigame: true };
  }
  c.v = SAVE_VERSION;
  return c;
}
