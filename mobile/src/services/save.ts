import { initDatabase } from './database'
import { normalizeGameState, SAVE_KEY, type GameState } from '../game/model'

export async function loadGame(): Promise<{ state: GameState | null; restored: boolean }> {
  try {
    const db = await initDatabase()
    const row = await db.getFirstAsync<{ payload: string }>('SELECT payload FROM game_saves WHERE save_key = ?', SAVE_KEY)
    if (!row) return { state: null, restored: false }
    const state = normalizeGameState(JSON.parse(row.payload))
    return { state, restored: Boolean(state) }
  } catch (error) {
    console.warn('[观远] 存档读取失败，已以新局启动', error)
    return { state: null, restored: false }
  }
}

export async function persistGame(state: GameState): Promise<void> {
  try {
    const db = await initDatabase()
    await db.runAsync('INSERT INTO game_saves (save_key, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(save_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at', SAVE_KEY, JSON.stringify(state), Date.now())
  } catch (error) {
    console.warn('[观远] 本次存档未能写入，当前会话仍可继续', error)
  }
}

export async function clearGame(): Promise<void> {
  try {
    const db = await initDatabase()
    await db.runAsync('DELETE FROM game_saves WHERE save_key = ?', SAVE_KEY)
  } catch (error) {
    console.warn('[观远] 旧存档清理失败', error)
  }
}
