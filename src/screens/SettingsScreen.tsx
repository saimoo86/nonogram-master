import { useState, type ReactNode } from 'react';
import { Modal, ScreenHeader } from '../components/ui';
import { LANGUAGES } from '../i18n';
import { useNav } from '../nav';
import { playSfx } from '../services/audio';
import { vibrate, vibrationSupported } from '../services/haptics';
import { useStore } from '../store/Store';
import type { LangCode, ThemeMode } from '../store/types';

function Toggle({ on, onChange, label, desc, testid, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; desc?: string; testid: string; disabled?: boolean }) {
  return (
    <div className="setting">
      <div>
        <b>{label}</b>
        {desc && <small>{desc}</small>}
      </div>
      <button role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={`switch${on ? ' on' : ''}`} onClick={() => onChange(!on)} data-testid={testid}>
        <i />
      </button>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="setting">
      <b>{label}</b>
      {children}
    </div>
  );
}

export function SettingsScreen() {
  const { t, save, setSettings, resetAll } = useStore();
  const nav = useNav();
  const [confirm, setConfirm] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const s = save.settings;
  const canVibrate = vibrationSupported();

  return (
    <div className="screen" data-testid="settings-screen">
      <ScreenHeader title={t('settings.title')} onBack={nav.back} />
      <section className="card">
        <Row label={t('settings.language')}>
          <select className="select" value={s.lang} onChange={(e) => setSettings({ lang: e.target.value as LangCode })} data-testid="lang-select" aria-label={t('settings.language')}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t('settings.theme')}>
          <div className="seg small" role="group">
            {(['light', 'dark', 'system'] as ThemeMode[]).map((m) => (
              <button key={m} className={s.theme === m ? 'on' : ''} onClick={() => setSettings({ theme: m })} data-testid={`theme-${m}`} aria-pressed={s.theme === m}>
                {t(m === 'light' ? 'settings.themeLight' : m === 'dark' ? 'settings.themeDark' : 'settings.themeSystem')}
              </button>
            ))}
          </div>
        </Row>
      </section>
      <section className="card">
        <Toggle on={s.sfx} onChange={(v) => { setSettings({ sfx: v }); if (v) setTimeout(() => playSfx('click'), 30); }} label={t('settings.sfx')} testid="toggle-sfx" />
        <Toggle on={s.music} onChange={(v) => setSettings({ music: v })} label={t('settings.music')} testid="toggle-music" />
        <Toggle on={s.showMistakes} onChange={(v) => setSettings({ showMistakes: v })} label={t('settings.mistakes')} desc={t('settings.mistakesDesc')} testid="toggle-mistakes" />
        <Toggle
          on={s.vibration && canVibrate}
          onChange={(v) => { setSettings({ vibration: v }); if (v) vibrate(40); }}
          label={t('settings.vibration')}
          desc={canVibrate ? undefined : t('settings.vibrationUnsupported')}
          disabled={!canVibrate}
          testid="toggle-vibration"
        />
      </section>
      <section className="card">
        <h3>{t('settings.data')}</h3>
        <p className="muted small">{t('settings.resetDesc')}</p>
        <button className="btn danger" onClick={() => setConfirm(true)} data-testid="reset-data">
          {t('settings.reset')}
        </button>
        {resetDone && <p className="tag" data-testid="reset-done">✓</p>}
      </section>
      <p className="muted center small">{t('settings.about')}</p>

      {confirm && (
        <Modal onClose={() => setConfirm(false)} label={t('settings.resetTitle')}>
          <h2>{t('settings.resetTitle')}</h2>
          <p>{t('settings.resetBody')}</p>
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setConfirm(false)}>
              {t('common.cancel')}
            </button>
            <button
              className="btn danger"
              data-testid="confirm-reset"
              onClick={() => {
                resetAll();
                setConfirm(false);
                setResetDone(true);
              }}
            >
              {t('settings.resetDo')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
