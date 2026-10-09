/** Sudoku model, candidate bookkeeping and a backtracking solver. Pure functions, no DOM. */

export const ALL = 0x1ff // bit (d-1) set = digit d is a candidate

export const rowOf = (i: number) => Math.floor(i / 9)
export const colOf = (i: number) => i % 9
export const boxOf = (i: number) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3)

/** 27 units: rows 0-8, columns 9-17, boxes 18-26. */
export const UNITS: number[][] = (() => {
  const u: number[][] = []
  for (let r = 0; r < 9; r++) u.push(Array.from({ length: 9 }, (_, c) => r * 9 + c))
  for (let c = 0; c < 9; c++) u.push(Array.from({ length: 9 }, (_, r) => r * 9 + c))
  for (let b = 0; b < 9; b++) {
    const r0 = Math.floor(b / 3) * 3
    const c0 = (b % 3) * 3
    u.push(Array.from({ length: 9 }, (_, k) => (r0 + Math.floor(k / 3)) * 9 + c0 + (k % 3)))
  }
  return u
})()

export type UnitKind = 'row' | 'col' | 'box'
export const unitKind = (u: number): UnitKind => (u < 9 ? 'row' : u < 18 ? 'col' : 'box')
export const unitNo = (u: number) => (u % 9) + 1

export const PEERS: number[][] = Array.from({ length: 81 }, (_, i) => {
  const s = new Set<number>()
  for (const u of [rowOf(i), 9 + colOf(i), 18 + boxOf(i)]) for (const c of UNITS[u]) if (c !== i) s.add(c)
  return [...s]
})

export const popcount = (m: number) => {
  let n = 0
  while (m) { m &= m - 1; n++ }
  return n
}
/** Digits (1-9) of a candidate mask. */
export const digitsOf = (m: number): number[] => {
  const d: number[] = []
  for (let k = 0; k < 9; k++) if (m & (1 << k)) d.push(k + 1)
  return d
}
export const bit = (d: number) => 1 << (d - 1)

export const cellName = (i: number) => `R${rowOf(i) + 1}C${colOf(i) + 1}`

export interface Board {
  values: number[] // 0 = empty
  cands: number[] // mask per cell, 0 for solved cells
}

/** Parses 81 characters: 1-9 are givens, 0 . _ - are blanks, whitespace ignored. */
export function parseGrid(text: string): number[] | null {
  const chars = [...text.replace(/\s+/g, '')]
  if (chars.length !== 81) return null
  const out: number[] = []
  for (const ch of chars) {
    if (ch >= '1' && ch <= '9') out.push(+ch)
    else if (ch === '0' || ch === '.' || ch === '_' || ch === '-' || ch === 'x' || ch === 'X') out.push(0)
    else return null
  }
  return out
}
export const formatGrid = (v: number[]): string => v.map((d) => (d ? String(d) : '.')).join('')

/** Cells that share a digit with a peer. */
export function conflicts(values: number[]): number[] {
  const bad = new Set<number>()
  for (const u of UNITS) {
    const seen = new Map<number, number>()
    for (const c of u) {
      const d = values[c]
      if (!d) continue
      const prev = seen.get(d)
      if (prev !== undefined) { bad.add(prev); bad.add(c) } else seen.set(d, c)
    }
  }
  return [...bad].sort((a, b) => a - b)
}

export function boardFromValues(values: number[]): Board {
  const cands = values.map((v, i) => {
    if (v) return 0
    let m = ALL
    for (const p of PEERS[i]) if (values[p]) m &= ~bit(values[p])
    return m
  })
  return { values: [...values], cands }
}

export function place(b: Board, cell: number, digit: number): void {
  b.values[cell] = digit
  b.cands[cell] = 0
  for (const p of PEERS[cell]) b.cands[p] &= ~bit(digit)
}

/** True if no empty cell is out of candidates and no unit lost a digit. */
export function isConsistent(b: Board): boolean {
  for (let i = 0; i < 81; i++) if (!b.values[i] && !b.cands[i]) return false
  return true
}

/** Counts solutions up to `limit` using bitmask backtracking (most constrained cell first). */
export function countSolutions(values: number[], limit = 2): number {
  if (conflicts(values).length) return 0
  const v = [...values]
  const rows = new Array<number>(9).fill(0)
  const cols = new Array<number>(9).fill(0)
  const boxes = new Array<number>(9).fill(0)
  for (let i = 0; i < 81; i++) if (v[i]) { const m = bit(v[i]); rows[rowOf(i)] |= m; cols[colOf(i)] |= m; boxes[boxOf(i)] |= m }
  let count = 0
  const rec = (): void => {
    let best = -1
    let bestMask = 0
    let bestN = 10
    for (let i = 0; i < 81; i++) {
      if (v[i]) continue
      const m = ALL & ~(rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)])
      const n = popcount(m)
      if (n < bestN) { best = i; bestMask = m; bestN = n; if (n <= 1) break }
    }
    if (best < 0) { count++; return }
    for (const d of digitsOf(bestMask)) {
      const m = bit(d)
      v[best] = d; rows[rowOf(best)] |= m; cols[colOf(best)] |= m; boxes[boxOf(best)] |= m
      rec()
      v[best] = 0; rows[rowOf(best)] &= ~m; cols[colOf(best)] &= ~m; boxes[boxOf(best)] &= ~m
      if (count >= limit) return
    }
  }
  rec()
  return count
}

/** First solution found by backtracking, or null. Optional `order` picks the digit try order (for generation). */
export function solveBacktrack(values: number[], digitOrder?: (cell: number, digits: number[]) => number[]): number[] | null {
  if (conflicts(values).length) return null
  const v = [...values]
  const rows = new Array<number>(9).fill(0)
  const cols = new Array<number>(9).fill(0)
  const boxes = new Array<number>(9).fill(0)
  for (let i = 0; i < 81; i++) if (v[i]) { const m = bit(v[i]); rows[rowOf(i)] |= m; cols[colOf(i)] |= m; boxes[boxOf(i)] |= m }
  const rec = (): boolean => {
    let best = -1
    let bestMask = 0
    let bestN = 10
    for (let i = 0; i < 81; i++) {
      if (v[i]) continue
      const m = ALL & ~(rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)])
      const n = popcount(m)
      if (n < bestN) { best = i; bestMask = m; bestN = n; if (n <= 1) break }
    }
    if (best < 0) return true
    let ds = digitsOf(bestMask)
    if (digitOrder) ds = digitOrder(best, ds)
    for (const d of ds) {
      const m = bit(d)
      v[best] = d; rows[rowOf(best)] |= m; cols[colOf(best)] |= m; boxes[boxOf(best)] |= m
      if (rec()) return true
      v[best] = 0; rows[rowOf(best)] &= ~m; cols[colOf(best)] &= ~m; boxes[boxOf(best)] &= ~m
    }
    return false
  }
  return rec() ? v : null
}
