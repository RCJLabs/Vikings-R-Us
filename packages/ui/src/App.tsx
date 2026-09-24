import { effect } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { initArt } from './art';
import { setVolume, unlockAudio } from './audio';
import { campaignUi } from './campaign/lazy';
import { Briefing, EndlessOver, Summary, Title } from './screens';
import { onShiftKey } from './shift/keys';
import { ShiftScreen } from './shift/Shift';
import { initStorage, screen, settings, startClock } from './store';

export function App() {
  useEffect(() => {
    void initStorage();
    initArt();
    const stopVolume = effect(() => setVolume(settings.value.sound));
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    startClock();
    window.addEventListener('keydown', onShiftKey);
    return () => {
      stopVolume();
      window.removeEventListener('keydown', onShiftKey);
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

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
