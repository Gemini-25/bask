import type { Rng } from '../core/rng';

const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '홍', '전', '고', '문', '양', '손', '배', '백', '허', '남', '심'];
const FIRST = ['민', '준', '서', '현', '우', '진', '호', '성', '재', '영', '수', '태', '동', '하', '지', '원', '승', '시', '도', '건', '주', '경', '상', '용', '범', '한', '정', '윤', '규', '석'];
const SECOND = ['준', '호', '우', '민', '현', '진', '혁', '훈', '빈', '수', '찬', '원', '성', '재', '율', '결', '한', '석', '규', '영', '환', '욱', '오', '기', '섭', '철', '균', '완', '택', '헌'];

export function koreanName(rng: Rng): string {
  let given = rng.pick(FIRST) + rng.pick(SECOND);
  while (given[0] === given[1]) given = rng.pick(FIRST) + rng.pick(SECOND);
  return rng.pick(SURNAMES) + given;
}
