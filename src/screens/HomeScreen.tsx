import { LevelBadge } from '../components/ui';
import { getPuzzleData } from '../data/catalog';
import { formatTime, utcDateKey } from '../engine/dates';
import { useNav, type Route } from '../nav';
import { useStore } from '../store/Store';
import type { TranslationKey } from '../i18n';

const ITEMS: { key: TranslationKey; icon: string; route: Route; id: string }[] = [
  { key: 'menu.play', icon: '▦', route: { name: 'play' }, id: 'play' },
  { key: 'menu.daily', icon: '📅', route: { name: 'daily' }, id: 'daily' },
  { key: 'menu.collection', icon: '🖼️', route: { name: 'collection' }, id: 'collection' },
  { key: 'menu.achievements', icon: '🏆', route: { name: 'achievements' }, id: 'achievements' },
  { key: 'menu.stats', icon: '📊', route: { name: 'stats' }, id: 'stats' },
  { key: 'menu.settings', icon: '⚙️', route: { name: 'settings' }, id: 'settings' },
];

export function HomeScreen() {
  const { t, save, lang, setSettings } = useStoreWithSettings();
  const nav = useNav();

  // most recently played unfinished puzzle
  const last = Object.entries(save.inProgress)
    .filter(([id]) => !id.startsWith('daily-') || id === `daily-${utcDateKey()}`)
    .filter(([id]) => !!getPuzzleData(id))
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)[0];

  const lastName = (() => {
    if (!last) return '';
    const d = getPuzzleData(last[0])!;
    if (d.theme === 'daily') return t('menu.daily');
    return `${d.size}×${d.size} ${t(`diff.${d.difficulty}` as TranslationKey)}`;
  })();

  return (
    <div className="screen home" data-testid="home">
      <div className="home-top">
        <LevelBadge />
        <div className="quick">
          <button className="icon-btn" aria-label="theme" data-testid="quick-theme" onClick={() => setSettings({ theme: save.settings.theme === 'dark' ? 'light' : 'dark' })}>
            {save.settings.theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button className="icon-btn txt" aria-label="language" data-testid="quick-lang" onClick={() => setSettings({ lang: lang === 'en' ? 'ko' : 'en' })}>
            {lang === 'en' ? 'KO' : 'EN'}
          </button>
        </div>
      </div>
      <div className="logo" aria-label={t('app.title')}>
        <div className="logo-grid" aria-hidden="true">
          {[1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1].map((v, i) => (
            <i key={i} className={v ? 'on' : ''} style={{ animationDelay: `${(i % 5) * 70 + Math.floor(i / 5) * 70}ms` }} />
          ))}
        </div>
        <h1>{t('app.title')}</h1>
        <p>{t('app.tagline')}</p>
      </div>
      <nav className="menu">
        {last && (
          <button className="menu-btn resume" data-testid="menu-continue" onClick={() => nav.go({ name: 'game', puzzleId: last[0] })}>
            <span className="mi">▶</span>
            <span className="ml">
              <b>{t('menu.continue')}</b>
              <small>{t('menu.continueSub', { name: lastName, time: formatTime(last[1].elapsed) })}</small>
            </span>
          </button>
        )}
        {ITEMS.map((it) => (
          <button key={it.id} className="menu-btn" data-testid={`menu-${it.id}`} onClick={() => nav.go(it.route)}>
            <span className="mi">{it.icon}</span>
            <span className="ml">
              <b>{t(it.key)}</b>
            </span>
            <span className="chev">›</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function useStoreWithSettings() {
  return useStore();
}
