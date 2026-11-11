/**
 * C-89 卷内阅读记忆：只记「上次看到哪一页」，仅存内存，刷新即失。
 * 不写 guanyuan.save.v1，不影响判定、时段与数值。
 */
import { useCallback, useState } from 'react'

const memory = new Map<string, string>()

export function readView<T extends string>(key: string, fallback: T): T {
  return (memory.get(key) as T | undefined) ?? fallback
}

export function hasView(key: string) {
  return memory.has(key)
}

export function writeView(key: string, value: string) {
  memory.set(key, value)
}

export function useViewMemory<T extends string>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => readView(key, initial))
  const set = useCallback((next: T) => {
    writeView(key, next)
    setValue(next)
  }, [key])
  return [value, set] as const
}

export function clearViewMemory() {
  memory.clear()
}
