// R90.8: shared audio-source resolution — extracted from useAudioAnalyzer so
// the AI listen feature can capture the SAME inputs (mic / system loopback /
// specific speaker) without duplicating the Electron desktop-capture dance.

const SYSTEM_AUDIO_ID = '__system_audio__'
const SPEAKER_PREFIX = '__speaker__:'
const DESKTOP_PREFIX = '__desktop__:'
const LOOPBACK_LABEL_RE = /stereo mix|what u hear|loopback|monitor/i

/** Desktop (loopback) capture — needs a video constraint stub in Chromium. */
async function makeDesktopStream(sourceId: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
      },
    } as MediaTrackConstraints,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
        maxWidth: 1,
        maxHeight: 1,
        maxFrameRate: 1,
      },
    } as MediaTrackConstraints,
  })
}

/** Prefer a real audio-output endpoint and capture its loopback (Stereo Mix etc.). */
async function tryCaptureSpeakerDevice(speakerDeviceId: string): Promise<MediaStream | null> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  const output = devices.find((d) => d.kind === 'audiooutput' && d.deviceId === speakerDeviceId)
  if (output?.groupId) {
    const loopbackInput = devices.find(
      (d) => d.kind === 'audioinput' && d.groupId === output.groupId && LOOPBACK_LABEL_RE.test(d.label)
    )
    if (loopbackInput) {
      return navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: loopbackInput.deviceId } },
        video: false,
      })
    }
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: speakerDeviceId } },
      video: false,
    })
  } catch {
    return null
  }
}

/**
 * Open a MediaStream for a device setting, resolving the sentinel values the
 * app uses across its audio device pickers:
 *   '' | mic id        → plain microphone
 *   '__system_audio__'  → first desktop source
 *   '__speaker__:ID'    → that output's loopback (falls back to desktop source)
 *   '__desktop__:ID'    → specific desktop source
 */
export async function openMonitorStream(deviceId: string): Promise<MediaStream> {
  if (deviceId === SYSTEM_AUDIO_ID) {
    const sourceId = await window.rgbbox.getDesktopAudioSourceId()
    if (!sourceId) throw new Error('source-unavailable')
    return makeDesktopStream(sourceId)
  }
  if (deviceId.startsWith(SPEAKER_PREFIX)) {
    const speakerDeviceId = deviceId.slice(SPEAKER_PREFIX.length)
    const stream = await tryCaptureSpeakerDevice(speakerDeviceId)
    if (stream) return stream
    const sourceId = await window.rgbbox.getDesktopAudioSourceId()
    if (!sourceId) throw new Error('source-unavailable')
    return makeDesktopStream(sourceId)
  }
  if (deviceId.startsWith(DESKTOP_PREFIX)) {
    const sourceId = deviceId.slice(DESKTOP_PREFIX.length)
    return makeDesktopStream(sourceId)
  }
  const audioConstraint: MediaStreamConstraints = deviceId
    ? { audio: { deviceId: { exact: deviceId } }, video: false }
    : { audio: true, video: false }
  return navigator.mediaDevices.getUserMedia(audioConstraint)
}

/** Desktop loopback streams carry a stub video track — drop it. */
export function stripVideoTracks(stream: MediaStream): void {
  stream.getVideoTracks().forEach((t) => { t.stop(); stream.removeTrack(t) })
}
