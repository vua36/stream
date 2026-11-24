import { describe, expect, it } from 'vitest'
import { applyRules, type GameState } from '../src/game/rules'

const base = (): GameState => ({
  score: 0,
  lives: 3,
  time: 0,
  collected: 0,
  status: 'playing',
})

describe('rules', () => {
  it('increments score on collect', () => {
    const s = base()
    applyRules(s, { type: 'collect', value: 10 })
    expect(s.score).toBe(10)
    expect(s.collected).toBe(1)
  })

  it('decrements lives and can end game', () => {
    const s = base()
    applyRules(s, { type: 'hit' })
    expect(s.lives).toBe(2)
    applyRules(s, { type: 'hit' })
    applyRules(s, { type: 'hit' })
    expect(s.lives).toBe(0)
    expect(s.status).toBe('dead')
  })
})
