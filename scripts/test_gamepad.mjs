/**
 * DualShock / Xbox id → help-card layout.
 *   node scripts/test_gamepad.mjs
 */
import assert from "node:assert/strict";
import { choosePad, interactLabel, layoutFromId, padFromBridge, padLabel, parseSonyReport } from "../viewer/gamepad.js";

const ds4 = "Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)";
const ds4Firefox = "054c-09cc-Wireless Controller";
const dualsense = "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)";
const xbox = "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)";
const unknown = "Generic USB Joystick";

assert.equal(layoutFromId(ds4), "playstation");
assert.equal(layoutFromId(ds4Firefox), "playstation");
assert.equal(layoutFromId(dualsense), "playstation");
assert.equal(layoutFromId(xbox), "xbox");
assert.equal(layoutFromId(unknown), null);

assert.equal(padLabel(ds4), "DualShock");
assert.equal(padLabel(ds4Firefox), "DualShock");
assert.equal(padLabel(dualsense), "DualSense");
assert.equal(padLabel(xbox), "Xbox");
assert.equal(padLabel(unknown), "Controller");

assert.equal(interactLabel("playstation"), "Square");
assert.equal(interactLabel("xbox"), "X");
assert.equal(interactLabel("generic"), "X");
assert.equal(interactLabel(null), "E");

const standard = { connected: true, mapping: "standard", id: ds4, axes: [0, 0, 0, 0] };
const gyro = { connected: true, mapping: "", id: "Wireless Controller", axes: [0.2, -0.4, 0.1, 0, 0.9, -0.2, 0.3, 0.1] };
assert.equal(layoutFromId("Gamepad (Vendor: 1356 Product: 1476)"), "playstation");
assert.equal(choosePad([gyro, standard]), standard);
assert.equal(choosePad([gyro]), gyro);
const mystery = { connected: true, mapping: "", id: "mystery", axes: [0, 0, 0, 0, 1, 1, 1, 1] };
assert.equal(choosePad([mystery]), mystery);
assert.equal(choosePad([null, { connected: true, mapping: "", id: "mystery", axes: [0, 0, 0, 0] }]).axes.length, 4);

const idle = parseSonyReport(0x05c4, 0x01, [128, 128, 128, 128, 0x08, 0, 0, 0, 0]);
assert.equal(idle.axes[0], 0);
assert.equal(idle.axes[1], 0);
assert.equal(layoutFromId(idle.id), "playstation");
assert.equal(padLabel(idle.id), "DualShock");
assert.equal(idle.buttons[0].pressed, false);
assert.equal(idle.buttons[12].pressed, false);

const active = parseSonyReport(0x05c4, 0x01, [0, 255, 128, 128, 0x28, 0x01, 0, 200, 0]);
assert.ok(active.axes[0] < -0.9);
assert.ok(active.axes[1] > 0.9);
assert.equal(active.buttons[0].pressed, true);
assert.equal(active.buttons[4].pressed, true);
assert.equal(active.buttons[6].pressed, true);
assert.equal(active.buttons[12].pressed, false);

const north = parseSonyReport(0x05c4, 0x01, [128, 128, 128, 128, 0x00, 0x20, 0, 0, 0]);
assert.equal(north.buttons[12].pressed, true);
assert.equal(north.buttons[9].pressed, true);

const bt = parseSonyReport(0x09cc, 0x11, [0xc0, 0x00, 0, 128, 128, 128, 0x10, 0, 0, 0, 0]);
assert.ok(bt.axes[0] < -0.9);
assert.equal(bt.buttons[2].pressed, true);
assert.equal(padLabel(bt.id), "DualShock");

const sense = parseSonyReport(0x0ce6, 0x01, [128, 128, 128, 128, 0, 0, 0, 0x80, 0]);
assert.equal(sense.buttons[3].pressed, true);
assert.equal(padLabel(sense.id), "DualSense");
assert.equal(parseSonyReport(0x05c4, 0x05, [128, 128, 128, 128, 0x08, 0]), null);
assert.equal(parseSonyReport(0x05c4, 0x01, [128, 128]), null);

const bridged = padFromBridge({
  ok: true, lx: 0, ly: 0.8, rx: 0, ry: 0,
  up: 0, down: 1, left: 0, right: 0,
  cross: 1, circle: 0, square: 0, triangle: 0,
  l1: 0, r1: 0, l2: 0.8, r2: 0,
  share: 0, options: 0,
});
assert.equal(layoutFromId(bridged.id), "playstation");
assert.equal(bridged.axes[1], 0.8);
assert.equal(bridged.buttons[0].pressed, true);
assert.equal(bridged.buttons[13].pressed, true);
assert.equal(bridged.buttons[6].pressed, true);
assert.equal(padFromBridge({ ok: false }), null);

console.log("gamepad layout ok");
