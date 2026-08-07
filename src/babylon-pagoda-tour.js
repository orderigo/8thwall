import * as THREE from 'three'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js'
import pagodaModelUrl from './assets/pagoda.glb?url'

const clock = new THREE.Clock()
const forwardVector = new THREE.Vector3()
const rightVector = new THREE.Vector3()
const moveVector = new THREE.Vector3()

const createButtonState = (overlay, mode) => {
  overlay.dataset.viewMode = mode
  overlay.querySelectorAll('[data-view]').forEach((button) => {
    button.toggleAttribute('aria-pressed', button.dataset.view === mode)
  })
}

const fitCameraToObject = (camera, controls, object) => {
  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxSize = Math.max(size.x, size.y, size.z, 1)
  const fitHeightDistance = maxSize / (2 * Math.atan((Math.PI * camera.fov) / 360))
  const fitWidthDistance = fitHeightDistance / camera.aspect
  const distance = Math.max(fitHeightDistance, fitWidthDistance) * 1.45
  const direction = new THREE.Vector3(0.65, 0.35, 1).normalize()

  camera.position.copy(center).add(direction.multiplyScalar(distance))
  camera.near = Math.max(distance / 100, 0.01)
  camera.far = Math.max(distance * 100, 1000)
  camera.updateProjectionMatrix()

  controls.target.copy(center)
  controls.maxDistance = distance * 4
  controls.minDistance = Math.max(distance * 0.08, 0.5)
  controls.update()

  return {box, center, size, distance}
}

const loadPagoda = (loader, scene) => new Promise((resolve, reject) => {
  loader.load(
    pagodaModelUrl,
    (gltf) => {
      scene.add(gltf.scene)
      resolve(gltf.scene)
    },
    undefined,
    reject
  )
})

const getPressedAxis = (keys) => ({
  x: Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')),
  y: Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')),
})

export const startPagodaTour = async () => {
  const overlay = document.createElement('section')
  overlay.className = 'pagoda-tour'
  overlay.innerHTML = `
    <canvas class="pagoda-tour__canvas" aria-label="Interactive 3D pagoda virtual tour"></canvas>
    <div class="pagoda-tour__hud">
      <div>
        <p class="pagoda-tour__eyebrow">Interactive 3D Virtual Tour</p>
        <h2>Pagoda Explorer</h2>
        <p>Explore uses FPS controls: drag to look, use WASD/arrow keys or the mobile joystick to walk.</p>
      </div>
      <div class="pagoda-tour__actions">
        <button type="button" data-view="walk">Explore</button>
        <button type="button" data-view="model">Model viewer</button>
        <button type="button" data-close>Close</button>
      </div>
    </div>
    <details class="pagoda-tour__tools">
      <summary>Tools</summary>
      <button type="button" data-tool="flashlight" aria-pressed="false">🔦 Flashlight</button>
    </details>
    <div class="pagoda-tour__joystick" aria-label="Mobile movement joystick">
      <div class="pagoda-tour__joystick-knob"></div>
    </div>
    <div class="pagoda-tour__loading">Loading pagoda.glb...</div>
  `
  document.body.appendChild(overlay)
  document.body.classList.add('pagoda-tour-active')
  createButtonState(overlay, 'walk')

  const canvas = overlay.querySelector('canvas')
  const loading = overlay.querySelector('.pagoda-tour__loading')
  const flashlightButton = overlay.querySelector('[data-tool="flashlight"]')
  const joystick = overlay.querySelector('.pagoda-tour__joystick')
  const joystickKnob = overlay.querySelector('.pagoda-tour__joystick-knob')
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: false})
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x070a12)
  scene.fog = new THREE.FogExp2(0x070a12, 0.012)

  const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 1000)
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.screenSpacePanning = false

  const ambient = new THREE.HemisphereLight(0xfff3df, 0x2d2118, 1.15)
  scene.add(ambient)

  const sun = new THREE.DirectionalLight(0xffe2ad, 3.2)
  sun.position.set(24, 42, 16)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.near = 0.5
  sun.shadow.camera.far = 160
  sun.shadow.camera.left = -55
  sun.shadow.camera.right = 55
  sun.shadow.camera.top = 55
  sun.shadow.camera.bottom = -55
  scene.add(sun)

  const fill = new THREE.DirectionalLight(0x88b8ff, 0.85)
  fill.position.set(-20, 12, -18)
  scene.add(fill)

  const flashlight = new THREE.SpotLight(0xfff4d0, 0, 38, Math.PI / 7, 0.38, 1.25)
  flashlight.position.set(0, 0, 0)
  flashlight.target.position.set(0, 0, -1)
  camera.add(flashlight)
  camera.add(flashlight.target)
  scene.add(camera)

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(180, 180),
    new THREE.MeshStandardMaterial({color: 0x6b5940, roughness: 0.92, metalness: 0})
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  const keys = new Set()
  const joystickAxis = {x: 0, y: 0}
  const lookState = {active: false, pointerId: null, yaw: 0, pitch: 0, lastX: 0, lastY: 0}
  let mode = 'walk'
  let frameId
  let eyeHeight = 1.7
  let groundY = 0

  const resize = () => {
    const width = canvas.clientWidth || window.innerWidth
    const height = canvas.clientHeight || window.innerHeight
    renderer.setSize(width, height, false)
    camera.aspect = width / Math.max(height, 1)
    camera.updateProjectionMatrix()
    controls.update()
  }

  const syncWalkRotation = () => {
    camera.rotation.order = 'YXZ'
    camera.rotation.y = lookState.yaw
    camera.rotation.x = lookState.pitch
    camera.rotation.z = 0
  }

  const setJoystick = (pointerEvent) => {
    const rect = joystick.getBoundingClientRect()
    const radius = rect.width * 0.5
    const x = pointerEvent.clientX - rect.left - radius
    const y = pointerEvent.clientY - rect.top - radius
    const length = Math.min(Math.hypot(x, y), radius)
    const angle = Math.atan2(y, x)

    joystickAxis.x = Math.cos(angle) * (length / radius)
    joystickAxis.y = -Math.sin(angle) * (length / radius)
    joystickKnob.style.transform = `translate(${Math.cos(angle) * length}px, ${Math.sin(angle) * length}px)`
  }

  const resetJoystick = () => {
    joystickAxis.x = 0
    joystickAxis.y = 0
    joystickKnob.style.transform = 'translate(0, 0)'
  }

  const updateWalkControls = (delta) => {
    const keyAxis = getPressedAxis(keys)
    const inputX = Math.max(-1, Math.min(1, keyAxis.x + joystickAxis.x))
    const inputY = Math.max(-1, Math.min(1, keyAxis.y + joystickAxis.y))

    if (Math.abs(inputX) + Math.abs(inputY) <= 0.01) return

    forwardVector.set(Math.sin(lookState.yaw), 0, Math.cos(lookState.yaw)).normalize()
    rightVector.set(Math.cos(lookState.yaw), 0, -Math.sin(lookState.yaw)).normalize()
    moveVector.copy(forwardVector).multiplyScalar(inputY).addScaledVector(rightVector, inputX)

    if (moveVector.lengthSq() > 1) moveVector.normalize()
    camera.position.addScaledVector(moveVector, delta * 5.2)
    camera.position.y = groundY + eyeHeight
  }

  const render = () => {
    const delta = Math.min(clock.getDelta(), 0.05)
    if (mode === 'walk') {
      updateWalkControls(delta)
    } else {
      controls.update()
    }
    renderer.render(scene, camera)
    frameId = window.requestAnimationFrame(render)
  }

  const cleanup = () => {
    window.cancelAnimationFrame(frameId)
    window.removeEventListener('resize', resize)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    controls.dispose()
    renderer.dispose()
    scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose()
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => material.dispose())
      }
    })
    overlay.remove()
    document.body.classList.remove('pagoda-tour-active')
  }

  const onKeyDown = (event) => keys.add(event.code)
  const onKeyUp = (event) => keys.delete(event.code)

  try {
    resize()
    const model = await loadPagoda(new GLTFLoader(), scene)
    model.traverse((object) => {
      if (!object.isMesh) return
      object.castShadow = true
      object.receiveShadow = true
    })
    const {box, center, size, distance} = fitCameraToObject(camera, controls, model)
    const modelTarget = center.clone()
    groundY = box.min.y - 0.02
    eyeHeight = Math.max(1.55, Math.min(size.y * 0.2, 2.2))
    ground.position.y = groundY

    const setView = (nextMode) => {
      mode = nextMode
      ground.visible = nextMode === 'walk'
      controls.enabled = nextMode === 'model'
      resetJoystick()
      createButtonState(overlay, nextMode)

      if (nextMode === 'walk') {
        const startZ = box.max.z + Math.max(size.z * 0.18, 4)
        camera.position.set(center.x, groundY + eyeHeight, startZ)
        lookState.yaw = Math.PI
        lookState.pitch = -0.04
        syncWalkRotation()
        return
      }

      camera.position.copy(modelTarget).add(new THREE.Vector3(distance * 0.65, distance * 0.35, distance))
      controls.target.copy(modelTarget)
      controls.update()
    }

    canvas.addEventListener('pointerdown', (event) => {
      if (mode !== 'walk' || event.target.closest?.('.pagoda-tour__joystick')) return
      lookState.active = true
      lookState.pointerId = event.pointerId
      lookState.lastX = event.clientX
      lookState.lastY = event.clientY
      canvas.setPointerCapture(event.pointerId)
    })
    canvas.addEventListener('pointermove', (event) => {
      if (mode !== 'walk' || !lookState.active || lookState.pointerId !== event.pointerId) return
      const deltaX = event.movementX || event.clientX - lookState.lastX
      const deltaY = event.movementY || event.clientY - lookState.lastY

      lookState.lastX = event.clientX
      lookState.lastY = event.clientY
      lookState.yaw -= deltaX * 0.003
      lookState.pitch = Math.max(-1.25, Math.min(1.1, lookState.pitch - deltaY * 0.003))
      syncWalkRotation()
    })
    canvas.addEventListener('pointerup', () => {
      lookState.active = false
      lookState.pointerId = null
    })

    joystick.addEventListener('pointerdown', (event) => {
      if (mode !== 'walk') return
      joystick.setPointerCapture(event.pointerId)
      setJoystick(event)
    })
    joystick.addEventListener('pointermove', (event) => {
      if (mode === 'walk') setJoystick(event)
    })
    joystick.addEventListener('pointerup', resetJoystick)
    joystick.addEventListener('pointercancel', resetJoystick)

    flashlightButton.addEventListener('click', () => {
      const enabled = flashlight.intensity === 0
      flashlight.intensity = enabled ? 7 : 0
      flashlightButton.toggleAttribute('aria-pressed', enabled)
    })
    overlay.querySelector('[data-view="walk"]').addEventListener('click', () => setView('walk'))
    overlay.querySelector('[data-view="model"]').addEventListener('click', () => setView('model'))
    overlay.querySelector('[data-close]').addEventListener('click', cleanup)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('resize', resize)
    setView('walk')
    loading.remove()
    clock.start()
    render()
  } catch (error) {
    loading.textContent = 'Could not load pagoda.glb. Please refresh and try again.'
    console.error('Failed to load pagoda.glb', error)
    throw error
  }
}
