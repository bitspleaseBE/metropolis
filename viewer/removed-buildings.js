/**
 * Buildings dropped from a district layout after its GLBs were baked (buildings.json `removed`).
 * Their meshes (`bldg_<id>`, `bldg_<id>_roof`, `bldg_<id>_facade0`, …) are hidden as chunks attach.
 * Building ids are unique across districts, so one set serves our package and every neighbour.
 */

const BLDG_ID = /^bldg_(\d+)(?:[_.]|$)/;

export function buildingIdOf(name) {
  const m = BLDG_ID.exec(String(name || ""));
  return m ? m[1] : null;
}

export function createRemovedBuildings(scene) {
  const ids = new Set();

  function apply(root) {
    if (!ids.size || !root) return 0;
    let hidden = 0;
    root.traverse((obj) => {
      const id = buildingIdOf(obj.name);
      if (id && ids.has(id) && obj.visible) {
        obj.visible = false;
        hidden += 1;
      }
    });
    return hidden;
  }

  /** Register a buildings.json body; hides matches already in the scene. */
  function add(doc) {
    let fresh = 0;
    for (const id of (doc && doc.removed) || []) {
      const key = String(id);
      if (!ids.has(key)) {
        ids.add(key);
        fresh += 1;
      }
    }
    return fresh ? apply(scene) : 0;
  }

  return { add, apply, ids };
}
