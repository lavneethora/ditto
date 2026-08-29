import type { Profile } from "~profile/schema"

/**
 * Every section receives the whole profile and a patch function, rather than
 * just its own slice.
 *
 * That is deliberate: a few sections need to read across slices (Preferences
 * suggests locations from Work history, Personal warns when a preferred name
 * is set but unchecked), and threading eight bespoke prop shapes through the
 * modal to save one object reference is not worth the coupling.
 */
export interface SectionProps {
  profile: Profile
  update: (patch: Partial<Profile>) => void
}

/** Replace one item in a keyed list, leaving the rest untouched. */
export function replaceById<T extends { id: string }>(items: T[], id: string, patch: Partial<T>): T[] {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item))
}

export function removeById<T extends { id: string }>(items: T[], id: string): T[] {
  return items.filter((item) => item.id !== id)
}
