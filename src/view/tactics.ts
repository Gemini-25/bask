// 작전 탭 (M22): 작전별 공격 효율, 수비 전술별 실점, 코트 위 선수들의 판단 (농구 IQ·위치선정이 보이게)
import { PLAY_LABEL, type DefScheme, type GameResult, type PlayKind } from '../sim/types';
import type { TeamLook } from './CourtScene';
import { DEF_LABEL, lineupRoles, ROLE_DESC, ROLE_LABEL } from '../sim/roles';

const SCHEME: Record<DefScheme, string> = { man: '대인방어', zone23: '2-3 지역방어', zone32: '3-2 지역방어', press: '풀코트 프레스' };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

interface Eff {
  calls: number;
  fga: number;
  fgm: number;
  tov: number;
  fta: number;
  pts: number;
}
const eff = (): Eff => ({ calls: 0, fga: 0, fgm: 0, tov: 0, fta: 0, pts: 0 });
const poss = (e: Eff) => e.fga + e.tov + 0.44 * e.fta;

export function tacticsHtml(g: GameResult, cur: number, looks: [TeamLook, TeamLook], onCourt: number[]): string {
  const plays: [Record<string, Eff>, Record<string, Eff>] = [{}, {}];
  const schemes: [Record<string, Eff>, Record<string, Eff>] = [{}, {}];
  const scheme: [DefScheme, DefScheme] = ['man', 'man'];
  const judge = new Map<number, { shots: number; xfg: number; open: number; tov: number; ast: number }>();
  // 역할 (M24): 이번 경기에서 실제로 맡은 일 (작전에서 공을 쥔 횟수, 스크린, 아이솔, 포스트, 핀다운), 주로 막은 상대
  const used = new Map<number, { handle: number; screen: number; iso: number; post: number; pin: number; guarded: Map<number, number> }>();
  const U = (pid: number) => {
    let u = used.get(pid);
    if (!u) used.set(pid, (u = { handle: 0, screen: 0, iso: 0, post: 0, pin: 0, guarded: new Map() }));
    return u;
  };
  const J = (pid: number) => {
    let j = judge.get(pid);
    if (!j) judge.set(pid, (j = { shots: 0, xfg: 0, open: 0, tov: 0, ast: 0 }));
    return j;
  };
  for (const e of g.events) {
    if (e.tick > cur) break;
    if (e.type === 'defense' && e.scheme) scheme[e.team] = e.scheme;
    // 프레스는 한 번의 수비 (하프라인을 넘으면 대인방어로 돌아간다: 엔진은 그때 따로 알리지 않는다)
    const ended = e.type === 'made' || e.type === 'turnover' || (e.type === 'rebound' && !e.offensive);
    if (e.type === 'play' && e.play) {
      (plays[e.team][e.play] ??= eff()).calls++;
      if (e.play === 'pnr' || e.play === 'dho') {
        if (e.player >= 0) U(e.player).handle++;
        if (e.other >= 0) U(e.other).screen++;
      } else if (e.play === 'pindown') {
        if (e.player >= 0) U(e.player).pin++;
        if (e.other >= 0) U(e.other).screen++;
      } else if (e.play === 'iso' && e.player >= 0) U(e.player).iso++;
      else if (e.play === 'post' && e.other >= 0) U(e.other).post++;
    }
    if ((e.type === 'made' || e.type === 'miss') && e.def !== undefined && e.def >= 0 && e.player >= 0) {
      const gm = U(e.def).guarded;
      gm.set(e.player, (gm.get(e.player) ?? 0) + 1);
    }
    if (e.type !== 'made' && e.type !== 'miss' && e.type !== 'turnover' && e.type !== 'ft') {
      if (ended) for (const t of [0, 1] as const) if (scheme[t] === 'press' && (e.type === 'rebound' ? t === e.team : t !== e.team)) scheme[t] = 'man';
      continue;
    }
    const k = e.play ?? 'none';
    const def = (1 - e.team) as 0 | 1;
    for (const b of [(plays[e.team][k] ??= eff()), (schemes[def][scheme[def]] ??= eff())]) {
      if (e.type === 'made' || e.type === 'miss') {
        b.fga++;
        if (e.type === 'made') {
          b.fgm++;
          b.pts += e.pts;
        }
      } else if (e.type === 'turnover') b.tov++;
      else {
        b.fta++;
        if (e.made) b.pts++;
      }
    }
    if (e.player >= 0 && (e.type === 'made' || e.type === 'miss')) {
      const j = J(e.player);
      j.shots++;
      j.xfg += e.prob ?? 0;
      if ((e.contest ?? 1) < 0.25) j.open++;
      if (e.type === 'made' && e.other >= 0) J(e.other).ast++;
    }
    if (e.type === 'turnover' && e.player >= 0) J(e.player).tov++;
    if (ended) for (const t of [0, 1] as const) if (scheme[t] === 'press' && t !== e.team) scheme[t] = 'man';
  }
  const tag = (t: 0 | 1) => `<span class="tag" style="background:${looks[t].fill};color:${looks[t].num}">${esc(g.teams[t].short)}</span>`;
  const ppp = (e: Eff) => (poss(e) > 0 ? (e.pts / poss(e)).toFixed(2) : '-');
  const fg = (e: Eff) => (e.fga ? `${Math.round((e.fgm / e.fga) * 100)}%` : '-');
  const playRows = (t: 0 | 1) =>
    Object.entries(plays[t])
      .filter(([, e]) => poss(e) > 0 || e.calls > 0)
      .sort((a, b) => poss(b[1]) - poss(a[1]))
      .map(([k, e]) => `<tr><td class="nm">${k === 'none' ? '작전 없이' : PLAY_LABEL[k as PlayKind]}</td><td>${e.calls || '-'}</td><td>${Math.round(poss(e))}</td><td>${e.pts}</td><td><b>${ppp(e)}</b></td><td>${fg(e)}</td></tr>`)
      .join('');
  const schemeRows = (t: 0 | 1) =>
    Object.entries(schemes[t])
      .sort((a, b) => poss(b[1]) - poss(a[1]))
      .map(([k, e]) => `<tr><td class="nm">${SCHEME[k as DefScheme] ?? k}</td><td>${Math.round(poss(e))}</td><td>${e.pts}</td><td><b>${ppp(e)}</b></td><td>${fg(e)}</td></tr>`)
      .join('');
  const people = onCourt
    .map((pid) => ({ pid, p: g.players[pid], t: g.teamOf[pid], j: judge.get(pid) }))
    .map(
      ({ pid, p, t, j }) =>
        `<tr><td class="nm">${tag(t)} ${esc(p.name)}</td><td>${p.r.iq}</td><td>${p.r.offBall}</td><td>${p.r.helpD}</td><td>${j?.shots ? `${Math.round((j.xfg / j.shots) * 100)}%` : '-'}</td><td>${j?.shots ? `${Math.round((j.open / j.shots) * 100)}%` : '-'}</td><td>${j?.ast ?? 0}</td><td>${j?.tov ?? 0}</td></tr>`.replace('<tr>', `<tr data-p="${pid}">`),
    )
    .join('');
  // 지금 다섯 명씩의 역할
  const five = (t: 0 | 1) => onCourt.slice(t * 5, t * 5 + 5).map((pid) => g.players[pid]);
  const rs = [...lineupRoles(five(0), five(1)), ...lineupRoles(five(1), five(0))];
  const roleRows = onCourt
    .map((pid, i) => {
      const p = g.players[pid];
      const r = rs[i];
      const u = used.get(pid);
      const did = u ? [u.handle && `볼 핸들러 ${u.handle}`, u.screen && `스크린 ${u.screen}`, u.iso && `아이솔 ${u.iso}`, u.post && `포스트 ${u.post}`, u.pin && `핀다운 ${u.pin}`].filter(Boolean).join(' · ') : '';
      let gp = -1;
      let gn = 0;
      for (const [o, n] of u?.guarded ?? []) if (n > gn) [gp, gn] = [o, n];
      const opp = r.guards ? `#${r.guards.number} ${esc(r.guards.name)}` : '';
      const seen = gp >= 0 ? `가장 많이 막은 슛: #${g.players[gp].number} ${esc(g.players[gp].name)} ${gn}개` : '';
      return `<tr data-p="${pid}"><td class="nm">${tag(g.teamOf[pid] as 0 | 1)} ${esc(p.name)} <small class="muted">${p.pos}</small></td><td class="nm rl" title="${esc(ROLE_DESC[r.key])}"><b>${ROLE_LABEL[r.key]}</b><small>${esc(r.jobs.join(' · '))}</small>${did ? `<small class="did">이번 경기: ${did}</small>` : ''}</td><td class="nm rl"><b>${DEF_LABEL[r.def]}</b>${opp ? `<small>막는 상대 ${opp}</small>` : ''}${seen ? `<small>${seen}</small>` : ''}</td></tr>`;
    })
    .join('');
  const team = (t: 0 | 1) => `<h3>${tag(t)} ${esc(g.teams[t].city)} ${esc(g.teams[t].name)}</h3>
    <div class="tablewrap"><table><tr><th class="nm">공격 작전</th><th title="작전을 부른 횟수">부름</th><th title="공격 수 (야투 + 실책 + 자유투×0.44)">공격</th><th>득점</th><th title="공격당 득점 (1.00이면 리그 평균 근처, 1.10 넘으면 아주 잘 통함)">공격당</th><th>야투</th></tr>${playRows(t)}</table></div>
    <div class="tablewrap"><table><tr><th class="nm">수비 전술</th><th>상대 공격</th><th>실점</th><th title="상대 공격당 득점 (낮을수록 잘 막음)">공격당</th><th>상대 야투</th></tr>${schemeRows(t)}</table></div>`;
  return `<h3>지금 코트 위 선수의 역할</h3>
    <div class="tablewrap"><table class="roles"><tr><th class="nm">선수</th><th class="nm" title="공격 역할, 맡은 일, 이번 경기에서 작전 중 실제로 한 일 (횟수)">공격</th><th class="nm">수비</th></tr>${roleRows}</table></div>
    <p class="hint">역할은 감독이 작전을 짤 때 쓰는 기준 그대로다: 볼핸들링+패스가 가장 좋은 선수가 공을 몰고, 혼자 만드는 힘이 가장 센 선수가 아이솔레이션을 맡는다. 가드가 아닌 선수 중 스크린이 가장 좋은 선수가 스크리너 (3점 60 넘으면 팝), 수비는 상대 위협 순서대로 맞는 수비수를 붙인다. 이름표를 '역할'로 바꾸면 코트 위에서도 보인다 (단축키 L).</p>
    ${team(0)}${team(1)}
    <h3>지금 코트 위 선수의 판단</h3>
    <div class="tablewrap"><table><tr><th class="nm">선수</th><th title="농구 IQ">IQ</th><th title="오프볼 움직임 (위치선정)">오프볼</th><th title="도움 수비">도움</th><th title="고른 슛의 평균 성공 확률 (높을수록 좋은 슛을 고른다)">슛 선택</th><th title="수비가 거의 안 붙은 슛 비율">노마크</th><th>어시</th><th>실책</th></tr>${people}</table></div>
    <p class="hint">IQ가 높으면 좋은 슛을 고르고 실책이 적다. 오프볼이 좋으면 수비가 떠나지 못해 동료 앞이 열리고, 받자마자 쏘는 슛이 편하다. 도움 수비가 좋으면 골밑을 잘 지킨다.</p>`;
}
