import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright'

const port = 4300 + Math.floor(Math.random() * 500)
const url = `http://127.0.0.1:${port}/`
const out = process.env.SHOTS_DIR ?? 'shots'
mkdirSync(out, { recursive: true })
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
let browser
const errors = []
const guard = setTimeout(() => fail('timed out'), 120_000)
function cleanup() { clearTimeout(guard); try { server.kill('SIGTERM') } catch {} }
async function fail(message) {
  console.error(`smoke: FAIL — ${message}`)
  await browser?.close().catch(() => {})
  cleanup()
  process.exit(1)
}
async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(url)).ok) return } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('preview server did not start')
}
async function clickAction(page, selector) { await page.locator(selector).evaluate(element => element.click()) }
async function newPage(context) {
  const page = await context.newPage()
  page.on('console', message => message.type() === 'error' && errors.push(message.text()))
  page.on('pageerror', error => errors.push(String(error)))
  page.on('response', response => response.status() >= 400 && errors.push(`HTTP ${response.status()} ${response.url()}`))
  await page.goto(url)
  await page.waitForSelector('[data-screen="title"].is-active', { timeout: 30_000 })
  return page
}
const state = page => page.evaluate(() => {
  const game = window.__game.game
  const player = game.player
  const position = player.root.position
  return { mode: game.mode, live: game.streamer.live, money: game.streamer.money, order: game.streamer.order, pos: { x: position.x, z: position.z } }
})

try {
  await waitForServer()
  browser = await chromium.launch({ args: ['--ignore-gpu-blocklist'] }).catch(() => chromium.launch({ args: ['--ignore-gpu-blocklist'], channel: 'chrome' }))
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const page = await newPage(desktop)
  await page.screenshot({ path: `${out}/01-title.png` })
  await clickAction(page, '[data-action="play"]')
  await page.waitForSelector('[data-screen="hud"].is-active')
  const before = await state(page)
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(900)
  await page.keyboard.up('KeyW')
  const afterMove = await state(page)
  const moved = Math.hypot(afterMove.pos.x - before.pos.x, afterMove.pos.z - before.pos.z)
  if (afterMove.mode !== 'playing' || moved < 0.2) throw new Error(`3D movement failed (${moved.toFixed(2)}m)`)
  await page.screenshot({ path: `${out}/02-gameplay.png` })

  await clickAction(page, '[data-screen="hud"] [data-action="computer"]')
  await page.waitForSelector('[data-screen="computer"].is-active')
  await clickAction(page, '[data-action="stream-start"]')
  await page.waitForTimeout(500)
  if (!(await state(page)).live) throw new Error('livestream did not start')
  await page.screenshot({ path: `${out}/03-livestream.png` })
  await clickAction(page, '[data-action="stream-stop"]')
  await clickAction(page, '[data-screen="computer"] [data-action="close"]')
  await page.waitForSelector('[data-screen="hud"].is-active')

  await clickAction(page, '[data-screen="hud"] .mobile-actions [data-action="phone"]')
  await page.waitForSelector('[data-screen="phone"].is-active')
  await clickAction(page, '[data-action="food-order"]')
  await page.waitForTimeout(250)
  if (!(await state(page)).order || (await state(page)).order.status !== 'delivery') throw new Error('food order did not start')
  await page.evaluate(() => { window.__game.game.state.order.eta = 0.01 })
  await page.waitForTimeout(350)
  await clickAction(page, '[data-action="order-receive"]')
  await clickAction(page, '[data-action="eat"]')
  await clickAction(page, '[data-screen="phone"] [data-action="save"]')
  await page.screenshot({ path: `${out}/04-phone.png` })
  await clickAction(page, '[data-screen="phone"] [data-action="close"]')
  await clickAction(page, '[data-action="pause"]')
  await page.waitForSelector('[data-screen="pause"].is-active')
  await clickAction(page, '[data-screen="pause"] [data-action="save"]')
  await clickAction(page, '[data-action="resume"]')
  if ((await state(page)).mode !== 'playing') throw new Error('resume failed')
  await desktop.close()

  const phone = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const mobile = await newPage(phone)
  await mobile.tap('[data-action="play"]')
  await mobile.waitForSelector('[data-screen="hud"].is-active')
  const portraitGate = await mobile.locator('.portrait-gate').isVisible()
  if (portraitGate) throw new Error('landscape viewport incorrectly blocked')
  await mobile.screenshot({ path: `${out}/05-mobile-landscape.png` })
  await phone.close()
  if (errors.length) throw new Error(`console errors:\n  ${errors.join('\n  ')}`)
  await browser.close()
  cleanup()
  console.log(`smoke: OK — moved ${moved.toFixed(2)}m; screenshots in ${out}/`)
} catch (error) {
  await fail(error?.message ?? String(error))
}
