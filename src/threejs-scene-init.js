// Defines an 8th Wall XR Camera Pipeline Module that places a ground-tracked
// door portal and opens the animated door as the visitor approaches it.
import * as THREE from 'three'
import {LumaSplatsThree} from '@lumaai/luma-web'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'
import doorModelUrl from './assets/lowpoly_animated_doors_blender_file.glb?url'
import {AgentVideo} from './agentvideo'

const DESTINATIONS = [
  {
    name: 'Bagan, Myanmar',
    color: 0xff9d2e,
    facts: ['Ancient temples', 'Golden-hour balloon flights', 'Irrawaddy River plains'],
  },
  {
    name: 'Kyoto, Japan',
    color: 0xff5fa2,
    facts: ['Torii gates', 'Zen gardens', 'Seasonal cherry blossoms'],
  },
  {
    name: 'Machu Picchu, Peru',
    color: 0x4ddf83,
    facts: ['Andes viewpoint', 'Inca stonework', 'Cloud-forest trails'],
  },
]

const DEFAULT_WORLD_CONFIG = {
  gaussianSplat: {
    source: 'https://lumalabs.ai/capture/4da7cf32-865a-4515-8cb9-9dfc574c90c2',
    position: [0, 0, -1.2],
    rotation: [0, Math.PI, 0],
    scale: [0.58, 0.58, 0.58],
  },
  glb: {url: '', position: [0.72, 0, -1.6], rotation: [0, 0, 0], scale: [1, 1, 1]},
}

const DOOR_REAL_WORLD_HEIGHT_METERS = 6.15
const DOOR_OPEN_DISTANCE_METERS = 1.35
const DOOR_CLOSE_DISTANCE_METERS = 1.8
const PORTAL_ENTRY_RADIUS = 2.7
const PORTAL_EXIT_RADIUS = 4.05
const PORTAL_ENTRY_DEPTH = 0.2
const PORTAL_DRAG_SENSITIVITY = 0.0038
const MAX_TAP_MOVEMENT = 10
const PLACEMENT_DISTANCE_METERS = 4.6

const applyTransform = (object, transform = {}) => {
  if (!object) return
  const {position, rotation, scale} = transform
  if (position) object.position.fromArray(position)
  if (rotation) object.rotation.set(rotation[0], rotation[1], rotation[2])
  if (scale) object.scale.fromArray(scale)
}

const fitObjectToHeight = (object, targetHeight) => {
  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())
  const height = size.y || 1
  const scale = targetHeight / height
  object.scale.multiplyScalar(scale)
  box.setFromObject(object)
  const center = box.getCenter(new THREE.Vector3())
  const minY = box.min.y
  object.position.sub(new THREE.Vector3(center.x, minY, center.z))
  return scale
}

const playPortalEntrySound = (() => {
  let entryAudioContext
  return () => {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return

    entryAudioContext ||= new AudioContext()
    if (entryAudioContext.state === 'suspended') entryAudioContext.resume()

    const now = entryAudioContext.currentTime
    const gain = entryAudioContext.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.24, now + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9)
    gain.connect(entryAudioContext.destination)

    ;[220, 329.63, 440].forEach((frequency, index) => {
      const oscillator = entryAudioContext.createOscillator()
      oscillator.type = index === 0 ? 'sine' : 'triangle'
      oscillator.frequency.setValueAtTime(frequency, now)
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.16, now + 0.65)
      oscillator.connect(gain)
      oscillator.start(now + index * 0.04)
      oscillator.stop(now + 0.95)
    })
  }
})()

export const initScenePipelineModule = () => {
  const clock = new THREE.Clock()
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const raycaster = new THREE.Raycaster()
  const selectedGroundPoint = new THREE.Vector3(0, 0, -PLACEMENT_DISTANCE_METERS)
  const dragRight = new THREE.Vector3()
  const dragForward = new THREE.Vector3()
  const cameraPortalPosition = new THREE.Vector3()
  const smoothedCameraPosition = new THREE.Vector3()
  const vrTourOffset = new THREE.Vector3()
  let hasSmoothedCameraPosition = false
  let marker
  let markerPulse
  let portal
  let doorRoot
  let doorMixer
  let doorActions = []
  let doorOpen = false
  let doorReady = false
  let portalRaised = false
  let portalWorld
  let lumaSplats
  let glbScene
  let gltfLoader
  let agentVideo
  let isInsidePortal = false
  let vrTourMode = false
  let vrMoveDirection = null
  let worldConfig = JSON.parse(JSON.stringify(DEFAULT_WORLD_CONFIG))

  const dispatchTrackingStatus = (message = 'Move your phone to choose a ground point, then tap Open Portal.') => {
    window.dispatchEvent(new CustomEvent('portal-tracking-change', {
      detail: {canEnter: portalRaised, source: '8th-wall-ground', state: 'stable', message},
    }))
  }

  const updatePlacementUi = (state, message) => {
    window.dispatchEvent(new CustomEvent('portal-placement-change', {detail: {state, message}}))
  }

  const orientToCameraOnGround = (object, camera) => {
    const dx = camera.position.x - object.position.x
    const dz = camera.position.z - object.position.z
    object.rotation.set(0, Math.atan2(dx, dz), 0)
  }

  const syncPortalWorld = () => {
    if (!portalWorld || !portal) return
    portalWorld.position.copy(portal.position)
    portalWorld.quaternion.copy(portal.quaternion)
  }

  const setPlacementPointFromScreen = (screenX = window.innerWidth / 2, screenY = window.innerHeight / 2) => {
    const {camera} = XR8.Threejs.xrScene()
    const ndc = new THREE.Vector2((screenX / window.innerWidth) * 2 - 1, -(screenY / window.innerHeight) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    const hit = new THREE.Vector3()
    if (!raycaster.ray.intersectPlane(groundPlane, hit) || hit.distanceTo(camera.position) < 0.35) {
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
      forward.y = 0
      forward.normalize()
      hit.copy(camera.position).addScaledVector(forward, PLACEMENT_DISTANCE_METERS)
      hit.y = 0
    }
    selectedGroundPoint.copy(hit)
    if (marker) {
      marker.position.copy(selectedGroundPoint)
      orientToCameraOnGround(marker, camera)
    }
    updatePlacementUi('ready', 'Ground point selected. Press Open Portal to raise the door here.')
  }

  const raisePortalAtSelectedPoint = () => {
    if (!portal || portalRaised) return
    const {camera} = XR8.Threejs.xrScene()
    portalRaised = true
    portal.visible = true
    portal.position.copy(selectedGroundPoint)
    portal.userData.revealProgress = 0
    orientToCameraOnGround(portal, camera)
    if (marker) marker.visible = false
    syncPortalWorld()
    playPortalEntrySound()
    updatePlacementUi('opened', 'Door portal is placed. Walk closer to open the door.')
    dispatchTrackingStatus('Door portal placed. Walk closer to open it.')
  }

  const setDoorOpen = (open) => {
    if (doorOpen === open || !doorReady) return
    doorOpen = open
    doorActions.forEach((action) => {
      action.paused = false
      action.enabled = true
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
      action.timeScale = open ? Math.abs(action.timeScale || 1) : -Math.abs(action.timeScale || 1)
      if (!open) action.time = action.getClip().duration
      action.play()
    })
    window.dispatchEvent(new CustomEvent('portal-door-change', {detail: {open}}))
  }

  const createPlacementMarker = (scene) => {
    const group = new THREE.Group()
    group.name = 'ground-placement-point-ui'
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.38, 96),
      new THREE.MeshBasicMaterial({color: 0x7ce0ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide})
    )
    ring.rotation.x = -Math.PI / 2
    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.075, 40),
      new THREE.MeshBasicMaterial({color: 0xffd76b, transparent: true, opacity: 0.95, side: THREE.DoubleSide})
    )
    dot.rotation.x = -Math.PI / 2
    markerPulse = ring
    group.add(ring, dot)
    scene.add(group)
    marker = group
  }

  const createPortal = (scene) => {
    const group = new THREE.Group()
    group.name = 'ground-door-portal'
    group.visible = false
    group.userData.revealProgress = 0
    scene.add(group)

    const base = new THREE.Mesh(
      new THREE.CircleGeometry(0.75, 96),
      new THREE.MeshStandardMaterial({color: 0x1a2945, roughness: 0.78, metalness: 0.18, transparent: true, opacity: 0.82})
    )
    base.rotation.x = -Math.PI / 2
    base.receiveShadow = true
    group.add(base)

    gltfLoader.load(doorModelUrl, (gltf) => {
      doorRoot = gltf.scene
      doorRoot.name = 'lowpoly-animated-door-portal-model'
      doorRoot.traverse((child) => {
        child.castShadow = true
        child.receiveShadow = true
      })
      fitObjectToHeight(doorRoot, DOOR_REAL_WORLD_HEIGHT_METERS)
      group.add(doorRoot)
      doorMixer = new THREE.AnimationMixer(doorRoot)
      doorActions = gltf.animations.map((clip) => doorMixer.clipAction(clip))
      doorActions.forEach((action) => {
        action.setLoop(THREE.LoopOnce, 1)
        action.clampWhenFinished = true
        action.enabled = true
        action.time = 0
        action.paused = true
        action.play()
      })
      doorReady = true
    })

    agentVideo = new AgentVideo()
    agentVideo.addToPortal(group)

    const portalLight = new THREE.PointLight(0xffa640, 2.2, 4)
    portalLight.position.set(0, 1.2, 0.45)
    group.add(portalLight)
    portal = group
  }

  const initXrScene = ({scene, renderer}) => {
    renderer.shadowMap.enabled = true
    renderer.outputColorSpace = THREE.SRGBColorSpace
    scene.add(new THREE.HemisphereLight(0xdcecff, 0x161927, 1.15))
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.85)
    directionalLight.position.set(3, 6, 4)
    directionalLight.castShadow = true
    scene.add(directionalLight)

    portalWorld = new THREE.Group()
    portalWorld.name = 'editable-portal-world'
    portalWorld.visible = false
    scene.add(portalWorld)

    lumaSplats = new LumaSplatsThree({
      source: worldConfig.gaussianSplat.source,
      loadingAnimationEnabled: false,
      enableThreeShaderIntegration: false,
    })
    lumaSplats.name = 'editable-gaussian-splat-world'
    applyTransform(lumaSplats, worldConfig.gaussianSplat)
    portalWorld.add(lumaSplats)
    lumaSplats.onLoad = () => {
      lumaSplats.captureCubemap(renderer).then((capturedTexture) => { scene.environment = capturedTexture })
    }

    gltfLoader = new GLTFLoader()
    createPlacementMarker(scene)
    createPortal(scene)

    const planeGeometry = new THREE.PlaneGeometry(2000, 2000)
    planeGeometry.rotateX(-Math.PI / 2)
    const plane = new THREE.Mesh(planeGeometry, new THREE.ShadowMaterial({opacity: 0.42}))
    plane.receiveShadow = true
    scene.add(plane)
  }

  return {
    name: 'threejsinitscene',

    onStart: ({canvas}) => {
      const {scene, renderer} = XR8.Threejs.xrScene()
      initXrScene({scene, renderer})
      window.setTimeout(() => setPlacementPointFromScreen(), 400)
      dispatchTrackingStatus()

      let activeTouchMode = 'none'
      let dragLastX = 0
      let dragLastY = 0
      let dragTotalMovement = 0

      canvas.addEventListener('touchmove', (event) => {
        event.preventDefault()
        if (event.touches.length !== 1 || !portalRaised || !portal || isInsidePortal) return
        activeTouchMode = 'drag'
        const touch = event.touches[0]
        const deltaX = touch.clientX - dragLastX
        const deltaY = touch.clientY - dragLastY
        dragLastX = touch.clientX
        dragLastY = touch.clientY
        dragTotalMovement += Math.hypot(deltaX, deltaY)
        const {camera} = XR8.Threejs.xrScene()
        dragRight.set(1, 0, 0).applyQuaternion(camera.quaternion)
        dragForward.set(0, 0, -1).applyQuaternion(camera.quaternion)
        dragRight.y = 0
        dragForward.y = 0
        dragRight.normalize()
        dragForward.normalize()
        portal.position.addScaledVector(dragRight, deltaX * PORTAL_DRAG_SENSITIVITY)
        portal.position.addScaledVector(dragForward, -deltaY * PORTAL_DRAG_SENSITIVITY)
        portal.position.y = 0
        syncPortalWorld()
      }, {passive: false})

      canvas.addEventListener('touchstart', (event) => {
        if (event.touches.length !== 1) return
        activeTouchMode = 'drag'
        dragLastX = event.touches[0].clientX
        dragLastY = event.touches[0].clientY
        dragTotalMovement = 0
      }, true)

      canvas.addEventListener('touchend', (event) => {
        if (event.touches.length === 0 && activeTouchMode === 'drag' && dragTotalMovement < MAX_TAP_MOVEMENT) {
          const changed = event.changedTouches?.[0]
          if (!portalRaised && changed) setPlacementPointFromScreen(changed.clientX, changed.clientY)
          else if (portal?.visible) {
            const nextIndex = (portal.userData.destinationIndex || 0) + 1
            portal.userData.destinationIndex = nextIndex % DESTINATIONS.length
            window.dispatchEvent(new CustomEvent('portal-destination-change', {detail: DESTINATIONS[portal.userData.destinationIndex]}))
          }
        }
        if (event.touches.length === 0) activeTouchMode = 'none'
      })

      window.addEventListener('portal-open-request', raisePortalAtSelectedPoint)
      window.addEventListener('portal-recenter-request', () => {
        portalRaised = false
        if (portal) portal.visible = false
        if (marker) marker.visible = true
        setPlacementPointFromScreen()
        updatePlacementUi('ready', 'Choose a new ground point, then tap Open Portal.')
      })
      window.addEventListener('portal-vr-toggle', (event) => {
        vrTourMode = event.detail?.enabled ?? !vrTourMode
        isInsidePortal = vrTourMode || isInsidePortal
        if (portalWorld) portalWorld.visible = isInsidePortal
        if (portal) portal.visible = portalRaised && !isInsidePortal
        window.dispatchEvent(new CustomEvent('portal-vr-change', {detail: {enabled: vrTourMode}}))
        window.dispatchEvent(new CustomEvent('portal-entry-change', {detail: {isInsidePortal}}))
      })
      window.addEventListener('portal-vr-move', (event) => { vrMoveDirection = event.detail.direction })
      window.addEventListener('portal-editor-update', (event) => {
        const {target, transform, url} = event.detail
        if (!worldConfig[target]) return
        if (transform) worldConfig[target] = {...worldConfig[target], ...transform}
        if (target === 'gaussianSplat') applyTransform(lumaSplats, worldConfig.gaussianSplat)
        if (target === 'glb') {
          if (url !== undefined) worldConfig.glb.url = url
          if (glbScene) applyTransform(glbScene, worldConfig.glb)
          if (worldConfig.glb.url && (!glbScene || url !== undefined)) {
            if (glbScene) portalWorld.remove(glbScene)
            gltfLoader.load(worldConfig.glb.url, (gltf) => {
              glbScene = gltf.scene
              glbScene.name = 'editable-glb-world-asset'
              applyTransform(glbScene, worldConfig.glb)
              portalWorld.add(glbScene)
            })
          }
        }
      })
    },

    onUpdate: () => {
      const delta = clock.getDelta()
      const elapsed = clock.elapsedTime
      const {camera} = XR8.Threejs.xrScene()
      if (marker?.visible) {
        markerPulse.scale.setScalar(1 + Math.sin(elapsed * 3.8) * 0.16)
        marker.rotation.y += delta * 0.8
      }
      if (!portal) return
      if (!hasSmoothedCameraPosition) {
        smoothedCameraPosition.copy(camera.position)
        hasSmoothedCameraPosition = true
      } else smoothedCameraPosition.lerp(camera.position, 0.18)

      if (portalRaised) {
        portal.userData.revealProgress += (1 - portal.userData.revealProgress) * 0.08
        portal.position.y = THREE.MathUtils.lerp(-DOOR_REAL_WORLD_HEIGHT_METERS, 0, portal.userData.revealProgress)
        const distanceToDoor = new THREE.Vector2(camera.position.x - selectedGroundPoint.x, camera.position.z - selectedGroundPoint.z).length()
        if (!doorOpen && distanceToDoor < DOOR_OPEN_DISTANCE_METERS) setDoorOpen(true)
        if (doorOpen && distanceToDoor > DOOR_CLOSE_DISTANCE_METERS) setDoorOpen(false)
      }

      if (doorMixer) doorMixer.update(delta)
      portal.worldToLocal(cameraPortalPosition.copy(smoothedCameraPosition))
      const portalPlaneDistance = cameraPortalPosition.z
      const portalRadialDistance = Math.hypot(cameraPortalPosition.x, cameraPortalPosition.y - 1.05)
      const thresholdRadius = isInsidePortal ? PORTAL_EXIT_RADIUS : PORTAL_ENTRY_RADIUS
      const shouldBeInsidePortal = portalRaised && (vrTourMode || (portalRadialDistance < thresholdRadius && portalPlaneDistance < -PORTAL_ENTRY_DEPTH))

      if (shouldBeInsidePortal !== isInsidePortal) {
        isInsidePortal = shouldBeInsidePortal
        window.dispatchEvent(new CustomEvent('portal-entry-change', {detail: {isInsidePortal}}))
        if (agentVideo) agentVideo.setActive(isInsidePortal)
        if (isInsidePortal) playPortalEntrySound()
      }

      portal.visible = portalRaised && !isInsidePortal
      if (portalWorld) {
        portalWorld.visible = isInsidePortal
        if (isInsidePortal) portalWorld.position.copy(selectedGroundPoint).add(vrTourOffset)
        portalWorld.quaternion.copy(portal.quaternion)
      }
      if (vrTourMode && vrMoveDirection) {
        const speed = 0.035
        if (vrMoveDirection === 'forward') vrTourOffset.z += speed
        if (vrMoveDirection === 'back') vrTourOffset.z -= speed
        if (vrMoveDirection === 'left') vrTourOffset.x += speed
        if (vrMoveDirection === 'right') vrTourOffset.x -= speed
      }
      if (agentVideo) agentVideo.update(camera)
    },
  }
}
