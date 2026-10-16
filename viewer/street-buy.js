/**
 * Street counters. A meal is a flat price and a fixed heal.
 * A hospital, doctor, or clinic fills the bar and does not charge.
 */

export const MEAL_PRICE = 8;
export const MEAL_HEAL = 40;

const FOOD = new Set([
  "bakery",
  "butcher",
  "greengrocer",
  "cafe",
  "restaurant",
  "fast_food",
  "supermarket",
  "convenience",
  "chocolate",
  "ice_cream",
  "deli",
  "kiosk",
]);

const CARE = new Set(["hospital", "doctors", "clinic"]);

export function isFoodKind(kind) {
  return FOOD.has(kind);
}

export function isCareKind(kind) {
  return CARE.has(kind);
}

/**
 * What E does at this counter.
 * @returns {{ action: "meal" | "broke" | "closed" | "full", price: number, heal: number, label: string } | null}
 */
export function mealOffer(shop, state) {
  if (!shop || !isFoodKind(shop.kind)) return null;
  if (shop.open !== true) {
    return { action: "closed", price: MEAL_PRICE, heal: 0, label: "Closed" };
  }
  const health = state?.health ?? 100;
  const money = state?.money ?? 0;
  if (health >= 100) return { action: "full", price: MEAL_PRICE, heal: 0, label: "" };
  if (money < MEAL_PRICE) {
    return { action: "broke", price: MEAL_PRICE, heal: MEAL_HEAL, label: `Need €${MEAL_PRICE} for a meal` };
  }
  return {
    action: "meal",
    price: MEAL_PRICE,
    heal: MEAL_HEAL,
    label: `E · meal · €${MEAL_PRICE}`,
  };
}

/**
 * What E does at a hospital, doctor, or clinic.
 * @returns {{ action: "treat" | "closed" | "full", price: number, heal: number, label: string } | null}
 */
export function careOffer(shop, state) {
  if (!shop || !isCareKind(shop.kind)) return null;
  if (shop.open !== true) return { action: "closed", price: 0, heal: 0, label: "Closed" };
  const health = state?.health ?? 100;
  if (health >= 100) return { action: "full", price: 0, heal: 0, label: "" };
  return { action: "treat", price: 0, heal: 100 - health, label: "E · treated · full health" };
}

/** Apply a meal. Returns the next health and cash, or null when the offer is not a sale. */
export function buyMeal(offer, state) {
  if (!offer || offer.action !== "meal") return null;
  const money = state?.money ?? 0;
  const health = state?.health ?? 0;
  if (money < offer.price) return null;
  return {
    money: money - offer.price,
    health: Math.min(100, health + offer.heal),
    spent: offer.price,
    healed: Math.min(offer.heal, 100 - health),
  };
}
