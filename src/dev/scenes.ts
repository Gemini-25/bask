// 개발용: 훈련 장면 전부 한 화면에
import { trainingScene } from '../app/scenes';
import { dunkScene, stageScene } from '../app/stage';
import { Rng } from '../core/rng';
import { generatePlayer } from '../data/player';

const pl = generatePlayer(new Rng(5), 'SG', 0, 7);
pl.look = { skin: 1, hair: 3, hairColor: 0, shoe: 2, headband: true, sleeve: false };
const kit = { jersey: '#3d6fd6', trim: '#ffffff' };
const list = [
  ['team'],
  ['solo', 'shoot'],
  ['solo', 'drive'],
  ['solo', 'post'],
  ['solo', 'defense'],
  ['solo', 'pass'],
  ['mentor', 'shoot'],
  ['weight'],
  ['video'],
  ['street'],
  ['friends'],
  ['rest'],
  ['rehab'],
] as const;
for (const [scene, focus] of list) {
  const c = document.createElement('canvas');
  document.body.appendChild(c);
  trainingScene(c, { scene, focus: focus as never, pl, kit, gained: { P: 2, T: 5, M: 1 } });
}

// 무대 장면 (M10): 덩크 콘테스트, 우승, 시상, 드래프트
const mates = [1, 2, 3, 4].map((i) => generatePlayer(new Rng(30 + i), (['PG', 'SF', 'PF', 'C'] as const)[i - 1], 0, i * 11));
for (const style of ['windmill', 'ftline', 'elbow', 'between'] as const) {
  const c = document.createElement('canvas');
  document.body.appendChild(c);
  dunkScene(c).show({ pl, kit, style });
}
for (const kind of ['title', 'award', 'draft'] as const) {
  const c = document.createElement('canvas');
  document.body.appendChild(c);
  stageScene(c, { kind, pl, kit, mates, label: kind === 'award' ? 'MVP' : kind === 'draft' ? '서울 스카이호크스' : undefined });
}
