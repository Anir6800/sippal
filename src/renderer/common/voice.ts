/*
 * Push-to-talk capture. Chromium's MediaRecorder only produces WebM/Opus, which Gemini doesn't
 * list as a supported audio type, so we decode it and re-encode as 16 kHz mono WAV (tiny and
 * universally accepted) before sending the base64 to main.
 */

let recorder: MediaRecorder | null = null
let chunks: Blob[] = []

export async function startRecording(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  chunks = []
  recorder = new MediaRecorder(stream)
  recorder.ondataavailable = (e) => chunks.push(e.data)
  recorder.start()
}

export function stopRecording(): Promise<string | null> {
  const r = recorder
  recorder = null
  if (!r) return Promise.resolve(null)
  return new Promise((resolve) => {
    r.onstop = async () => {
      r.stream.getTracks().forEach((t) => t.stop())
      try {
        const buf = await new Blob(chunks).arrayBuffer()
        const decoded = await new AudioContext().decodeAudioData(buf)
        if (decoded.duration < 0.3) return resolve(null)
        const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000)
        const src = off.createBufferSource()
        src.buffer = decoded
        src.connect(off.destination)
        src.start()
        resolve(toWavBase64((await off.startRendering()).getChannelData(0), 16000))
      } catch {
        resolve(null)
      }
    }
    r.stop()
  })
}

function toWavBase64(samples: Float32Array, rate: number): string {
  const v = new DataView(new ArrayBuffer(44 + samples.length * 2))
  const str = (o: number, s: string): void => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + samples.length * 2, true)
  str(8, 'WAVEfmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, samples.length * 2, true)
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true))
  let bin = ''
  const bytes = new Uint8Array(v.buffer)
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

export function speak(text: string): void {
  speechSynthesis.cancel()
  speechSynthesis.speak(new SpeechSynthesisUtterance(text.replace(/[\p{Extended_Pictographic}️]/gu, '')))
}
