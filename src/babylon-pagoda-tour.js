import * as THREE from 'three'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js'
import pagodaModelUrl from './assets/pagoda.glb?url'

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

export const startPagodaTour = async () => {
  const overlay = document.createElement('section')
  overlay.className = 'pagoda-tour'
  overlay.innerHTML = `
    <canvas class="pagoda-tour__canvas" aria-label="Interactive 3D pagoda virtual tour"></canvas>
    <div class="pagoda-tour__hud">
      <div>
        <p class="pagoda-tour__eyebrow">Interactive 3D Virtual Tour</p>
        <h2>Pagoda Explorer</h2>
        <p>Drag to rotate, pinch or scroll to zoom, and switch views to inspect the pagoda model.</p>
      </div>
      <div class="pagoda-tour__actions">
        <button type="button" data-view="walk">Explore</button>
        <button type="button" data-view="model">Model viewer</button>
        <button type="button" data-close>Close</button>
      </div>
    </div>
    <div class="pagoda-tour__loading">Loading pagoda.glb...</div>
  `
  document.body.appendChild(overlay)
  document.body.classList.add('pagoda-tour-active')
  createButtonState(overlay, 'walk')

  const canvas = overlay.querySelector('canvas')
  const loading = overlay.querySelector('.pagoda-tour__loading')
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: false})
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x050814)
  scene.fog = new THREE.Fog(0x050814, 40, 160)

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000)
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.screenSpacePanning = false

  const ambient = new THREE.HemisphereLight(0xfff7e8, 0x53402e, 2.2)
  scene.add(ambient)

  const sun = new THREE.DirectionalLight(0xfff0d0, 3.5)
  sun.position.set(24, 38, 18)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.near = 0.5
  sun.shadow.camera.far = 120
  sun.shadow.camera.left = -45
  sun.shadow.camera.right = 45
  sun.shadow.camera.top = 45
  sun.shadow.camera.bottom = -45
  scene.add(sun)

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(180, 180),
    new THREE.MeshStandardMaterial({color: 0x6b5940, roughness: 0.88, metalness: 0})
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  const resize = () => {
    const width = canvas.clientWidth || window.innerWidth
    const height = canvas.clientHeight || window.innerHeight
    renderer.setSize(width, height, false)
    camera.aspect = width / Math.max(height, 1)
    camera.updateProjectionMatrix()
    controls.update()
  }

  let frameId
  const render = () => {
    controls.update()
    renderer.render(scene, camera)
    frameId = window.requestAnimationFrame(render)
  }

  const cleanup = () => {
    window.cancelAnimationFrame(frameId)
    window.removeEventListener('resize', resize)
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

  try {
    resize()
    const model = await loadPagoda(new GLTFLoader(), scene)
    model.traverse((object) => {
      if (!object.isMesh) return
      object.castShadow = true
      object.receiveShadow = true
    })
    const {center, size, distance} = fitCameraToObject(camera, controls, model)
    const baseTarget = center.clone()
    const exploreTarget = center.clone().add(new THREE.Vector3(0, Math.max(size.y * 0.15, 1), 0))

    const setView = (mode) => {
      if (mode === 'walk') {
        controls.target.copy(exploreTarget)
        camera.position.set(
          center.x,
          Math.max(center.y + size.y * 0.2, 1.6),
          center.z + Math.max(size.z * 0.55, distance * 0.45)
        )
      } else {
        controls.target.copy(baseTarget)
        camera.position.copy(baseTarget).add(new THREE.Vector3(distance * 0.65, distance * 0.35, distance))
      }
      controls.update()
      createButtonState(overlay, mode)
    }

    overlay.querySelector('[data-view="walk"]').addEventListener('click', () => setView('walk'))
    overlay.querySelector('[data-view="model"]').addEventListener('click', () => setView('model'))
    overlay.querySelector('[data-close]').addEventListener('click', cleanup)
    window.addEventListener('resize', resize)
    setView('walk')
    loading.remove()
    render()
  } catch (error) {
    loading.textContent = 'Could not load pagoda.glb. Please refresh and try again.'
    console.error('Failed to load pagoda.glb', error)
    throw error
  }
}
