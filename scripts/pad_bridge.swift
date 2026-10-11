import AppKit
import Foundation
import GameController

setbuf(stdout, nil)

// This process is never the foreground app. GameController still lists the
// DualShock, but it freezes the sticks and buttons at rest unless a background
// reader opts in. Chrome then shows "ready" and never sees a deflection.
NSApplication.shared.setActivationPolicy(.prohibited)
GCController.shouldMonitorBackgroundEvents = true

final class PadState {
    var lx: Float = 0
    var ly: Float = 0
    var rx: Float = 0
    var ry: Float = 0
    var up = false
    var down = false
    var left = false
    var right = false
    var cross = false
    var circle = false
    var square = false
    var triangle = false
    var l1 = false
    var r1 = false
    var l2: Float = 0
    var r2: Float = 0
    var share = false
    var options = false
}

let state = PadState()
var bound: ObjectIdentifier?
var pollLx: Float = 0
var pollLy: Float = 0
var pollRx: Float = 0
var pollRy: Float = 0
var pollL2: Float = 0
var pollR2: Float = 0
var pollCross = false
var pollCircle = false
var pollSquare = false
var pollTriangle = false
var pollL1 = false
var pollR1 = false
var pollUp = false
var pollDown = false
var pollLeft = false
var pollRight = false
var pollShare = false
var pollOptions = false

func flag(_ pressed: Bool) -> String { pressed ? "1" : "0" }

func changed(_ now: Float, _ was: Float) -> Bool { abs(now - was) > 0.02 }

func bind(_ pad: GCExtendedGamepad) {
    pad.leftThumbstick.valueChangedHandler = { (_: GCControllerDirectionPad, x: Float, y: Float) in
        state.lx = x
        state.ly = -y
    }
    pad.rightThumbstick.valueChangedHandler = { (_: GCControllerDirectionPad, x: Float, y: Float) in
        state.rx = x
        state.ry = -y
    }
    pad.dpad.valueChangedHandler = { (dpad: GCControllerDirectionPad, _: Float, _: Float) in
        state.up = dpad.up.isPressed
        state.down = dpad.down.isPressed
        state.left = dpad.left.isPressed
        state.right = dpad.right.isPressed
    }
    pad.buttonA.pressedChangedHandler = { _, _, pressed in state.cross = pressed }
    pad.buttonB.pressedChangedHandler = { _, _, pressed in state.circle = pressed }
    pad.buttonX.pressedChangedHandler = { _, _, pressed in state.square = pressed }
    pad.buttonY.pressedChangedHandler = { _, _, pressed in state.triangle = pressed }
    pad.leftShoulder.pressedChangedHandler = { _, _, pressed in state.l1 = pressed }
    pad.rightShoulder.pressedChangedHandler = { _, _, pressed in state.r1 = pressed }
    pad.leftTrigger.valueChangedHandler = { _, value, _ in state.l2 = value }
    pad.rightTrigger.valueChangedHandler = { _, value, _ in state.r2 = value }
    pad.buttonOptions?.pressedChangedHandler = { _, _, pressed in state.share = pressed }
    pad.buttonMenu.pressedChangedHandler = { _, _, pressed in state.options = pressed }

    pollLx = pad.leftThumbstick.xAxis.value
    pollLy = -pad.leftThumbstick.yAxis.value
    pollRx = pad.rightThumbstick.xAxis.value
    pollRy = -pad.rightThumbstick.yAxis.value
    pollL2 = pad.leftTrigger.value
    pollR2 = pad.rightTrigger.value
    pollCross = pad.buttonA.isPressed
    pollCircle = pad.buttonB.isPressed
    pollSquare = pad.buttonX.isPressed
    pollTriangle = pad.buttonY.isPressed
    pollL1 = pad.leftShoulder.isPressed
    pollR1 = pad.rightShoulder.isPressed
    pollUp = pad.dpad.up.isPressed
    pollDown = pad.dpad.down.isPressed
    pollLeft = pad.dpad.left.isPressed
    pollRight = pad.dpad.right.isPressed
    pollShare = pad.buttonOptions?.isPressed == true
    pollOptions = pad.buttonMenu.isPressed
    state.lx = pollLx
    state.ly = pollLy
    state.rx = pollRx
    state.ry = pollRy
    state.l2 = pollL2
    state.r2 = pollR2
    state.cross = pollCross
    state.circle = pollCircle
    state.square = pollSquare
    state.triangle = pollTriangle
    state.l1 = pollL1
    state.r1 = pollR1
    state.up = pollUp
    state.down = pollDown
    state.left = pollLeft
    state.right = pollRight
    state.share = pollShare
    state.options = pollOptions
}

func takeFloat(_ now: Float, _ last: inout Float, _ into: inout Float) {
    if !changed(now, last) { return }
    last = now
    into = now
}

func takeBool(_ now: Bool, _ last: inout Bool, _ into: inout Bool) {
    if now == last { return }
    last = now
    into = now
}

func absorb(_ pad: GCExtendedGamepad) {
    // Copy a polled value only when it actually changes. A stick stuck at
    // zero must not erase a handler update, and a live poll must still be
    // able to return the stick to center.
    takeFloat(pad.leftThumbstick.xAxis.value, &pollLx, &state.lx)
    takeFloat(-pad.leftThumbstick.yAxis.value, &pollLy, &state.ly)
    takeFloat(pad.rightThumbstick.xAxis.value, &pollRx, &state.rx)
    takeFloat(-pad.rightThumbstick.yAxis.value, &pollRy, &state.ry)
    takeFloat(pad.leftTrigger.value, &pollL2, &state.l2)
    takeFloat(pad.rightTrigger.value, &pollR2, &state.r2)
    takeBool(pad.buttonA.isPressed, &pollCross, &state.cross)
    takeBool(pad.buttonB.isPressed, &pollCircle, &state.circle)
    takeBool(pad.buttonX.isPressed, &pollSquare, &state.square)
    takeBool(pad.buttonY.isPressed, &pollTriangle, &state.triangle)
    takeBool(pad.leftShoulder.isPressed, &pollL1, &state.l1)
    takeBool(pad.rightShoulder.isPressed, &pollR1, &state.r1)
    takeBool(pad.dpad.up.isPressed, &pollUp, &state.up)
    takeBool(pad.dpad.down.isPressed, &pollDown, &state.down)
    takeBool(pad.dpad.left.isPressed, &pollLeft, &state.left)
    takeBool(pad.dpad.right.isPressed, &pollRight, &state.right)
    takeBool(pad.buttonOptions?.isPressed == true, &pollShare, &state.share)
    takeBool(pad.buttonMenu.isPressed, &pollOptions, &state.options)
}

func sample() -> String {
    guard let controller = GCController.controllers().first(where: { $0.extendedGamepad != nil }),
          let pad = controller.extendedGamepad else {
        bound = nil
        return "{\"ok\":false}"
    }
    if controller.playerIndex == .indexUnset {
        controller.playerIndex = .index1
    }
    let id = ObjectIdentifier(controller)
    if bound != id {
        bind(pad)
        bound = id
    } else {
        absorb(pad)
    }
    return String(
        format: "{\"ok\":true,\"lx\":%.3f,\"ly\":%.3f,\"rx\":%.3f,\"ry\":%.3f,\"up\":%@,\"down\":%@,\"left\":%@,\"right\":%@,\"cross\":%@,\"circle\":%@,\"square\":%@,\"triangle\":%@,\"l1\":%@,\"r1\":%@,\"l2\":%.3f,\"r2\":%.3f,\"share\":%@,\"options\":%@}",
        state.lx, state.ly, state.rx, state.ry,
        flag(state.up), flag(state.down), flag(state.left), flag(state.right),
        flag(state.cross), flag(state.circle), flag(state.square), flag(state.triangle),
        flag(state.l1), flag(state.r1),
        state.l2, state.r2,
        flag(state.share), flag(state.options)
    )
}

Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { _ in
    let line = sample()
    print(line)
    fflush(stdout)
}
NSApplication.shared.run()
