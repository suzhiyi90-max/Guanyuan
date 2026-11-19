/**
 * W6-I-2 — local development OwnerId adapter.
 *
 * This adapter is intentionally not wired into the current W5 Preview App.
 * It stores only a local installation owner key; it does not create worlds,
 * reserve Genesis, or write game facts.
 */
/// <reference types="vite/client" />

import { ownerIdFromTrustedValue, type OwnerIdentityPort, type OwnerId } from '../application/identity/owner'

export interface OwnerIdentityStoragePort {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface OwnerIdentityInitializationLockPort {
  runExclusive<T>(name: string, operation: () => Promise<T>): Promise<T>
}

export interface LocalOwnerIdentityOptions {
  readonly storage: OwnerIdentityStoragePort
  readonly allocateUuid: () => string
  readonly initializationLock: OwnerIdentityInitializationLockPort
}

export const LOCAL_OWNER_IDENTITY_STORAGE_KEY = 'guanyuan:w6:local-owner:v1'

const LOCAL_OWNER_ID_PATTERN = /^owner:local:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function parseLocalOwnerId(value: string): OwnerId {
  const normalized = value.trim()
  if (!LOCAL_OWNER_ID_PATTERN.test(normalized)) throw new Error('owner-identity-format-invalid')
  return ownerIdFromTrustedValue(normalized)
}

function candidateOwnerId(allocateUuid: () => string): OwnerId {
  const uuid = allocateUuid()
  return parseLocalOwnerId(`owner:local:${uuid}`)
}

/**
 * Storage-backed adapter core. Storage and UUID allocation are injected so
 * failures and restart persistence can be tested without browser globals.
 */
export function createLocalOwnerIdentityPort(options: LocalOwnerIdentityOptions): OwnerIdentityPort {
  return Object.freeze({
    async resolve(): Promise<OwnerId> {
      return options.initializationLock.runExclusive(
        'guanyuan:w6:local-owner-identity:init',
        async () => {
          let stored: string | null
          try {
            stored = options.storage.getItem(LOCAL_OWNER_IDENTITY_STORAGE_KEY)
          } catch {
            throw new Error('owner-identity-storage-read-failed')
          }

          if (stored !== null) {
            try {
              return parseLocalOwnerId(stored)
            } catch {
              // Never silently replace a corrupt identity: doing so could orphan
              // worlds already owned by the previous value.
              throw new Error('owner-identity-storage-corrupt')
            }
          }

          const ownerId = candidateOwnerId(options.allocateUuid)
          try {
            options.storage.setItem(LOCAL_OWNER_IDENTITY_STORAGE_KEY, ownerId)
            const confirmed = options.storage.getItem(LOCAL_OWNER_IDENTITY_STORAGE_KEY)
            if (confirmed !== ownerId) throw new Error('owner-identity-write-not-confirmed')
          } catch {
            throw new Error('owner-identity-storage-write-failed')
          }
          return ownerId
        },
      )
    },
  })
}

/**
 * Browser composition is explicitly development-only. Vite replaces DEV at
 * build time; a production bundle therefore always rejects this adapter.
 * This factory is not imported by the existing App or any W5 save workflow.
 */
export function createBrowserLocalDevelopmentOwnerIdentityPort(): OwnerIdentityPort {
  if (!import.meta.env.DEV) throw new Error('local-owner-identity-disabled-outside-development')
  let storage: Storage
  try {
    storage = window.localStorage
  } catch {
    throw new Error('owner-identity-storage-unavailable')
  }
  if (!globalThis.navigator?.locks) throw new Error('owner-identity-lock-unavailable')
  return createLocalOwnerIdentityPort({
    storage,
    initializationLock: {
      runExclusive: (name, operation) => globalThis.navigator.locks.request(name, () => operation()),
    },
    allocateUuid: () => {
      if (!globalThis.crypto?.randomUUID) throw new Error('owner-identity-crypto-unavailable')
      return globalThis.crypto.randomUUID()
    },
  })
}
