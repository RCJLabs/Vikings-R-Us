import { useEffect } from 'preact/hooks';
import { Briefing, Summary, Title } from './screens';
import { onShiftKey } from './shift/keys';
import { ShiftScreen } from './shift/Shift';
import { initStorage, screen, startClock } from './store';

export function App() {
  useEffect(() => {
    void initStorage();
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
    default:
      return <Title />;
  }
}
