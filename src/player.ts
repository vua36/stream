import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RAPIER, type Physics } from '../engine/physics'
import { CONFIG } from './config'

const CHARACTER_URL = new URL('../../assets/models/streamer-character-animated.glb', import.meta.url).href
const UP = new THREE.Vector3(0, 1, 0)
const CHARACTER_HEIGHT = 2.28
const CAPSULE_HALF_HEIGHT = 0.75
const CAPSULE_RADIUS = 0.38

type PlayerIntent = { moveX: number; moveY: number; sprint: boolean }
type Activity = 'none' | 'computer'

export class Player {
  readonly root = new THREE.Group()
  readonly body: RAPIER.RigidBody
  readonly collider: RAPIER.Collider
  readonly velocity = new THREE.Vector3()
  readonly safe = new THREE.Vector3()
  grounded = true
  facing = Math.PI
  private readonly controller: RAPIER.KinematicCharacterController
  private readonly model = new THREE.Group()
  private mixer?: THREE.AnimationMixer
  private actions = new Map<string, THREE.AnimationAction>()
  private activeAction?: THREE.AnimationAction
  private loaded = false
  private loadError = false
  private walkBlend = 0
  private activity: Activity = 'none'
  private activityProgress = 0
  private characterObject?: THREE.Object3D
  private readonly appliedPose = new Map<string, THREE.Vector3>()

  constructor(private readonly physics: Physics, spawn: THREE.Vector3, private readonly onAssetError?: (label: string) => void) {
    const P = CONFIG.player
    this.body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y, spawn.z))
    this.collider = physics.world.createCollider(RAPIER.ColliderDesc.capsule(CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS).setFriction(0.1), this.body)
    this.controller = physics.world.createCharacterController(0.02)
    this.controller.enableAutostep(0.3, 0.22, false)
    this.controller.enableSnapToGround(0.32)
    this.controller.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(42))
    this.controller.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(34))
    this.root.position.copy(spawn)
    this.safe.copy(spawn)
    this.root.add(this.model)
    physics.bind(this.body, this.root)
    this.loadCharacter()
    void P
  }

  get position(): THREE.Vector3 {
    const t = this.body.translation()
    return new THREE.Vector3(t.x, t.y, t.z)
  }

  get isLoaded(): boolean {
    return this.loaded
  }

  get isUsingComputer(): boolean {
    return this.activity === 'computer'
  }

  setActivity(activity: Activity): void {
    this.activity = activity
  }

  step(dt: number, intent: PlayerIntent, cameraYaw: number): void {
    const P = CONFIG.player
    const currentAtStart = this.body.translation()
    if (this.grounded && currentAtStart.y > 0.6 && Math.abs(currentAtStart.x) < 7.35 && Math.abs(currentAtStart.z) < 5.35) {
      this.safe.set(currentAtStart.x, currentAtStart.y, currentAtStart.z)
    }
    const forward = new THREE.Vector3(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw))
    const right = new THREE.Vector3().crossVectors(forward, UP)
    const blocked = this.activity === 'computer'
    const wish = new THREE.Vector3().addScaledVector(right, blocked ? 0 : intent.moveX).addScaledVector(forward, blocked ? 0 : intent.moveY)
    const length = Math.min(1, wish.length())
    if (length > 0.01) wish.normalize()
    const speed = (intent.sprint ? 5.8 : 4.05) * length
    const target = wish.multiplyScalar(speed)
    const horizontal = new THREE.Vector3(this.velocity.x, 0, this.velocity.z)
    horizontal.lerp(target, 1 - Math.exp(-22 * dt))
    this.velocity.x = horizontal.x
    this.velocity.z = horizontal.z
    if (length > 0.08) this.facing = dampAngle(this.facing, Math.atan2(-this.velocity.x, -this.velocity.z), 12, dt)
    this.velocity.y = Math.max(-18, this.velocity.y + P.gravity * dt)
    const desired = this.velocity.clone().multiplyScalar(dt)
    this.controller.computeColliderMovement(this.collider, desired)
    const moved = this.controller.computedMovement()
    const previousGrounded = this.grounded
    this.grounded = this.controller.computedGrounded()
    if (this.grounded) {
      if (this.velocity.y < 0) this.velocity.y = -1
      if (!previousGrounded) this.safe.set(this.body.translation().x, this.body.translation().y, this.body.translation().z)
    }
    const current = this.body.translation()
    const next = {
      x: THREE.MathUtils.clamp(current.x + moved.x, -7.35, 7.35),
      y: current.y + moved.y,
      z: THREE.MathUtils.clamp(current.z + moved.z, -5.35, 5.35),
    }
    if (!Number.isFinite(next.x) || !Number.isFinite(next.y) || !Number.isFinite(next.z) || next.y < 0.35) {
      this.teleport(this.safe)
      return
    }
    this.body.setNextKinematicTranslation(next)
  }

  animate(frameSeconds: number): void {
    const speed = Math.hypot(this.velocity.x, this.velocity.z)
    this.model.rotation.y = 0
    this.root.rotation.y = this.facing
    this.walkBlend = THREE.MathUtils.damp(this.walkBlend, speed > 0.12 ? 1 : 0, 10, frameSeconds)
    this.mixer?.update(frameSeconds)
    const walk = findAction(this.actions, ['walk', 'walking', 'run'])
    const idle = findAction(this.actions, ['idle', 'standing', 'stand'])
    if (walk && idle) {
      if (this.walkBlend > 0.08 && this.activeAction !== walk) this.switchAction(walk, 0.22)
      if (this.walkBlend <= 0.08 && this.activeAction !== idle) this.switchAction(idle, 0.28)
      if (this.activeAction === walk) walk.setEffectiveTimeScale(THREE.MathUtils.clamp(speed / 3.25, 0.75, 1.45))
    } else if (walk && this.walkBlend > 0.08 && this.activeAction !== walk) {
      this.switchAction(walk, 0.2)
    } else if (idle && this.walkBlend <= 0.08 && this.activeAction !== idle) {
      this.switchAction(idle, 0.25)
    }
    this.activityProgress = THREE.MathUtils.damp(this.activityProgress, this.activity === 'computer' ? 1 : 0, 7.5, frameSeconds)
    this.applyComputerPose()
    if (!this.loaded && !this.loadError) this.model.visible = false
  }

  teleport(to: THREE.Vector3): void {
    this.body.setTranslation(to, true)
    this.body.setNextKinematicTranslation(to)
    this.velocity.set(0, 0, 0)
    this.root.position.copy(to)
    this.physics.snap(this.body)
  }

  private loadCharacter(): void {
    const loader = new GLTFLoader()
    loader.load(CHARACTER_URL, gltf => {
      const object = gltf.scene
      const bounds = new THREE.Box3().setFromObject(object)
      const size = bounds.getSize(new THREE.Vector3())
      const scale = CHARACTER_HEIGHT / Math.max(size.y, 0.01)
      object.scale.setScalar(scale)
      const fitted = new THREE.Box3().setFromObject(object)
      // The physics body is centered on the capsule. Put the rendered feet on the
      // capsule's bottom rather than at the body's origin; this removes the visible float.
      object.position.y = -(CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS) - fitted.min.y
      object.traverse(child => {
        child.castShadow = true
        child.receiveShadow = true
      })
      this.characterObject = object
      this.model.add(object)
      this.mixer = new THREE.AnimationMixer(object)
      for (const clip of gltf.animations) this.actions.set(clip.name.toLowerCase(), this.mixer.clipAction(clip))
      this.loaded = true
      this.model.visible = true
      const idle = findAction(this.actions, ['idle', 'standing', 'stand']) ?? [...this.actions.values()][0]
      if (idle) this.switchAction(idle, 0)
    }, undefined, () => {
      this.loadError = true
      this.onAssetError?.('Model nhân vật streamer')
    })
  }

  private applyComputerPose(): void {
    const p = this.activityProgress
    const offsets: Array<[string, number, number, number]> = [
      ['L_Thigh', -0.95, 0, 0],
      ['R_Thigh', -0.95, 0, 0],
      ['L_Calf', 1.5, 0, 0],
      ['R_Calf', 1.5, 0, 0],
      ['Spine01', -0.16, 0, 0],
      ['L_Upperarm', -0.28, 0, -0.08],
      ['R_Upperarm', -0.28, 0, 0.08],
      ['L_Forearm', 0.48, 0, 0],
      ['R_Forearm', 0.48, 0, 0],
    ]
    for (const [name, x, y, z] of offsets) {
      const bone = this.characterObject?.getObjectByName(name)
      if (!bone) continue
      const previous = this.appliedPose.get(name)
      if (previous) bone.rotation.set(bone.rotation.x - previous.x, bone.rotation.y - previous.y, bone.rotation.z - previous.z)
      const next = new THREE.Vector3(x * p, y * p, z * p)
      if (p > 0.002) {
        bone.rotation.set(bone.rotation.x + next.x, bone.rotation.y + next.y, bone.rotation.z + next.z)
        this.appliedPose.set(name, next)
      } else {
        this.appliedPose.delete(name)
      }
    }
    this.model.position.y = -0.56 * p
    this.model.position.z = -0.1 * p
  }

  private switchAction(next: THREE.AnimationAction, fade: number): void {
    if (this.activeAction === next) return
    next.reset().fadeIn(fade).play()
    this.activeAction?.fadeOut(fade)
    this.activeAction = next
  }
}

function findAction(actions: Map<string, THREE.AnimationAction>, names: string[]): THREE.AnimationAction | undefined {
  for (const name of names) {
    const exact = actions.get(name)
    if (exact) return exact
    for (const [key, action] of actions) if (key.includes(name)) return action
  }
  return undefined
}

function dampAngle(from: number, to: number, lambda: number, dt: number): number {
  let delta = (to - from) % (Math.PI * 2)
  if (delta > Math.PI) delta -= Math.PI * 2
  if (delta < -Math.PI) delta += Math.PI * 2
  return from + delta * (1 - Math.exp(-lambda * dt))
}
