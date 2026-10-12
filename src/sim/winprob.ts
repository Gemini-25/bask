import { overall } from '../data/player';
import type { Team } from '../data/teams';
import type { GameResult } from './types';

// 승리 확률 (V7). 남은 시간 동안 점수 차가 정규분포로 움직인다고 보고 계산한다.
// 계수는 tools/wp.ts로 300경기를 돌려 맞췄다.

/** 출전 시간 비중대로 가중한 팀 전력 (주전이 무겁다) */
const ROTATION = [32, 30, 30, 30, 30, 22, 17, 12, 8, 4, 2, 2];

export function teamStrength(team: Team): number {
  const ovr = team.players.map((p) => overall(p)).sort((a, b) => b - a);
  let s = 0;
  let n = 0;
  ovr.forEach((v, i) => {
    const w = ROTATION[i] ?? 0;
    s += v * w;
    n += w;
  });
  return s / n;
}

/** 전력 1점 차가 40분 동안 만드는 점수 차 */
export const MARGIN_PER_OVR = 1.4;
/** 40분 경기 최종 점수 차의 표준편차 (전력 차를 뺀 나머지) */
export const MARGIN_SD = 14.5;

/** 경기 전 예상 점수 차 (팀0 − 팀1) */
export function expectedMargin(a: Team, b: Team): number {
  return (teamStrength(a) - teamStrength(b)) * MARGIN_PER_OVR;
}

function phi(z: number): number {
  // 표준정규 누적분포 (Abramowitz–Stegun 근사)
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/** 팀0이 이길 확률. margin = 팀0 − 팀1, remain = 남은 경기 시간(초), full = 정규 경기 길이(초) */
export function winProb(margin: number, remain: number, expected: number, full = 2400): number {
  const frac = Math.max(0, remain) / full;
  const mu = margin + expected * frac;
  const sd = MARGIN_SD * Math.sqrt(frac) + 0.5;
  return phi(mu / sd);
}

export interface WpPoint {
  /** 경기 흐른 시간(초) */
  t: number;
  p: number;
  quarter: number;
  score: [number, number];
}

/** 득점이 날 때마다, 그리고 10초마다 승리 확률을 찍는다 */
export function winProbSeries(game: GameResult): WpPoint[] {
  const { rec, events, quarterSeconds } = game;
  const exp = expectedMargin(game.teams[0], game.teams[1]);
  const full = quarterSeconds * 4;
  const out: WpPoint[] = [];
  let ei = 0;
  let score: [number, number] = [0, 0];
  const step = Math.round(10 / game.dt);
  for (let i = 0; i < rec.n; i++) {
    let changed = false;
    while (ei < events.length && events[ei].tick <= i) {
      const s = events[ei].score;
      if (s[0] !== score[0] || s[1] !== score[1]) changed = true;
      score = s;
      ei++;
    }
    if (!changed && i % step !== 0 && i !== rec.n - 1) continue;
    const q = rec.quarter[i];
    const t = rec.elapsed[i];
    // 연장은 그 연장의 남은 시간만 본다
    const remain = q <= 4 ? full - t : rec.clock[i];
    let p = winProb(score[0] - score[1], remain, exp, full);
    if (i === rec.n - 1) p = score[0] > score[1] ? 1 : 0;
    out.push({ t, p, quarter: q, score: [score[0], score[1]] });
  }
  return out;
}
