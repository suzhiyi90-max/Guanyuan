/**
 * W6-I-2 — local development OwnerId adapter.
 *
 * This adapter is intentionally not wired into the current W5 Preview App.
 * It stores only a local installation owner key; it does not create worlds,
 * reserve Genesis, or write game facts.
 */
/// <reference types="vite/client" />

import { parseOwnerId, type OwnerIdentityPort, type OwnerId } from '../application/identity/owner'

export interface OwnerIdentityStoragePort {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface LocalOwnerIdentityOptions {
  readonly storage: OwnerIdentityStoragePort
  readonly allocateUuid: () => string
}

export const LOCAL_OWNER_IDENTITY_STORAGE_KEY = 'guanyuan:w6:local-owner:v1'

function candidateOwnerId(allocateUuid: () => string): OwnerId {
  const uuid = allocateUuid()
  return parseOwnerId(`owner:local:${uuid}`)
}

/**
 * Storage-backed adapter core. Storage and UUID allocation are injected so
 * failures and restart persistence can be tested without browser globals.
 */
export function createLocalOwnerIdentityPort(options: LocalOwnerIdentityOptions): OwnerIdentityPort {
  return Object.freeze({
    async resolve(): Promise<OwnerId> {
      let stored: string | null
      try {
        stored = options.storage.getItem(LOCAL_OWNER_IDENTITY_STORAGE_KEY)
      } catch {
        throw new Error('owner-identity-storage-read-failed')
      }

      if (stored !== null) {
        try {
          return parseOwnerId(stored)
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
  return createLocalOwnerIdentityPort({
    storage,
    allocateUuid: () => {
      if (!globalThis.crypto?.randomUUID) throw new Error('owner-identity-crypto-unavailable')
      return globalThis.crypto.randomUUID()
    },
  })
}
