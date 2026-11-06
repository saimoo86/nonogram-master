import { useState } from 'react';
import { PixelArt } from '../components/PixelArt';
import { ScreenHeader } from '../components/ui';
import { puzzlesOf } from '../data/catalog';
import { formatTime } from '../engine/dates';
import { DIFFICULTIES, SIZE_OF, type Difficulty } from '../engine/types';
import type { TranslationKey } from '../i18n';
import { useNav } from '../nav';
import { useStore } from '../store/Store';

export function PlayScreen({ initial }: { initial?: Difficulty }) {
  const { t, save } = useStore();
  const nav = useNav();
  const [diff, setDiff] = useState<Difficulty>(initial ?? 'easy');
  const list = puzzlesOf(diff);
  const done = list.filter((p) => save.completed[p.id]).length;

  return (
    <div className="screen" data-testid="play-screen">
      <ScreenHeader title={t('menu.play')} onBack={nav.back} />
      <div className="diff-tabs" role="tablist">
        {DIFFICULTIES.map((d) => {
          const l = puzzlesOf(d);
          const c = l.filter((p) => save.completed[p.id]).length;
          return (
            <button key={d} role="tab" aria-selected={d === diff} className={`diff-tab${d === diff ? ' on' : ''}`} onClick={() => setDiff(d)} data-testid={`diff-${d}`}>
              <b>{t(`diff.${d}` as TranslationKey)}</b>
              <small>
                {SIZE_OF[d]}×{SIZE_OF[d]}
              </small>
              <span className="mini-progress">
                <i style={{ width: `${(c / Math.max(1, l.length)) * 100}%` }} />
              </span>
            </button>
          );
        })}
      </div>
      <p className="sub-line">{t('play.solved', { done, total: list.length })}</p>
      <div className="puzzle-grid" data-testid="puzzle-grid">
        {list.map((p, idx) => {
          const rec = save.completed[p.id];
          const prog = save.inProgress[p.id];
          return (
            <button key={p.id} className={`puzzle-card${rec ? ' done' : ''}`} onClick={() => nav.go({ name: 'game', puzzleId: p.id })} data-testid="puzzle-card" data-id={p.id}>
              <div className="thumb">
                {rec ? <PixelArt data={p} size={72} /> : <div className="blank-art" style={{ width: 72, height: 72 }} />}
                {!rec && <span className="q">?</span>}
              </div>
              <b>{t('play.puzzleN', { n: idx + 1 })}</b>
              <span className="stars" title={t('play.logic')} aria-label={`${p.stars}/5`}>
                {'★'.repeat(p.stars)}
                <span className="off">{'★'.repeat(5 - p.stars)}</span>
              </span>
              <small>{rec ? t('play.best', { time: formatTime(rec.best) }) : prog ? `⏸ ${t('play.inProgress')} · ${formatTime(prog.elapsed)}` : t('play.mystery')}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}
