import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Physics } from '../engine/physics'

export type RoomInteractable = {
  id: 'computer' | 'bed' | 'phone' | 'door'
  label: string
  position: THREE.Vector3
  radius: number
}

/** Compatibility type retained for unused starter enemy modules. */
export type DroneRoute = { center: THREE.Vector3; radius: number; phase: number; dir: 1 | -1 }

export const ISLANDS: never[] = []

/** Small deterministic helper retained for the starter's test surface. */
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

export function planStones(): { x: number; z: number; top: number }[] {
  return []
}

const DESK_URL = new URL('../../assets/models/streamer-desk-setup.glb', import.meta.url).href

export class World {
  readonly scene = new THREE.Scene()
  readonly sun: THREE.DirectionalLight
  // Capsule center is 1 m above the floor (0.62 half-height + 0.38 radius).
  readonly spawn = new THREE.Vector3(0.8, 1.02, 3.5)
  readonly interactables: RoomInteractable[] = [
    { id: 'computer', label: 'Máy tính', position: new THREE.Vector3(-1.2, 1.1, -2.25), radius: 1.65 },
    { id: 'phone', label: 'Điện thoại', position: new THREE.Vector3(-4.4, 0.9, 2.0), radius: 1.45 },
    { id: 'bed', label: 'Giường ngủ', position: new THREE.Vector3(4.6, 0.85, 1.2), radius: 1.8 },
    { id: 'door', label: 'Cửa ra vào', position: new THREE.Vector3(6.7, 1.1, 3.45), radius: 1.7 },
  ]
  private readonly lights: THREE.PointLight[] = []
  private onAssetError?: (label: string) => void

  constructor(private readonly physics: Physics, shadowMapSize: number, onAssetError?: (label: string) => void) {
    this.onAssetError = onAssetError
    this.scene.background = new THREE.Color('#0b1020')
    this.scene.fog = new THREE.Fog('#10172c', 20, 42)

    this.scene.add(new THREE.HemisphereLight('#cfe6ff', '#161325', 1.15))
    this.sun = new THREE.DirectionalLight('#ffe4c2', 2.5)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize)
    this.sun.shadow.camera.left = -14
    this.sun.shadow.camera.right = 14
    this.sun.shadow.camera.top = 14
    this.sun.shadow.camera.bottom = -14
    this.sun.shadow.camera.near = 0.5
    this.sun.shadow.camera.far = 38
    this.sun.shadow.bias = -0.00035
    this.sun.shadow.normalBias = 0.04
    this.scene.add(this.sun, this.sun.target)

    this.buildRoomShell()
    this.buildWindow()
    this.buildBed()
    this.buildWardrobe()
    this.buildPhoneTable()
    this.loadDeskSetup()
    this.buildLighting()
  }

  setTime(minutes: number): void {
    const day = (minutes % 1440) / 1440
    const daylight = THREE.MathUtils.clamp(Math.sin((day - 0.25) * Math.PI * 2) * 0.5 + 0.5, 0.08, 1)
    this.sun.intensity = 0.45 + daylight * 2.1
    this.sun.color.setHSL(0.08, 0.55, 0.72 + daylight * 0.1)
    for (const light of this.lights) light.intensity = light.userData.baseIntensity * (0.65 + (1 - daylight) * 0.6)
    this.scene.background = new THREE.Color().setHSL(0.65, 0.38, 0.05 + daylight * 0.09)
    if (this.scene.fog) (this.scene.fog as THREE.Fog).color.copy(this.scene.background as THREE.Color)
  }

  update(_dt: number, focus: THREE.Vector3): void {
    this.sun.position.set(focus.x - 8, focus.y + 16, focus.z + 10)
    this.sun.target.position.set(0, 0, 0)
  }

  nearestInteractable(position: THREE.Vector3): RoomInteractable | null {
    let best: RoomInteractable | null = null
    let distance = Infinity
    for (const item of this.interactables) {
      const d = position.distanceTo(item.position)
      if (d < item.radius && d < distance) {
        distance = d
        best = item
      }
    }
    return best
  }

  private buildRoomShell(): void {
    const floor = new THREE.Mesh(
      new RoundedBoxGeometry(16, 0.22, 12, 5, 0.08),
      new THREE.MeshStandardMaterial({ color: '#29263a', roughness: 0.72, metalness: 0.08 }),
    )
    floor.position.y = -0.12
    floor.receiveShadow = true
    this.scene.add(floor)
    this.physics.addStaticBox(new THREE.Vector3(0, -0.14, 0), new THREE.Vector3(16, 0.22, 12))

    const wallMat = new THREE.MeshStandardMaterial({ color: '#25253b', roughness: 0.82, metalness: 0.02 })
    const trimMat = new THREE.MeshStandardMaterial({ color: '#3f3a5c', roughness: 0.55, metalness: 0.2 })
    const back = this.wall(new THREE.Vector3(0, 2.5, -6), new THREE.Vector3(16, 5, 0.22), wallMat)
    const left = this.wall(new THREE.Vector3(-8, 2.5, 0), new THREE.Vector3(0.22, 5, 12), wallMat)
    const right = this.wall(new THREE.Vector3(8, 2.5, 0), new THREE.Vector3(0.22, 5, 12), wallMat)
    this.physics.addStaticBox(back.position, new THREE.Vector3(16, 5, 0.22))
    this.physics.addStaticBox(left.position, new THREE.Vector3(0.22, 5, 12))
    this.physics.addStaticBox(right.position, new THREE.Vector3(0.22, 5, 12))

    const ceiling = this.wall(new THREE.Vector3(0, 5.15, 0), new THREE.Vector3(16, 0.18, 12), new THREE.MeshStandardMaterial({ color: '#15172a', roughness: 0.9 }))
    ceiling.receiveShadow = true
    for (const x of [-7.7, 7.7]) this.addTrim(new THREE.Vector3(x, 0.28, 0), new THREE.Vector3(0.08, 0.22, 11.6), trimMat)
    this.addTrim(new THREE.Vector3(0, 0.28, -5.82), new THREE.Vector3(15.6, 0.22, 0.08), trimMat)
    void ceiling
  }

  private wall(position: THREE.Vector3, size: THREE.Vector3, material: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(size.x, size.y, size.z, 5, 0.06), material)
    mesh.position.copy(position)
    mesh.receiveShadow = true
    this.scene.add(mesh)
    return mesh
  }

  private addTrim(position: THREE.Vector3, size: THREE.Vector3, material: THREE.Material): void {
    const trim = new THREE.Mesh(new RoundedBoxGeometry(size.x, size.y, size.z, 4, 0.03), material)
    trim.position.copy(position)
    trim.castShadow = true
    trim.receiveShadow = true
    this.scene.add(trim)
  }

  private buildWindow(): void {
    const frameMat = new THREE.MeshStandardMaterial({ color: '#9a6f4e', roughness: 0.45, metalness: 0.08 })
    const glassMat = new THREE.MeshPhysicalMaterial({ color: '#58a8d6', roughness: 0.12, metalness: 0.05, transmission: 0.1, transparent: true, opacity: 0.72, emissive: '#10294a', emissiveIntensity: 0.22 })
    const group = new THREE.Group()
    group.position.set(3.7, 3.2, -5.82)
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(3.25, 2.15), glassMat)
    group.add(glass)
    for (const [x, y, sx, sy] of [[0, 1.1, 3.55, 0.14], [0, -1.1, 3.55, 0.14], [-1.7, 0, 0.14, 2.35], [1.7, 0, 0.14, 2.35], [0, 0, 0.1, 2.2]] as const) {
      const bar = new THREE.Mesh(new RoundedBoxGeometry(sx, sy, 0.14, 4, 0.03), frameMat)
      bar.position.set(x, y, 0.04)
      group.add(bar)
    }
    const curtainMat = new THREE.MeshStandardMaterial({ color: '#8c4169', roughness: 0.72, side: THREE.DoubleSide })
    for (const x of [-2.15, 2.15]) {
      const curtain = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 2.65, 4, 8), curtainMat)
      curtain.position.set(x, 0, 0.1)
      curtain.rotation.y = x < 0 ? -0.08 : 0.08
      group.add(curtain)
    }
    group.traverse(o => { o.castShadow = true; o.receiveShadow = true })
    this.scene.add(group)
  }

  private buildBed(): void {
    const group = new THREE.Group()
    group.position.set(4.7, 0, 1.15)
    const wood = new THREE.MeshStandardMaterial({ color: '#593d39', roughness: 0.62, metalness: 0.08 })
    const fabric = new THREE.MeshStandardMaterial({ color: '#46466b', roughness: 0.9 })
    const white = new THREE.MeshStandardMaterial({ color: '#d8d2e5', roughness: 0.84 })
    const frame = new THREE.Mesh(new RoundedBoxGeometry(4.8, 0.38, 2.65, 6, 0.14), wood)
    frame.position.y = 0.35
    const mattress = new THREE.Mesh(new RoundedBoxGeometry(4.45, 0.48, 2.3, 8, 0.18), fabric)
    mattress.position.y = 0.76
    const blanket = new THREE.Mesh(new RoundedBoxGeometry(2.6, 0.12, 2.1, 6, 0.12), white)
    blanket.position.set(0.8, 1.06, 0.1)
    const pillow = new THREE.Mesh(new RoundedBoxGeometry(1.28, 0.18, 0.82, 6, 0.22), white)
    pillow.position.set(-1.35, 1.08, -0.43)
    const headboard = new THREE.Mesh(new RoundedBoxGeometry(0.28, 2.6, 2.7, 6, 0.12), wood)
    headboard.position.set(-2.25, 1.3, 0)
    group.add(frame, mattress, blanket, pillow, headboard)
    group.traverse(o => { o.castShadow = true; o.receiveShadow = true })
    this.scene.add(group)
    this.physics.addStaticBox(new THREE.Vector3(4.7, 0.55, 1.15), new THREE.Vector3(4.8, 1.15, 2.65))
  }

  private buildWardrobe(): void {
    const group = new THREE.Group()
    group.position.set(-5.9, 0, -3.95)
    const wood = new THREE.MeshStandardMaterial({ color: '#43334d', roughness: 0.55, metalness: 0.15 })
    const panel = new THREE.MeshStandardMaterial({ color: '#262638', roughness: 0.36, metalness: 0.3 })
    const body = new THREE.Mesh(new RoundedBoxGeometry(3.15, 4.35, 0.86, 8, 0.14), wood)
    body.position.y = 2.18
    const left = new THREE.Mesh(new RoundedBoxGeometry(1.44, 3.82, 0.12, 5, 0.06), panel)
    const right = left.clone()
    left.position.set(-0.75, 2.17, -0.48)
    right.position.set(0.75, 2.17, -0.48)
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.4, 16), new THREE.MeshStandardMaterial({ color: '#b9a6cb', metalness: 0.7, roughness: 0.22 }))
    rail.rotation.z = Math.PI / 2
    rail.position.set(0, 3.35, -0.56)
    const handleMat = new THREE.MeshStandardMaterial({ color: '#d8b47a', metalness: 0.65, roughness: 0.28 })
    for (const x of [-0.35, 0.35]) {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.32, 12), handleMat)
      handle.rotation.z = Math.PI / 2
      handle.position.set(x, 2.2, -0.62)
      group.add(handle)
    }
    group.add(body, left, right, rail)
    group.traverse(o => { o.castShadow = true; o.receiveShadow = true })
    this.scene.add(group)
    this.physics.addStaticBox(new THREE.Vector3(-5.9, 2.15, -3.95), new THREE.Vector3(3.15, 4.35, 0.86))
  }

  private buildPhoneTable(): void {
    const group = new THREE.Group()
    group.position.set(-4.4, 0, 2.0)
    const wood = new THREE.MeshStandardMaterial({ color: '#7c573d', roughness: 0.64 })
    const top = new THREE.Mesh(new RoundedBoxGeometry(1.65, 0.16, 1.2, 5, 0.08), wood)
    top.position.y = 0.85
    group.add(top)
    for (const x of [-0.62, 0.62]) for (const z of [-0.38, 0.38]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.85, 12), wood)
      leg.position.set(x, 0.42, z)
      group.add(leg)
    }
    const phone = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.04, 0.72, 5, 0.06), new THREE.MeshStandardMaterial({ color: '#141521', metalness: 0.35, roughness: 0.18, emissive: '#172f55', emissiveIntensity: 0.28 }))
    phone.rotation.y = -0.18
    phone.position.set(0, 0.97, 0)
    group.add(phone)
    group.traverse(o => { o.castShadow = true; o.receiveShadow = true })
    this.scene.add(group)
    this.physics.addStaticBox(new THREE.Vector3(-4.4, 0.45, 2), new THREE.Vector3(1.65, 0.9, 1.2))
  }

  private loadDeskSetup(): void {
    const loader = new GLTFLoader()
    loader.load(DESK_URL, gltf => {
      const object = gltf.scene
      const box = new THREE.Box3().setFromObject(object)
      const size = box.getSize(new THREE.Vector3())
      // Keep the furniture at a believable room scale: the human avatar is about 2.1 m tall.
      const factor = 3.8 / Math.max(size.x, size.z, 0.01)
      object.scale.setScalar(factor)
      const fitted = new THREE.Box3().setFromObject(object)
      object.position.set(-1.0, -fitted.min.y + 0.02, -2.45)
      object.traverse(child => {
        child.castShadow = true
        child.receiveShadow = true
        if (child instanceof THREE.Mesh) {
          child.material = Array.isArray(child.material) ? child.material.map(m => m.clone()) : child.material.clone()
        }
      })
      this.scene.add(object)
    }, undefined, () => this.onAssetError?.('Bộ nội thất streamer'))
    this.physics.addStaticBox(new THREE.Vector3(-1.0, 0.52, -2.45), new THREE.Vector3(3.7, 1.04, 1.7))
  }

  private buildLighting(): void {
    const key = new THREE.PointLight('#74ddff', 4.2, 9, 2)
    key.position.set(-1.2, 3.1, -2.7)
    key.castShadow = true
    key.userData.baseIntensity = 4.2
    const magenta = new THREE.PointLight('#ef4aa5', 3.4, 8, 2)
    magenta.position.set(5.5, 2.4, -4.8)
    magenta.userData.baseIntensity = 3.4
    const warm = new THREE.PointLight('#ffc47a', 2.3, 7, 2)
    warm.position.set(4.9, 3.7, 1.8)
    warm.userData.baseIntensity = 2.3
    this.lights.push(key, magenta, warm)
    this.scene.add(key, magenta, warm)
  }
}
