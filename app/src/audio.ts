/**
 * FE-089 音频挂点：只分发「声音提示」与总闸参数，不加载任何音源。
 * 现有按钮以 data-sound 标注语义；将来的音频层监听 guanyuan:sound 即可，
 * 音量与静音从 guanyuan.prefs.read.v1 读取，绝不写存档。
 */
import { getReadPrefs } from './readPrefs'

export interface SoundCue {
  cue: string
  volume: number
  muted: boolean
}

export function installSoundHooks() {
  if (typeof document === 'undefined') return () => {}
  const onClick = (event: MouseEvent) => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-sound]')
    if (!target || !target.dataset.sound) return
    const prefs = getReadPrefs()
    window.dispatchEvent(new CustomEvent<SoundCue>('guanyuan:sound', {
      detail: { cue: target.dataset.sound, volume: prefs.volume, muted: prefs.muted },
    }))
  }
  document.addEventListener('click', onClick)
  return () => document.removeEventListener('click', onClick)
}
