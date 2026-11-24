import { describe, expect, it } from 'vitest'
import { t, setLocale } from '../src/engine/i18n'

describe('i18n', () => {
  it('returns English by default', () => {
    setLocale('en')
    expect(t('play')).toBeTruthy()
  })

  it('switches to zh-CN', () => {
    setLocale('zh-CN')
    expect(t('play')).toBeTruthy()
  })
})
