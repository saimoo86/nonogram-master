/**
 * Ad / monetization extension point. No real ad SDK is connected.
 * To integrate one: implement AdService with the SDK, set AD_CONFIG.enabled = true.
 * All UI hooks (post-puzzle interstitial, rewarded hints, collection unlock) already call this layer
 * and are hidden/skipped while ads are disabled or the player owns `adFree`.
 */
import type { SaveData } from '../store/types';

export type InterstitialPlacement = 'puzzle_complete';
export type RewardedPlacement = 'extra_hints' | 'unlock_art';

export interface AdService {
  showInterstitial(placement: InterstitialPlacement): Promise<void>;
  showRewarded(placement: RewardedPlacement): Promise<{ rewarded: boolean }>;
}

export const AD_CONFIG = { enabled: false };

/** Placeholder implementation: resolves immediately so gameplay is never blocked. */
export const stubAds: AdService = {
  async showInterstitial() {},
  async showRewarded() {
    return { rewarded: true };
  },
};

let service: AdService = stubAds;
export function setAdService(s: AdService) {
  service = s;
}
export const ads: AdService = {
  showInterstitial: (p) => service.showInterstitial(p),
  showRewarded: (p) => service.showRewarded(p),
};

/** Future "Remove Ads" IAP flips save.adFree. */
export function adsActive(save: Pick<SaveData, 'adFree'>): boolean {
  return AD_CONFIG.enabled && !save.adFree;
}
