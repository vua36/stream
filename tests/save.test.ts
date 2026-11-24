import { describe, expect, it } from 'vitest'
import { defaultSave, insertScore, LEADERBOARD_SIZE, parseSave, SAVE_KEY, SaveStore } from '../src/engine/save'

describe('save', () => {
  it('falls back to defaults for missing, corrupt or foreign data', () => {
    expect(parseSave(null)).toEqual(defaultSave())
    expect(parseSave('')).toEqual(defaultSave())
    expect(parseSave('{')).toEqual(defaultSave())
    expect(parseSave('{"v":2}')).toEqual(defaultSave())
  })

  it('round-trips a valid save', () => {
    const s = defaultSave()
    s.highScore = 42
    s.leaderboard = [{ score: 42, at: 1 }]
    const store = new SaveStore()
    store.write(s)
    expect(store.read()).toEqual(s)
  })

  it('insertScore keeps top N and sorts', () => {
    const board = []
    for (let i = 0; i < LEADERBOARD_SIZE + 2; i++) {
      insertScore(board, i * 10)
    }
    expect(board).toHaveLength(LEADERBOARD_SIZE)
    expect(board[0].score).toBe((LEADERBOARD_SIZE + 1) * 10)
    expect(board[LEADERBOARD_SIZE - 1].score).toBe(20)
  })
})
