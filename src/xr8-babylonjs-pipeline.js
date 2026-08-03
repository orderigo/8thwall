/**
 * Custom 8th Wall Pipeline Module for Babylon.js
 * This module bridges 8th Wall's SLAM tracking with Babylon.js 3D engine
 * 
 * Features:
 * - Full Babylon.js scene with camera sync from 8th Wall
 * - Portal system with ground placement
 * - Animated door
 * - Portal world (inside)
 * - Entry/exit detection
 * - Public API for control
 */

const DOOR_REAL_WORLD_HEIGHT_METERS = 6.15
const DOOR_OPEN_DISTANCE_METERS = 1.35
const DOOR_CLOSE_DISTANCE_METERS = 1.8
const PORTAL_ENTRY_RADIUS = 2.7
const PORTAL_EXIT_RADIUS = 4.05
const PORTAL_ENTRY_DEPTH = 0.2
const PLACEMENT_DISTANCE_METERS = 4.6
const MAX_TAP_MOVEMENT = 10

let engine
let scene
let camera
let canvas
let portal
let door
let doorRoot
let doorOpen = false
let doorReady = false
let portalRaised = false
let portalWorld
let marker
let isInsidePortal = false
let selectedGroundPoint = new BABYLON.Vector3(0, 0, -PLACEMENT_DISTANCE_METERS)
let hasSmoothedCameraPosition = false
let smoothedCameraPosition = new BABYLON.Vector3()

/**
 * Play portal entry sound effect
 */
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

/**
 * Fit object to target height
 */
const fitObjectToHeight = (object, targetHeight) => {
  const boundingInfo = object.getBoundingInfo()
  const height = boundingInfo.boundingBox.maximum.y - boundingInfo.boundingBox.minimum.y
  const scale = targetHeight / height
  object.scaling.scaleInPlace(scale)
  
  // Center the object
  const center = boundingInfo.boundingBox.center
  object.position.subtractInPlace(center)
  object.position.y += targetHeight / 2
  
  return scale
}

/**
 * Orient object to face the camera on the ground
 */
const orientToCameraOnGround = (object, camera) => {
  const dx = camera.position.x - object.position.x
  const dz = camera.position.z - object.position.z
  object.rotation.y = Math.atan2(dx, dz)
}

/**
 * Create placement marker for ground selection
 */
const createPlacementMarker = () => {
  const markerGroup = new BABYLON.TransformNode("ground-placement-marker")
  
  const ring = BABYLON.MeshBuilder.CreateTorus("marker-ring", {
    diameter: 0.65,
    thickness: 0.06,
    tessellation: 96,
    sideOrientation: BABYLON.Mesh.DOUBLESIDE
  }, scene)
  ring.rotation.x = Math.PI / 2
  
  const dot = BABYLON.MeshBuilder.CreateDisc("marker-dot", {
    radius: 0.075,
    tessellation: 40,
    sideOrientation: BABYLON.Mesh.DOUBLESIDE
  }, scene)
  dot.rotation.x = Math.PI / 2
  
  const ringMaterial = new BABYLON.StandardMaterial("ring-material", scene)
  ringMaterial.diffuseColor = new BABYLON.Color3(0.49, 0.88, 1)
  ringMaterial.emissiveColor = new BABYLON.Color3(0.49, 0.88, 1)
  ringMaterial.alpha = 0.9
  ring.material = ringMaterial
  
  const dotMaterial = new BABYLON.StandardMaterial("dot-material", scene)
  dotMaterial.diffuseColor = new BABYLON.Color3(1, 0.85, 0.43)
  dotMaterial.emissiveColor = new BABYLON.Color3(1, 0.85, 0.43)
  dotMaterial.alpha = 0.95
  dot.material = dotMaterial
  
  markerGroup.add(ring)
  markerGroup.add(dot)
  scene.add(markerGroup)
  
  return markerGroup
}

/**
 * Create the portal with animated door
 */
const createPortal = () => {
  const group = new BABYLON.TransformNode("ground-door-portal")
  group.setEnabled(false)
  group.position.copyFrom(selectedGroundPoint)
  
  // Base
  const base = BABYLON.MeshBuilder.CreateDisc("portal-base", {
    radius: 0.75,
    tessellation: 96,
    sideOrientation: BABYLON.Mesh.DOUBLESIDE
  }, scene)
  base.rotation.x = -Math.PI / 2
  base.position.y = -0.01
  
  const baseMaterial = new BABYLON.StandardMaterial("base-material", scene)
  baseMaterial.diffuseColor = new BABYLON.Color3(0.1, 0.16, 0.28)
  baseMaterial.roughness = 0.78
  baseMaterial.metallic = 0.18
  base.material = baseMaterial
  
  group.add(base)
  
  // Load door model
  BABYLON.SceneLoader.ImportMesh(
    "",
    "/assets/",
    "lowpoly_animated_doors_blender_file.glb",
    scene,
    (meshes) => {
      doorRoot = new BABYLON.TransformNode("door-root")
      meshes.forEach(mesh => doorRoot.add(mesh))
      
      doorRoot.name = "lowpoly-animated-door-portal-model"
      fitObjectToHeight(doorRoot, DOOR_REAL_WORLD_HEIGHT_METERS)
      
      // Position door on base
      doorRoot.position.y = DOOR_REAL_WORLD_HEIGHT_METERS / 2
      doorRoot.position.z = 0.1
      
      group.add(doorRoot)
      
      // Find door mesh for animations
      door = doorRoot.getChildMeshes().find(m => m.name.includes('door') || m.name.includes('Door'))
      
      if (door) {
        doorReady = true
      }
    },
    (progressEvent) => {
      // Loading progress
    },
    (error) => {
      console.error('Error loading door model:', error)
    }
  )
  
  // Portal light
  const portalLight = new BABYLON.PointLight("portal-light", new BABYLON.Vector3(0, 1.2, 0.45), scene)
  portalLight.intensity = 2.2
  portalLight.range = 4
  portalLight.diffuse = new BABYLON.Color3(1, 0.65, 0.25)
  group.add(portalLight)
  
  scene.add(group)
  return group
}

/**
 * Create the portal world (inside)
 */
const createPortalWorld = () => {
  const group = new BABYLON.TransformNode("editable-portal-world")
  group.setEnabled(false)
  
  // Add a sample environment
  const ground = BABYLON.MeshBuilder.CreateGround("world-ground", {
    width: 100,
    height: 100
  }, scene)
  const groundMaterial = new BABYLON.StandardMaterial("world-ground-material", scene)
  groundMaterial.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.2)
  ground.material = groundMaterial
  group.add(ground)
  
  // Add a sample box
  const box = BABYLON.MeshBuilder.CreateBox("sample-box", { size: 2 }, scene)
  box.position.set(0, 1, -3)
  box.material = new BABYLON.StandardMaterial("box-material", scene)
  box.material.diffuseColor = new BABYLON.Color3(0.8, 0.2, 0.2)
  group.add(box)
  
  // Add a sphere
  const sphere = BABYLON.MeshBuilder.CreateSphere("sample-sphere", {
    diameter: 1.5,
    segments: 32
  }, scene)
  sphere.position.set(3, 1.5, -2)
  sphere.material = new BABYLON.StandardMaterial("sphere-material", scene)
  sphere.material.diffuseColor = new BABYLON.Color3(0.2, 0.8, 0.2)
  group.add(sphere)
  
  // Add a cylinder
  const cylinder = BABYLON.MeshBuilder.CreateCylinder("sample-cylinder", {
    height: 2,
    diameter: 1,
    tessellation: 32
  }, scene)
  cylinder.position.set(-3, 1, -2)
  cylinder.material = new BABYLON.StandardMaterial("cylinder-material", scene)
  cylinder.material.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.8)
  group.add(cylinder)
  
  scene.add(group)
  return group
}

/**
 * Set door open/close state
 */
const setDoorOpen = (open) => {
  if (doorOpen === open || !doorReady || !doorRoot) return
  
  doorOpen = open
  
  // Simple rotation animation
  const targetRotation = open ? -Math.PI / 2 : 0
  const animation = new BABYLON.Animation(
    "doorAnimation",
    "rotation.y",
    30,
    BABYLON.Animation.ANIMATIONTYPE_FLOAT,
    BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT
  )
  
  const keys = [
    { frame: 0, value: doorRoot.rotation.y },
    { frame: 30, value: targetRotation }
  ]
  
  animation.setKeys(keys)
  doorRoot.animations = [animation]
  
  scene.beginDirectAnimation(
    doorRoot,
    [animation],
    0,
    30,
    false,
    1,
    () => {
      window.dispatchEvent(new CustomEvent('portal-door-change', { detail: { open } }))
    }
  )
}

/**
 * Set placement point from screen coordinates
 */
const setPlacementPointFromScreen = (screenX, screenY) => {
  if (!XR8.Threejs || !XR8.Threejs.xrScene) return
  
  const threeCamera = XR8.Threejs.xrScene().camera
  const threeScene = XR8.Threejs.xrScene()
  
  // Convert screen coordinates to NDC
  const ndc = new THREE.Vector2(
    (screenX / window.innerWidth) * 2 - 1,
    -(screenY / window.innerHeight) * 2 + 1
  )
  
  // Create raycaster
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(ndc, threeCamera)
  
  // Ground plane
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const hit = new THREE.Vector3()
  
  if (raycaster.ray.intersectPlane(groundPlane, hit) && hit.distanceTo(threeCamera.position) >= 0.35) {
    selectedGroundPoint.set(hit.x, 0, hit.z)
  } else {
    // Fallback: place in front of camera
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(threeCamera.quaternion)
    forward.y = 0
    forward.normalize()
    hit.copy(threeCamera.position).addScaledVector(forward, PLACEMENT_DISTANCE_METERS)
    hit.y = 0
    selectedGroundPoint.set(hit.x, 0, hit.z)
  }
  
  if (marker) {
    marker.position.copyFrom(selectedGroundPoint)
    orientToCameraOnGround(marker, threeCamera)
  }
  
  window.dispatchEvent(new CustomEvent('portal-placement-change', {
    detail: { state: 'ready', message: 'Ground point selected. Press Open Portal to raise the door here.' }
  }))
}

/**
 * Raise portal at selected point
 */
const raisePortalAtSelectedPoint = () => {
  if (!portal || portalRaised) return
  
  const threeCamera = XR8.Threejs.xrScene().camera
  
  portalRaised = true
  portal.setEnabled(true)
  portal.position.copyFrom(selectedGroundPoint)
  orientToCameraOnGround(portal, threeCamera)
  
  if (marker) marker.setEnabled(false)
  
  if (portalWorld) {
    portalWorld.position.copyFrom(selectedGroundPoint)
    portalWorld.rotation.copyFrom(portal.rotation)
  }
  
  playPortalEntrySound()
  
  window.dispatchEvent(new CustomEvent('portal-placement-change', {
    detail: { state: 'opened', message: 'Door portal is placed. Walk closer to open the door.' }
  }))
  
  window.dispatchEvent(new CustomEvent('portal-tracking-change', {
    detail: { canEnter: true, source: '8th-wall-ground', state: 'stable', message: 'Door portal placed. Walk closer to open it.' }
  }))
}

/**
 * Recenter portal placement
 */
const recenterPortal = () => {
  portalRaised = false
  if (portal) portal.setEnabled(false)
  if (marker) marker.setEnabled(true)
  setPlacementPointFromScreen(window.innerWidth / 2, window.innerHeight / 2)
  
  window.dispatchEvent(new CustomEvent('portal-placement-change', {
    detail: { state: 'ready', message: 'Choose a new ground point, then tap Open Portal.' }
  }))
}

/**
 * Main pipeline module export
 */
export const BabylonjsPipelineModule = () => {
  return {
    name: 'xr8-babylonjs',
    
    onStart: ({ canvas: canvasParam }) => {
      canvas = canvasParam
      
      // Create Babylon.js engine and scene
      engine = new BABYLON.Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
        alpha: true,
        antialias: true
      })
      
      scene = new BABYLON.Scene(engine)
      
      // Create camera (will be controlled by 8th Wall)
      camera = new BABYLON.FreeCamera("xr-camera", new BABYLON.Vector3(0, 1.6, 0), scene)
      camera.attachControl(canvas, false) // Don't attach default controls
      
      // Lighting
      const hemiLight = new BABYLON.HemisphericLight(
        "hemi-light",
        new BABYLON.Vector3(0, 1, 0),
        scene
      )
      hemiLight.intensity = 1.15
      hemiLight.diffuse = new BABYLON.Color3(0.86, 0.89, 1)
      hemiLight.groundColor = new BABYLON.Color3(0.09, 0.1, 0.16)
      
      const dirLight = new BABYLON.DirectionalLight(
        "dir-light",
        new BABYLON.Vector3(3, -6, 4),
        scene
      )
      dirLight.intensity = 0.85
      
      // Ground
      const ground = BABYLON.MeshBuilder.CreateGround(
        "ground",
        { width: 2000, height: 2000 },
        scene
      )
      const groundMaterial = new BABYLON.StandardMaterial("ground-material", scene)
      groundMaterial.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1)
      ground.material = groundMaterial
      
      // Create placement marker
      marker = createPlacementMarker()
      
      // Create portal
      portal = createPortal()
      
      // Create portal world
      portalWorld = createPortalWorld()
      
      // Set initial placement point
      setPlacementPointFromScreen(window.innerWidth / 2, window.innerHeight / 2)
      
      // Start render loop
      engine.runRenderLoop(() => {
        if (scene) {
          scene.render()
        }
      })
      
      // Handle window resize
      window.addEventListener('resize', () => {
        if (engine) {
          engine.resize()
        }
      })
      
      // Dispatch ready event
      window.dispatchEvent(new CustomEvent('babylonjs-ready', {
        detail: { engine, scene, camera }
      }))
    },
    
    onUpdate: () => {
      if (!camera || !XR8.Threejs || !XR8.Threejs.xrScene) return
      
      const threeCamera = XR8.Threejs.xrScene().camera
      const threeScene = XR8.Threejs.xrScene()
      
      // Sync Babylon.js camera with 8th Wall's Three.js camera
      camera.position.set(
        threeCamera.position.x,
        threeCamera.position.y,
        threeCamera.position.z
      )
      camera.rotation.set(
        threeCamera.rotation.x,
        threeCamera.rotation.y,
        threeCamera.rotation.z
      )
      
      // Smooth camera position
      if (!hasSmoothedCameraPosition) {
        smoothedCameraPosition.copyFrom(camera.position)
        hasSmoothedCameraPosition = true
      } else {
        smoothedCameraPosition.scaleInPlace(0.82)
        smoothedCameraPosition.addInPlace(camera.position.scale(0.18))
      }
      
      // Update placement marker if portal not raised
      if (!portalRaised) {
        setPlacementPointFromScreen(window.innerWidth / 2, window.innerHeight / 2)
      }
      
      // Portal logic
      if (portalRaised && portal) {
        // Calculate distance to portal
        const cameraPos = smoothedCameraPosition
        const portalPos = portal.position
        const distanceToPortal = BABYLON.Vector3.Distance(
          new BABYLON.Vector3(cameraPos.x, 0, cameraPos.z),
          new BABYLON.Vector3(portalPos.x, 0, portalPos.z)
        )
        
        // Open/close door based on distance
        if (!doorOpen && distanceToPortal < DOOR_OPEN_DISTANCE_METERS) {
          setDoorOpen(true)
        }
        if (doorOpen && distanceToPortal > DOOR_CLOSE_DISTANCE_METERS) {
          setDoorOpen(false)
        }
        
        // Calculate portal-relative camera position
        const cameraPortalPosition = cameraPos.subtract(portalPos)
        const portalRadialDistance = Math.sqrt(
          cameraPortalPosition.x * cameraPortalPosition.x +
          (cameraPortalPosition.y - 1.05) * (cameraPortalPosition.y - 1.05)
        )
        const portalPlaneDistance = cameraPortalPosition.z
        
        const thresholdRadius = isInsidePortal ? PORTAL_EXIT_RADIUS : PORTAL_ENTRY_RADIUS
        const shouldBeInsidePortal = portalRadialDistance < thresholdRadius && 
                                   portalPlaneDistance < -PORTAL_ENTRY_DEPTH
        
        if (shouldBeInsidePortal !== isInsidePortal) {
          isInsidePortal = shouldBeInsidePortal
          
          if (portalWorld) {
            portalWorld.setEnabled(isInsidePortal)
          }
          if (portal) {
            portal.setEnabled(!isInsidePortal)
          }
          
          window.dispatchEvent(new CustomEvent('portal-entry-change', {
            detail: { isInsidePortal }
          }))
          
          if (isInsidePortal) {
            playPortalEntrySound()
          }
        }
        
        // Sync portal world position
        if (portalWorld && isInsidePortal) {
          portalWorld.position.copyFrom(portal.position)
          portalWorld.rotation.copyFrom(portal.rotation)
        }
      }
    },
    
    // Public methods
    raisePortal: raisePortalAtSelectedPoint,
    recenterPortal: recenterPortal,
    
    getScene: () => scene,
    getCamera: () => camera,
    getEngine: () => engine,
    getPortal: () => portal,
    getPortalWorld: () => portalWorld
  }
}
