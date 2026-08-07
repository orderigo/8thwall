// app.js is the main entry point for the SLAM-tracked Magic Portal app.

import {initScenePipelineModule} from './threejs-scene-init'
import * as THREE from 'three'
import {startPagodaTour} from './babylon-pagoda-tour'
import {createGeminiLiveAgent} from './gemini-live-agent'

window.THREE = THREE

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''


const buildHomePage = ({onExplore, onVRMode, onInteractiveTour}) => {
  const home = document.createElement('main')
  home.className = 'home-page home-page--redesigned'
  home.innerHTML = `
    <div class="home-shell">
      <nav class="home-nav" aria-label="Main navigation">
        <a class="home-nav__brand" href="#top" aria-label="Portal World home">Portal World</a>
        <div class="home-nav__links">
        </div>
      </nav>
      <section class="hero-card" id="top" aria-labelledby="hero-title">
        <div class="hero-card__content">
          <p class="hero-card__eyebrow">Immersive portal experience</p>
          <h1 id="hero-title">Step into portal worlds from your browser.</h1>
          <p class="hero-card__copy">Choose your mode to open the door.</p>
          <div class="hero-card__actions">
            <button class="hero-card__button" type="button" data-action="explore">Open Door (AR Mode)</button>
            <button class="hero-card__button hero-card__button--vr" type="button" data-action="vr-mode">Open Door (VR Mode)</button>
            <button class="hero-card__button hero-card__button--interactive" type="button" data-action="interactive-tour">3D Interactive</button>
          </div>
        </div>
        <div class="portal-preview" aria-hidden="true"><div class="portal-preview__ring"></div><div class="portal-preview__core"><span>AR<br>Portal</span></div><div class="portal-preview__orbit portal-preview__orbit--one"></div><div class="portal-preview__orbit portal-preview__orbit--two"></div></div>
      </section>
    </div>
  `

  const launchAr = () => {
    home.classList.add('home-page--exiting')
    window.setTimeout(() => {
      home.remove()
      onExplore()
    }, 420)
  }

  const launchVR = () => {
    home.classList.add('home-page--exiting')
    window.setTimeout(() => {
      home.remove()
      onVRMode()
    }, 420)
  }

  const launchInteractiveTour = () => {
    home.classList.add('home-page--exiting')
    window.setTimeout(() => {
      home.remove()
      onInteractiveTour()
    }, 420)
  }

  home.querySelectorAll('[data-action="explore"]').forEach((button) => button.addEventListener('click', launchAr))
  home.querySelectorAll('[data-action="vr-mode"]').forEach((button) => button.addEventListener('click', launchVR))
  home.querySelectorAll('[data-action="interactive-tour"]').forEach((button) => button.addEventListener('click', launchInteractiveTour))
  document.body.prepend(home)
}


const buildPortalOverlay = () => {
  const panel = document.createElement('section')
  panel.className = 'portal-panel'
  panel.innerHTML = `
    <div class="portal-panel__header">
      <span class="portal-panel__status"></span>
      <div>
        <p class="portal-panel__eyebrow">Portal Controls</p>
        <h1>Door Portal</h1>
      </div>
    </div>
    <div class="portal-panel__tracking">
      <p>8th Wall Ground Tracking: <strong>Stable</strong> <span>\u2014 choose a ground point</span></p>
      <button class="portal-panel__recenter" type="button">Choose ground point</button>
      <button class="portal-panel__open" type="button">Open Portal</button>
    </div>
    <div class="portal-voice" data-state="idle">
      <div>
        <p class="portal-voice__eyebrow">Gemini Live AI Voice Agent</p>
        <strong class="portal-voice__status">Enter the portal to activate voice guidance.</strong>
      </div>
      <button class="portal-voice__toggle" type="button" disabled>Start Voice</button>
      <div class="portal-voice__transcript" aria-live="polite"></div>
    </div>
    <div class="gesture-instruction" aria-live="polite">
      <strong>Ground tracking point</strong>
      <span>Move your phone, tap the animated ground point position, then press Open Portal.</span>
      <meter min="0" max="1" value="1"></meter>
    </div>
  `
  document.body.appendChild(panel)

  const tracking = panel.querySelector('.portal-panel__tracking')
  const recenterButton = panel.querySelector('.portal-panel__recenter')
  const openButton = panel.querySelector('.portal-panel__open')
  const voicePanel = panel.querySelector('.portal-voice')
  const voiceButton = panel.querySelector('.portal-voice__toggle')
  const voiceStatus = panel.querySelector('.portal-voice__status')
  const voiceTranscript = panel.querySelector('.portal-voice__transcript')
  let voiceEnabled = false
  const voiceAgent = createGeminiLiveAgent({
    onStatus: ({state, detail}) => {
      voicePanel.dataset.state = state
      voiceStatus.textContent = detail
      voiceButton.textContent = state === 'listening' || state === 'connecting' ? 'Stop Voice' : 'Start Voice'
      voiceButton.disabled = state === 'connecting' || panel.dataset.portalState !== 'inside'
    },
    onTranscript: ({speaker, text}) => {
      const line = document.createElement('p')
      const label = document.createElement('strong')
      label.textContent = `${speaker}:`
      line.append(label, ` ${text}`)
      voiceTranscript.appendChild(line)
      while (voiceTranscript.children.length > 5) voiceTranscript.firstElementChild.remove()
      voiceTranscript.scrollTop = voiceTranscript.scrollHeight
    },
  })

  recenterButton.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('portal-recenter-request'))
  })

  openButton.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('portal-open-request'))
  })

  voiceButton.addEventListener('click', async () => {
    if (voiceEnabled) {
      voiceEnabled = false
      voiceAgent.stop()
      return
    }
    voiceEnabled = true
    try {
      await voiceAgent.start()
    } catch (error) {
      voiceEnabled = false
      console.error('Gemini Live voice agent failed', error)
    }
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
      ? '\u2014 door portal is placed'
      : '\u2014 waiting for a ground point'
  })

  window.addEventListener('portal-placement-change', (event) => {
    const instruction = panel.querySelector('.gesture-instruction')
    instruction.querySelector('meter').value = event.detail.state === 'opened' ? 1 : 0.55
    instruction.querySelector('span').textContent = event.detail.message
    instruction.dataset.state = event.detail.state
  })

  window.addEventListener('portal-entry-change', (event) => {
    const status = event.detail.isInsidePortal ? 'Inside portal world' : 'Door Portal threshold'
    panel.dataset.portalState = event.detail.isInsidePortal ? 'inside' : 'outside'
    panel.querySelector('h1').textContent = status
    voiceButton.disabled = !event.detail.isInsidePortal
    if (event.detail.isInsidePortal) {
      voiceStatus.textContent = 'Ready inside portal. Tap Start Voice and allow microphone access.'
    } else {
      voiceEnabled = false
      voiceAgent.stop()
      voiceStatus.textContent = 'Enter the portal to activate voice guidance.'
    }
  })
}

const startOriginalPortal = () => {
  if (!window.XR8) {
    window.alert('AR Portal is still loading. Please try again in a moment.')
    return
  }
  buildPortalOverlay()
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

const startVRPortal = () => {
  if (!window.XR8) {
    window.alert('VR Portal is still loading. Please try again in a moment.')
    return
  }
  buildPortalOverlay()
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
  XR8.run({canvas, xrMode: 'VR'})
  
  // Auto-trigger portal open in VR mode
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent('portal-open-request'))
    // Auto-enter portal after opening
    window.setTimeout(() => {
      const event = new CustomEvent('portal-entry-change', {
        detail: {isInsidePortal: true}
      })
      window.dispatchEvent(event)
    }, 1000)
  }, 500)
}

const initializeApp = () => {
  buildHomePage({onExplore: startOriginalPortal, onVRMode: startVRPortal, onInteractiveTour: startPagodaTour})
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp, {once: true})
} else {
  initializeApp()
}
