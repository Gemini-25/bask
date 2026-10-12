// 칩튠 곡 (SD1): 파일 없이 음표 데이터로. 한 마디 = 8분음표 8칸.
export type SongId = 'title' | 'school' | 'pro' | 'tense' | 'ceremony' | 'ending';

export interface Song {
  /** 8분음표 한 칸 길이 (초) */
  beat: number;
  /** 마디마다 화음 (MIDI) */
  chords: number[][];
  /** 칸마다 멜로디 (0이면 쉼) */
  lead: number[];
  leadWave: OscillatorType;
  leadVol: number;
  /** 베이스: 2칸마다 / 매 칸 */
  bass: 2 | 1;
  /** 칸마다 드럼: k 킥, s 스네어, h 하이햇, . 없음 (마디 단위로 반복) */
  drums: string;
  /** 화음 아르페지오 */
  arp: boolean;
}

export const SONGS: Record<SongId, Song> = {
  // 타이틀: 힘찬 D장조
  title: {
    beat: 0.2,
    chords: [
      [62, 66, 69],
      [59, 62, 66],
      [55, 59, 62],
      [57, 61, 64],
    ],
    lead: [74, 0, 78, 0, 81, 0, 78, 76, 74, 0, 0, 71, 74, 0, 76, 0, 79, 0, 78, 76, 74, 0, 71, 0, 73, 0, 76, 0, 81, 0, 0, 0],
    leadWave: 'square',
    leadVol: 0.035,
    bass: 2,
    drums: 'k.h.s.h.',
    arp: true,
  },
  // 고교 홈: 처음 곡 (C - Am - F - G)
  school: {
    beat: 0.2,
    chords: [
      [60, 64, 67],
      [57, 60, 64],
      [53, 57, 60],
      [55, 59, 62],
    ],
    lead: [72, 0, 74, 76, 79, 0, 76, 74, 72, 0, 69, 72, 74, 0, 0, 0, 69, 0, 72, 74, 76, 0, 74, 72, 71, 0, 72, 74, 67, 0, 0, 0],
    leadWave: 'square',
    leadVol: 0.035,
    bass: 2,
    drums: '....h...',
    arp: true,
  },
  // 프로 홈: 그루브 (F - C - Dm - Bb)
  pro: {
    beat: 0.19,
    chords: [
      [65, 69, 72],
      [60, 64, 67],
      [62, 65, 69],
      [58, 62, 65],
    ],
    lead: [77, 0, 76, 77, 0, 72, 0, 74, 76, 0, 72, 0, 67, 0, 69, 72, 74, 0, 72, 74, 0, 77, 0, 76, 74, 72, 0, 70, 0, 69, 70, 72],
    leadWave: 'square',
    leadVol: 0.03,
    bass: 2,
    drums: 'k.hks.h.',
    arp: true,
  },
  // 플레이오프: 긴장되는 A단조
  tense: {
    beat: 0.17,
    chords: [
      [57, 60, 64],
      [53, 57, 60],
      [55, 59, 62],
      [52, 56, 59],
    ],
    lead: [69, 0, 69, 72, 0, 71, 69, 0, 65, 0, 65, 69, 0, 67, 65, 0, 67, 0, 67, 71, 0, 74, 72, 71, 68, 0, 71, 0, 76, 0, 75, 0],
    leadWave: 'sawtooth',
    leadVol: 0.022,
    bass: 1,
    drums: 'k.k.s.kk',
    arp: false,
  },
  // 시상식·우승: 팡파르
  ceremony: {
    beat: 0.24,
    chords: [
      [60, 64, 67],
      [65, 69, 72],
      [67, 71, 74],
      [60, 64, 67],
    ],
    lead: [72, 72, 72, 0, 76, 0, 79, 0, 77, 0, 76, 0, 74, 0, 72, 0, 74, 74, 74, 0, 77, 0, 79, 0, 84, 0, 0, 0, 0, 0, 0, 0],
    leadWave: 'square',
    leadVol: 0.04,
    bass: 2,
    drums: 'k...s...',
    arp: false,
  },
  // 은퇴: 잔잔하게
  ending: {
    beat: 0.32,
    chords: [
      [65, 69, 72],
      [64, 67, 71],
      [62, 65, 69],
      [60, 64, 67],
    ],
    lead: [72, 0, 0, 74, 72, 0, 69, 0, 71, 0, 0, 72, 71, 0, 67, 0, 69, 0, 0, 72, 69, 0, 65, 0, 67, 0, 0, 0, 64, 0, 0, 0],
    leadWave: 'triangle',
    leadVol: 0.06,
    bass: 2,
    drums: '........',
    arp: true,
  },
};
