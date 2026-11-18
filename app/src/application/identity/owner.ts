/**
 * W6-I-2 — account/world owner identity port.
 *
 * OwnerId is an application security subject. It is deliberately distinct
 * from the in-world PersonId used by W6-H command authorization. Its wire
 * value is provider-neutral; identity adapters must derive it from trusted
 * local or server-verified identity state.
 */
declare const ownerIdBrand: unique symbol

export type OwnerId = string & { readonly [ownerIdBrand]: 'OwnerId' }

export interface OwnerIdentityPort {
  /** Resolves the stable owner for this installation/account. */
  resolve(): Promise<OwnerId>
}

/** Brands a non-empty value already resolved by a trusted identity adapter. */
export function ownerIdFromTrustedValue(value: string): OwnerId {
  const normalized = value.trim()
  if (!normalized) throw new Error('owner-identity-value-empty')
  return normalized as OwnerId
}
