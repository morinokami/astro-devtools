/**
 * `Omit` applied to each member of a union, for the primitives that pass an
 * element's native attributes through. Preact types some elements as unions
 * that tie `role` to another attribute — `type` on an `input`, `multiple` and
 * `size` on a `select` — and a plain `Omit` would merge the members into props
 * that the element no longer accepts.
 */

export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
