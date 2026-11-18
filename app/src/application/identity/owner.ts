/**
 * W6-I-2 — account/world owner identity port.
 *
 * OwnerId is an application security subject. It is deliberately distinct
 * from the in-world PersonId used by W6-H command authorization.
 */
declare const ownerIdBrand: unique symbol

export type OwnerId = string & { readonly [ownerIdBrand]: 'OwnerId' }

export interface OwnerIdentityPort {
  /** Resolves the stable owner for this installation/session. */
  resolve(): Promise<OwnerId>
}

export function parseOwnerId(value: string): OwnerId {
  const normalized = value.trim()
  if (!/^owner:local:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new Error('owner-identity-format-invalid')
  }
  return normalized as OwnerId
}
