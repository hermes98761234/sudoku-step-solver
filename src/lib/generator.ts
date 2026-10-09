import { countSolutions, solveBacktrack } from './sudoku'
import { TECH_ORDER, solveSteps, type Tech } from './techniques'

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert'

/** Mulberry32: tiny seedable PRNG. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(a: T[], r: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function randomSolution(r: () => number): number[] {
  const sol = solveBacktrack(new Array<number>(81).fill(0), (_c, ds) => shuffle([...ds], r))
  if (!sol) throw new Error('unreachable: empty grid is solvable')
  return sol
}

const LIMITS: Record<Difficulty, { techs: Tech[]; clues: number }> = {
  easy: { techs: ['naked-single', 'hidden-single'], clues: 36 },
  medium: { techs: ['naked-single', 'hidden-single', 'pointing', 'box-line', 'naked-pair', 'hidden-pair'], clues: 30 },
  hard: { techs: TECH_ORDER.filter((t) => t !== 'jellyfish'), clues: 26 },
  expert: { techs: TECH_ORDER, clues: 17 },
}

/** Generates a puzzle with a unique solution, removing digits in 180-degree symmetric pairs. */
export function generate(seed: number, difficulty: Difficulty): number[] {
  const r = rng(seed)
  const v = randomSolution(r)
  const { techs, clues } = LIMITS[difficulty]
  const allowed = new Set(techs)
  const order = shuffle(Array.from({ length: 41 }, (_, i) => i), r)
  let count = 81
  for (const i of order) {
    if (count <= clues) break
    const j = 80 - i
    const a = v[i]
    const b = v[j]
    v[i] = 0
    v[j] = 0
    const removed = i === j ? 1 : 2
    const ok = countSolutions(v, 2) === 1 && (difficulty === 'expert' || solveSteps(v, { allowed, backtrack: false }).solved)
    if (ok) count -= removed
    else { v[i] = a; v[j] = b }
  }
  return v
}
