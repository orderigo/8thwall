import pagodaModelUrl from './assets/pagoda.glb?url'

const ensureBabylon = () => new Promise((resolve, reject) => {
  if (window.BABYLON) {
    resolve(window.BABYLON)
    return
  }

  const existingScript = document.querySelector('[data-babylon-runtime]')
  if (existingScript) {
    existingScript.addEventListener('load', () => resolve(window.BABYLON), {once: true})
    existingScript.addEventListener('error', reject, {once: true})
    return
  }

  const script = document.createElement('script')
  script.src = 'https://cdn.babylonjs.com/babylon.js'
  script.async = true
  script.crossOrigin = 'anonymous'
  script.dataset.babylonRuntime = 'true'
  script.addEventListener('load', () => resolve(window.BABYLON), {once: true})
  script.addEventListener('error', reject, {once: true})
  document.head.appendChild(script)
})

const ensureBabylonLoaders = () => new Promise((resolve, reject) => {
  if (window.BABYLON?.SceneLoader?.GetPluginForExtension?.('.glb')) {
    resolve()
    return
  }

  const existingScript = document.querySelector('[data-babylon-loaders]')
  if (existingScript) {
    existingScript.addEventListener('load', resolve, {once: true})
    existingScript.addEventListener('error', reject, {once: true})
    return
  }

  const script = document.createElement('script')
  script.src = 'https://cdn.babylonjs.com/loaders/babylonjs.loaders.min.js'
  script.async = true
  script.crossOrigin = 'anonymous'
  script.dataset.babylonLoaders = 'true'
  script.addEventListener('load', resolve, {once: true})
  script.addEventListener('error', reject, {once: true})
  document.head.appendChild(script)
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
        <p>Drag to look around. Use one finger or joystick-style touch movement to explore the 3D environment.</p>
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

  const canvas = overlay.querySelector('canvas')
  const loading = overlay.querySelector('.pagoda-tour__loading')
  const BABYLON = await ensureBabylon()
  await ensureBabylonLoaders()

  const engine = new BABYLON.Engine(canvas, true, {preserveDrawingBuffer: true, stencil: true})
  const scene = new BABYLON.Scene(engine)
  scene.clearColor = new BABYLON.Color4(0.02, 0.03, 0.08, 1)
  scene.environmentIntensity = 0.95

  const hdr = BABYLON.CubeTexture.CreateFromPrefilteredData('https://playground.babylonjs.com/textures/environment.env', scene)
  scene.environmentTexture = hdr
  scene.createDefaultSkybox(hdr, true, 1200, 0.45, false)

  const hemispheric = new BABYLON.HemisphericLight('tour-sky-light', new BABYLON.Vector3(0, 1, 0), scene)
  hemispheric.intensity = 0.72
  hemispheric.groundColor = new BABYLON.Color3(0.2, 0.16, 0.12)

  const sun = new BABYLON.DirectionalLight('tour-sun', new BABYLON.Vector3(-0.45, -0.85, 0.28), scene)
  sun.position = new BABYLON.Vector3(22, 38, -18)
  sun.intensity = 2.2

  const shadowGenerator = new BABYLON.ShadowGenerator(2048, sun)
  shadowGenerator.useBlurExponentialShadowMap = true
  shadowGenerator.blurKernel = 24

  const walkCamera = new BABYLON.UniversalCamera('walk-camera', new BABYLON.Vector3(0, 1.65, -8), scene)
  walkCamera.speed = 0.45
  walkCamera.angularSensibility = 3500
  walkCamera.touchAngularSensibility = 4500
  walkCamera.minZ = 0.04
  walkCamera.applyGravity = true
  walkCamera.ellipsoid = new BABYLON.Vector3(0.45, 0.82, 0.45)
  walkCamera.attachControl(canvas, true)
  walkCamera.inputs.addVirtualJoystick()

  const orbitCamera = new BABYLON.ArcRotateCamera('model-camera', -Math.PI / 2, Math.PI / 2.35, 12, BABYLON.Vector3.Zero(), scene)
  orbitCamera.wheelDeltaPercentage = 0.01
  orbitCamera.pinchDeltaPercentage = 0.01
  orbitCamera.lowerRadiusLimit = 2
  orbitCamera.upperRadiusLimit = 80

  scene.activeCamera = walkCamera
  scene.gravity = new BABYLON.Vector3(0, -0.25, 0)
  scene.collisionsEnabled = true

  const ground = BABYLON.MeshBuilder.CreateGround('tour-ground', {width: 180, height: 180}, scene)
  const groundMaterial = new BABYLON.PBRMaterial('tour-ground-material', scene)
  groundMaterial.albedoColor = new BABYLON.Color3(0.42, 0.35, 0.26)
  groundMaterial.roughness = 0.88
  groundMaterial.metallic = 0
  ground.material = groundMaterial
  ground.receiveShadows = true
  ground.checkCollisions = true

  try {
    const result = await BABYLON.SceneLoader.ImportMeshAsync('', '', pagodaModelUrl, scene)
    const modelRoot = new BABYLON.TransformNode('pagoda-root', scene)
    result.meshes.forEach((mesh) => {
      if (mesh !== scene.meshes[0]) mesh.parent = modelRoot
      mesh.checkCollisions = true
      mesh.receiveShadows = true
      shadowGenerator.addShadowCaster(mesh, true)
    })

    const {min, max} = modelRoot.getHierarchyBoundingVectors(true)
    const size = max.subtract(min)
    const center = min.add(size.scale(0.5))
    modelRoot.position.subtractInPlace(new BABYLON.Vector3(center.x, min.y, center.z))
    const scale = Math.min(1, 18 / Math.max(size.x, size.y, size.z || 1))
    modelRoot.scaling = new BABYLON.Vector3(scale, scale, scale)
    orbitCamera.setTarget(new BABYLON.Vector3(0, Math.max(1, size.y * scale * 0.45), 0))
    orbitCamera.radius = Math.max(8, Math.max(size.x, size.z) * scale * 1.15)
    walkCamera.position = new BABYLON.Vector3(0, 1.65, -Math.max(7, size.z * scale * 0.8))
    loading.remove()
  } catch (error) {
    loading.textContent = 'Could not load pagoda.glb. Please refresh and try again.'
    throw error
  }

  const setView = (mode) => {
    scene.activeCamera.detachControl(canvas)
    scene.activeCamera = mode === 'model' ? orbitCamera : walkCamera
    scene.activeCamera.attachControl(canvas, true)
    overlay.dataset.viewMode = mode
  }

  overlay.querySelector('[data-view="walk"]').addEventListener('click', () => setView('walk'))
  overlay.querySelector('[data-view="model"]').addEventListener('click', () => setView('model'))
  overlay.querySelector('[data-close]').addEventListener('click', () => {
    engine.dispose()
    overlay.remove()
    document.body.classList.remove('pagoda-tour-active')
  })

  window.addEventListener('resize', () => engine.resize())
  engine.runRenderLoop(() => scene.render())
}
