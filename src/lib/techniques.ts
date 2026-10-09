import { ALL, bit, boardFromValues, boxOf, cellName, colOf, digitsOf, isConsistent, place, popcount, rowOf, solveBacktrack, UNITS, unitKind, unitNo, type Board } from './sudoku'

export type Tech =
  | 'naked-single' | 'hidden-single' | 'pointing' | 'box-line'
  | 'naked-pair' | 'hidden-pair' | 'naked-triple' | 'hidden-triple'
  | 'x-wing' | 'swordfish' | 'jellyfish' | 'backtrack'

/** Order in which techniques are tried (simplest first). */
export const TECH_ORDER: Tech[] = [
  'naked-single', 'hidden-single', 'pointing', 'box-line', 'naked-pair', 'hidden-pair',
  'naked-triple', 'hidden-triple', 'x-wing', 'swordfish', 'jellyfish',
]
export const TECH_LEVEL: Record<Tech, number> = {
  'naked-single': 1, 'hidden-single': 1, pointing: 2, 'box-line': 2, 'naked-pair': 3, 'hidden-pair': 3,
  'naked-triple': 4, 'hidden-triple': 4, 'x-wing': 5, swordfish: 6, jellyfish: 7, backtrack: 9,
}
export const TECH_NAME: Record<Tech, string> = {
  'naked-single': 'Naked single', 'hidden-single': 'Hidden single', pointing: 'Pointing pair/triple', 'box-line': 'Box/line reduction',
  'naked-pair': 'Naked pair', 'hidden-pair': 'Hidden pair', 'naked-triple': 'Naked triple', 'hidden-triple': 'Hidden triple',
  'x-wing': 'X-Wing', swordfish: 'Swordfish', jellyfish: 'Jellyfish', backtrack: 'Backtracking',
}

export interface Step {
  tech: Tech
  /** English template; `{n}` are filled from args. Args starting with `@` are UI words to translate. */
  tpl: string
  args: (string | number)[]
  place?: { cell: number; digit: number }
  elim: { cell: number; digit: number }[]
  /** Cells that make up the pattern. */
  cells: number[]
  /** Digits of the pattern. */
  digits: number[]
  /** Unit indices (0-26) to shade. */
  units: number[]
}

const names = (cells: number[]) => cells.map(cellName).join(', ')
const unitArgs = (u: number): (string | number)[] => ['@' + unitKind(u), unitNo(u)]

function nakedSingle(b: Board): Step | null {
  for (let i = 0; i < 81; i++) {
    if (popcount(b.cands[i]) === 1) {
      const d = digitsOf(b.cands[i])[0]
      return { tech: 'naked-single', tpl: 'Naked single: {0} can only be {1}; every other digit is already used by a neighbour.', args: [cellName(i), d], place: { cell: i, digit: d }, elim: [], cells: [i], digits: [d], units: [] }
    }
  }
  return null
}

function hiddenSingle(b: Board): Step | null {
  for (let u = 0; u < 27; u++) {
    for (let d = 1; d <= 9; d++) {
      const spots = UNITS[u].filter((c) => b.cands[c] & bit(d))
      if (spots.length === 1 && !UNITS[u].some((c) => b.values[c] === d)) {
        const c = spots[0]
        return { tech: 'hidden-single', tpl: 'Hidden single: {1} fits only in {0} within {2} {3}.', args: [cellName(c), d, ...unitArgs(u)], place: { cell: c, digit: d }, elim: [], cells: [c], digits: [d], units: [u] }
      }
    }
  }
  return null
}

function pointing(b: Board): Step | null {
  for (let bx = 0; bx < 9; bx++) {
    for (let d = 1; d <= 9; d++) {
      const spots = UNITS[18 + bx].filter((c) => b.cands[c] & bit(d))
      if (spots.length < 2) continue
      for (const [kind, f] of [['row', rowOf], ['col', colOf]] as const) {
        const line = f(spots[0])
        if (!spots.every((c) => f(c) === line)) continue
        const lineUnit = kind === 'row' ? line : 9 + line
        const elim = UNITS[lineUnit].filter((c) => boxOf(c) !== bx && b.cands[c] & bit(d)).map((c) => ({ cell: c, digit: d }))
        if (elim.length) return { tech: 'pointing', tpl: 'Pointing {4}: in box {0}, {1} is confined to {5} {2} ({3}), so it is removed from the rest of that {5}.', args: [bx + 1, d, line + 1, names(spots), spots.length === 2 ? '@pair' : '@triple', '@' + kind], elim, cells: spots, digits: [d], units: [18 + bx, lineUnit] }
      }
    }
  }
  return null
}

function boxLine(b: Board): Step | null {
  for (let u = 0; u < 18; u++) {
    for (let d = 1; d <= 9; d++) {
      const spots = UNITS[u].filter((c) => b.cands[c] & bit(d))
      if (spots.length < 2) continue
      const bx = boxOf(spots[0])
      if (!spots.every((c) => boxOf(c) === bx)) continue
      const elim = UNITS[18 + bx].filter((c) => !spots.includes(c) && b.cands[c] & bit(d)).map((c) => ({ cell: c, digit: d }))
      if (elim.length) return { tech: 'box-line', tpl: 'Box/line reduction: in {0} {1}, {2} is confined to box {3}, so it is removed from the rest of that box.', args: [...unitArgs(u), d, bx + 1], elim, cells: spots, digits: [d], units: [u, 18 + bx] }
    }
  }
  return null
}

function combos<T>(items: T[], k: number): T[][] {
  const out: T[][] = []
  const rec = (start: number, cur: T[]) => {
    if (cur.length === k) { out.push([...cur]); return }
    for (let i = start; i < items.length; i++) { cur.push(items[i]); rec(i + 1, cur); cur.pop() }
  }
  rec(0, [])
  return out
}

function nakedSubset(b: Board, n: 2 | 3): Step | null {
  for (let u = 0; u < 27; u++) {
    const open = UNITS[u].filter((c) => b.cands[c] && popcount(b.cands[c]) <= n)
    for (const group of combos(open, n)) {
      const mask = group.reduce((m, c) => m | b.cands[c], 0)
      if (popcount(mask) !== n) continue
      const elim: Step['elim'] = []
      for (const c of UNITS[u]) {
        if (group.includes(c) || !b.cands[c]) continue
        for (const d of digitsOf(b.cands[c] & mask)) elim.push({ cell: c, digit: d })
      }
      if (elim.length) return { tech: n === 2 ? 'naked-pair' : 'naked-triple', tpl: 'Naked {0}: {1} can only hold {2} within {3} {4}, so those digits are removed from the other cells there.', args: [n === 2 ? '@pair' : '@triple', names(group), digitsOf(mask).join(''), '@' + unitKind(u), unitNo(u)], elim, cells: group, digits: digitsOf(mask), units: [u] }
    }
  }
  return null
}

function hiddenSubset(b: Board, n: 2 | 3): Step | null {
  for (let u = 0; u < 27; u++) {
    const present = [] as number[]
    for (let d = 1; d <= 9; d++) {
      const k = UNITS[u].filter((c) => b.cands[c] & bit(d)).length
      if (k >= 1 && k <= n) present.push(d)
    }
    for (const ds of combos(present, n)) {
      const cells = UNITS[u].filter((c) => ds.some((d) => b.cands[c] & bit(d)))
      if (cells.length !== n) continue
      // each digit must appear somewhere (guaranteed) and the cells must be exactly n
      const keep = ds.reduce((m, d) => m | bit(d), 0)
      const elim: Step['elim'] = []
      for (const c of cells) for (const d of digitsOf(b.cands[c] & ~keep)) elim.push({ cell: c, digit: d })
      if (elim.length) return { tech: n === 2 ? 'hidden-pair' : 'hidden-triple', tpl: 'Hidden {0}: {2} appear only in {1} within {3} {4}, so every other candidate is removed from those cells.', args: [n === 2 ? '@pair' : '@triple', names(cells), ds.join(''), '@' + unitKind(u), unitNo(u)], elim, cells, digits: ds, units: [u] }
    }
  }
  return null
}

const FISH: Record<number, { tech: Tech; name: string }> = {
  2: { tech: 'x-wing', name: '@X-Wing' }, 3: { tech: 'swordfish', name: '@Swordfish' }, 4: { tech: 'jellyfish', name: '@Jellyfish' },
}

function fish(b: Board, n: 2 | 3 | 4): Step | null {
  for (let d = 1; d <= 9; d++) {
    for (const byRow of [true, false]) {
      // base lines: rows (or columns) in which d has 2..n places
      const lineCells = (l: number) => UNITS[byRow ? l : 9 + l]
      const pos = (l: number) => lineCells(l).filter((c) => b.cands[c] & bit(d)).map((c) => (byRow ? colOf(c) : rowOf(c)))
      const bases = [] as number[]
      for (let l = 0; l < 9; l++) {
        const p = pos(l).length
        if (p >= 2 && p <= n) bases.push(l)
      }
      for (const group of combos(bases, n)) {
        const cover = new Set<number>()
        for (const l of group) for (const p of pos(l)) cover.add(p)
        if (cover.size !== n) continue
        const elim: Step['elim'] = []
        const coverCells: number[] = []
        for (const p of cover) {
          for (let l = 0; l < 9; l++) {
            const c = byRow ? l * 9 + p : p * 9 + l
            if (group.includes(l)) { if (b.cands[c] & bit(d)) coverCells.push(c); continue }
            if (b.cands[c] & bit(d)) elim.push({ cell: c, digit: d })
          }
        }
        if (elim.length) {
          const f = FISH[n]
          const baseWord = byRow ? '@rows' : '@cols'
          const coverWord = byRow ? '@cols' : '@rows'
          return { tech: f.tech, tpl: '{0} on {1}: in {2} {3} the digit is confined to {4} {5}, so it is removed from the other cells of those {4}.', args: [f.name, d, baseWord, group.map((l) => l + 1).join(', '), coverWord, [...cover].map((p) => p + 1).sort().join(', ')], elim, cells: coverCells, digits: [d], units: group.map((l) => (byRow ? l : 9 + l)) }
        }
      }
    }
  }
  return null
}

const FINDERS: Record<Exclude<Tech, 'backtrack'>, (b: Board) => Step | null> = {
  'naked-single': nakedSingle,
  'hidden-single': hiddenSingle,
  pointing,
  'box-line': boxLine,
  'naked-pair': (b) => nakedSubset(b, 2),
  'hidden-pair': (b) => hiddenSubset(b, 2),
  'naked-triple': (b) => nakedSubset(b, 3),
  'hidden-triple': (b) => hiddenSubset(b, 3),
  'x-wing': (b) => fish(b, 2),
  swordfish: (b) => fish(b, 3),
  jellyfish: (b) => fish(b, 4),
}

/** Finds the first applicable step among `allowed` techniques (in TECH_ORDER). */
export function findStep(b: Board, allowed: ReadonlySet<Tech> = new Set(TECH_ORDER)): Step | null {
  for (const t of TECH_ORDER) {
    if (!allowed.has(t)) continue
    if (t === 'backtrack') continue
    const s = FINDERS[t](b)
    if (s) return s
  }
  return null
}

export function applyStep(b: Board, s: Step): Board {
  const out: Board = { values: [...b.values], cands: [...b.cands] }
  if (s.place) place(out, s.place.cell, s.place.digit)
  for (const e of s.elim) out.cands[e.cell] &= ~bit(e.digit)
  return out
}

export interface SolveResult {
  steps: Step[]
  /** Board before each step, plus the final board at the end (length = steps.length + 1). */
  boards: Board[]
  solved: boolean
  /** Number of solutions found (capped at 2); 0 means the puzzle is invalid. */
  status: 'ok' | 'invalid' | 'stuck'
  maxLevel: number
}

/**
 * Solves with human techniques; when none applies and `backtrack` is true, places one digit
 * from a backtracking solution and carries on.
 */
export function solveSteps(values: number[], opts: { allowed?: ReadonlySet<Tech>; backtrack?: boolean } = {}): SolveResult {
  const allowed = opts.allowed ?? new Set(TECH_ORDER)
  const backtrack = opts.backtrack ?? true
  let b = boardFromValues(values)
  const steps: Step[] = []
  const boards: Board[] = [b]
  let status: SolveResult['status'] = 'ok'
  for (let guard = 0; guard < 400; guard++) {
    if (b.values.every((v) => v)) break
    if (!isConsistent(b)) { status = 'invalid'; break }
    let s = findStep(b, allowed)
    if (!s) {
      if (!backtrack) { status = 'stuck'; break }
      const sol = solveBacktrack(b.values)
      if (!sol) { status = 'invalid'; break }
      // choose the empty cell with the fewest candidates for the guess
      let best = -1
      for (let i = 0; i < 81; i++) if (!b.values[i] && (best < 0 || popcount(b.cands[i]) < popcount(b.cands[best]))) best = i
      s = { tech: 'backtrack', tpl: 'No technique applies. Trial and error (backtracking) shows {0} must be {1}.', args: [cellName(best), sol[best]], place: { cell: best, digit: sol[best] }, elim: [], cells: [best], digits: [sol[best]], units: [] }
    }
    steps.push(s)
    b = applyStep(b, s)
    boards.push(b)
  }
  const solved = b.values.every((v) => v) && status === 'ok'
  return { steps, boards, solved, status, maxLevel: steps.reduce((m, s) => Math.max(m, TECH_LEVEL[s.tech]), 0) }
}

export { ALL }
