import { ScreenHeader } from '../components/ui';
import { formatTime } from '../engine/dates';
import { DIFFICULTIES, SIZE_OF } from '../engine/types';
import type { TranslationKey } from '../i18n';
import { useNav } from '../nav';
import { levelInfo } from '../store/progression';
import { useStore } from '../store/Store';

export function StatsScreen() {
  const { t, save } = useStore();
  const nav = useNav();
  const s = save.stats;
  const acc = s.moves ? Math.round((s.correctMoves / s.moves) * 100) : null;
  const li = levelInfo(save.xp);
  const d = save.daily;
  const dDays = Object.keys(d.completed).length;
  return (
    <div className="screen" data-testid="stats-screen">
      <ScreenHeader title={t('stats.title')} onBack={nav.back} />
      <h3 className="section">{t('stats.overview')}</h3>
      <section className="stat-grid">
        <Stat label={t('stats.level')} value={`${t('common.level', { n: li.level })} · ${t('common.xp', { n: save.xp })}`} testid="stat-level" />
        <Stat label={t('stats.completed')} value={String(s.completedTotal)} testid="stat-completed" />
        <Stat label={t('stats.totalTime')} value={formatTime(s.totalTime)} testid="stat-time" />
        <Stat label={t('stats.accuracy')} value={acc === null ? '—' : `${acc}%`} testid="stat-accuracy" />
        <Stat label={t('stats.hintsUsed')} value={String(s.hintsUsed)} testid="stat-hints" />
        <Stat label={t('stats.hintFree')} value={String(s.hintFreeTotal)} />
        <Stat label={t('stats.perfect')} value={String(s.perfectTotal)} />
        <Stat label={t('stats.playStreak')} value={t('daily.days', { n: s.playStreak })} testid="stat-streak" />
        <Stat label={t('stats.bestPlayStreak')} value={t('daily.days', { n: s.bestPlayStreak })} />
      </section>

      <h3 className="section">{t('stats.byDiff')}</h3>
      <section className="card table-card">
        <table className="stats-table">
          <thead>
            <tr>
              <th />
              <th>{t('stats.done')}</th>
              <th>{t('stats.best')}</th>
              <th>{t('stats.avg')}</th>
              <th>💡</th>
            </tr>
          </thead>
          <tbody>
            {DIFFICULTIES.map((k) => {
              const r = s.byDiff[k];
              return (
                <tr key={k} data-testid={`row-${k}`}>
                  <th>
                    {t(`diff.${k}` as TranslationKey)} <small>{SIZE_OF[k]}²</small>
                  </th>
                  <td>{r.completed}</td>
                  <td>{r.best !== null ? formatTime(r.best) : '—'}</td>
                  <td>{r.completed ? formatTime(r.time / r.completed) : '—'}</td>
                  <td>{r.hintFree}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <h3 className="section">{t('stats.daily')}</h3>
      <section className="stat-grid">
        <Stat label={t('daily.completed')} value={String(dDays)} testid="stat-daily-completed" />
        <Stat label={t('daily.streak')} value={t('daily.days', { n: d.streak })} />
        <Stat label={t('daily.bestStreak')} value={t('daily.days', { n: d.bestStreak })} />
        <Stat label={t('daily.bestTime')} value={d.best !== null ? formatTime(d.best) : '—'} />
        <Stat label={t('daily.avgTime')} value={dDays ? formatTime(d.totalTime / dDays) : '—'} />
      </section>
    </div>
  );
}

function Stat({ label, value, testid }: { label: string; value: string; testid?: string }) {
  return (
    <div className="stat" data-testid={testid}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
