import './styles/main.css'
import { Audio } from './engine/audio'
import { Input } from './engine/input'
import { GameLoop } from './engine/loop'
import { TouchControls } from './ui/touch'
import { Ui } from './ui/ui'
import type { Game } from './game/game'

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game')!
  const input = new Input(canvas)
  const audio = new Audio()
  let game: Game | undefined
  let loop: GameLoop | undefined
  let bootReady = false

  const ui = new Ui(input, {
    play: () => {
      if (isPortrait()) {
        ui.banner('Hãy xoay điện thoại sang ngang để bắt đầu')
        return
      }
      game?.start()
      ui.show('hud')
      loop?.resetAccumulator()
      input.lockPointer()
    },
    resume: () => {
      game?.resume()
      ui.show('hud')
      loop?.resetAccumulator()
      input.lockPointer()
    },
    pause: () => {
      if (game?.mode !== 'playing') return
      game.pause()
      ui.show('pause')
      input.unlockPointer()
    },
    quit: () => {
      game?.toTitle()
      ui.show('title')
      input.unlockPointer()
    },
    startStream: (topic, title, duration) => game?.startLivestream(topic, title, duration),
    stopStream: () => game?.stopLivestream(),
    orderFood: () => game?.orderFood(),
    receiveOrder: () => game?.receiveOrder(),
    eat: () => game?.eat(),
    sleep: () => game?.sleep(),
    buyUpgrade: () => game?.buyUpgrade(),
    save: () => game?.saveManually(),
    reset: () => game?.reset(),
  })
  ui.show('boot')
  ui.setBootProgress(0.08)

  try {
    const [{ Game }, { Renderer, suggestQuality }, physics] = await Promise.all([
      import('./game/game'),
      import('./engine/renderer'),
      import('./engine/physics'),
      document.fonts.ready,
    ])
    ui.setBootProgress(0.36)
    await physics.initPhysics()
    ui.setBootProgress(0.6)
    const renderer = new Renderer(canvas, suggestQuality())
    game = new Game(renderer, input, audio, {
      state: (state, interaction) => ui.updateHud(state, interaction),
      interaction: id => ui.interaction(id),
      banner: text => ui.banner(text),
      assetError: label => ui.banner(`${label} chưa tải được — kiểm tra lại asset GLB`),
    })
    ui.setBootProgress(1)
    bootReady = true
    loop = new GameLoop({
      beforeFrame: frameSeconds => input.update(frameSeconds),
      step: dt => game?.step(dt),
      render: (alpha, frameSeconds) => {
        ui.frame(frameSeconds)
        const portrait = isPortrait()
        if (loop) loop.paused = portrait || game?.mode === 'paused'
        game?.render(alpha, frameSeconds)
        if (game) ui.updateHud(game.streamer, game.interaction)
      },
    })
    loop.start()
    new TouchControls(document.getElementById('ui')!, input, () => game?.mode === 'playing' && !isPortrait())
    window.addEventListener('game:pause', () => {
      if (game?.mode === 'playing') {
        game.pause()
        ui.show('pause')
        input.unlockPointer()
      }
    })
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && game?.mode === 'playing') {
        game.pause()
        ui.show('pause')
        input.unlockPointer()
      }
    })
    canvas.addEventListener('click', () => {
      if (game?.mode === 'playing' && !isPortrait()) input.lockPointer()
    })
    ;(window as unknown as { __game: unknown }).__game = { game, ui, input }
    window.setTimeout(() => ui.show('title'), 420)
  } catch (error) {
    console.error(error)
    ui.banner(`Không thể khởi động game: ${String((error as Error)?.message ?? error)}`)
  } finally {
    if (!bootReady) ui.setBootProgress(1)
  }
}

function isPortrait(): boolean {
  return window.innerHeight > window.innerWidth && window.innerWidth < 900
}

window.addEventListener('contextmenu', event => event.preventDefault(), { capture: true })
document.addEventListener('selectstart', event => {
  if (!(event.target as HTMLElement | null)?.closest('input, textarea')) event.preventDefault()
})
document.addEventListener('dragstart', event => event.preventDefault())

boot().catch(error => console.error(error))
