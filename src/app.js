// app.js is the main entry point for the SLAM-tracked Magic Portal app.

import {initScenePipelineModule} from './threejs-scene-init'
import * as THREE from 'three'

window.THREE = THREE

const destinationResponses = {
  'Bagan, Myanmar': 'Bagan portal is ready. Ask about temple history, sunrise routes, or responsible travel etiquette.',
  'Kyoto, Japan': 'Kyoto portal is ready. Ask about shrines, seasonal walking paths, tea culture, or local manners.',
  'Machu Picchu, Peru': 'Machu Picchu portal is ready. Ask about Inca engineering, altitude prep, or trail planning.',
}

const buildAgentOverlay = () => {
  const panel = document.createElement('section')
  panel.className = 'agent-panel'
  panel.innerHTML = `
    <div class="agent-panel__header">
      <span class="agent-panel__status"></span>
      <div>
        <p class="agent-panel__eyebrow">Portal LLM Agent</p>
        <h1>Ask the guide</h1>
      </div>
    </div>
    <p class="agent-panel__destination">Destination: <strong>Bagan, Myanmar</strong></p>
    <div class="agent-panel__log" aria-live="polite">
      <p><strong>Agent:</strong> Mingalarbar! Tap the portal to rotate destinations, then ask me what you want to learn.</p>
    </div>
    <form class="agent-panel__form">
      <input aria-label="Ask the portal guide" placeholder="e.g. What should I notice here?" />
      <button type="submit">Ask</button>
    </form>
  `
  document.body.appendChild(panel)

  const destination = panel.querySelector('.agent-panel__destination strong')
  const log = panel.querySelector('.agent-panel__log')
  const form = panel.querySelector('.agent-panel__form')
  const input = panel.querySelector('input')

  window.addEventListener('portal-destination-change', (event) => {
    const name = event.detail.name
    destination.textContent = name
    log.innerHTML = `<p><strong>Agent:</strong> ${destinationResponses[name]}</p>`
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

const onxrloaded = () => {
  buildAgentOverlay()

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

window.XR8 ? onxrloaded() : window.addEventListener('xrloaded', onxrloaded)
