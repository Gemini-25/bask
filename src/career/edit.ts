// 인게임 에디터 (M14): 고칠 수 있는 선수 목록과 찾기. 화면 없이 테스트한다.
// 세이브에 들어 있는 선수(나, 팀원, 라이벌, 리그)는 바로 고치고,
// 해마다 새로 만들어지는 상대 학교 선수는 c.overrides에 고친 사본을 둔다 (그해만).
import type { Player } from '../data/player';
import { teammates, type Career } from './career';
import { opponentTeam } from './match';
import { COLLEGES, SCHOOLS } from './schools';
import type { League } from './league';

export interface EditEntry {
  /** 'me' | 'mate:<id>' | 'rival' | 'lg:<팀>:<id>' | 'home:<팀>:<id>' | 'abroad:<팀>:<id>' | 'school:<학교>:<id>' */
  key: string;
  player: Player;
  team: string;
}

export interface EditGroup {
  id: string;
  label: string;
  entries: EditEntry[];
}

function leagueGroups(L: League | null, prefix: string, label: string, skip?: string): EditGroup[] {
  if (!L) return [];
  return L.teams
    .filter((t) => t.info.id !== skip)
    .map((t) => ({
      id: `${prefix}:${t.info.id}`,
      label: `${label} · ${t.info.city} ${t.info.name}`,
      entries: t.players.filter((p) => p.id !== 'me').map((p) => ({ key: `${prefix}:${t.info.id}:${p.id}`, player: p, team: t.info.id })),
    }));
}

/** 고칠 수 있는 선수 전부 (묶음별) */
export function editGroups(c: Career): EditGroup[] {
  const myTeam = c.pro ? c.pro.team : c.school;
  const groups: EditGroup[] = [{ id: 'me', label: '나', entries: [{ key: 'me', player: c.me, team: myTeam }] }];
  const mates = teammates(c)
    .map((e) => e.player)
    .filter((p) => p.id !== 'me');
  groups.push({ id: 'mate', label: '우리 팀', entries: mates.map((p) => ({ key: `mate:${p.id}`, player: p, team: myTeam })) });
  if (c.rival) groups.push({ id: 'rival', label: '라이벌', entries: [{ key: 'rival', player: c.rival.player, team: c.rival.school }] });
  if (c.pro && c.league) {
    groups.push(...leagueGroups(c.league, 'lg', c.overseas ? '해외 리그' : '리그', myTeam));
    if (c.homeLeague) groups.push(...leagueGroups(c.homeLeague, 'home', '국내 리그'));
    if (c.abroadLeague) groups.push(...leagueGroups(c.abroadLeague, 'abroad', '해외 리그'));
  } else {
    // 상대 학교는 해마다 새로 만들어진다 (고친 건 그해만 남는다)
    const list = (c.college ? COLLEGES : SCHOOLS).filter((s) => s.id !== c.school);
    for (const s of list) {
      const t = opponentTeam(c, s.id);
      groups.push({ id: `school:${s.id}`, label: `${c.college ? '대학' : '고교'} · ${s.name}`, entries: t.players.filter((p) => p.id !== c.rival?.player.id).map((p) => ({ key: `school:${s.id}:${p.id}`, player: p, team: s.id })) });
    }
  }
  return groups.filter((g) => g.entries.length);
}

/** 키로 선수 찾기 (세이브에 있는 실제 객체, 상대 학교는 사본) */
export function findEditable(c: Career, key: string): EditEntry | null {
  if (key === 'me') return { key, player: c.me, team: c.pro ? c.pro.team : c.school };
  if (key === 'rival') return c.rival ? { key, player: c.rival.player, team: c.rival.school } : null;
  const [kind, a, b] = key.split(':');
  if (kind === 'mate') {
    const p = teammates(c).find((e) => e.player.id === a)?.player;
    return p ? { key, player: p, team: c.pro ? c.pro.team : c.school } : null;
  }
  if (kind === 'lg' || kind === 'home' || kind === 'abroad') {
    const L = kind === 'lg' ? c.league : kind === 'home' ? c.homeLeague : c.abroadLeague;
    const p = L?.teams.find((t) => t.info.id === a)?.players.find((x) => x.id === b);
    return p ? { key, player: p, team: a } : null;
  }
  if (kind === 'school') {
    const p = opponentTeam(c, a).players.find((x) => x.id === b);
    return p ? { key, player: p, team: a } : null;
  }
  return null;
}

/** 해마다 만들어지는 선수는 고친 사본을 따로 둔다 */
export function isGenerated(key: string) {
  return key.startsWith('school:');
}

export function storeOverride(c: Career, p: Player) {
  (c.overrides ??= {})[p.id] = JSON.parse(JSON.stringify(p)) as Player;
}

// ───────────── 되돌리기와 🔧 표시 ─────────────

/** 편집 창을 열 때 찍어 두는 처음 값 */
export interface EditSnap {
  key: string;
  player: string;
  /** 나: 선호 포지션, 잠재력, 성장, 최종 키, 성격, 연애 */
  me?: string;
  /** 팀원: 나와의 친밀도, 콤비 */
  mate?: string;
  override?: string | null;
}

export function snapEdit(c: Career, e: EditEntry): EditSnap {
  const s: EditSnap = { key: e.key, player: JSON.stringify(e.player) };
  if (e.key === 'me') s.me = JSON.stringify({ prefPos: c.prefPos, potential: c.potential, growth: c.growth, finalHeight: c.finalHeight, traits: c.traits, romance: c.romance });
  if (e.key.startsWith('mate:')) s.mate = JSON.stringify({ friend: c.friends[e.player.id], combos: c.combos });
  if (isGenerated(e.key)) s.override = c.overrides?.[e.player.id] ? JSON.stringify(c.overrides[e.player.id]) : null;
  return s;
}

/** 같은 객체를 그대로 두고 값만 처음으로 (리그 배열이 같은 객체를 가리킨다) */
function restoreInto(p: Player, json: string) {
  const v = JSON.parse(json) as Player;
  for (const k of Object.keys(p)) delete (p as unknown as Record<string, unknown>)[k];
  Object.assign(p, v);
}

export function revertEdit(c: Career, e: EditEntry, s: EditSnap) {
  restoreInto(e.player, s.player);
  if (s.me) Object.assign(c, JSON.parse(s.me));
  if (s.mate) {
    const m = JSON.parse(s.mate) as { friend?: number; combos: Career['combos'] };
    if (m.friend === undefined) delete c.friends[e.player.id];
    else c.friends[e.player.id] = m.friend;
    c.combos = m.combos;
  }
  if (s.override !== undefined) {
    if (s.override === null) delete c.overrides?.[e.player.id];
    else storeOverride(c, JSON.parse(s.override) as Player);
  }
}

/** 이름·등번호·겉모습만 바꾼 건 🔧를 남기지 않는다 (내 선수는 무엇이든 남긴다) */
export const COSMETIC = new Set(['name', 'number', 'look']);

export function marksDev(key: string, field: string) {
  return key === 'me' || !COSMETIC.has(field);
}
