/**
 * Stable ids for page elements. Panels key their rows by the element a row
 * describes, so an existing row keeps its DOM and focus when a rescan
 * inserts, removes, or reorders neighbors. An id is minted the first time
 * an element is seen and then lives as long as the element does, so
 * repeated scans always agree.
 */

const idsByElement = new WeakMap<Element, string>();
let nextElementId = 0;

/** The id assigned to `element`. */
export function stableElementId(element: Element): string {
  let id = idsByElement.get(element);
  if (id === undefined) {
    id = `element-${nextElementId++}`;
    idsByElement.set(element, id);
  }
  return id;
}
