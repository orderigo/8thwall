// app.js is the main entry point for the SLAM-tracked Magic Portal app.

import {initScenePipelineModule} from './threejs-scene-init'
import * as THREE from 'three'

window.THREE = THREE

const PORTAL_EDITOR_PIN = import.meta.env.VITE_PORTAL_EDITOR_PIN || 'portal-admin'
const PORTAL_EDITOR_UNLOCK_KEY = 'portal-editor-unlocked'

const EDITOR_TARGETS = {
  greenScreen: 'Green Screen Plane',
  gaussianSplat: 'Gaussian Splat World',
  glb: 'GLB Asset',
}

const editorDefaults = {
  greenScreen: {position: [0, 1.18, -1.35], rotation: [0, 0, 0], scale: [1.55, 1.55, 1]},
  gaussianSplat: {position: [0, 0, -1.2], rotation: [0, 180, 0], scale: [0.58, 0.58, 0.58]},
  glb: {position: [0.72, 0, -1.6], rotation: [0, 0, 0], scale: [1, 1, 1]},
}

const editorState = {
  target: 'greenScreen',
  transforms: JSON.parse(JSON.stringify(editorDefaults)),
}

const emitEditorUpdate = (extra = {}) => {
  const transform = editorState.transforms[editorState.target]
  window.dispatchEvent(new CustomEvent('portal-editor-update', {
    detail: {
      target: editorState.target,
      transform: {
        position: transform.position,
        rotation: transform.rotation.map(THREE.MathUtils.degToRad),
        scale: transform.scale,
      },
      ...extra,
    },
  }))
}

const destinationResponses = {
  'Bagan, Myanmar': 'Bagan portal is ready. Ask about temple history, sunrise routes, or responsible travel etiquette.',
  'Kyoto, Japan': 'Kyoto portal is ready. Ask about shrines, seasonal walking paths, tea culture, or local manners.',
  'Machu Picchu, Peru': 'Machu Picchu portal is ready. Ask about Inca engineering, altitude prep, or trail planning.',
}

const buildHomePage = ({onExplore}) => {
  const home = document.createElement('main')
  home.className = 'home-page'
  home.innerHTML = `
    <div class="home-page__aurora home-page__aurora--one"></div>
    <div class="home-page__aurora home-page__aurora--two"></div>
    <section class="hero-card" aria-labelledby="hero-title">
      <div class="hero-card__content">
        <p class="hero-card__eyebrow">High Tech × Magic Travel</p>
        <h1 id="hero-title">Open AR portals and explore worlds across the globe.</h1>
        <p class="hero-card__copy">
          Step into a cinematic portal chamber where intelligent travel guidance, glowing arcane energy,
          and spatial AR combine to reveal destinations from Myanmar to Japan and Peru.
        </p>
        <div class="hero-card__actions">
          <button class="hero-card__button" type="button">Explore Portal</button>
          <span class="hero-card__hint">Launches the Original Portal View</span>
        </div>
      </div>
      <div class="portal-preview" aria-hidden="true">
        <div class="portal-preview__ring"></div>
        <div class="portal-preview__core">
          <span>Original<br>Portal</span>
        </div>
        <div class="portal-preview__orbit portal-preview__orbit--one"></div>
        <div class="portal-preview__orbit portal-preview__orbit--two"></div>
      </div>
    </section>
    <section class="feature-grid" aria-label="Portal features">
      <article>
        <span>01</span>
        <h2>Arcane Gateway</h2>
        <p>Magic-style runes and radiant energy introduce the immersive AR experience.</p>
      </article>
      <article>
        <span>02</span>
        <h2>Smart Guide</h2>
        <p>An on-screen portal agent stays ready to answer destination questions.</p>
      </article>
      <article>
        <span>03</span>
        <h2>World Explorer</h2>
        <p>Tap the portal to rotate global destinations, then walk through the threshold.</p>
      </article>
    </section>
  `

  home.querySelector('.hero-card__button').addEventListener('click', () => {
    home.classList.add('home-page--exiting')
    window.setTimeout(() => {
      home.remove()
      onExplore()
    }, 420)
  })

  document.body.prepend(home)
}

const buildAgentOverlay = () => {
  const panel = document.createElement('section')
  panel.className = 'agent-panel'
  panel.innerHTML = `
    <button class="agent-panel__minimize" type="button" aria-expanded="true" aria-label="Minimize agent chat">Minimize</button>
    <div class="agent-panel__header">
      <span class="agent-panel__status"></span>
      <div>
        <p class="agent-panel__eyebrow">Original Portal LLM Agent</p>
        <h1>Ask the guide</h1>
      </div>
    </div>
    <p class="agent-panel__destination">Destination: <strong>Bagan, Myanmar</strong></p>
    <div class="agent-panel__tracking">
      <p>8th Wall SLAM: <strong>Stable</strong> <span>— ready to enter</span></p>
      <button class="agent-panel__recenter" type="button">Recenter portal</button>
      <button class="agent-panel__dissolve" type="button" aria-pressed="false">Dissolve real world</button>
    </div>
    <div class="agent-panel__log" aria-live="polite">
      <p><strong>Agent:</strong> Welcome to the Original Portal. Drag to move it, pinch to scale it, tap to rotate destinations, then walk through to enter the Luma 3D environment.</p>
    </div>
    <section class="portal-editor-access" aria-label="Portal editor access">
      <button class="portal-editor-access__toggle" type="button" aria-expanded="false">Editor access</button>
      <form class="portal-editor-access__form" hidden>
        <label>Admin PIN <input class="portal-editor-access__pin" type="password" autocomplete="off" inputmode="text" placeholder="Enter editor PIN" /></label>
        <button type="submit">Unlock editor</button>
        <p class="portal-editor-access__error" role="status"></p>
      </form>
    </section>
    <details class="portal-editor" hidden>
      <summary>three.js Portal World Editor</summary>
      <label>Asset <select class="portal-editor__target">
        ${Object.entries(EDITOR_TARGETS).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}
      </select></label>
      <label class="portal-editor__url">GLB URL <input class="portal-editor__glb-url" placeholder="/models/world.glb or https://..." /></label>
      <div class="portal-editor__grid" aria-label="Transform controls">
        ${['position', 'rotation', 'scale'].map((kind) => ['x', 'y', 'z'].map((axis, index) => `
          <label>${kind[0].toUpperCase()}${axis.toUpperCase()}
            <input type="number" step="0.01" data-kind="${kind}" data-axis="${index}" value="${editorState.transforms.greenScreen[kind][index]}">
          </label>`).join('')).join('')}
      </div>
      <p>Position, rotation, and scale are applied live so green-screen planes, Gaussian splats, and GLB files can be placed precisely.</p>
    </details>
    <form class="agent-panel__form">
      <input aria-label="Ask the portal guide" placeholder="e.g. What should I notice here?" />
      <button type="submit">Ask</button>
    </form>
  `
  document.body.appendChild(panel)

  const minimizeButton = panel.querySelector('.agent-panel__minimize')
  const destination = panel.querySelector('.agent-panel__destination strong')
  const log = panel.querySelector('.agent-panel__log')
  const tracking = panel.querySelector('.agent-panel__tracking')
  const recenterButton = panel.querySelector('.agent-panel__recenter')
  const dissolveButton = panel.querySelector('.agent-panel__dissolve')
  const editorAccess = panel.querySelector('.portal-editor-access')
  const editorAccessToggle = panel.querySelector('.portal-editor-access__toggle')
  const editorAccessForm = panel.querySelector('.portal-editor-access__form')
  const editorAccessPin = panel.querySelector('.portal-editor-access__pin')
  const editorAccessError = panel.querySelector('.portal-editor-access__error')
  const editor = panel.querySelector('.portal-editor')
  const form = panel.querySelector('.agent-panel__form')
  const input = form.querySelector('input')

  minimizeButton.addEventListener('click', () => {
    const isMinimized = panel.classList.toggle('agent-panel--minimized')
    minimizeButton.textContent = isMinimized ? 'Open' : 'Minimize'
    minimizeButton.setAttribute('aria-expanded', String(!isMinimized))
    minimizeButton.setAttribute('aria-label', isMinimized ? 'Open agent chat' : 'Minimize agent chat')
  })

  const unlockPortalEditor = () => {
    editor.hidden = false
    editor.open = true
    editorAccess.hidden = true
    window.localStorage.setItem(PORTAL_EDITOR_UNLOCK_KEY, 'true')
  }

  if (window.localStorage.getItem(PORTAL_EDITOR_UNLOCK_KEY) === 'true') {
    unlockPortalEditor()
  }

  editorAccessToggle.addEventListener('click', () => {
    const shouldOpen = editorAccessForm.hidden
    editorAccessForm.hidden = !shouldOpen
    editorAccessToggle.setAttribute('aria-expanded', String(shouldOpen))
    if (shouldOpen) editorAccessPin.focus()
  })

  editorAccessForm.addEventListener('submit', (event) => {
    event.preventDefault()
    if (editorAccessPin.value.trim() === PORTAL_EDITOR_PIN) {
      editorAccessPin.value = ''
      editorAccessError.textContent = ''
      unlockPortalEditor()
      return
    }

    editorAccessError.textContent = 'Editor locked. Ask an administrator for access.'
    editorAccessPin.select()
  })

  recenterButton.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('portal-recenter-request'))
  })

  dissolveButton.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('portal-dissolve-toggle'))
  })

  window.addEventListener('portal-dissolve-change', (event) => {
    dissolveButton.setAttribute('aria-pressed', String(event.detail.enabled))
    dissolveButton.textContent = event.detail.enabled ? 'Restore portal world' : 'Dissolve real world'
  })

  const editorControls = [...editor.querySelectorAll('[data-kind]')]

  const syncEditorControls = () => {
    const transform = editorState.transforms[editorState.target]
    editorControls.forEach((control) => {
      control.value = transform[control.dataset.kind][Number(control.dataset.axis)]
    })
  }

  editor.querySelector('.portal-editor__target').addEventListener('change', (event) => {
    editorState.target = event.target.value
    syncEditorControls()
    emitEditorUpdate()
  })

  editor.querySelector('.portal-editor__glb-url').addEventListener('change', (event) => {
    emitEditorUpdate({url: event.target.value.trim()})
  })

  editorControls.forEach((control) => {
    control.addEventListener('input', () => {
      editorState.transforms[editorState.target][control.dataset.kind][Number(control.dataset.axis)] = Number(control.value)
      emitEditorUpdate()
    })
  })

  window.addEventListener('portal-destination-change', (event) => {
    const name = event.detail.name
    destination.textContent = name
    log.innerHTML = `<p><strong>Agent:</strong> ${destinationResponses[name]}</p>`
  })

  window.addEventListener('portal-tracking-change', (event) => {
    const labels = {
      stable: 'Stable',
      recovering: 'Recovering',
      limited: 'Limited',
    }
    panel.dataset.trackingState = event.detail.state
    tracking.querySelector('strong').textContent = labels[event.detail.state]
    tracking.querySelector('span').textContent = event.detail.canEnter
      ? '— ready to enter'
      : '— waiting for 8th Wall SLAM tracking'
  })

  window.addEventListener('portal-entry-change', (event) => {
    const status = event.detail.isInsidePortal ? 'Inside editable portal world' : 'Original Portal threshold'
    panel.dataset.portalState = event.detail.isInsidePortal ? 'inside' : 'outside'
    panel.querySelector('h1').textContent = status
  })

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const question = input.value.trim()
    if (!question) return

    log.innerHTML = `
      <p><strong>You:</strong> ${question}</p>
      <p><strong>Agent:</strong> This prototype routes your question to the selected place. Next milestone: connect this box to a hosted LLM tool with destination context, safety filters, and citations.</p>
    `
    input.value = ''
  })
}

const startOriginalPortal = () => {
  buildAgentOverlay()
  document.body.classList.add('original-portal-active')

  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(),
    XR8.Threejs.pipelineModule(),
    XR8.XrController.pipelineModule(),
    LandingPage.pipelineModule(),
    XRExtras.FullWindowCanvas.pipelineModule(),
    XRExtras.Loading.pipelineModule(),
    XRExtras.RuntimeError.pipelineModule(),
    initScenePipelineModule(),
  ])

  const canvas = document.getElementById('camerafeed')
  XR8.run({canvas})
}

const onxrloaded = () => {
  buildHomePage({onExplore: startOriginalPortal})
}

window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)
