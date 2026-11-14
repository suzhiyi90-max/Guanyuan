export type AbsentField =
  | { readonly kind: 'unknown' }
  | { readonly kind: 'not-generated' }
  | { readonly kind: 'n/a' }

// {} excludes null and undefined while still permitting primitive payloads.
export type Field<T extends {}> =
  | { readonly kind: 'value'; readonly value: T }
  | AbsentField

export const field = {
  value<T extends {}>(value: T): Field<T> {
    return { kind: 'value', value }
  },
  unknown: { kind: 'unknown' } as const,
  notGenerated: { kind: 'not-generated' } as const,
  notApplicable: { kind: 'n/a' } as const,
}

export function isFieldValue<T extends {}>(value: Field<T>): value is { readonly kind: 'value'; readonly value: T } {
  return value.kind === 'value'
}
