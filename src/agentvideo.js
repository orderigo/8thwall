// agentvideo.js controls the hologram guide video that appears after portal entry.
import * as THREE from 'three'
import presenterVideoSource from './assets/presenter.mp4'

const FEET_TO_METERS = 0.3048
const AGENT_DISTANCE_FEET = 2
const AGENT_DISTANCE_METERS = AGENT_DISTANCE_FEET * FEET_TO_METERS

const CHROMA_KEY_COLOR = new THREE.Color(0x00ff00)

const createVideoElement = () => {
  const video = document.createElement('video')
  video.src = presenterVideoSource
  video.crossOrigin = 'anonymous'
  video.loop = true
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.setAttribute('playsinline', '')
  video.setAttribute('webkit-playsinline', '')
  video.load()
  return video
}

const createGreenScreenMaterial = (videoTexture) => new THREE.ShaderMaterial({
  uniforms: {
    videoMap: {value: videoTexture},
    keyColor: {value: CHROMA_KEY_COLOR},
    similarity: {value: 0.38},
    smoothness: {value: 0.08},
    spill: {value: 0.18},
  },
  vertexShader: `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D videoMap;
    uniform vec3 keyColor;
    uniform float similarity;
    uniform float smoothness;
    uniform float spill;
    varying vec2 vUv;

    void main() {
      vec4 videoColor = texture2D(videoMap, vUv);
      float chromaDistance = distance(videoColor.rgb, keyColor);
      float alpha = smoothstep(similarity, similarity + smoothness, chromaDistance);
      float greenSpill = smoothstep(0.0, spill, videoColor.g - max(videoColor.r, videoColor.b));
      vec3 cleanedColor = mix(videoColor.rgb, vec3(videoColor.r, min(videoColor.g, max(videoColor.r, videoColor.b)), videoColor.b), greenSpill * (1.0 - alpha));

      if (alpha < 0.03) discard;
      gl_FragColor = vec4(cleanedColor, videoColor.a * alpha);
    }
  `,
  transparent: true,
  side: THREE.DoubleSide,
  depthWrite: false,
})

export class AgentVideo {
  constructor() {
    this.video = createVideoElement()
    this.texture = new THREE.VideoTexture(this.video)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.minFilter = THREE.LinearFilter
    this.texture.magFilter = THREE.LinearFilter

    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.92, 1.64),
      createGreenScreenMaterial(this.texture)
    )
    this.mesh.name = 'portal-hologram-agent-video'
    this.mesh.position.set(0, 0.05, -AGENT_DISTANCE_METERS)
    this.mesh.renderOrder = 12
    this.mesh.visible = false
  }

  addToPortal(portal) {
    portal.add(this.mesh)
  }

  setActive(isActive) {
    this.mesh.visible = isActive

    if (isActive) {
      const playPromise = this.video.play()
      if (playPromise) playPromise.catch(() => {})
      return
    }

    this.video.pause()
    this.video.currentTime = 0
  }

  update(camera) {
    if (!this.mesh.visible) return
    this.mesh.lookAt(camera.position)
  }
}
