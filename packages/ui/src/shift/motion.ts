import type { Destination } from '@cots/engine';
import { settings } from '../store';

/*
 * The desk's feel (docs/tech-spec.md §33): the soul walking up and off, the
 * stamp's ink, the sky going down with the sun. All of it is decoration over
 * the game: it never takes a click, a key or a moment from the player, and
 * "Reduce motion" (or the device's own setting) turns the movement off.
 */

/** Whether to leave out decorative movement: the player's setting, or the device's. */
export function motionReduced(): boolean {
  if (settings.peek().reduceMotion) return true;
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export type Way = 'up' | 'down' | 'back' | 'aside';

/** Which way a sent soul goes: up to the halls, down to Hel and the sea, back home, or aside to a clerk. */
export function wayOf(dest: Destination): Way {
  switch (dest) {
    case 'VALHALLA':
    case 'FOLKVANGR':
      return 'up';
    case 'HEL':
    case 'RAN':
      return 'down';
    case 'RETURN':
      return 'back';
    default:
      return 'aside';
  }
}

/** How long a sent soul takes to walk off; it's gone from the page by then, animation or not. */
export const WALK_OFF_MS = 420;

/**
 * The sent soul walks off the way its stamp sends it: a copy of its drawing and the ink, over the desk for
 * a moment while the next soul walks up. Only a picture: no buttons, labels, roles or test ids, and it
 * takes no clicks, so the next soul can be looked at and judged at once.
 */
export function walkOff(frame: HTMLElement, dest: Destination): void {
  if (motionReduced()) return;
  const host = frame.closest('.shift');
  const box = frame.getBoundingClientRect();
  if (!host || box.width === 0 || box.height === 0) return;
  const ghost = document.createElement('div');
  ghost.className = 'departure';
  ghost.dataset.way = wayOf(dest);
  ghost.setAttribute('aria-hidden', 'true');
  ghost.setAttribute('inert', '');
  ghost.style.left = `${box.left}px`;
  ghost.style.top = `${box.top}px`;
  ghost.style.width = `${box.width}px`;
  ghost.style.height = `${box.height}px`;
  const art = frame.querySelector('.stage__art');
  if (art) {
    const copy = document.createElement('div');
    copy.className = 'departure__art';
    copy.innerHTML = art.innerHTML;
    // The drawing says it's an image; its copy says nothing at all.
    for (const el of copy.querySelectorAll('[role]')) el.removeAttribute('role');
    ghost.append(copy);
  }
  const ink = frame.querySelector<HTMLElement>('.ink');
  if (ink) {
    const copy = document.createElement('div');
    copy.className = `departure__ink ink--${dest.toLowerCase()}`;
    copy.textContent = ink.textContent;
    ghost.append(copy);
  }
  host.append(ghost);
  const gone = () => ghost.remove();
  // Its own animation, not one inside the copied drawing, whose end would bubble up here.
  ghost.addEventListener('animationend', (e) => {
    if (e.target === ghost) gone();
  });
  setTimeout(gone, WALK_OFF_MS + 200);
}
