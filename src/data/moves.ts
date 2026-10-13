// 슛 동작 (M16): 스텝백, 페이드어웨이, 유로스텝, 인유어페이스 덩크 같은 동작.
// 능력치가 조건을 넘으면 누구나 가끔 하고, 관련 특수능력·센스·천재·성격이 있으면 훨씬 자주 한다.
// 효과는 작게: 견제(c), 성공률(p), 블록(block), 슈팅 파울(foul), 파울 당하고도 넣기(andOne)에 곱한다.
import { ACT, type ShotKind, type ShotMove } from '../sim/types';
import type { AbilityId } from './abilities';
import type { RatingKey } from './ratings';

/** 언제 하나: 붙어 있을 때 / 노마크 / 돌파 끝 / 포스트 / 받자마자 / 골밑 혼잡 / 블록하러 떴을 때 */
export type MoveWhen = 'tight' | 'open' | 'drive' | 'post' | 'catch' | 'traffic' | 'rimContest' | 'any';

export interface ShotMoveDef {
  id: ShotMove;
  label: string;
  /** 슛 이름 앞에 붙이나 (false면 label이 전체 이름) */
  prefix: boolean;
  kinds: ShotKind[];
  need: Partial<Record<RatingKey, number>>;
  /** 빈도에 쓰는 능력치 */
  keys: RatingKey[];
  base: number;
  when: MoveWhen;
  /** 화려한 동작 (센스·천재·쇼맨이 늘린다) */
  flashy?: boolean;
  /** 힘으로 하는 동작 (다혈질·승부욕) / 기본기 (냉철) */
  style?: 'power' | 'basic';
  /** 이 특수능력이 있으면 ★마다 크게 늘어난다 */
  ability?: AbilityId;
  minHeight?: number;
  act: number;
  fx: { c?: number; p?: number; block?: number; foul?: number; andOne?: number };
  /** 준비 동작 중에 미끄러지듯 움직이는 거리 (m) */
  slide?: { m: number; dir: 'back' | 'side' };
  /** 준비 시간 더 (초) */
  extra?: number;
  /**
   * 수비를 실제로 제치는 방법 (M25): 달려든 수비가 한 발 늦음 (lunge), 떨어져 공간 (space), 첫 스텝에 속음 (bite),
   * 블록 손을 피함 (dodge), 몸으로 밀어냄 (shove), 블록하러 뜬 수비 위로 (over), 펌프 페이크에 뜸 (jumpfake)
   */
  beat?: 'lunge' | 'space' | 'bite' | 'dodge' | 'shove' | 'over' | 'jumpfake';
}

export const SHOT_MOVES: ShotMoveDef[] = [
  // 점프슛
  { id: 'stepback', label: '스텝백', prefix: true, kinds: ['mid', 'three'], need: { ballHandling: 58, agility: 52 }, keys: ['ballHandling', 'agility', 'three'], base: 1.2, when: 'tight', flashy: true, ability: 'stepback', act: ACT.STEPBACK, fx: { p: 0.95 }, slide: { m: 1.0, dir: 'back' }, extra: 0.14 , beat: 'lunge' },
  { id: 'sidestep', label: '사이드스텝', prefix: true, kinds: ['three'], need: { ballHandling: 55, three: 60 }, keys: ['ballHandling', 'three', 'agility'], base: 0.8, when: 'tight', ability: 'stepback', act: ACT.SIDESTEP, fx: { p: 0.96 }, slide: { m: 0.9, dir: 'side' }, extra: 0.12 , beat: 'lunge' },
  { id: 'pullup', label: '풀업', prefix: true, kinds: ['mid', 'three'], need: { midRange: 52, ballHandling: 50 }, keys: ['midRange', 'ballHandling'], base: 1.0, when: 'drive', act: ACT.SHOOT, fx: {} },
  { id: 'fadeaway', label: '페이드어웨이', prefix: true, kinds: ['mid'], need: { midRange: 60 }, keys: ['midRange', 'composure', 'sense'], base: 1.0, when: 'tight', flashy: true, ability: 'fadeaway', act: ACT.FADE, fx: { c: 0.78, p: 0.95, block: 0.25 }, slide: { m: 0.45, dir: 'back' } , beat: 'space' },
  { id: 'turnFade', label: '턴어라운드 페이드어웨이', prefix: false, kinds: ['mid', 'hook'], need: { postUp: 55, midRange: 55 }, keys: ['postUp', 'midRange'], base: 1.4, when: 'post', ability: 'fadeaway', act: ACT.TURNFADE, fx: { c: 0.8, p: 0.92, block: 0.3 }, slide: { m: 0.35, dir: 'back' } , beat: 'space' },
  { id: 'oneLeg', label: '원레그 페이더', prefix: false, kinds: ['mid'], need: { midRange: 72, sense: 65 }, keys: ['midRange', 'sense'], base: 0.5, when: 'tight', flashy: true, ability: 'fadeaway', act: ACT.ONELEG, fx: { c: 0.72, p: 0.88, block: 0.15 }, slide: { m: 0.3, dir: 'back' } , beat: 'space' },
  { id: 'catchShoot', label: '캐치앤슛', prefix: true, kinds: ['three', 'mid'], need: { three: 60 }, keys: ['three', 'offBall'], base: 1.5, when: 'catch', style: 'basic', act: ACT.SHOOT, fx: { p: 1.02 } },
  { id: 'contactShot', label: '컨택트', prefix: true, kinds: ['mid', 'floater', 'layup'], need: { strength: 58 }, keys: ['strength', 'composure'], base: 0.9, when: 'traffic', style: 'power', ability: 'contact', act: ACT.CONTACT, fx: { foul: 1.35, p: 0.9, andOne: 1.4 } , beat: 'shove' },
  { id: 'pumpFake', label: '펌프 페이크', prefix: true, kinds: ['mid', 'three'], need: { iq: 50 }, keys: ['iq', 'sense', 'composure'], base: 0.9, when: 'tight', act: ACT.PUMPFAKE, fx: {}, extra: 0.35, beat: 'jumpfake' },
  // 팁인 (M26): 리바운드 다툼에서만 (고르는 동작이 아니다)
  { id: 'tipIn', label: '팁인', prefix: false, kinds: ['layup'], need: {}, keys: ['offReb'], base: 0, when: 'any', act: ACT.TIPIN, fx: { c: 0.55 } },
  { id: 'bank', label: '뱅크슛', prefix: false, kinds: ['mid'], need: {}, keys: ['midRange', 'iq'], base: 0.4, when: 'any', style: 'basic', act: ACT.SHOOT, fx: {} },
  { id: 'skyhook', label: '스카이훅', prefix: false, kinds: ['hook'], need: { postUp: 70 }, keys: ['postUp'], base: 1.0, when: 'any', minHeight: 203, act: ACT.SKYHOOK, fx: { block: 0.35, p: 0.98 } },
  { id: 'teardrop', label: '티어드롭', prefix: false, kinds: ['floater'], need: { floater: 60 }, keys: ['floater', 'sense'], base: 0.8, when: 'traffic', flashy: true, act: ACT.FLOAT, fx: { block: 0.6 } },
  // 레이업
  { id: 'euro', label: '유로스텝', prefix: true, kinds: ['layup'], need: { agility: 55, ballHandling: 52 }, keys: ['agility', 'ballHandling', 'sense'], base: 1.2, when: 'drive', flashy: true, ability: 'euro', act: ACT.EURO, fx: { c: 0.93, p: 0.95 }, slide: { m: 0.8, dir: 'side' }, extra: 0.1 , beat: 'bite' },
  { id: 'scoop', label: '스쿱', prefix: true, kinds: ['layup'], need: { layup: 55 }, keys: ['layup', 'sense'], base: 0.7, when: 'traffic', flashy: true, ability: 'euro', act: ACT.SCOOP, fx: { block: 0.5, p: 0.88 } , beat: 'dodge' },
  { id: 'reverseLay', label: '리버스', prefix: true, kinds: ['layup'], need: { layup: 58, agility: 50 }, keys: ['layup', 'agility'], base: 0.8, when: 'traffic', ability: 'euro', act: ACT.REVLAY, fx: { block: 0.4, p: 0.95 } , beat: 'dodge' },
  { id: 'fingerRoll', label: '핑거롤', prefix: false, kinds: ['layup'], need: { layup: 55 }, keys: ['layup'], base: 0.8, when: 'open', style: 'basic', act: ACT.FINGER, fx: { p: 1.01 } },
  { id: 'powerLay', label: '파워', prefix: true, kinds: ['layup'], need: { strength: 60 }, keys: ['strength', 'layup'], base: 1.0, when: 'traffic', style: 'power', ability: 'contact', act: ACT.POWERLAY, fx: { foul: 1.2, block: 0.75, andOne: 1.2 } , beat: 'shove' },
  { id: 'doubleClutch', label: '더블 클러치', prefix: false, kinds: ['layup'], need: { jump: 65, layup: 62, sense: 58 }, keys: ['jump', 'layup', 'sense'], base: 0.5, when: 'traffic', flashy: true, ability: 'euro', act: ACT.CLUTCH, fx: { block: 0.3, p: 0.9 } , beat: 'dodge' },
  // 덩크
  // 덩크 동작은 수비가 버텨서 레이업을 올리려던 때도 고를 수 있다 (덩크가 되는 선수만)
  { id: 'poster', label: '인유어페이스 덩크', prefix: false, kinds: ['dunk', 'layup'], need: { dunk: 70, jump: 68 }, keys: ['dunk', 'jump', 'strength', 'competitive'], base: 1.0, when: 'rimContest', flashy: true, style: 'power', ability: 'poster', act: ACT.POSTER, fx: { block: 0.2, foul: 1.15, andOne: 1.3 } , beat: 'over' },
  { id: 'contactDunk', label: '컨택트 덩크', prefix: false, kinds: ['dunk', 'layup'], need: { dunk: 60, strength: 62 }, keys: ['strength', 'dunk'], base: 1.0, when: 'traffic', style: 'power', ability: 'contact', act: ACT.CDUNK, fx: { foul: 1.3, block: 0.6, andOne: 1.35, p: 0.94 } , beat: 'shove' },
];

/** 레이업 자리에서도 덩크로 바꿔 찍는 동작 */
export const DUNK_MOVES: ShotMove[] = ['poster', 'contactDunk', 'putback'];

export function shotMove(id: ShotMove) {
  return SHOT_MOVES.find((m) => m.id === id);
}

/** 문자 중계에 쓰는 이름 (스텝백 3점슛, 유로스텝 레이업, 인유어페이스 덩크) */
export function moveShotLabel(id: ShotMove, kindLabel: string): string {
  if (id === 'putback') return '풋백 덩크';
  const m = shotMove(id);
  if (!m) return kindLabel;
  return m.prefix ? `${m.label} ${kindLabel}` : m.label;
}
