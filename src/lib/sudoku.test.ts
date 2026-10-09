import { describe, expect, it } from 'vitest'
import { ALL, bit, boardFromValues, conflicts, countSolutions, formatGrid, parseGrid, PEERS, solveBacktrack, UNITS } from './sudoku'
import { generate, rng } from './generator'
import { TECH_ORDER, applyStep, findStep, solveSteps, type Tech } from './techniques'
import type { Board } from './sudoku'

const EASY = '530070000600195000098000060800060003400803001700020006060000280000419005000080079'
const EASY_SOL = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'
// Arto Inkala's "world's hardest sudoku"
const HARD = '8..........36......7..9.2...5...7.......457.....1...3...1....68..85...1..9....4..'
const HARD_SOL = '812753649943682175675491283154237896369845721287169534521974368438526917796318452'

const dots = (s: string) => parseGrid(s)!

/** A board where every empty cell has every candidate. */
function blank(): Board {
  return { values: new Array<number>(81).fill(0), cands: new Array<number>(81).fill(ALL) }
}

describe('grid basics', () => {
  it('has 27 units of 9 and 20 peers per cell', () => {
    expect(UNITS).toHaveLength(27)
    expect(UNITS.every((u) => u.length === 9)).toBe(true)
    expect(PEERS.every((p) => p.length === 20)).toBe(true)
  })
  it('parses and formats', () => {
    expect(formatGrid(dots(HARD))).toBe(HARD)
    expect(parseGrid('123')).toBeNull()
    expect(parseGrid('x'.repeat(80) + 'q')).toBeNull()
  })
  it('detects conflicts', () => {
    const v = dots(EASY)
    expect(conflicts(v)).toEqual([])
    v[2] = 5 // second 5 in row 0
    expect(conflicts(v)).toContain(2)
    expect(conflicts(v)).toContain(0)
  })
  it('computes candidates from peers', () => {
    const b = boardFromValues(dots(EASY))
    // cell 2 (R1C3): row has 5,3,7; col has 8; box has 5,3,6,9,8 -> candidates 1,2,4
    expect(b.cands[2]).toBe(bit(1) | bit(2) | bit(4))
  })
})

describe('backtracking', () => {
  it('solves the easy puzzle', () => expect(formatGrid(solveBacktrack(dots(EASY))!)).toBe(EASY_SOL))
  it('solves the hardest puzzle', () => expect(formatGrid(solveBacktrack(dots(HARD))!)).toBe(HARD_SOL))
  it('counts unique and multiple solutions', () => {
    expect(countSolutions(dots(EASY))).toBe(1)
    expect(countSolutions(new Array<number>(81).fill(0), 5)).toBe(5)
  })
  it('returns 0 for contradictions', () => {
    const v = dots(EASY)
    v[2] = 5
    expect(countSolutions(v)).toBe(0)
  })
})

describe('techniques on hand-built boards', () => {
  it('finds a naked single', () => {
    const b = blank()
    b.cands[10] = bit(4)
    const s = findStep(b)!
    expect(s.tech).toBe('naked-single')
    expect(s.place).toEqual({ cell: 10, digit: 4 })
  })
  it('finds a hidden single', () => {
    const b = blank()
    for (const c of UNITS[0]) if (c !== 3) b.cands[c] &= ~bit(7)
    const s = findStep(b, new Set<Tech>(['hidden-single']))!
    expect(s.place).toEqual({ cell: 3, digit: 7 })
  })
  it('finds a naked pair and removes the digits from the rest of the unit', () => {
    const b = blank()
    b.cands[0] = bit(1) | bit(2)
    b.cands[1] = bit(1) | bit(2)
    const s = findStep(b, new Set<Tech>(['naked-pair']))!
    expect(s.cells).toEqual([0, 1])
    expect(s.elim.every((e) => e.digit === 1 || e.digit === 2)).toBe(true)
    const after = applyStep(b, s)
    expect(after.cands[2] & (bit(1) | bit(2))).toBe(0)
  })
  it('finds a hidden pair', () => {
    const b = blank()
    for (const c of UNITS[0]) if (c !== 0 && c !== 1) b.cands[c] &= ~(bit(8) | bit(9))
    const s = findStep(b, new Set<Tech>(['hidden-pair']))!
    expect(s.cells).toEqual([0, 1])
    expect(applyStep(b, s).cands[0]).toBe(bit(8) | bit(9))
  })
  it('finds pointing candidates', () => {
    const b = blank()
    // digit 5 in box 0 only in row 0
    for (const c of UNITS[18]) if (c >= 9) b.cands[c] &= ~bit(5)
    const s = findStep(b, new Set<Tech>(['pointing']))!
    expect(s.tech).toBe('pointing')
    expect(s.elim.every((e) => e.cell < 9 && e.cell >= 3 && e.digit === 5)).toBe(true)
  })
  it('finds an X-Wing', () => {
    const b = blank()
    // digit 1 in rows 1 and 5 only in columns 2 and 6
    for (const r of [1, 5]) for (let c = 0; c < 9; c++) if (c !== 2 && c !== 6) b.cands[r * 9 + c] &= ~bit(1)
    const s = findStep(b, new Set<Tech>(['x-wing']))!
    expect(s.tech).toBe('x-wing')
    expect(s.cells.sort((a, c) => a - c)).toEqual([11, 15, 47, 51])
    expect(s.elim.every((e) => (e.cell % 9 === 2 || e.cell % 9 === 6) && ![1, 5].includes(Math.floor(e.cell / 9)))).toBe(true)
    expect(s.elim).toHaveLength(14)
  })
  it('finds a Swordfish', () => {
    const b = blank()
    // digit 3 in rows 0, 3, 6 limited to columns {1,4},{4,7},{1,7}
    const allowed: Record<number, number[]> = { 0: [1, 4], 3: [4, 7], 6: [1, 7] }
    for (const [r, cols] of Object.entries(allowed)) for (let c = 0; c < 9; c++) if (!cols.includes(c)) b.cands[+r * 9 + c] &= ~bit(3)
    const s = findStep(b, new Set<Tech>(['swordfish']))!
    expect(s.tech).toBe('swordfish')
    expect(s.elim).toHaveLength(18)
  })
})

describe('step solver', () => {
  it('solves the easy puzzle with singles only', () => {
    const r = solveSteps(dots(EASY), { allowed: new Set<Tech>(['naked-single', 'hidden-single']), backtrack: false })
    expect(r.solved).toBe(true)
    expect(formatGrid(r.boards.at(-1)!.values)).toBe(EASY_SOL)
    expect(r.boards).toHaveLength(r.steps.length + 1)
  })
  it('solves the hardest puzzle correctly using any mix of techniques and backtracking', () => {
    const r = solveSteps(dots(HARD))
    expect(r.solved).toBe(true)
    expect(formatGrid(r.boards.at(-1)!.values)).toBe(HARD_SOL)
  })
  it('only uses sound steps: every placement matches the solution and no solution digit is eliminated', () => {
    const sol = dots(HARD_SOL)
    const r = solveSteps(dots(HARD))
    for (const s of r.steps) {
      if (s.place) expect(sol[s.place.cell]).toBe(s.place.digit)
      for (const e of s.elim) expect(sol[e.cell]).not.toBe(e.digit)
    }
  })
  it('falls back to backtracking when techniques are limited', () => {
    const r = solveSteps(dots(EASY), { allowed: new Set<Tech>(['naked-single']) })
    expect(r.solved).toBe(true)
  })
  it('reports stuck / invalid', () => {
    expect(solveSteps(dots(HARD), { allowed: new Set<Tech>(['naked-single']), backtrack: false }).status).toBe('stuck')
    const v = dots(EASY)
    v[2] = 5
    expect(solveSteps(v).status).not.toBe('ok')
  })
  it('lists techniques in TECH_ORDER', () => expect(TECH_ORDER[0]).toBe('naked-single'))
})

describe('generator', () => {
  it('is deterministic per seed and yields unique puzzles', () => {
    const a = generate(42, 'easy')
    expect(generate(42, 'easy')).toEqual(a)
    expect(countSolutions(a)).toBe(1)
  })
  it('easy puzzles are solvable with singles', () => {
    const p = generate(7, 'easy')
    expect(solveSteps(p, { allowed: new Set<Tech>(['naked-single', 'hidden-single']), backtrack: false }).solved).toBe(true)
  })
  it.each(['medium', 'hard', 'expert'] as const)('%s puzzle has one solution', (d) => {
    const p = generate(3, d)
    expect(countSolutions(p)).toBe(1)
    expect(p.filter(Boolean).length).toBeLessThan(45)
  })
  it('rng is in [0,1)', () => {
    const r = rng(1)
    for (let i = 0; i < 100; i++) { const x = r(); expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1) }
  })
})
