/**
 * Dashes and zebras become white paint. Asphalt and kerbs stay as they are.
 *   node scripts/test_road_paint.mjs
 */
import assert from "node:assert/strict";
import { MARKING, isRoadMarking, paintRoadMarkings, paintSurveyMarkings } from "../viewer/road-paint.js";

assert.equal(isRoadMarking("road_dash"), true);
assert.equal(isRoadMarking("road_dash_1"), true);
assert.equal(isRoadMarking("zebra"), true);
assert.equal(isRoadMarking("zebra_rail_3"), true);
assert.equal(isRoadMarking("Zebra"), true);
assert.equal(isRoadMarking("road_iron"), false);
assert.equal(isRoadMarking("asphalt"), false);
assert.equal(isRoadMarking("curb"), false);
assert.equal(isRoadMarking("hedge"), false);

function color() {
  return {
    r: 0.82,
    g: 0.78,
    b: 0.55,
    setRGB(r, g, b) {
      this.r = r;
      this.g = g;
      this.b = b;
    },
  };
}
const dash = { name: "road_dash", color: color() };
const zebra = { name: "zebra_4", color: color() };
const iron = { name: "road_iron", color: color() };
const root = {
  traverse(fn) {
    fn({ isMesh: true, material: [dash, iron] });
    fn({ isMesh: true, material: zebra });
  },
};
assert.equal(paintRoadMarkings(root), 2);
assert.equal(dash.color.r, MARKING[0]);
assert.ok(dash.color.b > 0.9, "a dash is no longer sand");
assert.equal(zebra.color.g, MARKING[1]);
assert.equal(iron.color.r, 0.82, "worn asphalt is left alone");
assert.equal(paintRoadMarkings(root), 2);

function makeTHREE() {
  class Shape {
    moveTo() {}
    lineTo() {}
    closePath() {}
  }
  class ShapeGeometry {}
  class MeshBasicMaterial {
    constructor(opts) {
      Object.assign(this, opts);
    }
  }
  class Color {
    constructor(r, g, b) {
      this.r = r;
      this.g = g;
      this.b = b;
    }
  }
  class Mesh {
    constructor() {
      this.rotation = { x: 0 };
      this.position = { y: 0 };
      this.name = "";
    }
  }
  class Group {
    constructor() {
      this.children = [];
      this.name = "";
    }
    add(mesh) {
      this.children.push(mesh);
    }
  }
  return { Shape, ShapeGeometry, MeshBasicMaterial, Mesh, Color, Group };
}

assert.equal(await paintSurveyMarkings(null, makeTHREE()), 0);

globalThis.fetch = async () => {
  throw new Error("offline");
};
const missed = [];
assert.equal(await paintSurveyMarkings({ add(g) { missed.push(g); } }, makeTHREE()), 0);
assert.equal(missed.length, 0);

globalThis.fetch = async (url) => {
  assert.match(String(url), /roads\.json$/);
  return {
    ok: true,
    status: 200,
    json: async () => ({
      markings: [
        { k: "zebra", ring: [[0, 0], [4, 0], [4, 2]] },
        { k: "bike", ring: [[0, 0]] },
      ],
      parkingBays: [
        { lined: true, ring: [[0, 0], [5, 0], [5, 2]] },
        { lined: false, ring: [[0, 0], [1, 0], [1, 1]] },
      ],
    }),
  };
};
const added = [];
const painted = await paintSurveyMarkings({ add(g) { added.push(g); } }, makeTHREE());
assert.equal(painted, 2);
assert.equal(added.length, 1);
assert.equal(added[0].name, "SurveyPaint");
assert.equal(added[0].children[0].name, "survey_marking");
assert.equal(added[0].children[1].name, "survey_bay");

console.log("road paint ok");
