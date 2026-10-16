/**
 * Street counters. A meal is a flat price and a fixed heal.
 * A hospital, doctor, or clinic fills the bar and does not charge.
 * A bike shop sells one bicycle for a price in the €2000–€6000 band.
 */

export const MEAL_PRICE = 8;
export const MEAL_HEAL = 40;
export const BIKE_MIN = 2000;
export const BIKE_MAX = 6000;

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

/** Stable shop price, whole hundreds from €2000 to €6000. */
export function bikePrice(shop) {
  const name = String(shop?.name || shop?.id || "bicycle");
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const steps = (BIKE_MAX - BIKE_MIN) / 100;
  return BIKE_MIN + ((h >>> 0) % (steps + 1)) * 100;
}

/**
 * What E does at a bike shop.
 * @returns {{ action: "bike" | "broke" | "closed" | "owned", price: number, heal: number, label: string } | null}
 */
export function bikeOffer(shop, state) {
  if (!shop || shop.kind !== "bicycle") return null;
  const price = bikePrice(shop);
  if (shop.open !== true) return { action: "closed", price, heal: 0, label: "Closed" };
  if (state?.ownsBike) return { action: "owned", price, heal: 0, label: "" };
  if ((state?.money ?? 0) < price) {
    return { action: "broke", price, heal: 0, label: `Need €${price} for a bicycle` };
  }
  return { action: "bike", price, heal: 0, label: `E · bicycle · €${price}` };
}

/** Pay for a bicycle. Returns the next cash, or null when the offer is not a sale. */
export function buyBike(offer, state) {
  if (!offer || offer.action !== "bike") return null;
  if (state?.ownsBike) return null;
  const money = state?.money ?? 0;
  if (money < offer.price) return null;
  return { money: money - offer.price, spent: offer.price, ownsBike: true };
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
