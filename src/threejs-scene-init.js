// Defines an 8th Wall XR Camera Pipeline Module that anchors a Dr. Strange-inspired
// travel portal into the SLAM-tracked world and keeps it animated with three.js.
import * as THREE from 'three'

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

const makePanoramaTexture = (destination) => {
  const canvas = document.createElement('canvas')
  canvas.width = 2048
  canvas.height = 1024
  const context = canvas.getContext('2d')

  const sky = context.createLinearGradient(0, 0, 0, 1024)
  sky.addColorStop(0, '#07142d')
  sky.addColorStop(0.42, '#25416e')
  sky.addColorStop(0.7, '#f0a35c')
  sky.addColorStop(1, '#1b1b24')
  context.fillStyle = sky
  context.fillRect(0, 0, 2048, 1024)

  context.fillStyle = 'rgba(255, 255, 255, 0.62)'
  for (let i = 0; i < 120; i++) {
    const x = (i * 97) % 2048
    const y = 35 + ((i * 53) % 330)
    context.fillRect(x, y, 2, 2)
  }

  context.fillStyle = `#${destination.color.toString(16).padStart(6, '0')}`
  for (let i = 0; i < 18; i++) {
    const x = i * 130 - 90
    const height = 170 + ((i * 47) % 260)
    context.beginPath()
    context.moveTo(x, 820)
    context.lineTo(x + 82, 820 - height)
    context.lineTo(x + 164, 820)
    context.closePath()
    context.fill()
  }

  context.fillStyle = 'rgba(4, 8, 18, 0.72)'
  context.fillRect(0, 820, 2048, 204)

  context.fillStyle = '#ffffff'
  context.font = '800 92px sans-serif'
  context.textAlign = 'center'
  context.fillText(destination.name, 1024, 520)

  context.font = '500 42px sans-serif'
  context.fillText('360 preview room — premium mode can swap this for Gaussian splat capture', 1024, 590)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

const createPortal = () => {
  const group = new THREE.Group()
  group.name = 'slam-magic-travel-portal'
  group.position.set(0, 1.35, -3.2)

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
  const outerRing = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.055, 16, 160), ringMaterial)
  group.add(outerRing)

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
    size: 0.035,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  })
  const sparkPositions = []
  for (let i = 0; i < 180; i++) {
    const angle = Math.random() * Math.PI * 2
    const radius = 0.78 + Math.random() * 0.58
    sparkPositions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, (Math.random() - 0.5) * 0.18)
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

  group.userData = {innerWorld, innerMaterial, outerRing, runeGroup, sparks, destinationIndex: 0}
  return group
}

const updateDestination = (portal, panoramaRoom) => {
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
  panoramaRoom.material.map.dispose()
  panoramaRoom.material.map = makePanoramaTexture(destination)
  panoramaRoom.material.needsUpdate = true

  window.dispatchEvent(new CustomEvent('portal-destination-change', {detail: destination}))
}

export const initScenePipelineModule = () => {
  const clock = new THREE.Clock()
  let portal
  let panoramaRoom
  let isInsidePortal = false

  const initXrScene = ({scene, camera, renderer}) => {
    renderer.shadowMap.enabled = true
    renderer.outputColorSpace = THREE.SRGBColorSpace

    const ambientLight = new THREE.HemisphereLight(0xdcecff, 0x161927, 1.15)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.85)
    directionalLight.position.set(3, 6, 4)
    directionalLight.castShadow = true
    scene.add(directionalLight)

    panoramaRoom = new THREE.Mesh(
      new THREE.SphereGeometry(18, 64, 32),
      new THREE.MeshBasicMaterial({
        map: makePanoramaTexture(DESTINATIONS[0]),
        side: THREE.BackSide,
        transparent: true,
        opacity: 0,
      })
    )
    panoramaRoom.name = 'walk-through-360-destination-room'
    panoramaRoom.visible = true
    scene.add(panoramaRoom)

    const portalLight = new THREE.PointLight(0xffa640, 2.2, 4)
    portalLight.position.set(0, 1.35, -2.6)
    scene.add(portalLight)

    portal = createPortal()
    scene.add(portal)

    const planeGeometry = new THREE.PlaneGeometry(2000, 2000)
    planeGeometry.rotateX(-Math.PI / 2)
    const plane = new THREE.Mesh(planeGeometry, new THREE.ShadowMaterial({opacity: 0.42}))
    plane.receiveShadow = true
    scene.add(plane)

    camera.position.set(0, 2, 2)
  }

  return {
    name: 'threejsinitscene',

    onStart: ({canvas}) => {
      const {scene, camera, renderer} = XR8.Threejs.xrScene()

      initXrScene({scene, camera, renderer})

      canvas.addEventListener('touchmove', (event) => {
        event.preventDefault()
      })

      XR8.XrController.updateCameraProjectionMatrix(
        {origin: camera.position, facing: camera.quaternion}
      )

      canvas.addEventListener(
        'touchstart', (event) => {
          if (event.touches.length === 1) {
            XR8.XrController.recenter()
            updateDestination(portal, panoramaRoom)
          }
        }, true
      )
    },

    onUpdate: () => {
      if (!portal) return

      const {camera} = XR8.Threejs.xrScene()
      const elapsed = clock.getElapsedTime()
      const distanceToPortal = camera.position.distanceTo(portal.position)
      const shouldBeInsidePortal = distanceToPortal < 1.25

      if (shouldBeInsidePortal !== isInsidePortal) {
        isInsidePortal = shouldBeInsidePortal
        window.dispatchEvent(new CustomEvent('portal-entry-change', {detail: {isInsidePortal}}))
      }

      panoramaRoom.position.copy(camera.position)
      panoramaRoom.material.opacity = THREE.MathUtils.lerp(
        panoramaRoom.material.opacity,
        isInsidePortal ? 1 : 0,
        0.12
      )

      portal.userData.outerRing.rotation.z = elapsed * 0.85
      portal.userData.runeGroup.rotation.z = -elapsed * 0.55
      portal.userData.sparks.rotation.z = elapsed * 0.32
      portal.userData.innerWorld.scale.setScalar(1 + Math.sin(elapsed * 2.4) * 0.018)
    },
  }
}
