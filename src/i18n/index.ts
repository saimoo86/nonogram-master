import { en, type TranslationKey } from './en';
import { ko } from './ko';

export type { TranslationKey };

/**
 * To add a language: create `src/i18n/<code>.ts` exporting a full Record<TranslationKey, string>,
 * register it in DICTIONARIES and LANGUAGES. Missing keys fall back to English.
 */
export const DICTIONARIES: Record<string, Partial<Record<TranslationKey, string>>> = { en, ko };

export const LANGUAGES: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'ko', name: '한국어' },
];

export type Params = Record<string, string | number>;

export function translate(lang: string, key: TranslationKey, params?: Params): string {
  const dict = DICTIONARIES[lang] ?? en;
  let s: string = dict[key] ?? en[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
