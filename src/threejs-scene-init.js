// Defines an 8th Wall XR Camera Pipeline Module that anchors a Dr. Strange-inspired
// travel portal into the SLAM-tracked world and keeps it animated with three.js.
import * as THREE from 'three'
import {LumaSplatsThree} from '@lumaai/luma-web'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js'
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

const makeTextTexture = (title, lines, accentColor = '#ffb04f') => {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 1024
  const context = canvas.getContext('2d')

  const gradient = context.createLinearGradient(0, 0, 1024, 1024)
  gradient.addColorStop(0, '#102243')
  gradient.addColorStop(0.55, '#38205f')
  gradient.addColorStop(1, '#07111f')
  context.fillStyle = gradient
  context.fillRect(0, 0, 1024, 1024)

  context.fillStyle = 'rgba(255, 255, 255, 0.14)'
  for (let i = 0; i < 36; i++) {
    const x = Math.random() * 1024
    const y = Math.random() * 1024
    const radius = 2 + Math.random() * 7
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.fill()
  }

  context.fillStyle = accentColor
  context.font = '700 76px sans-serif'
  context.textAlign = 'center'
  context.fillText(title, 512, 190)

  context.fillStyle = '#f7fbff'
  context.font = '500 44px sans-serif'
  lines.forEach((line, index) => context.fillText(line, 512, 360 + index * 92))

  context.fillStyle = 'rgba(255, 255, 255, 0.82)'
  context.font = '600 34px sans-serif'
  context.fillText('Step closer and ask the portal guide', 512, 850)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

const DEFAULT_WORLD_CONFIG = {
  gaussianSplat: {
    source: 'https://lumalabs.ai/capture/4da7cf32-865a-4515-8cb9-9dfc574c90c2',
    position: [0, 0, -1.2],
    rotation: [0, Math.PI, 0],
    scale: [0.58, 0.58, 0.58],
  },
  glb: {url: '', position: [0.72, 0, -1.6], rotation: [0, 0, 0], scale: [1, 1, 1]},
}
const DEFAULT_PORTAL_SCALE = 2
const MIN_PORTAL_SCALE = 0.35
const PORTAL_ENTRY_RADIUS = 0.82
const PORTAL_EXIT_RADIUS = 1.04
const PORTAL_ENTRY_DEPTH = 0.12
const PORTAL_DRAG_SENSITIVITY = 0.0038
const MAX_TAP_MOVEMENT = 10
const WORLD_DISSOLVE_SPEED = 0.08
const CIRCLE_COMPLETION_THRESHOLD = 0.72
const HAND_TRAIL_POINTS = 96
const TRAIL_CAMERA_DEPTH = -1.15


const applyTransform = (object, transform = {}) => {
  if (!object) return
  const {position, rotation, scale} = transform
  if (position) object.position.fromArray(position)
  if (rotation) object.rotation.set(rotation[0], rotation[1], rotation[2])
  if (scale) object.scale.fromArray(scale)
}

const setObjectOpacity = (object, opacity) => {
  object.traverse((child) => {
    if (!child.material) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    materials.forEach((material) => {
      material.transparent = true
      material.opacity = opacity
      material.needsUpdate = true
    })
  })
}

const createPortal = () => {
  const group = new THREE.Group()
  group.name = 'slam-magic-travel-portal'
  group.position.set(0, 1.35, -3.2)
  group.scale.setScalar(0.001)
  group.visible = false

  const innerMaterial = new THREE.MeshBasicMaterial({
    map: makeTextTexture(DESTINATIONS[0].name, DESTINATIONS[0].facts, '#ffb04f'),
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.94,
  })
  const innerWorld = new THREE.Mesh(new THREE.CircleGeometry(0.95, 96), innerMaterial)
  group.add(innerWorld)

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: DESTINATIONS[0].color,
    transparent: true,
    opacity: 0.9,
  })
  const outerRing = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.055, 24, 220), ringMaterial)
  group.add(outerRing)

  const innerRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.86, 0.018, 12, 180),
    new THREE.MeshBasicMaterial({color: 0x7ce0ff, transparent: true, opacity: 0.76})
  )
  group.add(innerRing)

  const runeGroup = new THREE.Group()
  const runeMaterial = new THREE.MeshBasicMaterial({color: 0xffd76b, transparent: true, opacity: 0.86})
  for (let i = 0; i < 28; i++) {
    const rune = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.018, 0.012), runeMaterial)
    const angle = (i / 28) * Math.PI * 2
    rune.position.set(Math.cos(angle) * 1.22, Math.sin(angle) * 1.22, 0.025)
    rune.rotation.z = angle
    runeGroup.add(rune)
  }
  group.add(runeGroup)

  const sparkMaterial = new THREE.PointsMaterial({
    color: 0xffc05f,
    size: 0.042,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const sparkPositions = []
  const sparkAngles = []
  const sparkRadii = []
  for (let i = 0; i < 420; i++) {
    const angle = Math.random() * Math.PI * 2
    const radius = 0.78 + Math.random() * 0.66
    sparkPositions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, (Math.random() - 0.5) * 0.24)
    sparkAngles.push(angle)
    sparkRadii.push(radius)
  }
  const sparkGeometry = new THREE.BufferGeometry()
  sparkGeometry.setAttribute('position', new THREE.Float32BufferAttribute(sparkPositions, 3))
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial)
  group.add(sparks)

  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1.18, 0.08, 96),
    new THREE.MeshStandardMaterial({color: 0x1a2945, roughness: 0.8, metalness: 0.2})
  )
  pedestal.position.set(0, -1.08, 0)
  pedestal.receiveShadow = true
  group.add(pedestal)

  group.userData = {
    innerWorld,
    innerMaterial,
    outerRing,
    innerRing,
    runeGroup,
    sparks,
    sparkAngles,
    sparkRadii,
    revealProgress: 0,
    destinationIndex: 0,
    baseScale: DEFAULT_PORTAL_SCALE,
  }
  return group
}

const updateDestination = (portal) => {
  const nextIndex = (portal.userData.destinationIndex + 1) % DESTINATIONS.length
  const destination = DESTINATIONS[nextIndex]
  portal.userData.destinationIndex = nextIndex
  portal.userData.innerMaterial.map.dispose()
  portal.userData.innerMaterial.map = makeTextTexture(
    destination.name,
    destination.facts,
    `#${destination.color.toString(16).padStart(6, '0')}`
  )
  portal.userData.innerMaterial.needsUpdate = true
  portal.userData.outerRing.material.color.set(destination.color)
  window.dispatchEvent(new CustomEvent('portal-destination-change', {detail: destination}))
}

export const initScenePipelineModule = () => {
  const clock = new THREE.Clock()
  let portal
  let isInsidePortal = false
  let lumaSplats
  let agentVideo
  let portalWorld
  let glbScene
  let gltfLoader
  let worldConfig = JSON.parse(JSON.stringify(DEFAULT_WORLD_CONFIG))
  let dissolveRealWorld = false
  let vrTourMode = false
  let vrMoveDirection = null
  const vrTourOffset = new THREE.Vector3()
  let worldOpacity = 1
  let smoothedCameraPosition = new THREE.Vector3()
  let hasSmoothedCameraPosition = false
  const cameraPortalPosition = new THREE.Vector3()
  const dragRight = new THREE.Vector3()
  const dragUp = new THREE.Vector3()
  let entryAudioContext
  let handTrail
  let handTrailGeometry
  let handTrailPositions
  const handTrailPoints = []
  let portalUnlockedByGesture = false
  let hasHandTrackingInput = false
  let fallbackPromptShown = false
  const dispatchTrackingStatus = () => {
    window.dispatchEvent(new CustomEvent('portal-tracking-change', {
      detail: {
        canEnter: true,
        source: '8th-wall-slam',
        state: 'stable',
      },
    }))
  }

  const placePortalInFrontOfCamera = () => {
    if (!portal) return

    const {camera} = XR8.Threejs.xrScene()
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
    const target = camera.position.clone().addScaledVector(forward, 3.2)
    portal.position.set(target.x, Math.max(1.05, target.y), target.z)
    portal.quaternion.copy(camera.quaternion)
    portal.rotation.x = 0
    portal.rotation.z = 0
    if (portalWorld) {
      portalWorld.position.copy(portal.position)
      portalWorld.quaternion.copy(portal.quaternion)
    }
    dispatchTrackingStatus()
  }


  const updateInstruction = (detail) => {
    window.dispatchEvent(new CustomEvent('portal-hand-gesture-change', {detail}))
  }

  const showFallbackPrompt = () => {
    if (hasHandTrackingInput || fallbackPromptShown || portalUnlockedByGesture) return
    fallbackPromptShown = true
    updateInstruction({
      state: 'fallback',
      progress: 0,
      message: 'Hand tracking is not available yet. Fallback: press and drag a full circle on the screen to summon the portal.',
    })
  }

  const createHandTrail = (scene) => {
    handTrailPositions = new Float32Array(HAND_TRAIL_POINTS * 3)
    handTrailGeometry = new THREE.BufferGeometry()
    handTrailGeometry.setAttribute('position', new THREE.BufferAttribute(handTrailPositions, 3))
    const material = new THREE.PointsMaterial({
      color: 0x7ce0ff,
      size: 0.045,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    handTrail = new THREE.Points(handTrailGeometry, material)
    handTrail.frustumCulled = false
    scene.add(handTrail)
  }

  const revealPortalFromGesture = () => {
    if (portalUnlockedByGesture || !portal) return
    portalUnlockedByGesture = true
    portal.visible = true
    placePortalInFrontOfCamera()
    playPortalEntrySound()
    updateInstruction({state: 'complete', progress: 1, message: 'Magic circle complete — portal opened on the ground plane.'})
  }

  const evaluateCircleGesture = () => {
    if (handTrailPoints.length < 28) return 0
    const first = handTrailPoints[0]
    const last = handTrailPoints[handTrailPoints.length - 1]
    const center = handTrailPoints.reduce((acc, point) => acc.add(point), new THREE.Vector3()).multiplyScalar(1 / handTrailPoints.length)
    const radii = handTrailPoints.map((point) => point.distanceTo(center))
    const radius = radii.reduce((sum, value) => sum + value, 0) / radii.length
    const variance = radii.reduce((sum, value) => sum + Math.abs(value - radius), 0) / radii.length
    const closed = THREE.MathUtils.clamp(1 - first.distanceTo(last) / Math.max(radius, 0.001), 0, 1)
    const roundness = THREE.MathUtils.clamp(1 - variance / Math.max(radius * 0.55, 0.001), 0, 1)
    const enoughSize = THREE.MathUtils.smoothstep(radius, 0.18, 0.42)
    const progress = closed * 0.45 + roundness * 0.35 + enoughSize * 0.2
    updateInstruction({state: 'drawing', progress, message: 'Trace a full circle with your index fingertip to summon the portal.'})
    if (progress > CIRCLE_COMPLETION_THRESHOLD) revealPortalFromGesture()
    return progress
  }

  const addHandTrailPoint = (screenX, screenY, source = 'fallback') => {
    if (source === 'hand') hasHandTrackingInput = true
    const {camera} = XR8.Threejs.xrScene()
    const ndc = new THREE.Vector3((screenX / window.innerWidth) * 2 - 1, -(screenY / window.innerHeight) * 2 + 1, 0.5)
    ndc.unproject(camera)
    const direction = ndc.sub(camera.position).normalize()
    const point = camera.position.clone().addScaledVector(direction, Math.abs(TRAIL_CAMERA_DEPTH / direction.z))
    handTrailPoints.push(point)
    if (handTrailPoints.length > HAND_TRAIL_POINTS) handTrailPoints.shift()
    handTrailPoints.forEach((trailPoint, index) => {
      handTrailPositions[index * 3] = trailPoint.x
      handTrailPositions[index * 3 + 1] = trailPoint.y
      handTrailPositions[index * 3 + 2] = trailPoint.z
    })
    handTrailGeometry.attributes.position.needsUpdate = true
    handTrailGeometry.setDrawRange(0, handTrailPoints.length)
    evaluateCircleGesture()
  }

  const vectorToScreenPoint = (position) => {
    if (!position) return null
    const {camera} = XR8.Threejs.xrScene()
    const vector = Array.isArray(position)
      ? new THREE.Vector3().fromArray(position)
      : new THREE.Vector3(position.x, position.y, position.z)
    vector.project(camera)
    return {
      x: (vector.x * 0.5 + 0.5) * window.innerWidth,
      y: (-vector.y * 0.5 + 0.5) * window.innerHeight,
    }
  }

  const readIndexTip = (hands) => {
    const hand = hands?.[0] || hands?.left || hands?.right || hands
    return hand?.landmarks?.[8] || hand?.joints?.indexFingerTip || hand?.indexTip || hand?.indexFingerTip
  }

  const readAttachmentIndexTip = (detail) => {
    const attachments = detail?.attachmentPoints || detail?.attachments || detail?.hand?.attachmentPoints
    return attachments?.indexNail || attachments?.indexTip || attachments?.indexUpper || attachments?.indexFingerTip
  }

  const addPointFromHandEvent = (event) => {
    const attachmentTip = readAttachmentIndexTip(event.detail)
    if (attachmentTip?.position) {
      const screenPoint = vectorToScreenPoint(attachmentTip.position)
      if (screenPoint) addHandTrailPoint(screenPoint.x, screenPoint.y, 'hand')
      return
    }

    const tip = readIndexTip(event.detail?.hands || event.detail?.hand || event.detail)
    if (!tip) return
    const x = tip.x <= 1 ? tip.x * window.innerWidth : tip.x
    const y = tip.y <= 1 ? tip.y * window.innerHeight : tip.y
    addHandTrailPoint(x, y, 'hand')
  }

  const playPortalEntrySound = () => {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return

    entryAudioContext ||= new AudioContext()
    if (entryAudioContext.state === 'suspended') {
      entryAudioContext.resume()
    }

    const now = entryAudioContext.currentTime
    const gain = entryAudioContext.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.28, now + 0.05)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9)
    gain.connect(entryAudioContext.destination)

    ;[392, 523.25, 783.99].forEach((frequency, index) => {
      const oscillator = entryAudioContext.createOscillator()
      oscillator.type = index === 0 ? 'sine' : 'triangle'
      oscillator.frequency.setValueAtTime(frequency, now)
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.18, now + 0.65)
      oscillator.connect(gain)
      oscillator.start(now + index * 0.04)
      oscillator.stop(now + 0.95)
    })
  }

  const initXrScene = ({scene, camera, renderer}) => {
    renderer.shadowMap.enabled = true
    renderer.outputColorSpace = THREE.SRGBColorSpace

    const ambientLight = new THREE.HemisphereLight(0xdcecff, 0x161927, 1.15)
    scene.add(ambientLight)

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
      lumaSplats.captureCubemap(renderer).then((capturedTexture) => {
        scene.environment = capturedTexture
      })
    }

    gltfLoader = new GLTFLoader()
    createHandTrail(scene)

    portal = createPortal()
    scene.add(portal)

    agentVideo = new AgentVideo()
    agentVideo.addToPortal(portal)

    const portalLight = new THREE.PointLight(0xffa640, 2.2, 4)
    portalLight.position.set(0, 0, 0.6)
    portal.add(portalLight)

    const planeGeometry = new THREE.PlaneGeometry(2000, 2000)
    planeGeometry.rotateX(-Math.PI / 2)
    const plane = new THREE.Mesh(planeGeometry, new THREE.ShadowMaterial({opacity: 0.42}))
    plane.receiveShadow = true
    scene.add(plane)
  }

  return {
    name: 'threejsinitscene',
    listeners: [
      {event: 'handcontroller.handfound', process: addPointFromHandEvent},
      {event: 'handcontroller.handupdated', process: addPointFromHandEvent},
      {event: 'handcontroller.handlost', process: showFallbackPrompt},
    ],

    onStart: ({canvas}) => {
      const {scene, camera, renderer} = XR8.Threejs.xrScene()

      initXrScene({scene, camera, renderer})

      let pinchStartDistance = 0
      let pinchStartScale = 1
      let activeTouchMode = 'none'
      let dragLastX = 0
      let dragLastY = 0
      let dragTotalMovement = 0

      const getTouchDistance = (touches) => {
        const dx = touches[0].clientX - touches[1].clientX
        const dy = touches[0].clientY - touches[1].clientY
        return Math.hypot(dx, dy)
      }

      canvas.addEventListener('touchmove', (event) => {
        event.preventDefault()

        if (event.touches.length === 2 && portal && pinchStartDistance > 0) {
          activeTouchMode = 'pinch'
          const nextScale = Math.max(
            MIN_PORTAL_SCALE,
            pinchStartScale * (getTouchDistance(event.touches) / pinchStartDistance)
          )
          portal.userData.baseScale = nextScale
          portal.scale.setScalar(nextScale)
          return
        }

        if (event.touches.length === 1 && portal && activeTouchMode === 'drag' && !isInsidePortal) {
          const touch = event.touches[0]
          const deltaX = touch.clientX - dragLastX
          const deltaY = touch.clientY - dragLastY
          dragLastX = touch.clientX
          dragLastY = touch.clientY
          dragTotalMovement += Math.hypot(deltaX, deltaY)

          const {camera} = XR8.Threejs.xrScene()
          dragRight.set(1, 0, 0).applyQuaternion(camera.quaternion)
          dragUp.set(0, 1, 0).applyQuaternion(camera.quaternion)
          portal.position.addScaledVector(dragRight, deltaX * PORTAL_DRAG_SENSITIVITY)
          portal.position.addScaledVector(dragUp, -deltaY * PORTAL_DRAG_SENSITIVITY)
          portal.position.y = Math.max(0.35, portal.position.y)
          if (portalWorld) portalWorld.position.copy(portal.position)
        }
      }, {passive: false})

      canvas.addEventListener(
        'touchstart', (event) => {
          if (event.touches.length === 2) {
            activeTouchMode = 'pinch'
            pinchStartDistance = getTouchDistance(event.touches)
            pinchStartScale = portal.userData.baseScale
            return
          }

          if (event.touches.length === 1) {
            activeTouchMode = 'drag'
            dragLastX = event.touches[0].clientX
            dragLastY = event.touches[0].clientY
            dragTotalMovement = 0
          }
        }, true
      )

      window.addEventListener('portal-recenter-request', () => { portalUnlockedByGesture = true; if (portal) portal.visible = true; placePortalInFrontOfCamera() })
      window.addEventListener('portal-hand-point', (event) => addHandTrailPoint(event.detail.x, event.detail.y, event.detail.source))
      window.addEventListener('handcontroller.handfound', addPointFromHandEvent)
      window.addEventListener('handcontroller.handupdated', addPointFromHandEvent)
      window.setTimeout(showFallbackPrompt, 4500)
      window.addEventListener('portal-dissolve-toggle', () => {
        dissolveRealWorld = !dissolveRealWorld
        window.dispatchEvent(new CustomEvent('portal-dissolve-change', {detail: {enabled: dissolveRealWorld}}))
      })
      window.addEventListener('portal-vr-toggle', (event) => {
        vrTourMode = event.detail?.enabled ?? !vrTourMode
        isInsidePortal = vrTourMode || isInsidePortal
        if (portalWorld) portalWorld.visible = isInsidePortal
        if (portal) portal.visible = !isInsidePortal
        window.dispatchEvent(new CustomEvent('portal-vr-change', {detail: {enabled: vrTourMode}}))
        window.dispatchEvent(new CustomEvent('portal-entry-change', {detail: {isInsidePortal}}))
      })
      window.addEventListener('portal-vr-move', (event) => {
        vrMoveDirection = event.detail.direction
      })
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
      dispatchTrackingStatus()

      canvas.addEventListener('touchend', (event) => {
        if (activeTouchMode === 'drag' && event.touches.length === 0 && dragTotalMovement < MAX_TAP_MOVEMENT) {
          if (portal.visible) updateDestination(portal)
        }

        if (event.touches.length === 0) {
          activeTouchMode = 'none'
          pinchStartDistance = 0
        }
      })
    },

    onProcessCpu: ({processCpuResult}) => {
      const tip = readIndexTip(processCpuResult?.hands || processCpuResult?.handDetections || processCpuResult?.handTracking)
      if (!tip) return
      const x = tip.x <= 1 ? tip.x * window.innerWidth : tip.x
      const y = tip.y <= 1 ? tip.y * window.innerHeight : tip.y
      addHandTrailPoint(x, y, 'hand')
    },

    onUpdate: () => {
      if (!portal) return

      const {camera} = XR8.Threejs.xrScene()
      const elapsed = clock.getElapsedTime()
      if (!hasSmoothedCameraPosition) {
        smoothedCameraPosition.copy(camera.position)
        hasSmoothedCameraPosition = true
      } else {
        smoothedCameraPosition.lerp(camera.position, 0.18)
      }

      portal.worldToLocal(cameraPortalPosition.copy(smoothedCameraPosition))
      const portalPlaneDistance = cameraPortalPosition.z
      const portalRadialDistance = Math.hypot(cameraPortalPosition.x, cameraPortalPosition.y)
      const thresholdRadius = isInsidePortal ? PORTAL_EXIT_RADIUS : PORTAL_ENTRY_RADIUS
      const isWithinPortalOpening = portalRadialDistance < thresholdRadius
      const isBehindPortal = isInsidePortal
        ? portalPlaneDistance < PORTAL_ENTRY_DEPTH
        : portalPlaneDistance < -PORTAL_ENTRY_DEPTH
      const shouldBeInsidePortal = vrTourMode || (isWithinPortalOpening && isBehindPortal)

      if (shouldBeInsidePortal !== isInsidePortal) {
        isInsidePortal = shouldBeInsidePortal
        window.dispatchEvent(new CustomEvent('portal-entry-change', {detail: {isInsidePortal}}))
        if (agentVideo) agentVideo.setActive(isInsidePortal)
        if (isInsidePortal) {
          portal.visible = false
          if (portalWorld) {
            portalWorld.position.copy(portal.position)
            portalWorld.quaternion.copy(portal.quaternion)
          }
          playPortalEntrySound()
        } else {
          portal.visible = true
        }
      }

      if (portalWorld) {
        portalWorld.visible = isInsidePortal
        if (isInsidePortal) {
          portalWorld.position.copy(portal.position).add(vrTourOffset)
          portalWorld.quaternion.copy(portal.quaternion)
        }
      }
      if (vrTourMode && vrMoveDirection) {
        const speed = 0.035
        if (vrMoveDirection === 'forward') vrTourOffset.z += speed
        if (vrMoveDirection === 'back') vrTourOffset.z -= speed
        if (vrMoveDirection === 'left') vrTourOffset.x += speed
        if (vrMoveDirection === 'right') vrTourOffset.x -= speed
      }
      worldOpacity += ((dissolveRealWorld ? 0.34 : 1) - worldOpacity) * WORLD_DISSOLVE_SPEED
      if (portalWorld) setObjectOpacity(portalWorld, worldOpacity)
      portal.userData.revealProgress += ((portalUnlockedByGesture ? 1 : 0) - portal.userData.revealProgress) * 0.08
      portal.scale.setScalar(portal.userData.baseScale * (isInsidePortal ? 0.001 : Math.max(0.001, portal.userData.revealProgress)))
      portal.userData.outerRing.material.opacity = isInsidePortal ? 0 : 0.9
      portal.userData.innerMaterial.opacity = isInsidePortal ? 0 : 0.94
      portal.userData.outerRing.rotation.z = elapsed * 0.85
      portal.userData.runeGroup.rotation.z = -elapsed * 0.55
      portal.userData.innerRing.rotation.z = -elapsed * 1.35
      const positions = portal.userData.sparks.geometry.attributes.position
      for (let i = 0; i < portal.userData.sparkAngles.length; i++) {
        const angle = portal.userData.sparkAngles[i] + elapsed * (0.75 + (i % 7) * 0.04)
        const radius = portal.userData.sparkRadii[i] + Math.sin(elapsed * 3 + i) * 0.035
        positions.setXYZ(i, Math.cos(angle) * radius, Math.sin(angle) * radius, Math.sin(elapsed * 4 + i) * 0.12)
      }
      positions.needsUpdate = true
      portal.userData.sparks.rotation.z = elapsed * 0.32
      portal.userData.innerWorld.scale.setScalar(1 + Math.sin(elapsed * 2.4) * 0.018)
      if (agentVideo) agentVideo.update(camera)
    },
  }
}
