import * as THREE from 'three'
import type { Audio } from '../engine/audio'
import type { Input } from '../engine/input'
import { Physics } from '../engine/physics'
import type { Renderer } from '../engine/renderer'
import type { Quality } from '../engine/save'
import { FollowCamera } from './camera'
import { CONFIG } from './config'
import { Player } from './player'
import { World, type RoomInteractable } from './world'

export type Mode = 'attract' | 'playing' | 'paused'

export type OrderState = {
  status: 'delivery' | 'delivered' | 'received'
  item: string
  eta: number
  price: number
}

export type StreamerState = {
  version: 1
  money: number
  followers: number
  views: number
  likes: number
  channelQuality: number
  reputation: number
  hunger: number
  energy: number
  mood: number
  health: number
  comfort: number
  day: number
  timeMinutes: number
  livestreams: number
  totalIncome: number
  totalExpenses: number
  equipmentLevel: number
  roomLevel: number
  inventoryFood: number
  order: OrderState | null
  live: boolean
  liveTopic: string
  liveTitle: string
  liveDuration: number
  liveElapsed: number
  liveViewers: number
  liveRevenue: number
}

export type GameHooks = {
  state(state: StreamerState, interaction: RoomInteractable | null): void
  interaction(id: RoomInteractable['id']): void
  banner(text: string): void
  assetError(label: string): void
}

const SAVE_KEY = 'streamlife.realworld.v1'

export class Game {
  mode: Mode = 'attract'
  reducedMotion = false
  private readonly physics: Physics
  private readonly world: World
  private readonly player: Player
  private readonly cam: FollowCamera
  private state: StreamerState
  private elapsed = 0
  private autosave = 0
  private titleOrbit = 0

  constructor(
    private readonly renderer: Renderer,
    private readonly input: Input,
    private readonly audio: Audio,
    private readonly hooks: GameHooks,
  ) {
    this.physics = new Physics(CONFIG.player.gravity)
    this.state = loadState()
    this.world = new World(this.physics, renderer.shadowMapSize, hooks.assetError)
    this.player = new Player(this.physics, this.world.spawn, hooks.assetError)
    this.cam = new FollowCamera(this.physics, this.player.collider)
    this.world.scene.add(this.player.root)
    this.cam.reset(this.world.spawn, Math.PI)
    this.world.setTime(this.state.timeMinutes)
  }

  get camera(): THREE.PerspectiveCamera {
    return this.cam.camera
  }

  get streamer(): StreamerState {
    return this.state
  }

  get interaction(): RoomInteractable | null {
    return this.world.nearestInteractable(this.player.position)
  }

  start(): void {
    this.audio.unlock()
    this.audio.startMusic()
    this.mode = 'playing'
    this.player.teleport(this.world.spawn)
    this.cam.reset(this.world.spawn, Math.PI)
    this.input.endFrame()
    this.input.takeLook()
    this.pushState()
  }

  pause(): void {
    if (this.mode === 'playing') this.mode = 'paused'
  }

  resume(): void {
    if (this.mode !== 'paused') return
    this.mode = 'playing'
    this.input.endFrame()
    this.input.takeLook()
  }

  toTitle(): void {
    this.mode = 'attract'
    this.input.endFrame()
    this.save()
  }

  reset(): void {
    this.state = defaultState()
    this.save()
    this.hooks.banner('Đã bắt đầu lại hành trình streamer')
    this.pushState()
  }

  setQuality(quality: Quality): void {
    this.renderer.applyQuality(quality)
    const size = this.renderer.shadowMapSize
    this.world.sun.shadow.map?.dispose()
    this.world.sun.shadow.map = null
    this.world.sun.shadow.mapSize.set(size, size)
    this.world.scene.traverse(object => {
      const material = (object as THREE.Mesh).material
      for (const m of Array.isArray(material) ? material : material ? [material] : []) m.needsUpdate = true
    })
  }

  step(dt: number): void {
    this.elapsed += dt
    this.world.setTime(this.state.timeMinutes)
    this.world.update(dt, this.player.position)
    if (this.mode !== 'playing') {
      this.physics.step(dt)
      return
    }

    this.player.step(dt, {
      moveX: this.input.move.x,
      moveY: this.input.move.y,
      sprint: this.input.held('sprint'),
    }, this.cam.yaw)
    this.physics.step(dt)

    const interaction = this.world.nearestInteractable(this.player.position)
    if (this.input.consume('interact') && interaction) this.hooks.interaction(interaction.id)

    const gameMinutes = dt * (this.state.live ? 4.2 : 2.2)
    this.advanceTime(gameMinutes)
    this.tickNeeds(dt)
    this.tickOrder(dt)
    this.tickLivestream(dt)

    this.autosave += dt
    if (this.autosave > 5) {
      this.autosave = 0
      this.save()
    }
    this.pushState(interaction)
  }

  render(alpha: number, frameSeconds: number): void {
    this.physics.sync(alpha)
    if (this.mode === 'attract') {
      this.titleOrbit += frameSeconds * 0.18
      const target = new THREE.Vector3(0, 1.15, -0.7)
      this.cam.camera.position.set(Math.sin(this.titleOrbit) * 10.5, 6.2, Math.cos(this.titleOrbit) * 10.5 - 0.5)
      this.cam.camera.lookAt(target)
    } else {
      const look = this.mode === 'playing' ? this.input.takeLook() : { x: 0, y: 0 }
      this.cam.update(this.player.root.position, look, frameSeconds, false, this.reducedMotion)
    }
    this.player.animate(frameSeconds)
    this.world.update(frameSeconds, this.player.position)
    this.renderer.render(this.world.scene, this.cam.camera)
  }

  startLivestream(topic: string, title: string, duration: number): void {
    if (this.state.live) return
    if (this.state.energy < 18 || this.state.hunger < 12) {
      this.hooks.banner('Cần ăn uống và nghỉ ngơi trước khi livestream')
      return
    }
    this.state.live = true
    this.state.liveTopic = topic
    this.state.liveTitle = title || `${topic} cùng mình tối nay`
    this.state.liveDuration = Math.max(2, Math.min(20, duration))
    this.state.liveElapsed = 0
    this.state.liveViewers = Math.max(3, Math.round(this.state.followers * 0.18 + this.state.channelQuality * 4 + Math.random() * 8))
    this.state.liveRevenue = 0
    this.hooks.banner(`Đang live: ${this.state.liveTitle}`)
    this.pushState()
  }

  stopLivestream(): void {
    if (!this.state.live) return
    const duration = Math.max(1, this.state.liveElapsed)
    const qualityFactor = THREE.MathUtils.clamp(this.state.channelQuality / 100, 0.45, 1.2)
    const followers = Math.max(1, Math.round(this.state.liveViewers * duration * 0.035 * qualityFactor))
    const views = Math.max(1, Math.round(this.state.liveViewers * duration * 1.7))
    const income = Math.max(1, Math.round(this.state.liveRevenue))
    this.state.followers += followers
    this.state.views += views
    this.state.money += income
    this.state.totalIncome += income
    this.state.livestreams += 1
    this.state.reputation = Math.min(100, this.state.reputation + qualityFactor * 1.2)
    this.state.live = false
    this.state.liveElapsed = 0
    this.hooks.banner(`Kết thúc live +${income.toLocaleString('vi-VN')} đ · +${followers} follow`)
    this.pushState()
    this.save()
  }

  openPhone(): void {
    this.hooks.interaction('phone')
  }

  orderFood(item = 'Cơm gà & cà phê', price = 85): void {
    if (this.state.order?.status === 'delivery' || this.state.order?.status === 'delivered') {
      this.hooks.banner('Bạn đang có một đơn hàng')
      return
    }
    if (this.state.money < price) {
      this.hooks.banner('Số dư không đủ để đặt món')
      return
    }
    this.state.money -= price
    this.state.totalExpenses += price
    this.state.order = { status: 'delivery', item, eta: 24, price }
    this.hooks.banner('Đơn hàng đang được giao đến cửa')
    this.pushState()
    this.save()
  }

  receiveOrder(): void {
    if (this.state.order?.status !== 'delivered') {
      this.hooks.banner('Đơn hàng chưa đến nơi')
      return
    }
    this.state.order.status = 'received'
    this.state.inventoryFood += 1
    this.hooks.banner('Đã nhận đồ ăn · Hãy mở kho và ăn khi cần')
    this.pushState()
    this.save()
  }

  eat(): void {
    if (this.state.inventoryFood <= 0) {
      this.hooks.banner('Kho đồ ăn đang trống')
      return
    }
    this.state.inventoryFood -= 1
    this.state.hunger = Math.min(100, this.state.hunger + 38)
    this.state.energy = Math.min(100, this.state.energy + 7)
    this.state.mood = Math.min(100, this.state.mood + 5)
    this.hooks.banner('Ăn uống xong · Độ đói và tâm trạng được hồi phục')
    this.pushState()
    this.save()
  }

  sleep(): void {
    if (this.state.live) this.stopLivestream()
    this.state.day += 1
    this.state.timeMinutes = 8 * 60
    this.state.energy = 100
    this.state.hunger = Math.max(0, this.state.hunger - 12)
    this.state.mood = Math.min(100, this.state.mood + 18)
    this.state.health = Math.min(100, this.state.health + 12)
    this.hooks.banner(`Ngày ${this.state.day} · Bạn đã ngủ đủ và bắt đầu ngày mới`)
    this.pushState()
    this.save()
  }

  buyUpgrade(): void {
    const price = 420 + this.state.equipmentLevel * 280
    if (this.state.money < price) {
      this.hooks.banner(`Cần ${price.toLocaleString('vi-VN')} đ để nâng cấp thiết bị`)
      return
    }
    this.state.money -= price
    this.state.totalExpenses += price
    this.state.equipmentLevel += 1
    this.state.channelQuality = Math.min(100, this.state.channelQuality + 9)
    this.state.comfort = Math.min(100, this.state.comfort + 6)
    this.state.mood = Math.min(100, this.state.mood + 4)
    this.hooks.banner('Thiết bị đã nâng cấp · Chất lượng phòng và kênh tăng')
    this.pushState()
    this.save()
  }

  saveManually(): void {
    this.save()
    this.hooks.banner('Đã lưu tiến trình game')
  }

  private tickNeeds(dt: number): void {
    this.state.hunger = Math.max(0, this.state.hunger - dt * (this.state.live ? 0.14 : 0.045))
    this.state.energy = Math.max(0, this.state.energy - dt * (this.state.live ? 0.22 : 0.025))
    const fatigue = this.state.energy < 18 || this.state.hunger < 15
    this.state.mood = THREE.MathUtils.clamp(this.state.mood + (fatigue ? -dt * 0.12 : dt * 0.015), 0, 100)
    this.state.health = THREE.MathUtils.clamp(this.state.health + (this.state.hunger < 8 ? -dt * 0.08 : dt * 0.008), 0, 100)
  }

  private tickLivestream(dt: number): void {
    if (!this.state.live) return
    const contentQuality = THREE.MathUtils.clamp(this.state.channelQuality * 0.58 + this.state.mood * 0.2 + this.state.energy * 0.16, 0, 100)
    const volatility = (Math.random() - 0.47) * 2.8
    this.state.liveViewers = Math.max(0, Math.round(this.state.liveViewers + (contentQuality - 52) * dt * 0.04 + volatility))
    this.state.liveRevenue += Math.max(0, this.state.liveViewers * 0.006 * (contentQuality / 70)) * dt
    this.state.liveElapsed += dt / 4
    if (this.state.liveElapsed >= this.state.liveDuration) this.stopLivestream()
  }

  private tickOrder(dt: number): void {
    const order = this.state.order
    if (!order || order.status !== 'delivery') return
    order.eta -= dt
    if (order.eta <= 0) {
      order.eta = 0
      order.status = 'delivered'
      this.hooks.banner('Shipper đã đến cửa · Đi tới cửa để nhận đồ')
    }
  }

  private advanceTime(minutes: number): void {
    this.state.timeMinutes += minutes
    if (this.state.timeMinutes >= 1440) {
      this.state.timeMinutes -= 1440
      this.state.day += 1
      this.hooks.banner(`Báo cáo ngày ${this.state.day - 1}: thu nhập và chi phí đã được ghi nhận`)
    }
  }

  private pushState(interaction = this.interaction): void {
    this.hooks.state({ ...this.state, order: this.state.order ? { ...this.state.order } : null }, interaction)
  }

  private save(): void {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.state)) } catch { /* private mode: keep in memory */ }
  }
}

export function defaultState(): StreamerState {
  return {
    version: 1,
    money: 2500,
    followers: 18,
    views: 120,
    likes: 34,
    channelQuality: 28,
    reputation: 12,
    hunger: 74,
    energy: 88,
    mood: 76,
    health: 94,
    comfort: 62,
    day: 1,
    timeMinutes: 9 * 60,
    livestreams: 0,
    totalIncome: 0,
    totalExpenses: 0,
    equipmentLevel: 1,
    roomLevel: 1,
    inventoryFood: 0,
    order: null,
    live: false,
    liveTopic: 'Gaming',
    liveTitle: '',
    liveDuration: 8,
    liveElapsed: 0,
    liveViewers: 0,
    liveRevenue: 0,
  }
}

function loadState(): StreamerState {
  const fallback = defaultState()
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as Partial<StreamerState> | null
    if (!parsed || parsed.version !== 1) return fallback
    return {
      ...fallback,
      ...parsed,
      order: parsed.order && (parsed.order.status === 'delivery' || parsed.order.status === 'delivered' || parsed.order.status === 'received') ? parsed.order : null,
      live: false,
      liveElapsed: 0,
      liveViewers: 0,
      liveRevenue: 0,
    }
  } catch {
    return fallback
  }
}
