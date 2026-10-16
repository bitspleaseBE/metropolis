/**
 * A meal at an open food shop costs €8 and puts 40 health back.
 *   node scripts/test_street_buy.mjs
 */
import assert from "node:assert/strict";
import {
  BIKE_MAX,
  BIKE_MIN,
  MEAL_HEAL,
  MEAL_PRICE,
  bikeOffer,
  bikePrice,
  buyBike,
  buyMeal,
  careOffer,
  isCareKind,
  isFoodKind,
  mealOffer,
} from "../viewer/street-buy.js";

assert.equal(isFoodKind("bakery"), true);
assert.equal(isFoodKind("pharmacy"), false);

const open = { kind: "bakery", open: true };
assert.equal(mealOffer(open, { health: 100, money: 25 })?.action, "full");
assert.equal(mealOffer({ kind: "bakery", open: false }, { health: 40, money: 25 })?.action, "closed");
assert.equal(mealOffer(open, { health: 40, money: 3 })?.action, "broke");
assert.equal(mealOffer({ kind: "clothes", open: true }, { health: 40, money: 25 }), null);

const deal = mealOffer(open, { health: 50, money: 25 });
assert.equal(deal.action, "meal");
assert.equal(deal.price, MEAL_PRICE);
const next = buyMeal(deal, { health: 50, money: 25 });
assert.equal(next.money, 25 - MEAL_PRICE);
assert.equal(next.health, 50 + MEAL_HEAL);
assert.equal(buyMeal(deal, { health: 90, money: 25 }).health, 100);
assert.equal(buyMeal(deal, { health: 50, money: 0 }), null);

assert.equal(isCareKind("hospital"), true);
assert.equal(isCareKind("doctors"), true);
assert.equal(isCareKind("clinic"), true);
assert.equal(isCareKind("pharmacy"), false);
assert.equal(careOffer({ kind: "bakery", open: true }, { health: 40 }), null);
assert.equal(careOffer({ kind: "hospital", open: false }, { health: 40 })?.action, "closed");
assert.equal(careOffer({ kind: "doctors", open: true }, { health: 100 })?.action, "full");
const ward = careOffer({ kind: "clinic", open: true }, { health: 12 });
assert.equal(ward.action, "treat");
assert.equal(ward.price, 0);
assert.equal(ward.heal, 88);
assert.equal(ward.label.includes("full health"), true);

const priced = bikePrice({ name: "ECOMOBIEL" });
assert.equal(priced, bikePrice({ name: "ECOMOBIEL" }));
assert.equal(priced >= BIKE_MIN && priced <= BIKE_MAX, true);
assert.equal(priced % 100, 0);
assert.notEqual(bikePrice({ name: "ECOMOBIEL" }), bikePrice({ name: "Lucien" }));
assert.equal(bikeOffer({ kind: "bakery", open: true, name: "ECOMOBIEL" }, { money: 9000 }), null);
assert.equal(bikeOffer({ kind: "bicycle", open: false, name: "ECOMOBIEL" }, { money: 9000 })?.action, "closed");
assert.equal(bikeOffer({ kind: "bicycle", open: true, name: "ECOMOBIEL" }, { money: 25 })?.action, "broke");
assert.equal(bikeOffer({ kind: "bicycle", open: true, name: "ECOMOBIEL" }, { money: 9000, ownsBike: true })?.action, "owned");
const sale = bikeOffer({ kind: "bicycle", open: true, name: "ECOMOBIEL" }, { money: 9000 });
assert.equal(sale.action, "bike");
assert.equal(sale.price, priced);
assert.equal(sale.label, `E · bicycle · €${priced}`);
const bought = buyBike(sale, { money: 9000 });
assert.equal(bought.spent, priced);
assert.equal(bought.money, 9000 - priced);
assert.equal(bought.ownsBike, true);
assert.equal(buyBike(sale, { money: 9000, ownsBike: true }), null);

console.log("street-buy ok");
