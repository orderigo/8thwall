// app-babylon.js - Main entry point for the SLAM-tracked Magic Portal app using Babylon.js

import { BabylonjsPipelineModule } from './xr8-babylonjs-pipeline'

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
        rotation: transform.rotation,
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


const buildHomePage = ({onExplore}) => {
  const home = document.createElement('main')
  home.className = 'home-page home-page--redesigned'
  home.innerHTML = `
    <div class="home-shell">
      <nav class="home-nav" aria-label="Main navigation">
        <a class="home-nav__brand" href="#top" aria-label="Portal World home">Portal World</a>
        <div class="home-nav__links">
          <button type="button" data-action="explore">AR Portal</button>
          <button type="button" data-action="admin-login">Admin Login</button>
        </div>
      </nav>
      <section class="hero-card" id="top" aria-labelledby="hero-title">
        <div class="hero-card__content">
          <p class="hero-card__eyebrow">Immersive portal experience</p>
          <h1 id="hero-title">Step into portal worlds from your browser.</h1>
          <p class="hero-card__copy">Launch an interactive AR portal for camera-based exploration with Babylon.js.</p>
          <div class="hero-card__actions">
            <button class="hero-card__button" type="button" data-action="explore">Launch AR Portal</button>
          </div>
        </div>
        <div class="portal-preview" aria-hidden="true">
          <div class="portal-preview__ring"></div>
          <div class="portal-preview__core"><span>Babylon<br>Portal</span></div>
          <div class="portal-preview__orbit portal-preview__orbit--one"></div>
          <div class="portal-preview__orbit portal-preview__orbit--two"></div>
        </div>
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

  home.querySelectorAll('[data-action="explore"]').forEach((button) => 
    button.addEventListener('click', launchAr)
  )
  home.querySelector('[data-action="admin-login"]').addEventListener('click', () => 
    document.body.dispatchEvent(new CustomEvent('portal-open-admin-login'))
  )
  document.body.prepend(home)
}


const buildAdminPanel = () => {
  const panel = document.createElement('aside')
  panel.className = 'admin-panel'
  panel.hidden = true
  panel.innerHTML = `
    <div class="admin-panel__dialog" role="dialog" aria-modal="true" aria-labelledby="admin-title">
      <button class="admin-panel__close" type="button" aria-label="Close admin panel">\u00d7</button>
      <p class="hero-card__eyebrow">Admin Dashboard</p>
      <h2 id="admin-title">Portal operations</h2>
      <form class="admin-login-form">
        <label>Email<input type="email" name="email" autocomplete="email" required></label>
        <label>Password<input type="password" name="password" autocomplete="current-password" required minlength="6"></label>
        <button type="submit">Login to dashboard</button>
        <p class="auth-form__status" role="status"></p>
      </form>
      <div class="admin-panel__content" hidden>
        <div class="admin-panel__toolbar">
          <button type="button" data-admin="load">Load users</button>
          <button type="button" data-admin="demo">Add demo user</button>
          <button type="button" data-admin="logout">Logout</button>
        </div>
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


const buildPortalOverlay = () => {
  const panel = document.createElement('section')
  panel.className = 'portal-panel'
  panel.innerHTML = `
    <div class="portal-panel__header">
      <span class="portal-panel__status"></span>
      <div>
        <p class="portal-panel__eyebrow">Portal Controls</p>
        <h1>Babylon.js Door Portal</h1>
      </div>
    </div>
    <div class="portal-panel__tracking">
      <p>8th Wall Ground Tracking: <strong>Stable</strong> <span>\u2014 choose a ground point</span></p>
      <button class="portal-panel__recenter" type="button">Choose ground point</button>
      <button class="portal-panel__open" type="button">Open Portal</button>
    </div>
    <div class="gesture-instruction" aria-live="polite">
      <strong>Ground tracking point</strong>
      <span>Move your phone, tap the animated ground point position, then press Open Portal.</span>
      <meter min="0" max="1" value="1"></meter>
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
      <summary>Babylon.js Portal World Editor</summary>
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
      <div class="portal-editor__actions">
        <button type="button" class="portal-editor__save">Save backend world</button>
        <button type="button" class="portal-editor__load">Load backend world</button>
      </div>
      <p>Position, rotation, and scale are applied live so Gaussian splats and GLB files can be placed precisely inside the portal.</p>
    </details>
  `
  document.body.appendChild(panel)

  const tracking = panel.querySelector('.portal-panel__tracking')
  const recenterButton = panel.querySelector('.portal-panel__recenter')
  const openButton = panel.querySelector('.portal-panel__open')
  const editorAccess = panel.querySelector('.portal-editor-access')
  const editorAccessToggle = panel.querySelector('.portal-editor-access__toggle')
  const editorAccessForm = panel.querySelector('.portal-editor-access__form')
  const editorAccessPin = panel.querySelector('.portal-editor-access__pin')
  const editorAccessError = panel.querySelector('.portal-editor-access__error')
  const editor = panel.querySelector('.portal-editor')

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

  openButton.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('portal-open-request'))
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
    const logElement = document.createElement('div')
    logElement.className = 'portal-panel__log'
    logElement.innerHTML = '<p><strong>Admin:</strong> Portal world saved to backend/local storage.</p>'
    panel.appendChild(logElement)
  })
  editor.querySelector('.portal-editor__load').addEventListener('click', async () => {
    await loadWorldConfig()
    syncEditorControls()
    const logElement = document.createElement('div')
    logElement.className = 'portal-panel__log'
    logElement.innerHTML = '<p><strong>Admin:</strong> Portal world loaded and linked to the frontend portal.</p>'
    panel.appendChild(logElement)
  })

  editorControls.forEach((control) => {
    control.addEventListener('input', () => {
      editorState.transforms[editorState.target][control.dataset.kind][Number(control.dataset.axis)] = Number(control.value)
      emitEditorUpdate()
    })
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
    const status = event.detail.isInsidePortal ? 'Inside Babylon.js portal world' : 'Door Portal threshold'
    panel.dataset.portalState = event.detail.isInsidePortal ? 'inside' : 'outside'
    panel.querySelector('h1').textContent = status
  })
}


const startOriginalPortal = () => {
  if (!window.XR8) {
    window.alert('AR Portal is still loading. Please try again in a moment.')
    return
  }
  
  buildPortalOverlay()
  document.body.classList.add('original-portal-active')

  // Create the Babylon.js pipeline module
  const babylonjsModule = BabylonjsPipelineModule()

  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(),
    XR8.Threejs.pipelineModule(), // Keep for 8th Wall's internal use
    XR8.XrController.pipelineModule(),
    LandingPage.pipelineModule(),
    XRExtras.FullWindowCanvas.pipelineModule(),
    XRExtras.Loading.pipelineModule(),
    XRExtras.RuntimeError.pipelineModule(),
    babylonjsModule // Our custom Babylon.js module
  ])

  const canvas = document.getElementById('camerafeed')
  XR8.run({ canvas })
  
  // Listen for Babylon.js ready event
  window.addEventListener('babylonjs-ready', (event) => {
    const { engine, scene, camera } = event.detail
    console.log('Babylon.js is ready!', { engine, scene, camera })
    
    // Add interactivity
    addInteractivity(scene, camera, babylonjsModule)
  })
  
  // Listen for portal events
  window.addEventListener('portal-open-request', () => {
    babylonjsModule.raisePortal()
  })
  
  window.addEventListener('portal-recenter-request', () => {
    babylonjsModule.recenterPortal()
  })
}


/**
 * Add interactivity to the Babylon.js scene
 */
const addInteractivity = (scene, camera, babylonModule) => {
  const canvas = document.getElementById('camerafeed')
  let lastPickedMesh = null
  
  // Add raycasting for mouse/touch
  const onPointerMove = (event) => {
    if (!scene || !camera) return
    
    // Get pointer position
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    
    // Create ray
    const ray = new BABYLON.Ray(
      new BABYLON.Vector3(x, y, 0),
      new BABYLON.Vector3(0, 0, -1)
    )
    
    // Transform ray to world space
    const rayWorld = ray.transformCoordinates(camera.getTransformationMatrix())
    
    // Raycast
    const pickResult = scene.pickWithRay(rayWorld)
    
    if (pickResult.hit) {
      const mesh = pickResult.pickedMesh
      
      // Highlight mesh
      if (lastPickedMesh && lastPickedMesh !== mesh) {
        if (lastPickedMesh.material) {
          lastPickedMesh.material.emissiveColor = BABYLON.Color3.Black()
        }
      }
      
      if (mesh.material) {
        mesh.material.emissiveColor = new BABYLON.Color3(1, 0, 0)
      }
      lastPickedMesh = mesh
      
      // Change cursor
      canvas.style.cursor = 'pointer'
    } else {
      if (lastPickedMesh && lastPickedMesh.material) {
        lastPickedMesh.material.emissiveColor = BABYLON.Color3.Black()
      }
      lastPickedMesh = null
      canvas.style.cursor = 'default'
    }
  }
  
  const onPointerDown = (event) => {
    if (!scene || !camera) return
    
    // Get pointer position
    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    
    // Create ray
    const ray = new BABYLON.Ray(
      new BABYLON.Vector3(x, y, 0),
      new BABYLON.Vector3(0, 0, -1)
    )
    
    // Transform ray to world space
    const rayWorld = ray.transformCoordinates(camera.getTransformationMatrix())
    
    // Raycast
    const pickResult = scene.pickWithRay(rayWorld)
    
    if (pickResult.hit) {
      const mesh = pickResult.pickedMesh
      handleObjectClick(mesh, scene)
    }
  }
  
  // Add event listeners
  canvas.addEventListener('mousemove', onPointerMove, false)
  canvas.addEventListener('click', onPointerDown, false)
  canvas.addEventListener('touchmove', (event) => {
    event.preventDefault()
    onPointerMove(event.touches[0])
  }, false)
  canvas.addEventListener('touchstart', (event) => {
    event.preventDefault()
    onPointerDown(event.touches[0])
  }, false)
  
  // Add info popup
  window.showInfoPopup = (text) => {
    let popup = document.querySelector('.info-popup')
    if (!popup) {
      popup = document.createElement('div')
      popup.className = 'info-popup'
      popup.innerHTML = `
        <p></p>
        <button onclick="this.parentElement.remove()">Close</button>
      `
      popup.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.85);
        color: white;
        padding: 20px;
        border-radius: 10px;
        max-width: 300px;
        z-index: 1000;
      `
      popup.querySelector('button').style.cssText = `
        background: #0066cc;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        margin-top: 10px;
      `
      document.body.appendChild(popup)
    }
    popup.querySelector('p').textContent = text
  }
}


/**
 * Handle object clicks
 */
const handleObjectClick = (mesh, scene) => {
  console.log('Clicked on:', mesh.name)
  
  // Check if mesh has userData with info
  if (mesh.userData && mesh.userData.info) {
    window.showInfoPopup(mesh.userData.info)
    return
  }
  
  // Default behavior based on mesh name
  switch(mesh.name) {
    case 'portal-base':
    case 'portal-door':
      window.showInfoPopup('This is the magic portal! Walk through to enter.')
      break
    case 'sample-box':
      window.showInfoPopup('This is a sample box inside the portal world.')
      break
    case 'sample-sphere':
      window.showInfoPopup('This is a sample sphere.')
      break
    case 'sample-cylinder':
      window.showInfoPopup('This is a sample cylinder.')
      break
    default:
      window.showInfoPopup(`You clicked on: ${mesh.name}`)
  }
}


const initializeApp = () => {
  buildAdminPanel()
  buildHomePage({onExplore: startOriginalPortal})
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp, {once: true})
} else {
  initializeApp()
}
