import { effect } from '@preact/signals';
import { useEffect, useLayoutEffect } from 'preact/hooks';
import { AchievementNote } from './achievements-ui';
import { initArt } from './art';
import { setVolume, unlockAudio } from './audio';
import { campaignUi } from './campaign/lazy';
import { startGamepad } from './gamepad';
import { Briefing, EndlessOver, Summary, Title } from './screens';
import { toTop } from './scroll';
import { onShiftKey } from './shift/keys';
import { ShiftScreen, ToastView } from './shift/Shift';
import { initStorage, screen, settings, startClock } from './store';

// A reload reopens the game at the top, not where the page was scrolled (docs/tech-spec.md §30). Set as this
// module loads, before the page's load event and first paint: set later (in an effect, after the first paint),
// a reload that came quickly enough found the browser still restoring the old position, and the page stayed there.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

export function App() {
  useEffect(() => {
    void initStorage();
    initArt();
    const stopVolume = effect(() => setVolume(settings.value.sound));
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    startClock();
    window.addEventListener('keydown', onShiftKey);
    const stopGamepad = startGamepad();
    return () => {
      stopVolume();
      stopGamepad();
      window.removeEventListener('keydown', onShiftKey);
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  // Each screen opens at its top, wherever the last one was scrolled to.
  useLayoutEffect(toTop, [screen.value]);

  // One toast and one notice for every screen: a live region made along with its message isn't read out, so
  // these stay put while the screens change (the last soul's verdict is said as the summary opens).
  return (
    <>
      <Screen />
      <ToastView />
      <AchievementNote />
    </>
  );
}

function Screen() {
  switch (screen.value) {
    case 'briefing':
      return <Briefing />;
    case 'shift':
      return <ShiftScreen />;
    case 'summary':
      return <Summary />;
    case 'endless':
      return <EndlessOver />;
    case 'campaign':
    case 'morning':
    case 'audit':
    case 'night':
    case 'ending': {
      const ui = campaignUi.value;
      return ui ? <ui.CampaignScreen which={screen.value} /> : <Title />;
    }
    default:
      return <Title />;
  }
}
