import { describe, expect, it } from 'vitest'
import { tr } from './i18n'
import { UK } from './uk'

describe('tr', () => {
  it('returns English source unchanged', () => {
    expect(tr(UK, 'en', 'Theme')).toBe('Theme')
  })
  it('translates and interpolates', () => {
    expect(tr({ 'a {0} b {1}': 'x {1} y {0}' }, 'uk', 'a {0} b {1}', 1, 2)).toBe('x 2 y 1')
  })
  it('falls back to the source for unknown strings', () => {
    expect(tr(UK, 'uk', 'No such string {0}', 5)).toBe('No such string 5')
  })
  it('translates the shared chrome', () => {
    expect(tr(UK, 'uk', 'Theme')).toBe('Тема')
  })
})
