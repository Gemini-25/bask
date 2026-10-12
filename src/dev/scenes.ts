// 개발용: 훈련 장면 전부 한 화면에
import { trainingScene } from '../app/scenes';
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
