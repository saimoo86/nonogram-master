import { useEffect, useMemo, useState } from 'react';
import { PixelArt } from '../components/PixelArt';
import { ScreenHeader } from '../components/ui';
import { getDaily } from '../data/catalog';
import { formatTime, msUntilNextUtcDay, shiftDateKey, utcDateKey } from '../engine/dates';
import type { TranslationKey } from '../i18n';
import { useNav } from '../nav';
import { useStore } from '../store/Store';

export function DailyScreen() {
  const { t, save } = useStore();
  const nav = useNav();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const today = utcDateKey(now);
  const data = useMemo(() => getDaily(today), [today]);
  const rec = save.daily.completed[today];
  const prog = save.inProgress[`daily-${today}`];
  const d = save.daily;
  const days = Object.keys(d.completed).length;
  const avg = days ? d.totalTime / days : 0;

  // streak is "alive" only if completed today or yesterday
  const streakAlive = d.lastDate === today || d.lastDate === shiftDateKey(today, -1);
  const history = Array.from({ length: 28 }, (_, i) => shiftDateKey(today, i - 27));

  return (
    <div className="screen" data-testid="daily-screen">
      <ScreenHeader title={t('daily.title')} onBack={nav.back} />
      <section className="card daily-hero">
        <div className="daily-art">
          {rec ? <PixelArt data={data} size={120} /> : <div className="blank-art" style={{ width: 120, height: 120 }} />}
          {!rec && <span className="q big">?</span>}
        </div>
        <div className="daily-info">
          <h2>{t('daily.today', { date: today })}</h2>
          <p className="muted">{t('daily.size', { n: data.size, diff: t(`diff.${data.difficulty}` as TranslationKey) })}</p>
          <p className="muted small">{t('daily.todayHint')}</p>
          {rec ? (
            <>
              <p className="tag" data-testid="daily-done">✅ {t('daily.done')} · {t('daily.doneTime', { time: formatTime(rec.time) })}</p>
              <p className="muted" data-testid="daily-countdown">{t('daily.nextIn', { time: formatTime(msUntilNextUtcDay(now)) })}</p>
            </>
          ) : (
            <button className="btn primary" data-testid="daily-play" onClick={() => nav.go({ name: 'game', puzzleId: data.id })}>
              {prog ? `${t('daily.resume')} · ${formatTime(prog.elapsed)}` : t('daily.play')}
            </button>
          )}
        </div>
      </section>

      <section className="stat-grid">
        <Stat label={t('daily.streak')} value={t('daily.days', { n: streakAlive ? d.streak : 0 })} testid="daily-streak" />
        <Stat label={t('daily.bestStreak')} value={t('daily.days', { n: d.bestStreak })} />
        <Stat label={t('daily.completed')} value={String(days)} />
        <Stat label={t('daily.bestTime')} value={d.best !== null ? formatTime(d.best) : '—'} />
        <Stat label={t('daily.avgTime')} value={days ? formatTime(avg) : '—'} />
      </section>

      <section className="card">
        <h3>{t('daily.history')}</h3>
        <div className="cal" data-testid="daily-cal">
          {history.map((k) => (
            <div key={k} className={`cal-day${d.completed[k] ? ' on' : ''}${k === today ? ' today' : ''}`} title={k}>
              {Number(k.slice(8))}
            </div>
          ))}
        </div>
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
