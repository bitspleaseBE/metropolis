/**
 * A meal at an open food shop costs €8 and puts 40 health back.
 *   node scripts/test_street_buy.mjs
 */
import assert from "node:assert/strict";
import { MEAL_HEAL, MEAL_PRICE, buyMeal, isFoodKind, mealOffer } from "../viewer/street-buy.js";

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

console.log("street-buy ok");
