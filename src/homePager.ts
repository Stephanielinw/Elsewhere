/** Session-only launcher state; app data and settings are untouched. */
export function createHomePager() {
  let host: HTMLElement | null = null;
  let pager: HTMLElement | null = null;
  let page = 0;
  let observer: ResizeObserver | null = null;
  const scrollTops = [0, 0];
  let drag: {id:number;x:number;y:number;left:number;page:number;active:boolean} | null = null;
  let suppressClick = false;

  function reflect() {
    host?.querySelectorAll<HTMLButtonElement>('[data-home-page]').forEach(button => {
      const active = Number(button.dataset.homePage) === page;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
    pager?.querySelectorAll<HTMLElement>('.home-page').forEach((panel, index) => {
      panel.inert = index !== page;
      panel.setAttribute('aria-hidden', String(index !== page));
    });
  }

  function select(next: number, smooth = false) {
    if (!pager) return;
    const target = Math.max(0, Math.min(1, next));
    // Touch keeps native scrolling; mouse release eases into the same snap points.
    if (smooth && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      pager.scrollTo({left:target * pager.clientWidth, behavior:'smooth'});
      return;
    }
    page = target;
    pager.scrollLeft = target * pager.clientWidth;
    reflect();
  }

  function releaseDrag() {
    const ended = drag;
    drag = null;
    pager?.classList.remove('is-dragging');
    if (ended && pager?.hasPointerCapture(ended.id)) pager.releasePointerCapture(ended.id);
    return ended;
  }

  function cancelDrag() {
    const ended = releaseDrag();
    suppressClick = false;
    if (ended?.active) select(ended.page);
  }

  function onPointerDown(event: PointerEvent) {
    if (event.pointerType !== 'mouse' || event.button !== 0 || !pager) return;
    suppressClick = false;
    if (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    drag = {id:event.pointerId,x:event.clientX,y:event.clientY,left:pager.scrollLeft,page,active:false};
  }

  function onPointerMove(event: PointerEvent) {
    if (!drag || drag.id !== event.pointerId || !pager) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.active) {
      if (Math.max(Math.abs(dx),Math.abs(dy)) < 8) return;
      if (Math.abs(dy) >= Math.abs(dx)) { drag = null; return; }
      drag.active = true;
      suppressClick = true;
      pager.classList.add('is-dragging');
      pager.setPointerCapture(event.pointerId);
      window.getSelection()?.removeAllRanges();
    }
    event.preventDefault();
    pager.scrollLeft = drag.left - dx;
  }

  function onPointerUp(event: PointerEvent) {
    if (!drag || drag.id !== event.pointerId || !pager) return;
    const ended = releaseDrag();
    if (!ended?.active) return;
    const dx = event.clientX - ended.x;
    const target = Math.abs(dx) >= Math.min(100,pager.clientWidth * .2)
      ? ended.page + (dx < 0 ? 1 : -1) : ended.page;
    select(target,true);
  }

  function onDragClick(event: MouseEvent) {
    if (!suppressClick || event.detail === 0) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  }

  function onDragStart(event: DragEvent) { event.preventDefault(); }

  function onScroll() {
    if (!pager?.clientWidth) return;
    const next = Math.max(0, Math.min(1, Math.round(pager.scrollLeft / pager.clientWidth)));
    if (next !== page) { page = next; reflect(); }
  }

  function onClick(event: Event) {
    const button = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-home-page]') : null;
    if (!button) return;
    event.preventDefault();
    select(Number(button.dataset.homePage));
  }

  function onKey(event: KeyboardEvent) {
    if (!(event.target instanceof Element) || !event.target.closest('.home-pages,.page-dots') ||
        event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      select(event.key === 'ArrowRight' ? 1 : 0);
    }
  }

  function detach() {
    releaseDrag();
    suppressClick = false;
    pager?.querySelectorAll<HTMLElement>('.home-desktop').forEach((el, index) => { scrollTops[index] = el.scrollTop; });
    pager?.removeEventListener('scroll', onScroll);
    pager?.removeEventListener('pointerdown', onPointerDown);
    pager?.removeEventListener('pointermove', onPointerMove);
    pager?.removeEventListener('pointerup', onPointerUp);
    pager?.removeEventListener('pointercancel', cancelDrag);
    pager?.removeEventListener('click', onDragClick, true);
    pager?.removeEventListener('dragstart', onDragStart);
    window.removeEventListener('blur', cancelDrag);
    host?.removeEventListener('click', onClick);
    host?.removeEventListener('keydown', onKey);
    observer?.disconnect();
    observer = null;
    pager = host = null;
  }

  return {
    detach,
    mount(root: HTMLElement) {
      detach();
      host = root;
      pager = root.querySelector<HTMLElement>('.home-pages');
      if (!pager) return;
      pager.querySelectorAll<HTMLElement>('.home-desktop').forEach((el, index) => { el.scrollTop = scrollTops[index]; });
      select(page);
      pager.addEventListener('scroll', onScroll, {passive: true});
      pager.addEventListener('pointerdown', onPointerDown);
      pager.addEventListener('pointermove', onPointerMove);
      pager.addEventListener('pointerup', onPointerUp);
      pager.addEventListener('pointercancel', cancelDrag);
      pager.addEventListener('click', onDragClick, true);
      pager.addEventListener('dragstart', onDragStart);
      window.addEventListener('blur', cancelDrag);
      host.addEventListener('click', onClick);
      host.addEventListener('keydown', onKey);
      observer = new ResizeObserver(() => { cancelDrag(); select(page); });
      observer.observe(pager);
    },
  };
}
