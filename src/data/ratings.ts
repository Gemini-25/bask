// 능력치 39개 (S3~S6). 키·윙스팬·체중은 측정값이라 따로 body에 둔다.
export const RATING_GROUPS = [
  {
    key: 'physical',
    label: '피지컬',
    items: [
      ['speed', '스피드'],
      ['accel', '가속'],
      ['jump', '점프력'],
      ['strength', '근력'],
      ['stamina', '지구력'],
      ['agility', '민첩성'],
      ['recovery', '회복력'],
    ],
  },
  {
    key: 'offense',
    label: '공격',
    items: [
      ['layup', '레이업'],
      ['dunk', '덩크'],
      ['floater', '플로터'],
      ['midRange', '미드레인지'],
      ['three', '3점슛'],
      ['freeThrow', '자유투'],
      ['postUp', '포스트업'],
      ['ballHandling', '볼핸들링'],
      ['passing', '패스'],
      ['offBall', '오프볼 움직임'],
      ['screen', '스크린'],
    ],
  },
  {
    key: 'defense',
    label: '수비',
    items: [
      ['perimeterD', '외곽 수비'],
      ['postD', '포스트 수비'],
      ['steal', '스틸'],
      ['block', '블록'],
      ['defReb', '수비 리바운드'],
      ['offReb', '공격 리바운드'],
      ['helpD', '헬프 수비'],
      ['boxOut', '박스아웃'],
    ],
  },
  {
    key: 'mental',
    label: '정신',
    items: [
      ['iq', '농구 IQ'],
      ['vision', '시야'],
      ['composure', '침착성'],
      ['focus', '집중력'],
      ['competitive', '승부욕'],
      ['leadership', '리더십'],
      ['consistency', '일관성'],
      ['resilience', '멘탈 회복력'],
      ['hustle', '허슬'],
      ['teamwork', '팀워크'],
    ],
  },
] as const;

type Items = (typeof RATING_GROUPS)[number]['items'][number];
export type RatingKey = Items[0];
export type Ratings = Record<RatingKey, number>;

export const RATING_KEYS: RatingKey[] = [];
export const RATING_LABEL = {} as Record<RatingKey, string>;
for (const g of RATING_GROUPS) {
  for (const [k, label] of g.items) {
    RATING_KEYS.push(k);
    RATING_LABEL[k] = label;
  }
}

export interface Body {
  heightCm: number;
  wingspanCm: number;
  weightKg: number;
}

/** 표시용 등급 (S2: 등급 + 숫자) */
export function grade(v: number): string {
  if (v >= 90) return 'S';
  if (v >= 80) return 'A';
  if (v >= 70) return 'B';
  if (v >= 60) return 'C';
  if (v >= 50) return 'D';
  if (v >= 40) return 'E';
  if (v >= 30) return 'F';
  return 'G';
}
