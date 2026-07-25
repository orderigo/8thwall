// app.js is the main entry point for the SLAM-tracked Magic Portal app.

import {initScenePipelineModule} from './threejs-scene-init'
import * as THREE from 'three'

window.THREE = THREE

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
    </div>
    <div class="agent-panel__log" aria-live="polite">
      <p><strong>Agent:</strong> Welcome to the Original Portal. Drag to move it, pinch to scale it, tap to rotate destinations, then walk through to enter the Luma 3D environment.</p>
    </div>
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
  const form = panel.querySelector('.agent-panel__form')
  const input = panel.querySelector('input')

  minimizeButton.addEventListener('click', () => {
    const isMinimized = panel.classList.toggle('agent-panel--minimized')
    minimizeButton.textContent = isMinimized ? 'Open' : 'Minimize'
    minimizeButton.setAttribute('aria-expanded', String(!isMinimized))
    minimizeButton.setAttribute('aria-label', isMinimized ? 'Open agent chat' : 'Minimize agent chat')
  })

  recenterButton.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('portal-recenter-request'))
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
    const status = event.detail.isInsidePortal ? 'Inside Luma 3D environment' : 'Original Portal threshold'
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
