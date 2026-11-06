import { useEffect } from 'react';
import { ToastHost } from './components/ui';
import { NavProvider, useNav } from './nav';
import { unlockAudio } from './services/audio';
import { AchievementsScreen } from './screens/AchievementsScreen';
import { CollectionScreen } from './screens/CollectionScreen';
import { DailyScreen } from './screens/DailyScreen';
import { GameScreen } from './screens/GameScreen';
import { HomeScreen } from './screens/HomeScreen';
import { PlayScreen } from './screens/PlayScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { StatsScreen } from './screens/StatsScreen';
import { StoreProvider } from './store/Store';
import type { SaveData } from './store/types';

function Router() {
  const { route } = useNav();
  switch (route.name) {
    case 'home': return <HomeScreen />;
    case 'play': return <PlayScreen initial={route.diff} />;
    case 'game': return <GameScreen key={route.puzzleId} puzzleId={route.puzzleId} />;
    case 'daily': return <DailyScreen />;
    case 'collection': return <CollectionScreen />;
    case 'achievements': return <AchievementsScreen />;
    case 'stats': return <StatsScreen />;
    case 'settings': return <SettingsScreen />;
  }
}

export function App({ initialSave }: { initialSave?: SaveData }) {
  useEffect(() => {
    const h = () => unlockAudio();
    window.addEventListener('pointerdown', h, { once: true });
    window.addEventListener('keydown', h, { once: true });
    return () => {
      window.removeEventListener('pointerdown', h);
      window.removeEventListener('keydown', h);
    };
  }, []);
  return (
    <StoreProvider initial={initialSave}>
      <NavProvider>
        <div className="app" key="app">
          <Router />
          <ToastHost />
        </div>
      </NavProvider>
    </StoreProvider>
  );
}
