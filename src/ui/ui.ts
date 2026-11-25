import type { Input } from '../engine/input'
import type { StreamerState } from '../game/game'
import type { RoomInteractable } from '../game/world'

export type Screen = 'boot' | 'title' | 'hud' | 'computer' | 'phone' | 'pause'

type Actions = {
  play(): void
  resume(): void
  quit(): void
  pause(): void
  startStream(topic: string, title: string, duration: number): void
  stopStream(): void
  orderFood(): void
  receiveOrder(): void
  eat(): void
  sleep(): void
  buyUpgrade(): void
  save(): void
  reset(): void
}

export class Ui {
  screen: Screen = 'boot'
  private bannerTimer = 0
  private readonly root: HTMLElement

  constructor(private readonly input: Input, private readonly actions: Actions) {
    this.root = document.getElementById('ui')!
    this.root.innerHTML = template()
    this.root.addEventListener('click', event => this.onClick(event))
    this.root.addEventListener('input', event => this.onInput(event))
    this.root.addEventListener('pointerdown', event => event.stopPropagation())
    this.root.addEventListener('contextmenu', event => event.preventDefault())
    window.addEventListener('resize', () => this.updateOrientation())
    window.addEventListener('orientationchange', () => this.updateOrientation())
    this.updateOrientation()
  }

  show(screen: Screen): void {
    this.screen = screen
    for (const el of this.root.querySelectorAll<HTMLElement>('[data-screen]')) {
      const active = el.dataset.screen === screen || (el.dataset.screen === 'hud' && screen === 'pause')
      el.classList.toggle('is-active', active)
      el.setAttribute('aria-hidden', String(!active))
    }
    this.root.dataset.activeScreen = screen
  }

  setBootProgress(progress: number): void {
    const bar = this.root.querySelector<HTMLElement>('.boot-bar i')
    if (bar) bar.style.transform = `scaleX(${Math.max(0.03, Math.min(1, progress))})`
  }

  updateHud(state: StreamerState, interaction: RoomInteractable | null): void {
    this.set('.money', `${Math.round(state.money).toLocaleString('vi-VN')} đ`)
    this.set('.followers', state.followers.toLocaleString('vi-VN'))
    this.set('.views', state.views.toLocaleString('vi-VN'))
    this.set('.day', `NGÀY ${state.day}`)
    this.set('.clock', formatTime(state.timeMinutes))
    this.set('.live-viewers', state.live ? `${state.liveViewers.toLocaleString('vi-VN')} đang xem` : 'Chưa phát sóng')
    this.set('.live-revenue', state.live ? `${Math.round(state.liveRevenue).toLocaleString('vi-VN')} đ` : '—')
    this.set('.live-timer', state.live ? `${Math.floor(state.liveElapsed)} / ${state.liveDuration} phút` : 'Sẵn sàng')
    this.set('.quality-value', `${Math.round(state.channelQuality)}%`)
    this.set('.inventory-value', `${state.inventoryFood} phần`)
    this.fill('.meter-hunger', state.hunger)
    this.fill('.meter-energy', state.energy)
    this.fill('.meter-mood', state.mood)
    this.fill('.meter-health', state.health)
    this.fill('.meter-comfort', state.comfort)
    const live = this.root.querySelector('.live-pill')
    live?.classList.toggle('is-live', state.live)
    this.set('.interaction-label', interaction ? `E · ${interaction.label}` : 'WASD · Di chuyển   |   Kéo màn hình · Xoay camera')
    this.set('.order-status', orderLabel(state))
    this.set('.phone-balance', `${Math.round(state.money).toLocaleString('vi-VN')} đ`)
    this.set('.upgrade-price', `${(420 + state.equipmentLevel * 280).toLocaleString('vi-VN')} đ`)
    const stop = this.root.querySelector<HTMLElement>('[data-action="stream-stop"]')
    const start = this.root.querySelector<HTMLElement>('[data-action="stream-start"]')
    stop?.classList.toggle('is-hidden', !state.live)
    start?.classList.toggle('is-hidden', state.live)
    this.updateOrientation()
  }

  interaction(id: RoomInteractable['id']): void {
    if (id === 'computer') this.show('computer')
    else if (id === 'phone') this.show('phone')
    else if (id === 'bed') this.actions.sleep()
    else if (id === 'door') this.actions.receiveOrder()
  }

  banner(text: string): void {
    const el = this.root.querySelector<HTMLElement>('.banner')!
    el.textContent = text
    el.classList.remove('show')
    void el.offsetWidth
    el.classList.add('show')
    this.bannerTimer = window.setTimeout(() => el.classList.remove('show'), 3200)
  }

  frame(dt: number): void {
    this.bannerTimer = Math.max(0, this.bannerTimer - dt * 1000)
    if (this.input.method === 'touch') document.body.classList.add('has-touch')
  }

  private onClick(event: MouseEvent): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')
    if (!target) return
    event.preventDefault()
    const action = target.dataset.action
    switch (action) {
      case 'play': this.actions.play(); break
      case 'resume': this.actions.resume(); break
      case 'pause': this.actions.pause(); break
      case 'quit': this.actions.quit(); break
      case 'close': this.show('hud'); break
      case 'phone': this.show('phone'); break
      case 'computer': this.show('computer'); break
      case 'stream-start': this.actions.startStream(this.value('[name="topic"]'), this.value('[name="stream-title"]'), Number(this.value('[name="duration"]')) || 8); break
      case 'stream-stop': this.actions.stopStream(); break
      case 'food-order': this.actions.orderFood(); break
      case 'order-receive': this.actions.receiveOrder(); break
      case 'eat': this.actions.eat(); break
      case 'sleep': this.actions.sleep(); break
      case 'upgrade': this.actions.buyUpgrade(); break
      case 'save': this.actions.save(); break
      case 'reset': if (window.confirm('Xóa toàn bộ tiến trình STREAMER LIFE?')) this.actions.reset(); break
    }
  }

  private onInput(event: Event): void {
    const input = event.target as HTMLInputElement
    if (input.name === 'duration') this.set('.duration-value', `${input.value} phút`)
  }

  private updateOrientation(): void {
    const portrait = window.innerHeight > window.innerWidth && window.innerWidth < 900
    this.root.classList.toggle('is-portrait', portrait)
  }

  private value(selector: string): string {
    return this.root.querySelector<HTMLInputElement>(selector)?.value.trim() ?? ''
  }

  private set(selector: string, value: string): void {
    const element = this.root.querySelector<HTMLElement>(selector)
    if (element && element.textContent !== value) element.textContent = value
  }

  private fill(selector: string, value: number): void {
    this.root.querySelector<HTMLElement>(selector)?.style.setProperty('transform', `scaleX(${Math.max(0, Math.min(1, value / 100))})`)
  }
}

function formatTime(minutes: number): string {
  const m = Math.floor(minutes) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`
}

function orderLabel(state: StreamerState): string {
  if (!state.order) return 'Chưa có đơn hàng'
  if (state.order.status === 'delivery') return `Đang giao · còn ${Math.ceil(state.order.eta)}s`
  if (state.order.status === 'delivered') return 'Đã đến cửa · đi nhận hàng'
  return `Đã nhận · ${state.inventoryFood} phần trong kho`
}

function template(): string {
  return /* html */ `
<div class="portrait-gate"><div class="rotate-icon">↻</div><strong>XOAY ĐIỆN THOẠI SANG NGANG</strong><span>STREAMER LIFE chỉ hỗ trợ chế độ màn hình ngang để điều khiển 3D chính xác.</span></div>
<section class="screen screen-boot is-active" data-screen="boot"><div class="boot-mark">STREAMER LIFE</div><div class="boot-sub">REAL WORLD · 3D SIMULATION</div><div class="boot-bar"><i></i></div><div class="boot-label">Đang tải phòng streamer 3D…</div></section>
<section class="screen screen-title" data-screen="title"><div class="title-glow"></div><div class="title-copy"><span class="eyebrow">REAL WORLD / V1 · OFFLINE</span><h1>STREAMER<br><em>LIFE</em></h1><p>Không gian sống. Nội dung thật. Sự nghiệp của bạn.</p><div class="title-tags"><span>THIRD PERSON</span><span>RIGGED HUMAN</span><span>MOBILE LANDSCAPE</span></div><button class="cta" data-action="play">BẮT ĐẦU CA TRỰC TIẾP <b>→</b></button></div><div class="title-mini"><span>Phòng 01</span><b>CREATOR LAB</b><small>Đang chờ bạn bước vào</small></div></section>
<section class="screen screen-hud" data-screen="hud"><div class="hud-top"><div class="brand-chip"><span class="brand-dot"></span><b>STREAMER LIFE</b><small>REAL WORLD</small></div><div class="day-chip"><span class="day"></span><strong class="clock"></strong></div><button class="icon-button" data-action="pause" aria-label="Tạm dừng">Ⅱ</button></div><div class="hud-left"><div class="channel-card"><div class="avatar-ring">SL</div><div><span class="eyebrow">KÊNH CỦA BẠN</span><strong>daily.dreamer</strong><small><span class="followers">18</span> followers · <span class="views">120</span> views</small></div></div><div class="cash-card"><span>SỐ DƯ NGÂN HÀNG</span><strong class="money">2.500 đ</strong></div></div><div class="hud-right"><div class="live-card"><div class="live-head"><span class="live-pill"><i></i><span>LIVE STATUS</span></span><span class="quality-value">28%</span></div><strong class="live-viewers">Chưa phát sóng</strong><div class="live-meta"><span class="live-timer">Sẵn sàng</span><span class="live-revenue">—</span></div></div><div class="needs-card"><div><span>ĐÓI</span><i class="meter"><b class="meter-hunger"></b></i></div><div><span>NĂNG LƯỢNG</span><i class="meter"><b class="meter-energy"></b></i></div><div><span>TÂM TRẠNG</span><i class="meter"><b class="meter-mood"></b></i></div></div></div><div class="hud-bottom"><div class="interaction-pill"><span class="key-hint">E</span><strong class="interaction-label">WASD · Di chuyển   |   Kéo màn hình · Xoay camera</strong></div><div class="mobile-actions"><button data-action="phone">▣<small>ĐIỆN THOẠI</small></button><button data-action="computer">▤<small>STREAM DESK</small></button></div></div><div class="banner"></div><div class="touch"><div class="touch-stick"><i></i></div><div class="touch-camera-hint">VUỐT ĐỂ XOAY CAMERA</div><button class="touch-btn touch-interact" data-touch="interact">E</button><button class="touch-btn touch-menu" data-action="phone">▣</button></div></section>
<section class="screen screen-panel" data-screen="computer"><div class="panel-window computer-window"><div class="panel-top"><div><span class="eyebrow">CONTROL ROOM / DESK 01</span><h2>STREAM DASHBOARD</h2></div><button class="close" data-action="close">×</button></div><div class="stream-layout"><div class="preview-frame"><div class="scanline"></div><span class="cam-label">WEBCAM / LIVE FEED</span><div class="preview-person">SL</div><span class="preview-status">1080P · RGB KEYLIGHT</span></div><div class="stream-form"><label>CHỦ ĐỀ<select name="topic"><option>Gaming</option><option>Just Chatting</option><option>Reaction</option><option>Thử thách</option><option>Review sản phẩm</option></select></label><label>TÊN BUỔI LIVE<input name="stream-title" maxlength="42" value="Đêm nay mình chơi thật chill" /></label><label>THỜI LƯỢNG <output class="duration-value">8 phút</output><input name="duration" type="range" min="2" max="20" value="8" /></label><div class="stream-actions"><button class="primary-button" data-action="stream-start">BẮT ĐẦU LIVESTREAM</button><button class="danger-button is-hidden" data-action="stream-stop">KẾT THÚC LIVESTREAM</button></div></div></div><div class="analytics-row"><div><span>CHẤT LƯỢNG KÊNH</span><b class="quality-value">28%</b></div><div><span>NGƯỜI XEM HIỆN TẠI</span><b class="live-viewers">Chưa phát sóng</b></div><div><span>DOANH THU LIVE</span><b class="live-revenue">—</b></div></div></div></section>
<section class="screen screen-panel" data-screen="phone"><div class="panel-window phone-window"><div class="panel-top"><div><span class="eyebrow">SMARTPHONE / PERSONAL</span><h2>MY DEVICE</h2></div><button class="close" data-action="close">×</button></div><div class="phone-head"><div><span>SỐ DƯ HIỆN TẠI</span><strong class="phone-balance">2.500 đ</strong></div><div class="phone-signal">5G<br><b>▰▰▰</b></div></div><div class="app-grid"><button data-action="food-order"><b>⌁</b><span>Food Delivery</span><small>Đặt bữa · 85 đ</small></button><button data-action="order-receive"><b>◷</b><span>Orders</span><small class="order-status">Chưa có đơn hàng</small></button><button data-action="eat"><b>◒</b><span>Kho đồ ăn</span><small><span class="inventory-value">0 phần</span></small></button><button data-action="computer"><b>◈</b><span>StreamTube</span><small>Quản lý kênh</small></button><button data-action="upgrade"><b>✦</b><span>Gear Store</span><small>Nâng cấp · <span class="upgrade-price">700 đ</span></small></button><button data-action="save"><b>⌂</b><span>Bank & Save</span><small>Lưu tiến trình</small></button></div><div class="phone-footer">Mọi giao dịch liên kết trực tiếp với số dư ngân hàng của bạn.</div></div></section>
<section class="screen screen-panel" data-screen="pause"><div class="panel-window pause-window"><span class="eyebrow">SESSION PAUSED</span><h2>TẠM DỪNG</h2><p>Phòng của bạn vẫn được lưu tự động.</p><div class="pause-actions"><button class="primary-button" data-action="resume">TIẾP TỤC</button><button data-action="save">LƯU THỦ CÔNG</button><button data-action="quit">VỀ MÀN HÌNH CHÍNH</button><button class="danger-button" data-action="reset">BẮT ĐẦU LẠI GAME</button></div></div></section>
</div>`
}
