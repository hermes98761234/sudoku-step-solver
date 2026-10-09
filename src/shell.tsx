import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { tr, type Lang, type T } from './i18n'

export type Theme = 'auto' | 'light' | 'dark'

/** useState that persists JSON to localStorage (falls back silently when unavailable). */
export function usePersisted<V>(key: string, init: V | (() => V)): [V, Dispatch<SetStateAction<V>>] {
  const [v, setV] = useState<V>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw != null) return { ...(typeof init === 'function' ? (init as () => V)() : init), ...JSON.parse(raw) } as V
    } catch { /* ignore */ }
    return typeof init === 'function' ? (init as () => V)() : init
  })
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* ignore */ }
  }, [key, v])
  return [v, setV]
}

export interface Shell {
  lang: Lang
  theme: Theme
  setLang: (l: Lang) => void
  setTheme: (t: Theme) => void
  t: T
}

export function useShell(key: string, uk: Record<string, string>): Shell {
  const [s, setS] = usePersisted<{ lang: Lang; theme: Theme }>(`${key}:shell`, () => ({
    lang: typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('uk') ? 'uk' : 'en',
    theme: 'auto',
  }))
  useEffect(() => {
    const root = document.documentElement
    if (s.theme === 'auto') delete root.dataset.theme
    else root.dataset.theme = s.theme
    root.lang = s.lang
  }, [s.theme, s.lang])
  const t: T = (str, ...a) => tr(uk, s.lang, str, ...a)
  return { lang: s.lang, theme: s.theme, setLang: (lang) => setS((p) => ({ ...p, lang })), setTheme: (theme) => setS((p) => ({ ...p, theme })), t }
}

export function Header({ title, tagline, shell, children }: { title: string; tagline: string; shell: Shell; children?: ReactNode }) {
  const { t } = shell
  return (
    <header className="toolbar">
      <span className="brand">{title}</span>
      <span className="hint tagline">{tagline}</span>
      <span className="spacer" />
      {children}
      <label className="inline">
        {t('Theme')}{' '}
        <select value={shell.theme} onChange={(e) => shell.setTheme(e.target.value as Theme)}>
          <option value="auto">{t('System')}</option>
          <option value="light">{t('Light')}</option>
          <option value="dark">{t('Dark')}</option>
        </select>
      </label>
      <label className="inline">
        {t('Language')}{' '}
        <select value={shell.lang} onChange={(e) => shell.setLang(e.target.value as Lang)}>
          <option value="en">English</option>
          <option value="uk">Українська</option>
        </select>
      </label>
    </header>
  )
}

export function Footer({ repo, note, t }: { repo: string; note?: string; t: T }) {
  return (
    <p className="hint foot">
      {note ? <>{note}{' '}</> : null}
      <a href={`https://github.com/hermes98761234/${repo}`}>{t('Source on GitHub')}</a>
    </p>
  )
}
