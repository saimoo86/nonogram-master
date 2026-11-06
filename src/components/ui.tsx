import { useEffect, type ReactNode } from 'react';
import { useStore } from '../store/Store';
import { ACHIEVEMENTS, levelInfo } from '../store/progression';

export function Modal({ children, onClose, label }: { children: ReactNode; onClose?: () => void; label?: string }) {
  useEffect(() => {
    if (!onClose) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose?.()} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

export function ScreenHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: ReactNode }) {
  const { t } = useStore();
  return (
    <header className="screen-header">
      <button className="icon-btn" onClick={onBack} aria-label={t('common.back')} data-testid="back">
        ‹
      </button>
      <h1>{title}</h1>
      <div className="header-right">{right}</div>
    </header>
  );
}

export function LevelBadge() {
  const { save, t } = useStore();
  const li = levelInfo(save.xp);
  return (
    <div className="level-badge" data-testid="level-badge" title={`${li.into}/${li.need} XP`}>
      <span className="lv">{t('common.level', { n: li.level })}</span>
      <span className="xpbar">
        <i style={{ width: `${Math.min(100, (li.into / li.need) * 100)}%` }} />
      </span>
    </div>
  );
}

export function ToastHost() {
  const { toasts, dismissToast, t } = useStore();
  useEffect(() => {
    if (!toasts.length) return;
    const timers = toasts.map((x) => window.setTimeout(() => dismissToast(x.id), 4200));
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [toasts, dismissToast]);
  return (
    <div className="toast-host" aria-live="polite">
      {toasts.map((x) => {
        const def = ACHIEVEMENTS.find((a) => a.id === x.achievementId);
        if (!def) return null;
        return (
          <div className="toast" key={x.id} data-testid="achievement-toast" onClick={() => dismissToast(x.id)}>
            <span className="toast-icon">{def.icon}</span>
            <span className="toast-body">
              <b>{t('ach.unlocked')}</b>
              <span>{t(`ach.${def.id}.name` as never)}</span>
              <small>{t('ach.reward', { xp: def.reward.xp, hints: def.reward.hints })}</small>
            </span>
            <span className="sparkles" aria-hidden="true">
              {Array.from({ length: 10 }, (_, i) => (
                <i key={i} style={{ ['--a' as string]: `${i * 36}deg`, animationDelay: `${i * 20}ms` }} />
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
