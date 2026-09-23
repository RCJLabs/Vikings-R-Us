import { stampsFor } from '@cots/engine';
import { act, answer, citation, comparing, drawerTab, screen, session, stampSheet } from '../store';
import { questionable, toggleCompare } from './Shift';

const INTERACTIVE = 'button, a, input, textarea, select, [role="tab"]';

function focusSend(): void {
  requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-testid="send"]')?.focus());
}

/**
 * The shift's keyboard map (docs/tech-spec.md §6.4): F turn over, T feather,
 * C compare, Q question, 1-9 stamps (focus moves to Send), Enter send,
 * R rules, Esc cancels or pauses.
 */
export function onShiftKey(e: KeyboardEvent): void {
  if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
  const s = session.peek();
  if (!s || screen.peek() !== 'shift' || s.state.phase !== 'shift') return;
  const target = e.target instanceof Element ? e.target : null;
  if (target?.closest('input, textarea, select')) return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  if (s.state.clock.pausedAt !== null) {
    if (key === 'Escape' || key === 'p') {
      act({ t: 'resume' });
      e.preventDefault();
    }
    return;
  }
  if (answer.peek() || citation.peek()) {
    if (key === 'Escape') {
      answer.value = null;
      citation.value = null;
      e.preventDefault();
    }
    return;
  }
  if (e.repeat) return;

  switch (key) {
    case 'f':
      if (s.ctx.tools.has('flip')) act({ t: 'flip' });
      break;
    case 't':
      if (s.ctx.tools.has('feather')) act({ t: 'tool', tool: 'feather' });
      break;
    case 'c':
      toggleCompare();
      break;
    case 'q': {
      const lie = questionable(s);
      if (lie) act({ t: 'question', lie });
      break;
    }
    case 'r':
      drawerTab.value = 'rules';
      break;
    case 'p':
      act({ t: 'pause' });
      break;
    case 'Escape':
      if (comparing.peek()) toggleCompare();
      else if (stampSheet.peek()) stampSheet.value = false;
      else act({ t: 'pause' });
      break;
    case 'Enter':
      // A focused button handles Enter itself.
      if (target?.closest(INTERACTIVE)) return;
      if (s.state.soul.stamp) act({ t: 'send' });
      break;
    default: {
      if (!/^[1-9]$/.test(key)) return;
      const dest = stampsFor(s.ctx)[Number(key) - 1];
      if (!dest) return;
      act({ t: 'stamp', dest });
      stampSheet.value = true;
      focusSend();
    }
  }
  e.preventDefault();
}
