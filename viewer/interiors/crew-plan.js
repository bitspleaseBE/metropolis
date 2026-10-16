/**
 * Who stands where inside a shop.
 * A dining room keeps a cashier and a cook, not a floor full of waitresses.
 * Nurse, cook, and counter uniforms never fill the customer seats.
 */

const UNIFORM_ID = /^(Staff_|Medical_|Chef_)/;

export function isUniform(person) {
  return !person || person.role === "staff" || UNIFORM_ID.test(person.id || "");
}

const rank = (role) => (role === "cashier" ? 0 : role === "chef" ? 1 : role === "nurse" ? 2 : 3);

/**
 * The posts that actually get a person. Restaurants and cafés stop at the
 * counter and the kitchen. A ward keeps reception and two nurses.
 */
export function staffToSpawn(spots, template, wanted) {
  const sorted = [...(spots || [])].sort((a, b) => rank(a.role) - rank(b.role));
  let cap = Math.max(1, Number(wanted) || 1);
  if (template === "restaurant" || template === "bar_coffee") cap = Math.min(cap, 2);
  if (template === "care") cap = Math.min(cap, 3);
  const picked = [];
  for (const s of sorted) {
    if (picked.length >= cap) break;
    if (template === "restaurant" && s.role !== "cashier" && s.role !== "chef") continue;
    picked.push(s);
  }
  if (!picked.length && sorted.length) picked.push(sorted[0]);
  return picked;
}
