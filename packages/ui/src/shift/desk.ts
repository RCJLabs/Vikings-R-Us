import { signal } from '@preact/signals';
import { settings, updateSettings } from '../store';
import { clampSpot, type PaperId, type PaperSpot, putDown, topZ } from './papers';

/*
 * Papers on the desk layout can be picked up by their titles and put down anywhere on the desk
 * (docs/build-plan.md §7, docs/tech-spec.md §33). A paper that has been moved is loose: it leaves its
 * column and lies where it was put, over the others, the last one moved on top. Positions are fractions
 * of the desk, so they survive a resize, and the settings keep them for the next shift. Tidying the desk
 * puts every paper back. The drawer layout has no loose papers.
 */

/** The paper being dragged and where it is, kept out of the settings until it's put down. */
export const dragging = signal<{ readonly id: PaperId; readonly spot: PaperSpot } | null>(null);

/** Where a paper lies now, or undefined while it's in its place. */
export function spotOf(id: PaperId): PaperSpot | undefined {
  const d = dragging.value;
  return d?.id === id ? d.spot : settings.value.deskPapers[id];
}

export function place(id: PaperId, spot: PaperSpot | null): void {
  updateSettings({ deskPapers: putDown(settings.peek().deskPapers, id, spot) });
}

export function tidyDesk(): void {
  updateSettings({ deskPapers: {} });
}

/** A press that moves less than this (in pixels) is a click on the title, not a drag. */
const DRAG_PX = 4;

/**
 * Picks a paper up by its title and follows the pointer until it's put down. The paper leaves its column
 * as soon as it moves, which replaces its element, so the drag listens on the window rather than on the
 * title it started from.
 */
export function grab(e: PointerEvent, id: PaperId): void {
  if (e.button !== 0 || !e.isPrimary) return;
  const title = e.currentTarget as HTMLElement;
  const paper = title.closest<HTMLElement>('.paper');
  const desk = title.closest<HTMLElement>('.desk');
  if (!paper || !desk) return;
  const d = desk.getBoundingClientRect();
  const p = paper.getBoundingClientRect();
  if (d.width === 0 || d.height === 0) return;
  e.preventDefault();
  const from = { x: e.clientX, y: e.clientY };
  const start = { x: (p.left - d.left) / d.width, y: (p.top - d.top) / d.height, w: p.width / d.width };
  const grip = title.getBoundingClientRect().height / d.height;
  const z = topZ(settings.peek().deskPapers);
  let spot: PaperSpot | null = null;
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return;
    const dx = ev.clientX - from.x;
    const dy = ev.clientY - from.y;
    if (!spot && Math.hypot(dx, dy) < DRAG_PX) return;
    spot = clampSpot({ x: start.x + dx / d.width, y: start.y + dy / d.height, w: start.w, z }, grip);
    dragging.value = { id, spot };
  };
  const end = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    dragging.value = null;
    if (spot) place(id, spot);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}
