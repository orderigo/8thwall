// app.js is the main entry point for the SLAM-tracked Magic Portal app.

import {initScenePipelineModule} from './threejs-scene-init'
import * as THREE from 'three'

window.THREE = THREE

const PORTAL_EDITOR_PIN = import.meta.env.VITE_PORTAL_EDITOR_PIN || 'portal-admin'
const PORTAL_EDITOR_UNLOCK_KEY = 'portal-editor-unlocked'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const SUPABASE_AUTH_KEY = 'portal-supabase-auth'
const PORTAL_WORLD_STORAGE_KEY = 'portal-world-config'

const EDITOR_TARGETS = {
  gaussianSplat: 'Gaussian Splat World',
  glb: 'GLB Asset',
}

const editorDefaults = {
  gaussianSplat: {position: [0, 0, -1.2], rotation: [0, 180, 0], scale: [0.58, 0.58, 0.58]},
  glb: {position: [0.72, 0, -1.6], rotation: [0, 0, 0], scale: [1, 1, 1]},
}

const editorState = {
  target: 'gaussianSplat',
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


const supabaseFetch = async (path, {method = 'GET', body, token, prefer} = {}) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  }

  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? {Prefer: prefer} : {}),
    },
    ...(body ? {body: JSON.stringify(body)} : {}),
  })

  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) throw new Error(data?.msg || data?.message || response.statusText)
  return data
}

const authRequest = (path, payload) => supabaseFetch(`/auth/v1/${path}`, {method: 'POST', body: payload})

const loadSession = () => {
  try {
    return JSON.parse(window.localStorage.getItem(SUPABASE_AUTH_KEY))
  } catch (error) {
    return null
  }
}

const saveSession = (session) => {
  if (session) window.localStorage.setItem(SUPABASE_AUTH_KEY, JSON.stringify(session))
  else window.localStorage.removeItem(SUPABASE_AUTH_KEY)
  window.dispatchEvent(new CustomEvent('portal-auth-change', {detail: {session}}))
}

const getAccessToken = () => loadSession()?.access_token

const saveWorldConfig = async () => {
  const payload = {id: 'default', config: editorState.transforms, updated_at: new Date().toISOString()}
  window.localStorage.setItem(PORTAL_WORLD_STORAGE_KEY, JSON.stringify(payload))
  const token = getAccessToken()
  if (token) {
    await supabaseFetch('/rest/v1/portal_worlds', {
      method: 'POST',
      token,
      body: payload,
      prefer: 'resolution=merge-duplicates,return=minimal',
    })
  }
  return payload
}

const loadWorldConfig = async () => {
  const token = getAccessToken()
  if (token) {
    const rows = await supabaseFetch('/rest/v1/portal_worlds?id=eq.default&select=config', {token})
    if (rows?.[0]?.config) {
      editorState.transforms = rows[0].config
      Object.keys(editorDefaults).forEach((key) => {
        editorState.transforms[key] = {...editorDefaults[key], ...editorState.transforms[key]}
      })
      emitEditorUpdate({persisted: true})
      return
    }
  }

  const cached = JSON.parse(window.localStorage.getItem(PORTAL_WORLD_STORAGE_KEY) || 'null')
  if (cached?.config) {
    editorState.transforms = cached.config
    emitEditorUpdate({persisted: true})
  }
}

const destinationResponses = {
  'Bagan, Myanmar': 'Bagan portal is ready. Ask about temple history, sunrise routes, or responsible travel etiquette.',
  'Kyoto, Japan': 'Kyoto portal is ready. Ask about shrines, seasonal walking paths, tea culture, or local manners.',
  'Machu Picchu, Peru': 'Machu Picchu portal is ready. Ask about Inca engineering, altitude prep, or trail planning.',
}

const buildHomePage = ({onExplore, onVrWorld}) => {
  const home = document.createElement('main')
  home.className = 'home-page home-page--redesigned'
  home.innerHTML = `
    <div class="home-shell">
      <nav class="home-nav" aria-label="Main navigation">
        <a class="home-nav__brand" href="#top" aria-label="Portal World home">Portal World</a>
        <div class="home-nav__links">
          <a href="#destinations">Destinations</a>
          <button type="button" data-action="explore">AR Portal</button>
          <button type="button" data-action="vr">VR World</button>
          <button type="button" data-action="admin-login">Admin Login</button>
        </div>
      </nav>
      <section class="hero-card" id="top" aria-labelledby="hero-title">
        <div class="hero-card__content">
          <p class="hero-card__eyebrow">Immersive travel preview</p>
          <h1 id="hero-title">Step into curated portal worlds from your browser.</h1>
          <p class="hero-card__copy">Choose an interactive AR portal for camera-based exploration, or open the standalone VR world when you want a full-screen virtual destination without 8th Wall tracking.</p>
          <div class="hero-card__actions">
            <button class="hero-card__button" type="button" data-action="explore">Launch AR Portal</button>
            <button class="hero-card__button hero-card__button--ghost" type="button" data-action="vr">Enter VR World</button>
          </div>
        </div>
        <div class="portal-preview" aria-hidden="true"><div class="portal-preview__ring"></div><div class="portal-preview__core"><span>VR<br>World</span></div><div class="portal-preview__orbit portal-preview__orbit--one"></div><div class="portal-preview__orbit portal-preview__orbit--two"></div></div>
      </section>
      <section class="destination-strip" id="destinations" aria-label="Available destinations">
        <article><strong>Bagan</strong><span>Temple horizons and sunrise storytelling.</span></article>
        <article><strong>Kyoto</strong><span>Seasonal paths, shrines, and tea culture.</span></article>
        <article><strong>Machu Picchu</strong><span>Inca engineering and mountain views.</span></article>
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

  home.querySelectorAll('[data-action="explore"]').forEach((button) => button.addEventListener('click', launchAr))
  home.querySelectorAll('[data-action="vr"]').forEach((button) => button.addEventListener('click', onVrWorld))
  home.querySelector('[data-action="admin-login"]').addEventListener('click', () => document.body.dispatchEvent(new CustomEvent('portal-open-admin-login')))
  document.body.prepend(home)
}


const buildAdminPanel = () => {
  const panel = document.createElement('aside')
  panel.className = 'admin-panel'
  panel.hidden = true
  panel.innerHTML = `
    <div class="admin-panel__dialog" role="dialog" aria-modal="true" aria-labelledby="admin-title">
      <button class="admin-panel__close" type="button" aria-label="Close admin panel">×</button>
      <p class="hero-card__eyebrow">Admin Dashboard</p>
      <h2 id="admin-title">Portal operations</h2>
      <form class="admin-login-form">
        <label>Email<input type="email" name="email" autocomplete="email" required></label>
        <label>Password<input type="password" name="password" autocomplete="current-password" required minlength="6"></label>
        <button type="submit">Login to dashboard</button>
        <p class="auth-form__status" role="status"></p>
      </form>
      <div class="admin-panel__content" hidden>
        <div class="admin-panel__toolbar"><button type="button" data-admin="load">Load users</button><button type="button" data-admin="demo">Add demo user</button><button type="button" data-admin="logout">Logout</button></div>
        <div class="admin-panel__users" role="status"></div>
        <p class="admin-panel__note">Dashboard access requires an authenticated admin session. For production user operations, expose secure server-side endpoints or Supabase Edge Functions with role checks.</p>
      </div>
    </div>`
  document.body.appendChild(panel)
  const loginForm = panel.querySelector('.admin-login-form')
  const status = panel.querySelector('.auth-form__status')
  const content = panel.querySelector('.admin-panel__content')
  const users = panel.querySelector('.admin-panel__users')
  const showDashboard = () => {
    loginForm.hidden = true
    content.hidden = false
    users.innerHTML = `<p>Signed in as ${loadSession()?.user?.email || 'admin'}.</p>`
  }
  const open = () => {
    panel.hidden = false
    if (getAccessToken()) showDashboard()
    else {
      loginForm.hidden = false
      content.hidden = true
      status.textContent = ''
    }
  }
  const close = () => { panel.hidden = true }
  document.body.addEventListener('portal-open-admin-login', open)
  panel.querySelector('.admin-panel__close').addEventListener('click', close)
  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    status.textContent = 'Checking admin credentials...'
    try {
      const data = await authRequest('token?grant_type=password', {email: form.get('email'), password: form.get('password')})
      saveSession(data)
      status.textContent = 'Login successful.'
      showDashboard()
    } catch (error) {
      status.textContent = error.message
    }
  })
  const renderUsers = (rows) => {
    users.innerHTML = `<table><thead><tr><th>Email</th><th>Role</th><th>Status</th></tr></thead><tbody>${rows.map((user) => `<tr><td>${user.email || user.id}</td><td>${user.role || 'viewer'}</td><td>${user.status || 'active'}</td></tr>`).join('')}</tbody></table>`
  }
  panel.addEventListener('click', async (event) => {
    const action = event.target.dataset.admin
    if (!action) return
    if (action === 'logout') {
      saveSession(null)
      content.hidden = true
      loginForm.hidden = false
      status.textContent = 'Logged out.'
      return
    }
    if (action === 'demo') {
      const demo = JSON.parse(window.localStorage.getItem('portal-demo-users') || '[]')
      demo.push({email: `demo${demo.length + 1}@portal.local`, role: demo.length ? 'editor' : 'admin', status: 'active'})
      window.localStorage.setItem('portal-demo-users', JSON.stringify(demo)); renderUsers(demo); return
    }
    if (action === 'load') {
      users.innerHTML = '<p>Loading users...</p>'
      try {
        const rows = await supabaseFetch('/rest/v1/profiles?select=id,email,role,status&order=email.asc', {token: getAccessToken()})
        renderUsers(rows)
      } catch (error) {
        const demo = JSON.parse(window.localStorage.getItem('portal-demo-users') || '[]')
        users.innerHTML = `<p>${error.message}</p>`
        if (demo.length) renderUsers(demo)
      }
    }
  })
}

const buildStandaloneVrWorld = () => {
  if (document.querySelector('.standalone-vr')) return
  const world = document.createElement('section')
  world.className = 'standalone-vr'
  world.innerHTML = `
    <div class="standalone-vr__sky"><span></span><span></span><span></span></div>
    <div class="standalone-vr__hud"><p>Standalone VR World</p><h2>Bagan sunset portal</h2><span>No 8th Wall tracking required.</span></div>
    <div class="standalone-vr__controls"><button data-move="up">▲</button><div><button data-move="left">◀</button><button data-move="down">▼</button><button data-move="right">▶</button></div><button data-close-vr>Exit VR World</button></div>
  `
  document.body.appendChild(world)
  let x = 0
  let y = 0
  const render = () => {
    world.style.setProperty('--vr-pan-x', `${x}px`)
    world.style.setProperty('--vr-pan-y', `${y}px`)
  }
  world.addEventListener('click', (event) => {
    const move = event.target.dataset.move
    if (event.target.dataset.closeVr !== undefined) { world.remove(); return }
    if (!move) return
    if (move === 'left') x -= 36
    if (move === 'right') x += 36
    if (move === 'up') y -= 24
    if (move === 'down') y += 24
    render()
  })
  render()
}


const buildVrControls = () => {
  const controls = document.createElement('section')
  controls.className = 'vr-controls'
  controls.hidden = true
  controls.innerHTML = `<button data-vr="forward">▲</button><div><button data-vr="left">◀</button><button data-vr="back">▼</button><button data-vr="right">▶</button></div><button data-vr-toggle type="button">Exit VR Tour</button>`
  document.body.appendChild(controls)
  let active = null
  const send = () => window.dispatchEvent(new CustomEvent('portal-vr-move', {detail: {direction: active}}))
  controls.addEventListener('pointerdown', (event) => { if (event.target.dataset.vr) { active = event.target.dataset.vr; send() } })
  controls.addEventListener('pointerup', () => { active = null; send() })
  controls.querySelector('[data-vr-toggle]').addEventListener('click', () => window.dispatchEvent(new CustomEvent('portal-vr-toggle', {detail: {enabled: false}})))
  window.addEventListener('portal-vr-change', (event) => { controls.hidden = !event.detail.enabled })
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
      <p>8th Wall Ground Tracking: <strong>Stable</strong> <span>— draw the circle first</span></p>
      <button class="agent-panel__recenter" type="button">Recenter portal</button>
      <button class="agent-panel__dissolve" type="button" aria-pressed="false">Dissolve real world</button>
    </div>
    <div class="gesture-instruction" aria-live="polite">
      <strong>လက်ညိုးထိပ်နဲ့ စက်ဝိုင်းဆွဲပါ</strong>
      <span>Point your index finger at the camera and draw one complete circle. If hand tracking does not start, press and drag a circle on the screen as fallback.</span>
      <meter min="0" max="1" value="0"></meter>
    </div>
    <div class="agent-panel__log" aria-live="polite">
      <p><strong>Agent:</strong> Welcome to the Original Portal. Hold your hand in front of the camera, trace a full circle with your index fingertip, and the particle trail will summon the ground-tracked portal ring.</p>
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
            <input type="number" step="0.01" data-kind="${kind}" data-axis="${index}" value="${editorState.transforms.gaussianSplat[kind][index]}">
          </label>`).join('')).join('')}
      </div>
      <div class="portal-editor__actions"><button type="button" class="portal-editor__save">Save backend world</button><button type="button" class="portal-editor__load">Load backend world</button></div><p>Position, rotation, and scale are applied live so Gaussian splats and GLB files can be placed precisely inside the portal.</p>
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
  editor.querySelector('.portal-editor__save').addEventListener('click', async () => {
    await saveWorldConfig()
    log.innerHTML = '<p><strong>Admin:</strong> Portal world saved to backend/local storage.</p>'
  })
  editor.querySelector('.portal-editor__load').addEventListener('click', async () => {
    await loadWorldConfig()
    syncEditorControls()
    log.innerHTML = '<p><strong>Admin:</strong> Portal world loaded and linked to the frontend portal.</p>'
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
      ? '— circle gesture can open the portal'
      : '— waiting for 8th Wall Ground Tracking'
  })

  window.addEventListener('portal-hand-gesture-change', (event) => {
    const instruction = panel.querySelector('.gesture-instruction')
    instruction.querySelector('meter').value = event.detail.progress || 0
    instruction.querySelector('span').textContent = event.detail.message
    instruction.dataset.state = event.detail.state
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
  if (!window.XR8) {
    window.alert('AR Portal is still loading. Please try again in a moment.')
    return
  }
  buildVrControls()
  buildAgentOverlay()
  document.body.classList.add('original-portal-active')

  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(),
    XR8.Threejs.pipelineModule(),
    XR8.XrController.pipelineModule(),
    ...(XR8.HandController ? [XR8.HandController.pipelineModule()] : []),
    LandingPage.pipelineModule(),
    XRExtras.FullWindowCanvas.pipelineModule(),
    XRExtras.Loading.pipelineModule(),
    XRExtras.RuntimeError.pipelineModule(),
    initScenePipelineModule(),
  ])

  const canvas = document.getElementById('camerafeed')
  let drawingFallback = false
  canvas.addEventListener('pointerdown', () => { drawingFallback = true })
  canvas.addEventListener('pointerup', () => { drawingFallback = false })
  canvas.addEventListener('pointermove', (event) => {
    if (!drawingFallback) return
    window.dispatchEvent(new CustomEvent('portal-hand-point', {detail: {x: event.clientX, y: event.clientY, source: 'fallback'}}))
  })
  XR8.run({canvas})
}

const initializeApp = () => {
  buildAdminPanel()
  buildHomePage({onExplore: startOriginalPortal, onVrWorld: buildStandaloneVrWorld})
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp, {once: true})
} else {
  initializeApp()
}
