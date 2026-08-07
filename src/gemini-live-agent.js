const LIVE_API_HOST = 'generativelanguage.googleapis.com'
const LIVE_API_PATH = '/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'
const DEFAULT_MODEL = 'models/gemini-2.5-flash-live-preview'
const INPUT_SAMPLE_RATE = 16000
const OUTPUT_SAMPLE_RATE = 24000
const CHUNK_SIZE = 2048

const getApiCredential = () =>
  import.meta.env.VITE_GEMINI_LIVE_EPHEMERAL_TOKEN || import.meta.env.VITE_GEMINI_API_KEY || ''

const getLiveUrl = () => {
  const credential = getApiCredential()
  if (!credential) return ''
  const keyName = import.meta.env.VITE_GEMINI_LIVE_EPHEMERAL_TOKEN ? 'access_token' : 'key'
  return `wss://${LIVE_API_HOST}${LIVE_API_PATH}?${keyName}=${encodeURIComponent(credential)}`
}

const floatTo16BitPcm = (input) => {
  const output = new Int16Array(input.length)
  for (let i = 0; i < input.length; i += 1) {
    const value = Math.max(-1, Math.min(1, input[i]))
    output[i] = value < 0 ? value * 0x8000 : value * 0x7fff
  }
  return output
}

const resample = (input, fromRate, toRate) => {
  if (fromRate === toRate) return input
  const ratio = fromRate / toRate
  const length = Math.max(1, Math.round(input.length / ratio))
  const output = new Float32Array(length)
  for (let i = 0; i < length; i += 1) {
    const sourceIndex = i * ratio
    const before = Math.floor(sourceIndex)
    const after = Math.min(before + 1, input.length - 1)
    const weight = sourceIndex - before
    output[i] = input[before] * (1 - weight) + input[after] * weight
  }
  return output
}

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i])
  return window.btoa(binary)
}

const base64ToInt16 = (base64) => {
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Int16Array(bytes.buffer)
}

const createPlayer = (audioContext) => {
  let playHead = audioContext.currentTime
  const scheduled = new Set()

  const clear = () => {
    scheduled.forEach((source) => {
      try { source.stop() } catch (_) {}
    })
    scheduled.clear()
    playHead = audioContext.currentTime
  }

  const play = (pcm) => {
    const buffer = audioContext.createBuffer(1, pcm.length, OUTPUT_SAMPLE_RATE)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < pcm.length; i += 1) channel[i] = pcm[i] / 0x8000

    const source = audioContext.createBufferSource()
    source.buffer = buffer
    source.connect(audioContext.destination)
    source.addEventListener('ended', () => scheduled.delete(source), {once: true})
    const startAt = Math.max(audioContext.currentTime + 0.03, playHead)
    source.start(startAt)
    playHead = startAt + buffer.duration
    scheduled.add(source)
  }

  return {clear, play}
}

export const createGeminiLiveAgent = ({onStatus, onTranscript} = {}) => {
  let socket
  let stream
  let audioContext
  let source
  let processor
  let player
  let connected = false
  let started = false

  const setStatus = (state, detail = '') => onStatus?.({state, detail})
  const addTranscript = (speaker, text) => {
    if (text?.trim()) onTranscript?.({speaker, text: text.trim()})
  }

  const send = (payload) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload))
  }

  const handleMessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.setupComplete) {
      connected = true
      setStatus('listening', 'Mic is live. Ask the portal guide anything.')
      return
    }
    if (message.serverContent?.interrupted) player?.clear()
    message.serverContent?.modelTurn?.parts?.forEach((part) => {
      const audio = part.inlineData?.data || part.inline_data?.data
      if (audio) player?.play(base64ToInt16(audio))
      if (part.text) addTranscript('Gemini', part.text)
    })
    const inputText = message.serverContent?.inputTranscription?.text
    const outputText = message.serverContent?.outputTranscription?.text
    addTranscript('You', inputText)
    addTranscript('Gemini', outputText)
    if (message.goAway) setStatus('ending', 'Gemini session is ending soon; reconnect if needed.')
  }

  const connect = async () => {
    const url = getLiveUrl()
    if (!url) throw new Error('Set VITE_GEMINI_API_KEY or VITE_GEMINI_LIVE_EPHEMERAL_TOKEN to enable Gemini Live.')

    audioContext = new (window.AudioContext || window.webkitAudioContext)()
    player = createPlayer(audioContext)
    stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true}})
    socket = new WebSocket(url)
    socket.addEventListener('message', handleMessage)
    socket.addEventListener('close', () => setStatus('idle', 'Disconnected from Gemini Live.'))
    socket.addEventListener('error', () => setStatus('error', 'Could not connect to Gemini Live.'))
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, {once: true})
      socket.addEventListener('error', reject, {once: true})
    })

    send({
      setup: {
        model: import.meta.env.VITE_GEMINI_LIVE_MODEL || DEFAULT_MODEL,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {voiceConfig: {prebuiltVoiceConfig: {voiceName: 'Kore'}}},
        },
        systemInstruction: {
          parts: [{text: 'You are a friendly AI voice agent inside an AR portal. Keep answers concise, helpful, and immersive. Reply in Burmese when the visitor speaks Burmese; otherwise use their language.'}],
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
    })
  }

  const startStreaming = () => {
    source = audioContext.createMediaStreamSource(stream)
    processor = audioContext.createScriptProcessor(CHUNK_SIZE, 1, 1)
    processor.onaudioprocess = (event) => {
      if (!connected) return
      const samples = resample(event.inputBuffer.getChannelData(0), audioContext.sampleRate, INPUT_SAMPLE_RATE)
      const pcm = floatTo16BitPcm(samples)
      send({realtimeInput: {audio: {mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`, data: arrayBufferToBase64(pcm.buffer)}}})
    }
    source.connect(processor)
    processor.connect(audioContext.destination)
  }

  const start = async () => {
    if (started) return
    started = true
    setStatus('connecting', 'Connecting to Gemini Live...')
    try {
      await connect()
      startStreaming()
    } catch (error) {
      started = false
      setStatus('error', error.message)
      throw error
    }
  }

  const stop = () => {
    started = false
    connected = false
    send({realtimeInput: {audioStreamEnd: true}})
    processor?.disconnect()
    source?.disconnect()
    stream?.getTracks().forEach((track) => track.stop())
    socket?.close()
    player?.clear()
    setStatus('idle', 'Voice agent is off.')
  }

  return {start, stop}
}
