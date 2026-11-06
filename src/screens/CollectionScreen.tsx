import { useState } from 'react';
import { PixelArt } from '../components/PixelArt';
import { Modal, ScreenHeader } from '../components/ui';
import { artFor, CATALOG, scenesOfTheme } from '../data/catalog';
import { SCENES } from '../engine/scenes';
import { DIFF_OF_SIZE, THEMES, type Theme } from '../engine/types';
import type { TranslationKey } from '../i18n';
import { useNav } from '../nav';
import { adsActive, ads } from '../services/ads';
import { unlockedScenes } from '../store/progression';
import { useStore } from '../store/Store';

const THEME_ICON: Record<Theme, string> = { animals: '🐾', food: '🍓', nature: '🌿', objects: '🧰', fantasy: '🪄', space: '🚀' };

export function CollectionScreen() {
  const { t, save, lang } = useStore();
  const nav = useNav();
  const [theme, setTheme] = useState<Theme>('animals');
  const [open, setOpen] = useState<string | null>(null);
  const unlocked = unlockedScenes(save);
  const total = SCENES.length;
  const have = SCENES.filter((s) => s.id in unlocked).length;
  const nameOf = (id: string) => {
    const sc = SCENES.find((s) => s.id === id)!;
    return sc.name[lang as 'en' | 'ko'] ?? sc.name.en;
  };

  const scene = open ? SCENES.find((s) => s.id === open) : null;
  const solvedSize = scene ? unlocked[scene.id] : undefined;

  return (
    <div className="screen" data-testid="collection-screen">
      <ScreenHeader title={t('menu.collection')} onBack={nav.back} />
      <div className="coll-progress">
        <span data-testid="collection-progress">{t('collection.progress', { n: have, total })}</span>
        <span className="mini-progress wide">
          <i style={{ width: `${(have / total) * 100}%` }} />
        </span>
      </div>
      <div className="theme-tabs" role="tablist">
        {THEMES.map((th) => {
          const a = scenesOfTheme(th).filter((s) => s.id in unlocked).length;
          return (
            <button key={th} role="tab" aria-selected={th === theme} className={`theme-tab${th === theme ? ' on' : ''}`} onClick={() => setTheme(th)} data-testid={`theme-${th}`}>
              <span>{THEME_ICON[th]}</span>
              <b>{t(`theme.${th}` as TranslationKey)}</b>
              <small>{t('collection.themeProgress', { a, b: scenesOfTheme(th).length })}</small>
            </button>
          );
        })}
      </div>
      <div className="art-grid" data-testid="art-grid">
        {scenesOfTheme(theme).map((s) => {
          const size = unlocked[s.id];
          const art = artFor(s.id, size)!;
          return (
            <button key={s.id} className={`art-card${size ? ' got' : ''}`} onClick={() => setOpen(s.id)} data-testid="art-card" data-scene={s.id} data-unlocked={size ? '1' : '0'}>
              <PixelArt data={art} locked={!size} size={104} label={size ? nameOf(s.id) : t('collection.locked')} />
              <b>{size ? nameOf(s.id) : '???'}</b>
              <small>{size ? t('collection.solvedAt', { n: size }) : t('collection.locked')}</small>
            </button>
          );
        })}
      </div>

      {scene && (
        <Modal onClose={() => setOpen(null)} label={nameOf(scene.id)}>
          <div className="art-modal" data-testid="art-modal">
            <PixelArt data={artFor(scene.id, solvedSize)!} locked={!solvedSize} size={200} />
            <h2>{solvedSize ? nameOf(scene.id) : '???'}</h2>
            <p className="muted">
              {THEME_ICON[scene.theme]} {t(`theme.${scene.theme}` as TranslationKey)}
              {solvedSize ? ` · ${t('collection.solvedAt', { n: solvedSize })}` : ''}
            </p>
            {!solvedSize && (
              <>
                <p>{t('collection.unlockHint')}</p>
                <div className="chips">
                  {CATALOG.filter((p) => p.sceneId === scene.id).map((p) => (
                    <button key={p.id} className="btn small" data-testid="play-from-collection" onClick={() => nav.go({ name: 'game', puzzleId: p.id })}>
                      {t(`diff.${DIFF_OF_SIZE[p.size]}` as TranslationKey)} · {t('collection.playIt', { n: p.size })}
                    </button>
                  ))}
                </div>
                {adsActive(save) && (
                  <button
                    className="btn ghost"
                    onClick={async () => {
                      const r = await ads.showRewarded('unlock_art');
                      if (r.rewarded) setOpen(null);
                    }}
                  >
                    {t('collection.unlockAd')}
                  </button>
                )}
              </>
            )}
            <button className="btn ghost" onClick={() => setOpen(null)}>
              {t('common.close')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
