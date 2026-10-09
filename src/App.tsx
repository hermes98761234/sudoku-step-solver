import { useEffect, useMemo, useRef, useState } from 'react'
import { Footer, Header, useShell, usePersisted } from './shell'
import { UK } from './uk'
import { boxOf, colOf, conflicts, countSolutions, formatGrid, parseGrid, rowOf, UNITS, bit } from './lib/sudoku'
import { generate, type Difficulty } from './lib/generator'
import { TECH_NAME, TECH_ORDER, solveSteps, type Step, type Tech } from './lib/techniques'
import type { T } from './i18n'

const SAMPLES: Record<string, string> = {
  'Easy sample': '530070000600195000098000060800060003400803001700020006060000280000419005000080079',
  'X-Wing sample': '1.....569492.561.8.561.924...964.8.1.64.1....218.356.4.4.5...169.5.614.2621.....5',
  'Hardest (Inkala)': '8..........36......7..9.2...5...7.......457.....1...3...1....68..85...1..9....4..',
}

function describe(s: Step, t: T): string {
  return t(s.tpl, ...s.args.map((a) => (typeof a === 'string' && a.startsWith('@') ? t(a.slice(1)) : a)))
}

function initialGivens(): number[] {
  const m = /[#&]p=([^&]+)/.exec(location.hash)
  const fromHash = m ? parseGrid(decodeURIComponent(m[1])) : null
  return fromHash ?? parseGrid(SAMPLES['X-Wing sample'])!
}

export default function App() {
  const shell = useShell('sudoku-step-solver', UK)
  const { t } = shell
  const [givens, setGivens] = useState<number[]>(initialGivens)
  const [prefs, setPrefs] = usePersisted<{ cands: boolean; backtrack: boolean; off: Tech[]; diff: Difficulty }>('sudoku-step-solver:prefs', {
    cands: true, backtrack: true, off: [], diff: 'medium',
  })
  const [idx, setIdx] = useState(0)
  const [sel, setSel] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [text, setText] = useState(formatGrid(givens))
  const [toast, setToast] = useState('')
  const seed = useRef(0)

  const allowed = useMemo(() => new Set(TECH_ORDER.filter((x) => !prefs.off.includes(x))), [prefs.off])
  const bad = useMemo(() => conflicts(givens), [givens])
  const solutions = useMemo(() => (bad.length ? 0 : countSolutions(givens, 2)), [givens, bad])
  const result = useMemo(() => solveSteps(givens, { allowed, backtrack: prefs.backtrack }), [givens, allowed, prefs.backtrack])
  const i = Math.min(idx, result.steps.length)
  const board = result.boards[i]
  const step: Step | undefined = result.steps[i]

  useEffect(() => {
    if (!playing) return
    if (i >= result.steps.length) { setPlaying(false); return }
    const id = setTimeout(() => setIdx(i + 1), 1000)
    return () => clearTimeout(id)
  }, [playing, i, result.steps.length])

  useEffect(() => {
    history.replaceState(null, '', `#p=${formatGrid(givens)}`)
  }, [givens])

  const setPuzzle = (g: number[]) => { setGivens(g); setText(formatGrid(g)); setIdx(0); setPlaying(false) }
  const edit = (cell: number, d: number) => {
    const g = [...givens]
    g[cell] = d
    setPuzzle(g)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (sel == null) return
    if (e.key >= '1' && e.key <= '9') edit(sel, +e.key)
    else if (e.key === '0' || e.key === 'Backspace' || e.key === 'Delete') edit(sel, 0)
    else if (e.key === 'ArrowRight') setSel((sel + 1) % 81)
    else if (e.key === 'ArrowLeft') setSel((sel + 80) % 81)
    else if (e.key === 'ArrowDown') setSel((sel + 9) % 81)
    else if (e.key === 'ArrowUp') setSel((sel + 72) % 81)
    else return
    e.preventDefault()
  }

  const stats = useMemo(() => {
    const m = new Map<Tech, number>()
    for (const s of result.steps) m.set(s.tech, (m.get(s.tech) ?? 0) + 1)
    return [...m.entries()]
  }, [result.steps])
  const hardest = result.steps.reduce<Tech | null>((h, s) => (h === null || TECH_ORDER.indexOf(s.tech) > TECH_ORDER.indexOf(h) || s.tech === 'backtrack' ? s.tech : h), null)

  const unitCells = new Set(step?.units.flatMap((u) => UNITS[u]) ?? [])
  const patternCells = new Set(step?.cells ?? [])
  const elimBy = new Map<number, number[]>()
  for (const e of step?.elim ?? []) elimBy.set(e.cell, [...(elimBy.get(e.cell) ?? []), e.digit])

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(location.href); setToast(t('Link copied')) } catch { setToast(location.href) }
    setTimeout(() => setToast(''), 2500)
  }

  const tooMany = solutions === 0 ? 'none' : solutions > 1 ? 'many' : 'one'

  return (
    <div className="app">
      <Header title={t('Sudoku Step Solver')} tagline={t('Solves like a person and explains every step')} shell={shell} />
      <div className="sudoku-wrap" onKeyDown={onKey}>
        <section>
          <div className="board" role="grid" aria-label={t('Puzzle')} tabIndex={0}>
            {Array.from({ length: 81 }, (_, c) => {
              const v = board.values[c]
              const given = givens[c] !== 0
              const cm = board.cands[c]
              const isPlace = step?.place?.cell === c
              const cls = ['cell']
              if (colOf(c) % 3 === 2 && colOf(c) < 8) cls.push('br')
              if (rowOf(c) % 3 === 2 && rowOf(c) < 8) cls.push('bb')
              if (unitCells.has(c)) cls.push('unit')
              if (patternCells.has(c)) cls.push('pattern')
              if (isPlace) cls.push('place')
              if (sel === c) cls.push('sel')
              if (given) cls.push('given')
              if (bad.includes(c)) cls.push('bad')
              return (
                <button key={c} className={cls.join(' ')} onClick={() => setSel(c)} aria-label={`${rowOf(c) + 1}-${colOf(c) + 1}${v ? ` = ${v}` : ''}`} data-box={boxOf(c)}>
                  {v ? <span className="v">{v}</span> : null}
                  {!v && isPlace && !prefs.cands ? <span className="ghost">{step!.place!.digit}</span> : null}
                  {!v && prefs.cands ? (
                    <span className="cands">
                      {Array.from({ length: 9 }, (_, k) => {
                        const d = k + 1
                        const has = (cm & bit(d)) !== 0
                        const del = elimBy.get(c)?.includes(d)
                        const put = isPlace && step!.place!.digit === d
                        const hl = patternCells.has(c) && step!.digits.includes(d) && !put
                        return <span key={d} className={del ? 'del' : put ? 'put' : hl && has ? 'hl' : ''}>{has ? d : ''}</span>
                      })}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
          <div className="pad no-print" aria-label={t('Digit pad')}>
            {Array.from({ length: 9 }, (_, k) => (
              <button key={k} disabled={sel == null} onClick={() => sel != null && edit(sel, k + 1)}>{k + 1}</button>
            ))}
            <button disabled={sel == null} onClick={() => sel != null && edit(sel, 0)}>0</button>
          </div>
          <p className="hint">{t('Click a cell and type 1-9 (0 or Backspace clears).')}</p>
          {bad.length > 0 && <p className="hint err-text">{t('Conflicting digits are marked in red.')}</p>}
        </section>

        <section>
          <div className="box">
            <div className="row">
              <button onClick={() => { setIdx(0); setPlaying(false) }} disabled={i === 0}>{t('Start')}</button>
              <button onClick={() => setIdx(Math.max(0, i - 1))} disabled={i === 0}>{t('Previous')}</button>
              <button className="primary" onClick={() => setPlaying(!playing)} disabled={result.steps.length === 0}>{playing ? t('Pause') : t('Play')}</button>
              <button onClick={() => setIdx(i + 1)} disabled={i >= result.steps.length}>{t('Next')}</button>
              <button onClick={() => { setIdx(result.steps.length); setPlaying(false) }} disabled={i >= result.steps.length}>{t('End')}</button>
              <span className="spacer" />
              <span className="pill">{t('Step {0} of {1}', i, result.steps.length)}</span>
            </div>
            <p className="explain">
              {tooMany === 'none' ? <span className="err-text">{t('This puzzle has no solution.')}</span>
                : step ? <><strong>{t(TECH_NAME[step.tech])}.</strong> {describe(step, t)}</>
                : result.solved ? <span className="ok-text">{t('Solved.')}</span>
                : result.status === 'stuck' ? <span className="warn-text">{t('Stuck: the enabled techniques are not enough.')}</span>
                : t('No steps yet. Enter a puzzle.')}
            </p>
            {tooMany === 'many' && <p className="hint warn-text">{t('This puzzle has more than one solution; showing one of them.')}</p>}
            <p className="hint legend">
              <span className="sw" style={{ background: '#fbbf24' }} /> {t('Elimination')}: <span className="sw" style={{ background: 'var(--err)' }} />
              {' '}<span className="sw" style={{ background: 'var(--ok)' }} /> {t('Placement')}
            </p>
          </div>

          <div className="box" style={{ marginTop: 8 }}>
            <h3>{t('Steps')}</h3>
            <ol className="steplist">
              {result.steps.map((s, k) => (
                <li key={k} className={k === i ? 'cur' : ''}>
                  <button onClick={() => { setIdx(k); setPlaying(false) }}>
                    <span className="n">{k + 1}.</span>
                    <span className="tech">{t(TECH_NAME[s.tech])}</span>{' '}
                    <span className="hint">{s.place ? `${s.place.digit} → R${rowOf(s.place.cell) + 1}C${colOf(s.place.cell) + 1}` : `−${s.elim.length}`}</span>
                  </button>
                </li>
              ))}
              {result.steps.length === 0 && <li><span className="hint" style={{ padding: 8, display: 'block' }}>{t('No steps yet. Enter a puzzle.')}</span></li>}
            </ol>
            <p className="hint">
              {t('Given digits: {0}', givens.filter(Boolean).length)}
              {hardest ? ` · ${t('Hardest technique: {0}', t(TECH_NAME[hardest]))}` : ''}
              {stats.length ? ` · ${stats.map(([k, n]) => `${t(TECH_NAME[k])} ×${n}`).join(', ')}` : ''}
            </p>
          </div>

          <div className="box no-print" style={{ marginTop: 8 }}>
            <h3>{t('Puzzle')}</h3>
            <textarea rows={2} className="mono" value={text} aria-label={t('Paste 81 characters (1-9, . or 0 for blank)')} placeholder={t('Paste 81 characters (1-9, . or 0 for blank)')}
              onChange={(e) => { setText(e.target.value); const g = parseGrid(e.target.value); if (g) { setGivens(g); setIdx(0); setPlaying(false) } }} />
            <div className="row">
              <button onClick={() => { const g = parseGrid(text); if (g) setPuzzle(g) }}>{t('Load')}</button>
              <button className="danger" onClick={() => setPuzzle(new Array<number>(81).fill(0))}>{t('Clear')}</button>
              <button onClick={copyLink}>{t('Copy link')}</button>
              {toast && <span className="hint">{toast}</span>}
            </div>
            <div className="row">
              <label className="inline">{t('Difficulty')}{' '}
                <select value={prefs.diff} onChange={(e) => setPrefs({ ...prefs, diff: e.target.value as Difficulty })}>
                  {(['easy', 'medium', 'hard', 'expert'] as const).map((d) => <option key={d} value={d}>{t(d[0].toUpperCase() + d.slice(1))}</option>)}
                </select>
              </label>
              <button className="primary" onClick={() => { seed.current = (seed.current || Date.now() % 100000) + 1; setPuzzle(generate(seed.current * 7919 + 13, prefs.diff)) }}>{t('Generate')}</button>
              <label className="inline">{t('Samples')}{' '}
                <select value="" onChange={(e) => { if (e.target.value) setPuzzle(parseGrid(SAMPLES[e.target.value])!) }}>
                  <option value="" />
                  {Object.keys(SAMPLES).map((k) => <option key={k} value={k}>{t(k)}</option>)}
                </select>
              </label>
            </div>
            <div className="row">
              <label className="inline"><input type="checkbox" checked={prefs.cands} onChange={(e) => setPrefs({ ...prefs, cands: e.target.checked })} /> {t('Show candidates')}</label>
              <label className="inline"><input type="checkbox" checked={prefs.backtrack} onChange={(e) => setPrefs({ ...prefs, backtrack: e.target.checked })} /> {t('Backtracking fallback')}</label>
            </div>
            <h3>{t('Techniques')}</h3>
            <div className="techs">
              {TECH_ORDER.map((k) => (
                <label key={k}>
                  <input type="checkbox" checked={!prefs.off.includes(k)} disabled={k === 'naked-single'}
                    onChange={(e) => setPrefs({ ...prefs, off: e.target.checked ? prefs.off.filter((x) => x !== k) : [...prefs.off, k] })} />
                  {t(TECH_NAME[k])}
                </label>
              ))}
            </div>
          </div>
        </section>
      </div>
      <Footer repo="sudoku-step-solver" note={t('Hints are generated in your browser. Nothing is uploaded.')} t={t} />
    </div>
  )
}
