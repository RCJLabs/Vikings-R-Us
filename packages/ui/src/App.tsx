import { useEffect } from 'preact/hooks';
import { initArt } from './art';
import { campaignUi } from './campaign/lazy';
import { Briefing, Summary, Title } from './screens';
import { onShiftKey } from './shift/keys';
import { ShiftScreen } from './shift/Shift';
import { initStorage, screen, startClock } from './store';

export function App() {
  useEffect(() => {
    void initStorage();
    initArt();
    startClock();
    window.addEventListener('keydown', onShiftKey);
    return () => window.removeEventListener('keydown', onShiftKey);
  }, []);

  switch (screen.value) {
    case 'briefing':
      return <Briefing />;
    case 'shift':
      return <ShiftScreen />;
    case 'summary':
      return <Summary />;
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
