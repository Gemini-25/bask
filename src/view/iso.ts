// 3/4 쿼터뷰 투영 (V1). 코트를 비스듬히 위에서 본다.
// 가로 1m = 20px, 깊이 1m = 14px, 높이 1m = 14px (도트 캐릭터 비율에 맞춘 값, M21에 캐릭터가 커져서 11 → 14)

export const VIEW_W = 640;
export const VIEW_H = 360;
export const PXX = 20;
export const PXY = 14;
export const ZH = 14;
export const OX = 40;
export const OY = 100;

export const sx = (x: number) => OX + x * PXX;
export const sy = (y: number) => OY + y * PXY;
/** 땅 위 (x, y)에서 높이 z인 점의 화면 y */
export const szy = (y: number, z: number) => sy(y) - z * ZH;
