/**
 * Ball-court lines, goals and playground pads from pitches.json.
 * The city polygons are the real rectangles; this only paints them.
 */

import { fetchJsonCached } from "./json-cache.js";

const LINE = [0.93, 0.94, 0.91];
const SAND = [0.62, 0.5, 0.34];

function ringMesh(THREE, ring, rgb, y, opacity) {
  if (!ring || ring.length < 3) return null;
  const shape = new THREE.Shape();
  shape.moveTo(ring[0][0], ring[0][1]);
  for (let i = 1; i < ring.length; i++) shape.lineTo(ring[i][0], ring[i][1]);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(rgb[0], rgb[1], rgb[2]),
    transparent: opacity < 1,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.name = "court_line";
  return mesh;
}

function addBox(group, THREE, mat, w, h, d, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  group.add(mesh);
}

/** A goal or hoop whose mesh faces world +Z before ``yaw`` turns the mouth into the court. */
function addGoal(parent, THREE, mats, goal) {
  const group = new THREE.Group();
  group.position.set(goal.x, 0, -goal.y);
  group.rotation.y = goal.yaw || 0;
  const w = Math.max(1.2, goal.w || 4);
  const h = Math.max(1.4, goal.h || 2);
  if (goal.k === "hoop") {
    addBox(group, THREE, mats.pole, 0.12, h + 0.3, 0.12, 0, (h + 0.3) / 2, -0.55);
    addBox(group, THREE, mats.white, 1.8, 1.05, 0.06, 0, h + 0.15, -0.18);
    const rim = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.235, 18), mats.orange);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, h, 0.08);
    group.add(rim);
  } else {
    const post = 0.1;
    addBox(group, THREE, mats.white, post, h, post, -w / 2, h / 2, 0);
    addBox(group, THREE, mats.white, post, h, post, w / 2, h / 2, 0);
    addBox(group, THREE, mats.white, w, post, post, 0, h, 0);
  }
  parent.add(group);
}

/** Draw every court and playground in the current district package. */
export async function paintCourts(scene, THREE) {
  if (!scene || !THREE) return 0;
  let doc = {};
  try {
    const res = await fetchJsonCached("pitches.json");
    if (!res.ok) return 0;
    doc = await res.json();
  } catch {
    return 0;
  }
  const group = new THREE.Group();
  group.name = "Courts";
  const mats = {
    white: new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.4, metalness: 0.2 }),
    orange: new THREE.MeshStandardMaterial({ color: 0xe07028, roughness: 0.45, metalness: 0.1 }),
    pole: new THREE.MeshStandardMaterial({ color: 0x2c2c2a, roughness: 0.55, metalness: 0.35 }),
  };
  let n = 0;
  for (const pad of doc.playgrounds || []) {
    const mesh = ringMesh(THREE, pad.ring, SAND, 0.03, 0.92);
    if (!mesh) continue;
    mesh.name = "playground";
    group.add(mesh);
    n += 1;
  }
  for (const court of doc.courts || []) {
    for (const ring of court.lines || []) {
      const mesh = ringMesh(THREE, ring, LINE, 0.055, 0.95);
      if (mesh) group.add(mesh);
    }
    for (const goal of court.goals || []) addGoal(group, THREE, mats, goal);
    n += 1;
  }
  if (n) scene.add(group);
  return n;
}
