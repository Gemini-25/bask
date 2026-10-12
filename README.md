# bask

2D 도트(카이로소프트 느낌) 농구 선수 육성 시뮬레이션. 개인 프로젝트.

- 나만의 선수 한 명을 고교부터 키우는 커리어
- 기술 / 정신 / 피지컬 능력치 39개와 특수능력
- 10명이 스스로 판단하며 움직이는 경기를 실시간으로 관람

## 플레이

`play/bask.html` 파일 하나를 받아서 더블클릭하면 브라우저에서 바로 열린다. 인터넷 연결 없이도 된다.

지금 버전은 **M3 경기 관람 테스트**: 가상 리그 두 팀(12명씩)이 붙는 경기를 3/4 쿼터뷰 경기장에서 본다. 도트 캐릭터가 드리블·점프슛·덩크·블록 같은 동작을 하고, 덩크 줌인·컷인·버저비터 슬로모션 같은 연출이 있다.

- Space 재생/정지 · 1~5 배속 (1x, 2x, 4x, 8x, 16x) · Q 쿼터 넘기기 · H 하이라이트 · N 새 경기
- 보는 방법: 전체 / 고른 선수만 (그 선수가 코트에 있을 때만) / 하이라이트
- 박스스코어나 선수 탭에서 선수를 누르면 코트에 노란 화살표가 뜨고 능력치 39개를 볼 수 있다
- 샷차트 탭: 슛 위치와 구역별 성공률, 흐름 탭: 승리 확률 그래프

## 개발

```sh
npm install
npm run dev        # 개발 서버
npm test           # 단위·밸런스 테스트
npm run build      # dist/index.html 하나로 빌드
npm run report     # 100경기 돌려서 평균 통계를 실제 리그와 비교
```

디버그 도구 (`tools/`):

- `npx tsx tools/ascii.ts [시드] [시작초] [길이초] [간격초]`: 경기를 글자 코트로 찍는다
- `npx tsx tools/think.ts [시드] [시작초] [끝초]`: 공 가진 선수가 어떤 선택지를 몇 점으로 봤는지
- `npx tsx tools/shots.ts`: 슛 종류별 수비 견제 분포
- `node tools/frames.mjs [출력.png] [시드] [시작초] [장 수] [간격초]`: 빌드된 화면을 연속 캡처
- `npx tsx tools/wp.ts [경기 수]`: 승리 확률 계수 맞추기와 보정 확인
- `node tools/charts.mjs <주소> <폴더> [시드]`: 샷차트·흐름·하이라이트 화면 캡처
- `sprites.html` (개발 서버에서 열기): 도트 캐릭터 동작 × 방향 시트

## 구조

- `src/sim/`: 경기 엔진. 화면 없이 돌아가고 0.1초 프레임 기록과 이벤트를 만든다
- `src/data/`: 능력치, 선수 생성, 가상 리그 10팀
- `src/view/`: Phaser 경기장 화면(`arena.ts` 경기장, `character.ts` 도트 캐릭터, `CourtScene.ts` 연출)과 HTML UI·차트. 엔진이 만든 기록을 재생만 한다

## 기획

- [기획 질문지](docs/planning/01-questions.md): 방향을 정하기 위한 질문 133개와 추천 답
- [기획 결정 v1](docs/planning/02-decisions.md): 질문지 답변 정리, 해석, 열린 질문
- [로드맵](docs/planning/03-roadmap.md): 마일스톤 M0~M8
- [M1 밸런스 리포트](docs/planning/m1-balance-report.txt), [M2 밸런스 리포트](docs/planning/m2-balance-report.txt): 200경기 평균 통계

폰트: [갈무리](https://github.com/quiple/galmuri) (SIL OFL 1.1)
