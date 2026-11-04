/**
 * 数据库初始化骨架（平台托管，业务代码不要绕开它拿句柄）
 *
 * 为什么存在这个文件——三条硬理由：
 *
 * 1. 迁移完成后才发布句柄。"opened 不等于 initialized"：openDatabaseAsync 返回后
 *    schema 可能还没建好，业务此时拿到句柄就查询，会得到 "no such table"。这个竞态
 *    在 Web 预览（wasm + Worker，IO 慢）下高概率出现，在真机上同样存在只是窗口更小。
 *    本骨架用 Promise 锁保证：句柄只在全部迁移执行完之后对外可见。
 *
 * 2. 全应用统一初始化入口。模块级单例 + 并发去重（in-flight Promise 复用）避免业务
 *    各自打开数据库、并发执行迁移或使用不一致的连接配置。SQLiteProvider/
 *    useSQLiteContext 是 Expo 官方支持的另一种架构；如果选用 Provider，应由 onInit
 *    统一管理迁移，并替代本骨架，不要对同一个数据库混用两套初始化入口。
 *
 * 3. 只用 async API。Web 预览环境没有 SharedArrayBuffer，sync 系（openDatabaseSync/
 *    execSync/getAllSync 等）会直接崩；Expo 官方也推荐 async 路径，async 等价物
 *    功能完全一致，禁用不损失任何能力。同理 withExclusiveTransactionAsync 在 Web
 *    实现中不受支持，事务一律用 withTransactionAsync。
 */
import * as SQLite from 'expo-sqlite';

export interface Migration {
  /** 递增整数版本号，从 1 开始；执行成功后写入 PRAGMA user_version */
  version: number;
  /** 该版本要执行的 DDL/DML 语句，整个版本在一个事务里原子执行 */
  statements: string[];
}

export const DB_NAME = 'app.db';

/**
 * 全部 schema 迁移都登记在这里（version 递增），业务代码不要在别处执行 DDL。
 * 示例：
 *   { version: 1, statements: ['CREATE TABLE IF NOT EXISTS todo (id INTEGER PRIMARY KEY, title TEXT NOT NULL)'] }
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    statements: [
      'CREATE TABLE IF NOT EXISTS game_saves (save_key TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)',
    ],
  },
];

let db: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function validateMigrations(migrations: Migration[]): void {
  const versions = new Set<number>();

  for (const migration of migrations) {
    if (!Number.isSafeInteger(migration.version) || migration.version <= 0) {
      throw new Error(`[database] 非法迁移版本号: ${String(migration.version)}`);
    }
    if (versions.has(migration.version)) {
      throw new Error(`[database] 重复的迁移版本号: ${migration.version}`);
    }
    versions.add(migration.version);

    for (const statement of migration.statements) {
      if (!statement.trim()) {
        throw new Error(`[database] 迁移 ${migration.version} 包含空 SQL`);
      }
    }
  }
}

async function runMigrations(handle: SQLite.SQLiteDatabase): Promise<void> {
  validateMigrations(MIGRATIONS);
  const row = await handle.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  const pending = MIGRATIONS
    .filter((migration) => migration.version > current)
    .sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    await handle.withTransactionAsync(async () => {
      for (const statement of migration.statements) {
        await handle.execAsync(statement);
      }
      await handle.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
  }
}

/**
 * 获取数据库句柄的唯一入口。可在任意处并发调用：
 * 已初始化直接返回；初始化进行中复用同一个 Promise；失败后允许重试。
 */
export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const next = await SQLite.openDatabaseAsync(DB_NAME);
    try {
      // journal_mode / foreign_keys 都是连接级配置，SQLite 禁止在迁移事务内切换。
      await next.execAsync('PRAGMA journal_mode = WAL');
      await next.execAsync('PRAGMA foreign_keys = ON');
      await runMigrations(next);
      db = next; // 最后发布：迁移没跑完之前，任何调用方都拿不到句柄
      return next;
    } catch (error) {
      // 失败句柄从未对外发布，可以安全关闭，避免下次重试再打开同名句柄。
      try {
        await next.closeAsync();
      } catch {
        // 保留原始初始化错误。
      }
      throw error;
    }
  })();

  try {
    return await initPromise;
  } finally {
    if (!db) initPromise = null; // 初始化失败则重置，下一次调用可重试
  }
}
