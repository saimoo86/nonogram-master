import { ScreenHeader } from '../components/ui';
import type { TranslationKey } from '../i18n';
import { useNav } from '../nav';
import { ACHIEVEMENTS } from '../store/progression';
import { useStore } from '../store/Store';

export function AchievementsScreen() {
  const { t, save } = useStore();
  const nav = useNav();
  const got = ACHIEVEMENTS.filter((a) => save.achievements[a.id]).length;
  return (
    <div className="screen" data-testid="ach-screen">
      <ScreenHeader title={t('ach.title')} onBack={nav.back} />
      <p className="sub-line" data-testid="ach-count">{t('ach.count', { n: got, total: ACHIEVEMENTS.length })}</p>
      <div className="ach-list">
        {ACHIEVEMENTS.map((a) => {
          const done = !!save.achievements[a.id];
          const p = a.progress(save);
          return (
            <div key={a.id} className={`ach${done ? ' done' : ''}`} data-testid="ach-item" data-id={a.id} data-done={done ? '1' : '0'}>
              <span className="ach-icon">{done ? a.icon : '🔒'}</span>
              <div className="ach-body">
                <b>{t(`ach.${a.id}.name` as TranslationKey)}</b>
                <small>{t(`ach.${a.id}.desc` as TranslationKey)}</small>
                <span className="mini-progress">
                  <i style={{ width: `${(p.cur / p.max) * 100}%` }} />
                </span>
                <small className="muted">
                  {done ? '✓ ' : `${p.cur}/${p.max} · `}
                  {t('ach.reward', { xp: a.reward.xp, hints: a.reward.hints })}
                </small>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
