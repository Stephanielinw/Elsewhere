/**
 * DOM Guard & Surgical Update Coordinator (P1-1)
 * Prevents the 850ms background timer from clobbering active text inputs,
 * IME composition (Chinese input method), cursor selection, or open drawers/details.
 */

export interface ActiveInputSnapshot {
  id: string;
  name: string;
  value: string;
  selectionStart: number | null;
  selectionEnd: number | null;
}

export interface UIPreservationState {
  isComposing: boolean;
  activeElementId: string;
  activeElementName: string;
  activeElementSelector: string;
  inputs: Record<string, string>;
  selectionStart: number | null;
  selectionEnd: number | null;
  openDetailsSelectors: string[];
  scrollPositions: Record<string, number>;
}

/**
 * Pure check: determines if a background timer tick should defer a full `innerHTML` replacement
 * and instead apply surgical DOM patches (e.g., updating status clock, pending count, or appending new chat bubbles).
 */
export function shouldDeferFullRenderOnTick(params: {
  isComposing: boolean;
  activeTagName: string;
  activeElementId: string;
  chatPanelOpen: boolean;
  editingMessageId: string | null;
  intermissionToolsOpen: boolean;
}): boolean {
  if (params.isComposing) return true;
  if (params.editingMessageId) return true;
  if (params.chatPanelOpen) return true;
  if (params.intermissionToolsOpen) return true;
  const tag = (params.activeTagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  return false;
}

const SCROLL_CONTAINER_CLASSES = [
  'viewport',
  'landing-roles-scroll',
  'landing-profile-scroll',
  'mini-list',
  'log-list',
  'frame-grid',
  'frame-modal-body',
  'revision-list',
  'intermission-history',
];

function buildActiveElementSelector(el: HTMLElement | null): string {
  if (!el || el === document.body || el === document.documentElement) return '';
  if (el.id) return `#${el.id}`;
  const name = el.getAttribute('name');
  if (name) {
    const form = el.closest('form');
    if (form?.id) return `#${form.id} [name="${name}"]`;
    return `[name="${name}"]`;
  }
  for (const attr of [
    'data-preset-content',
    'data-preset-enabled',
    'data-testid',
    'data-action',
  ]) {
    const val = el.getAttribute(attr);
    if (val !== null) return `[${attr}="${val}"]`;
  }
  return '';
}

export function captureUIState(root: Document | HTMLElement = document): UIPreservationState {
  const doc = 'activeElement' in root ? root : document;
  const active = doc.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
  const inputs: Record<string, string> = {};

  root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select').forEach((el) => {
    if (el.type === 'file' || el.type === 'checkbox' || el.type === 'radio') return;
    const key = el.id
      ? `#${el.id}`
      : el.getAttribute('data-preset-content') !== null
      ? `[data-preset-content="${el.getAttribute('data-preset-content')}"]`
      : el.name
      ? el.closest('form')?.id
        ? `#${el.closest('form')!.id} [name="${el.name}"]`
        : `[name="${el.name}"]`
      : '';
    if (key) {
      inputs[key] = el.value;
    }
  });

  const openDetailsSelectors: string[] = [];
  root.querySelectorAll<HTMLDetailsElement>('details[open]').forEach((det, idx) => {
    const fpCard = det.closest<HTMLElement>('[data-fp-id]');
    if (fpCard?.dataset.fpId) {
      openDetailsSelectors.push(`[data-fp-id="${fpCard.dataset.fpId}"] details`);
    } else if (det.className) {
      openDetailsSelectors.push(`details.${det.className.trim().split(/\s+/).join('.')}`);
    } else {
      openDetailsSelectors.push(`details:nth-of-type(${idx + 1})`);
    }
  });

  const scrollPositions: Record<string, number> = {};
  const scrollArea = root.querySelector<HTMLElement>('#scroll-area');
  if (scrollArea) {
    scrollPositions['#scroll-area'] = scrollArea.scrollTop;
  }
  for (const cls of SCROLL_CONTAINER_CLASSES) {
    root.querySelectorAll<HTMLElement>(`.${cls}`).forEach((el, idx) => {
      scrollPositions[`.${cls}>>${idx}`] = el.scrollTop;
    });
  }

  let selectionStart: number | null = null;
  let selectionEnd: number | null = null;
  try {
    if (active && ('selectionStart' in active)) {
      selectionStart = active.selectionStart;
      selectionEnd = active.selectionEnd;
    }
  } catch {
    // Some input types (e.g. number/date) do not support selectionStart
  }

  return {
    isComposing: false,
    activeElementId: active?.id || '',
    activeElementName: active?.getAttribute?.('name') || '',
    activeElementSelector: buildActiveElementSelector(active),
    inputs,
    selectionStart,
    selectionEnd,
    openDetailsSelectors,
    scrollPositions,
  };
}

export function restoreUIState(
  state: UIPreservationState,
  preserveScroll = false,
  root: Document | HTMLElement = document,
  preserveViewportScroll = preserveScroll
): void {
  // Restore open <details>
  for (const sel of state.openDetailsSelectors) {
    try {
      const det = root.querySelector<HTMLDetailsElement>(sel);
      if (det) det.open = true;
    } catch {
      // ignore invalid selector
    }
  }

  // Restore input values that were not intentionally cleared
  for (const [sel, val] of Object.entries(state.inputs)) {
    try {
      const el = root.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(sel);
      if (el && el.value !== val && val !== '') {
        el.value = val;
      }
    } catch {
      // ignore
    }
  }

  // Restore scroll positions
  const entries = Object.entries(state.scrollPositions);
  for (const [key, top] of entries) {
    if (key === '#scroll-area') {
      if (preserveScroll) {
        const el = root.querySelector<HTMLElement>('#scroll-area');
        if (el) el.scrollTop = top;
      }
      continue;
    }
    if (!preserveViewportScroll && !preserveScroll) continue;
    if (key.includes('>>')) {
      const [clsSel, idxStr] = key.split('>>');
      const idx = Number(idxStr) || 0;
      const list = root.querySelectorAll<HTMLElement>(clsSel);
      if (list[idx]) {
        list[idx].scrollTop = top;
      }
    } else if (key.startsWith('#') || key.startsWith('[data-testid=')) {
      const el = root.querySelector<HTMLElement>(key);
      if (el) el.scrollTop = top;
    }
  }

  // Restore focus & cursor selection
  let target: HTMLElement | null = null;
  if (state.activeElementSelector) {
    try {
      target = root.querySelector<HTMLElement>(state.activeElementSelector);
    } catch {
      target = null;
    }
  }
  if (!target && state.activeElementId) {
    target = root.querySelector<HTMLElement>(`#${state.activeElementId}`);
  }
  if (!target && state.activeElementName) {
    target = root.querySelector<HTMLElement>(`[name="${state.activeElementName}"]`);
  }
  if (target && typeof target.focus === 'function') {
    target.focus({ preventScroll: true });
    try {
      if (
        state.selectionStart !== null &&
        state.selectionEnd !== null &&
        'setSelectionRange' in target
      ) {
        (target as HTMLInputElement | HTMLTextAreaElement).setSelectionRange(
          state.selectionStart,
          state.selectionEnd
        );
      }
    } catch {
      // ignore
    }
  }
}
