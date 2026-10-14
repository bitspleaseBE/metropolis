/**
 * Standard Gamepad API, with a WebHID fallback for the original DualShock 4.
 * That pad shows up on macOS as "Wireless controller" (USB vendor 054c,
 * product 05c4 / 09cc). Chrome on a Mac often leaves navigator.getGamepads()
 * empty for the first revision (05c4) even while the OS lists it. A one-time
 * hid.requestDevice grant lets us read the same sticks and buttons.
 *
 * Axes do not fire events — poll once per frame.
 *
 * Chrome on a Mac sometimes drops a pad for a few frames, and it may also
 * list a second raw device whose extra axes are the gyro. Prefer the standard
 * mapping, and keep the last real pad across short gaps so the help card
 * doesn't strobe and the sticks aren't zeroed every blip.
 *
 * Button index follows the W3C standard mapping: 0 bottom (Cross/A), 1 right
 * (Circle/B), 2 left (Square/X), 3 top (Triangle/Y), 4 L1, 5 R1, 6 L2, 7 R2,
 * 8 Share, 9 Options, 12–15 D-pad.
 */

const DEAD = 0.18;
const HOLD_MS = 160;
const DROP_MS = 1200;
const HID_FRESH_MS = 1200;
const BRIDGE_FRESH_MS = 1500;

/** Sony pads Chrome's Gamepad API misses, read through WebHID instead. */
const SONY_FILTERS = [
  { vendorId: 0x054c, productId: 0x05c4 },
  { vendorId: 0x054c, productId: 0x09cc },
  { vendorId: 0x054c, productId: 0x0ba0 },
  { vendorId: 0x054c, productId: 0x0ce6 },
  { vendorId: 0x054c, productId: 0x0df2 },
];
const SONY_PRODUCTS = new Set(SONY_FILTERS.map((f) => f.productId));

const BUTTONS = {
  0: "cross",
  1: "circle",
  2: "square",
  3: "triangle",
  4: "l1",
  5: "r1",
  6: "l2",
  7: "r2",
  8: "share",
  9: "options",
  12: "up",
  13: "down",
  14: "left",
  15: "right",
};

const ROWS = {
  keyboard: [
    ["W A S D", "Walk, steer"],
    ["Mouse", "Look · click punch / fire · right-click kick / aim"],
    ["Tab · wheel · 1–6", "Weapons · R reload"],
    ["Shift", "Sprint"],
    ["Space", "Jump"],
    ["E", "Scooter, tram, bus, Velo"],
    ["N", "Night / day"],
    ["V", "Map view"],
    ["M", "Radar"],
    ["Esc", "Menu"],
    ["H", "This card"],
  ],
  playstation: [
    ["Left stick", "Walk, steer"],
    ["Right stick", "Look"],
    ["L2", "Aim (sprint unarmed)"],
    ["Cross", "Jump"],
    ["R2", "Fire / punch · Circle reload / kick"],
    ["L1", "Weapon wheel"],
    ["Square", "Scooter, tram, bus, Velo"],
    ["Triangle", "Night / day"],
    ["D-pad up", "Map view"],
    ["D-pad down", "Radar"],
    ["Options", "Menu"],
    ["R1", "This card"],
  ],
  xbox: [
    ["Left stick", "Walk, steer"],
    ["Right stick", "Look"],
    ["LT", "Aim (sprint unarmed)"],
    ["A", "Jump"],
    ["RT", "Fire / punch · B reload / kick"],
    ["LB", "Weapon wheel"],
    ["X", "Scooter, tram, bus, Velo"],
    ["Y", "Night / day"],
    ["D-pad up", "Map view"],
    ["D-pad down", "Radar"],
    ["Menu", "Pause"],
    ["RB", "This card"],
  ],
};

export function layoutFromId(id = "") {
  const s = String(id).toLowerCase();
  if (/xbox|xinput|045e|microsoft/.test(s)) return "xbox";
  // 1356 / 1476 are the decimal forms of Sony's vendor id and the first DualShock 4.
  if (/054c|1356|09cc|05c4|1476|0ba0|0ce6|sony|dualshock|dualsense|playstation|wireless controller/.test(s)) {
    return "playstation";
  }
  return null;
}

export function padLabel(id = "") {
  const s = String(id).toLowerCase();
  if (/dualsense|0ce6/.test(s)) return "DualSense";
  if (layoutFromId(id) === "playstation") return "DualShock";
  if (layoutFromId(id) === "xbox") return "Xbox";
  return "Controller";
}

/** Face button that takes the keyboard's E action. */
export function interactLabel(layout) {
  if (layout === "playstation") return "Square";
  if (layout === "xbox" || layout === "generic") return "X";
  return "E";
}

const PRETTY = {
  playstation: {
    cross: "Cross",
    circle: "Circle",
    square: "Square",
    triangle: "Triangle",
    l1: "L1",
    r1: "R1",
    share: "Share",
    options: "Options",
    up: "D-pad up",
    down: "D-pad down",
    left: "D-pad left",
    right: "D-pad right",
  },
  xbox: {
    cross: "A",
    circle: "B",
    square: "X",
    triangle: "Y",
    l1: "LB",
    r1: "RB",
    share: "View",
    options: "Menu",
    up: "D-pad up",
    down: "D-pad down",
    left: "D-pad left",
    right: "D-pad right",
  },
};

/** Label for a held button on the controls screen. */
export function buttonName(layout, name) {
  const table = layout === "xbox" || layout === "generic" ? PRETTY.xbox : PRETTY.playstation;
  return table[name] || name;
}

/** Rows of [button, action] for the controls menu. */
export function controlRows(layout) {
  if (layout === "playstation") return ROWS.playstation;
  if (layout === "xbox" || layout === "generic") return ROWS.xbox;
  return ROWS.keyboard;
}

/**
 * Prefer a standard-mapped pad. A DualShock also exposes a raw gyro device;
 * those extra axes jitter at rest and were being read as the look stick.
 * @param {ArrayLike<{connected?: boolean, mapping?: string, axes?: ArrayLike<number>}> | null} pads
 */
export function choosePad(pads) {
  const list = [];
  if (pads) {
    for (let i = 0; i < pads.length; i++) {
      const g = pads[i];
      if (g && g.connected) list.push(g);
    }
  }
  if (!list.length) return null;
  // Any connected pad counts. A standard mapping wins; otherwise keep the
  // first device. Sticks are read from the first four axes only.
  return (
    list.find((g) => g.mapping === "standard") ||
    list.find((g) => layoutFromId(g.id)) ||
    list[0]
  );
}

function bitButton(value, mask) {
  const on = !!(value & mask);
  return { pressed: on, value: on ? 1 : 0 };
}

function analogButton(value) {
  const v = Math.max(0, Math.min(1, value));
  return { pressed: v > 0.4, value: v };
}

function hatButton(hat, dirs) {
  const on = dirs.includes(hat);
  return { pressed: on, value: on ? 1 : 0 };
}

/**
 * DualShock 4 / DualSense input report → a standard-mapped pad.
 * WebHID omits the report id. USB 0x01 starts at the sticks. Bluetooth
 * 0x11 (DS4) and 0x31 (DualSense) put two header bytes in front.
 * @param {number} productId
 * @param {number} reportId
 * @param {ArrayLike<number>} bytes
 */
export function parseSonyReport(productId, reportId, bytes) {
  if (!bytes) return null;
  const dualsense = productId === 0x0ce6 || productId === 0x0df2;
  const offset = reportId === 0x11 || reportId === 0x31 ? 2 : reportId === 0x01 ? 0 : -1;
  if (offset < 0) return null;
  const need = offset + (dualsense ? 9 : 6);
  if (bytes.length < need) return null;
  const axis = (i) => ((bytes[offset + i] || 0) - 128) / 128;
  const face = bytes[offset + (dualsense ? 7 : 4)] || 0;
  const shoulders = bytes[offset + (dualsense ? 8 : 5)] || 0;
  const l2 = dualsense
    ? (bytes[offset + 4] || 0) / 255
    : bytes.length > offset + 7
      ? (bytes[offset + 7] || 0) / 255
      : shoulders & 0x04
        ? 1
        : 0;
  const r2 = dualsense
    ? (bytes[offset + 5] || 0) / 255
    : bytes.length > offset + 8
      ? (bytes[offset + 8] || 0) / 255
      : shoulders & 0x08
        ? 1
        : 0;
  const hat = face & 0x0f;
  const hex = productId.toString(16).padStart(4, "0");
  return {
    connected: true,
    mapping: "standard",
    id: `Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: ${hex})`,
    axes: [axis(0), axis(1), axis(2), axis(3)],
    buttons: [
      bitButton(face, 0x20),
      bitButton(face, 0x40),
      bitButton(face, 0x10),
      bitButton(face, 0x80),
      bitButton(shoulders, 0x01),
      bitButton(shoulders, 0x02),
      analogButton(l2),
      analogButton(r2),
      bitButton(shoulders, 0x10),
      bitButton(shoulders, 0x20),
      bitButton(shoulders, 0x40),
      bitButton(shoulders, 0x80),
      hatButton(hat, [0, 1, 7]),
      hatButton(hat, [3, 4, 5]),
      hatButton(hat, [5, 6, 7]),
      hatButton(hat, [1, 2, 3]),
    ],
  };
}

export function padFromBridge(data) {
  if (!data || !data.ok) return null;
  const bit = (on) => ({ pressed: !!on, value: on ? 1 : 0 });
  const analog = (value) => {
    const v = Math.max(0, Math.min(1, Number(value) || 0));
    return { pressed: v > 0.4, value: v };
  };
  return {
    connected: true,
    mapping: "standard",
    id: "Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 05c4)",
    axes: [Number(data.lx) || 0, Number(data.ly) || 0, Number(data.rx) || 0, Number(data.ry) || 0],
    buttons: [
      bit(data.cross),
      bit(data.circle),
      bit(data.square),
      bit(data.triangle),
      bit(data.l1),
      bit(data.r1),
      analog(data.l2),
      analog(data.r2),
      bit(data.share),
      bit(data.options),
      bit(false),
      bit(false),
      bit(data.up),
      bit(data.down),
      bit(data.left),
      bit(data.right),
    ],
  };
}

function radial(x, y) {
  const m = Math.hypot(x, y);
  if (m < DEAD || m === 0) return { x: 0, y: 0 };
  const s = Math.min(1, (m - DEAD) / (1 - DEAD)) / m;
  return { x: x * s, y: y * s };
}

function emptyMove() {
  return { w: false, a: false, s: false, d: false };
}

function empty() {
  return {
    layout: null,
    label: "",
    id: "",
    move: emptyMove(),
    sprint: false,
    jump: false,
    look: { x: 0, y: 0 },
    sticks: { lx: 0, ly: 0, rx: 0, ry: 0 },
    down: {},
    pressed: {},
  };
}

export function createGamepad() {
  let layout = null;
  let label = "";
  let id = "";
  let missSince = 0;
  const prev = [];
  const gate = { w: false, a: false, s: false, d: false };
  const listeners = new Set();
  let queued = empty();
  let seq = 0;
  let enabled = true;
  let seenOn = false;
  let seenLabel = "";
  let receiving = false;
  let hidDevice = null;
  let hidPad = null;
  let hidAt = 0;
  let bridgePad = null;
  let bridgeAt = 0;
  let bridgeBusy = false;
  let bridgeWait = 0;

  function emit(info) {
    for (const fn of listeners) fn(info);
  }

  function disconnect() {
    if (!layout) return;
    layout = null;
    label = "";
    id = "";
    receiving = false;
    missSince = 0;
    prev.length = 0;
    gate.w = gate.a = gate.s = gate.d = false;
    publish(empty());
    emit(null);
  }

  function buttonDown(pad, i, analog = 0.55) {
    const b = pad.buttons && pad.buttons[i];
    if (!b) return false;
    return !!(b.pressed || b.value > analog);
  }

  function latched(name, amount) {
    const on = amount > (gate[name] ? 0.12 : 0.22);
    gate[name] = on;
    return on;
  }

  function read(pad) {
    const axes = pad.axes || [];
    const left = radial(axes[0] || 0, axes[1] || 0);
    const right = radial(axes[2] || 0, axes[3] || 0);
    const pressed = {};
    const down = {};
    for (const index of Object.keys(BUTTONS)) {
      const i = Number(index);
      const held = buttonDown(pad, i);
      const name = BUTTONS[index];
      down[name] = held;
      pressed[name] = held && !prev[i];
      prev[i] = held;
    }
    return {
      layout,
      label,
      id: pad.id,
      move: {
        w: latched("w", Math.max(0, -left.y)),
        s: latched("s", Math.max(0, left.y)),
        a: latched("a", Math.max(0, -left.x)),
        d: latched("d", Math.max(0, left.x)),
      },
      sprint: buttonDown(pad, 6, 0.4),
      jump: buttonDown(pad, 0),
      look: right,
      sticks: { lx: left.x, ly: left.y, rx: right.x, ry: right.y },
      down,
      pressed,
    };
  }

  function publish(next) {
    seq += 1;
    next.seq = seq;
    queued = next;
    return queued;
  }

  function holdLast(now) {
    const gone = now - missSince;
    if (gone > HOLD_MS) {
      gate.w = gate.a = gate.s = gate.d = false;
      publish({
        ...queued,
        move: emptyMove(),
        sprint: false,
        jump: false,
        look: { x: 0, y: 0 },
        sticks: { lx: 0, ly: 0, rx: 0, ry: 0 },
        down: {},
        pressed: {},
      });
    } else {
      publish({ ...queued, pressed: {} });
    }
    if (gone > DROP_MS) disconnect();
  }

  function markSeen(pad) {
    const on = !!pad;
    if (on) seenLabel = padLabel(pad.id) || "Controller";
    if (on === seenOn) return false;
    seenOn = on;
    return true;
  }

  function padEnergy(pad) {
    let energy = 0;
    const axes = pad.axes || [];
    for (let i = 0; i < 4; i++) energy += Math.abs(axes[i] || 0);
    const buttons = pad.buttons || [];
    for (let i = 0; i < buttons.length; i++) {
      const button = buttons[i];
      if (!button) continue;
      energy += Math.abs(button.value || 0);
    }
    return energy;
  }

  function poll() {
    pullBridge();
    const list = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
    const now = performance.now();
    const api = choosePad(list);
    const bridgeFresh = bridgePad && now - bridgeAt < BRIDGE_FRESH_MS;
    const hidFresh = hidPad && now - hidAt < HID_FRESH_MS;
    // Use whichever source is actually moving. A browser gamepad can sit
    // "connected" at rest while the bridge has the sticks, and the reverse
    // happens when the OS reader is frozen.
    const bridge = bridgeFresh ? bridgePad : null;
    const hid = hidFresh ? hidPad : null;
    const raw = [bridge, api, hid].find((pad) => pad && padEnergy(pad) > 0.08) || bridge || api || hid;
    if (raw && padEnergy(raw) > 0.08) receiving = true;
    const presenceChanged = markSeen(raw);
    const pad = enabled ? raw : null;
    if (!pad) {
      if (layout) {
        if (!missSince) missSince = now;
        holdLast(now);
      } else if (presenceChanged) emit(null);
      return queued;
    }
    missSince = 0;
    const next = layoutFromId(pad.id) || "generic";
    const nextLabel = padLabel(pad.id);
    if (next !== layout || nextLabel !== label) {
      const fresh = !layout;
      layout = next;
      label = nextLabel;
      id = pad.id;
      if (fresh) prev.length = 0;
      emit({ layout, label, id: pad.id });
    } else {
      id = pad.id;
    }
    return publish(read(pad));
  }

  function pullBridge() {
    if (bridgeBusy || performance.now() < bridgeWait) return;
    if (typeof location === "undefined") return;
    if (location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;
    bridgeBusy = true;
    fetch("/pad-state", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) {
          bridgePad = null;
          bridgeWait = performance.now() + 1000;
          return;
        }
        const pad = padFromBridge(data);
        bridgePad = pad;
        if (pad) bridgeAt = performance.now();
        else bridgeWait = performance.now() + 400;
      })
      .catch(() => {
        bridgePad = null;
        bridgeWait = performance.now() + 1000;
      })
      .finally(() => {
        bridgeBusy = false;
      });
  }

  function onHidReport(event) {
    const data = event.data;
    if (!data) return;
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const pad = parseSonyReport(hidDevice?.productId, event.reportId, bytes);
    if (!pad) return;
    hidPad = pad;
    hidAt = performance.now();
  }

  async function openHid(device) {
    if (!device || !SONY_PRODUCTS.has(device.productId)) return false;
    if (hidDevice && hidDevice !== device) hidDevice.removeEventListener("inputreport", onHidReport);
    hidDevice = device;
    device.removeEventListener("inputreport", onHidReport);
    device.addEventListener("inputreport", onHidReport);
    if (!device.opened) await device.open();
    return true;
  }

  /** Use a pad the page can already see. Opens the browser picker only if nothing is reading yet. */
  async function connect() {
    enabled = true;
    poll();
    if (layout) return true;
    if (typeof navigator === "undefined" || !navigator.hid?.requestDevice) return !!layout;
    const devices = await navigator.hid.requestDevice({ filters: SONY_FILTERS });
    const device = devices && devices[0];
    if (!device) return !!layout;
    const opened = await openHid(device);
    poll();
    return opened || !!layout;
  }

  /** Stop driving the game with the pad. The controller stays plugged in. */
  async function disconnectPad() {
    enabled = false;
    const device = hidDevice;
    hidDevice = null;
    hidPad = null;
    hidAt = 0;
    if (device) {
      device.removeEventListener("inputreport", onHidReport);
      try {
        await device.close();
      } catch {
        /* already closed */
      }
      try {
        await device.forget?.();
      } catch {
        /* forget is optional */
      }
    }
    disconnect();
    poll();
  }

  if (typeof window !== "undefined") {
    window.addEventListener("gamepadconnected", () => poll());
    window.addEventListener("gamepaddisconnected", () => poll());
    window.addEventListener("pointerdown", () => poll(), { capture: true });
    navigator.hid?.addEventListener?.("disconnect", (event) => {
      if (event.device !== hidDevice) return;
      hidDevice = null;
      hidPad = null;
      hidAt = 0;
      poll();
    });
  }

  return {
    poll,
    /** Latest sample. Call poll() once per frame, then read this. */
    sample: () => queued,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    connect,
    disconnectPad,
    get layout() {
      return layout;
    },
    get label() {
      return label;
    },
    connected: () => !!layout,
    receiving: () => receiving,
    detected: () => seenOn,
    detectedLabel: () => seenLabel || "Controller",
  };
}
