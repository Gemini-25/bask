// 화면 공용 도우미: 화면 전환, 모달, 파일 저장
export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export type ScreenId = 'title' | 'create' | 'home' | 'game' | 'result';
const SCREENS: ScreenId[] = ['title', 'create', 'home', 'game', 'result'];

let current: ScreenId = 'title';
const listeners: ((s: ScreenId) => void)[] = [];

export function show(id: ScreenId, subtitle?: string) {
  current = id;
  for (const s of SCREENS) $(`scr-${s}`).hidden = s !== id;
  $('seedbox').hidden = id !== 'game';
  if (subtitle !== undefined) $('subtitle').textContent = subtitle;
  closeModal();
  window.scrollTo(0, 0);
  for (const l of listeners) l(id);
}

export function screen(): ScreenId {
  return current;
}

export function onScreen(l: (s: ScreenId) => void) {
  listeners.push(l);
}

let onClose: (() => void) | null = null;

/** 모달을 띄운다. 안의 [data-close] 버튼을 누르면 닫힌다 */
export function modal(html: string, opts: { onClose?: () => void; wide?: boolean } = {}): HTMLElement {
  const box = $('mbox');
  box.innerHTML = html;
  box.classList.toggle('wide', !!opts.wide);
  $('modal').hidden = false;
  onClose = opts.onClose ?? null;
  box.querySelectorAll<HTMLElement>('[data-close]').forEach((b) => (b.onclick = () => closeModal()));
  const first = box.querySelector<HTMLElement>('button.primary, button');
  first?.focus();
  return box;
}

export function closeModal() {
  if ($('modal').hidden) return;
  $('modal').hidden = true;
  $('mbox').innerHTML = '';
  const f = onClose;
  onClose = null;
  f?.();
}

export function modalOpen() {
  return !$('modal').hidden;
}

export function download(name: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** 파일 고르기 창을 열고 텍스트를 읽는다 */
export function pickFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      f.text().then(resolve, () => resolve(null));
    };
    input.click();
  });
}

/** 잠깐 떴다 사라지는 알림 */
export function toast(text: string) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = text;
  t.classList.remove('show');
  void t.offsetWidth;
  t.classList.add('show');
}
