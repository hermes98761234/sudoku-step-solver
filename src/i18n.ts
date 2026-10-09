export type Lang = 'en' | 'uk'
export type T = (s: string, ...args: (string | number)[]) => string

/** Marks a string for translation where it is defined away from its t() call. */
export const N = (s: string) => s

/** Common strings shared by every page. App-specific ones live in uk.ts. */
export const COMMON_UK: Record<string, string> = {
  Theme: 'Тема',
  System: 'Системна',
  Light: 'Світла',
  Dark: 'Темна',
  Language: 'Мова',
  'Source on GitHub': 'Код на GitHub',
}

/** English source string → Ukrainian. `{0}`, `{1}` are placeholders for interpolated values. */
export function tr(uk: Record<string, string>, lang: Lang, s: string, ...args: (string | number)[]): string {
  const src = lang === 'uk' ? (uk[s] ?? COMMON_UK[s] ?? s) : s
  return src.replace(/\{(\d+)\}/g, (_, i: string) => String(args[+i]))
}
