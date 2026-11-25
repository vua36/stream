import type { Input, Action } from '../engine/input'

export class TouchControls {
  private stickId: number | null = null
  private lookId: number | null = null
  private origin = { x: 0, y: 0 }
  private last = { x: 0, y: 0 }
  private readonly stick: HTMLElement
  private readonly knob: HTMLElement
  private readonly radius = 64

  constructor(root: HTMLElement, private readonly input: Input, private readonly active: () => boolean) {
    const layer = root.querySelector<HTMLElement>('.touch')!
    this.stick = layer.querySelector('.touch-stick')!
    this.knob = this.stick.querySelector('i')!
    const enableTouch = () => document.body.classList.add('has-touch')
    if (matchMedia('(pointer: coarse)').matches) enableTouch()
    window.addEventListener('touchstart', enableTouch, { once: true, passive: true })
    window.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch') {
        enableTouch()
        this.input.method = 'touch'
      }
    }, { capture: true, passive: true })

    const canvas = document.querySelector<HTMLCanvasElement>('#game')!
    canvas.addEventListener('contextmenu', event => event.preventDefault())
    canvas.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch' || !this.active()) return
      event.preventDefault()
      // Landscape mobile: joystick owns the right edge; the rest of the 3D view is camera look.
      if (event.clientX > window.innerWidth * 0.62 && this.stickId === null) {
        this.stickId = event.pointerId
        this.origin = { x: event.clientX, y: event.clientY }
        this.stick.style.left = `${event.clientX}px`
        this.stick.style.top = `${event.clientY}px`
        this.stick.classList.add('is-active')
        canvas.setPointerCapture?.(event.pointerId)
      } else if (this.lookId === null) {
        this.lookId = event.pointerId
        this.last = { x: event.clientX, y: event.clientY }
        canvas.setPointerCapture?.(event.pointerId)
      }
    }, { passive: false })

    window.addEventListener('pointermove', event => {
      if (event.pointerId === this.stickId) {
        event.preventDefault()
        let dx = event.clientX - this.origin.x
        let dy = event.clientY - this.origin.y
        const len = Math.hypot(dx, dy)
        if (len > this.radius) {
          dx = (dx / len) * this.radius
          dy = (dy / len) * this.radius
        }
        this.knob.style.transform = `translate(${dx}px, ${dy}px)`
        this.input.setTouchMove(dx / this.radius, -dy / this.radius)
      } else if (event.pointerId === this.lookId) {
        event.preventDefault()
        this.input.addTouchLook(event.clientX - this.last.x, event.clientY - this.last.y)
        this.last = { x: event.clientX, y: event.clientY }
      }
    }, { passive: false })

    const end = (event: PointerEvent) => {
      if (event.pointerId === this.stickId) {
        this.stickId = null
        this.knob.style.transform = ''
        this.stick.classList.remove('is-active')
        this.input.setTouchMove(0, 0)
      }
      if (event.pointerId === this.lookId) this.lookId = null
    }
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    window.addEventListener('blur', () => {
      this.stickId = null
      this.lookId = null
      this.knob.style.transform = ''
      this.stick.classList.remove('is-active')
      this.input.setTouchMove(0, 0)
    })

    for (const button of layer.querySelectorAll<HTMLElement>('[data-touch]')) {
      const action = button.dataset.touch as Action
      button.addEventListener('pointerdown', event => {
        event.preventDefault()
        event.stopPropagation()
        button.setPointerCapture?.(event.pointerId)
        button.classList.add('is-down')
        this.input.setTouchButton(action, true)
      }, { passive: false })
      const release = (event: Event) => {
        event.preventDefault()
        button.classList.remove('is-down')
        this.input.setTouchButton(action, false)
      }
      button.addEventListener('pointerup', release)
      button.addEventListener('pointercancel', release)
      button.addEventListener('lostpointercapture', release)
    }
  }
}
