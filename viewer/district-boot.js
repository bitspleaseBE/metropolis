/**
 * District package bootstrap. Sets window.__DISTRICT before other modules load.
 *
 * URL: ?district=2018-harmonie (default from districts/index.json).
 * Assets resolve under ./districts/<id>/ with legacy ./ fallbacks.
 */
(function () {
  const params = new URLSearchParams(location.search);
  const requested = params.get("district") || params.get("d") || "";

  window.__DISTRICT = {
    id: requested || "2018-harmonie",
    base: "",
    title: "Klein Antwerpen · Harmonie",
    summary: "",
    edges: [],
    index: null,
    ready: null,
  };

  function baseFor(id) {
    return "./districts/" + id + "/";
  }

  // District GLBs are built locally and git-ignored; Pages ships JSON-only packages.
  // A package without its core.glb is not playable.
  const builtCache = new Map();
  function districtBuilt(id) {
    if (!builtCache.has(id)) {
      builtCache.set(
        id,
        fetch(baseFor(id) + "core.glb", { method: "HEAD" })
          .then((res) => res.ok)
          .catch(() => false),
      );
    }
    return builtCache.get(id);
  }
  window.districtBuilt = districtBuilt;

  async function loadIndex() {
    try {
      const res = await fetch("./districts/index.json");
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  window.__DISTRICT.ready = (async () => {
    const index = await loadIndex();
    window.__DISTRICT.index = index;
    const fallbackId = (index && index.default) || "2018-harmonie";
    let id = requested || fallbackId;
    window.__DISTRICT.base = baseFor(id);
    // Unbuilt package (e.g. Pages): the legacy Klein Antwerpen city at the viewer root.
    if (!(await districtBuilt(id))) {
      let legacy = false;
      try {
        legacy = (await fetch("./spawn.json", { method: "HEAD" })).ok;
      } catch (_) {
        legacy = true;
      }
      if (legacy) {
        id = fallbackId;
        window.__DISTRICT.base = "./";
      }
    }
    window.__DISTRICT.id = id;
    if (index && Array.isArray(index.districts)) {
      const meta = index.districts.find((d) => d.id === id);
      if (meta) {
        window.__DISTRICT.title = meta.title || id;
        window.__DISTRICT.summary = meta.summary || "";
      }
      const edges = (index.edges || []).filter((e) => e.from === id);
      const built = await Promise.all(edges.map((e) => districtBuilt(e.to)));
      window.__DISTRICT.edges = edges.filter((_, i) => built[i]);
    }
    return window.__DISTRICT;
  })();

  /** Resolve a package-relative file (roads.json, core.glb, city.glb, …). */
  window.districtUrl = function districtUrl(name) {
    const bare = name.replace(/^\.\//, "");
    const base = (window.__DISTRICT && window.__DISTRICT.base) || "./";
    if (base === "./") {
      // Legacy filenames at viewer root.
      if (bare === "city.glb" || bare === "core.glb") return "./klein_antwerpen.glb";
      return "./" + bare;
    }
    return base + bare;
  };

  /** Prefer core.glb for first paint; fall back to city.glb / legacy. */
  window.districtCoreUrl = function districtCoreUrl() {
    const base = (window.__DISTRICT && window.__DISTRICT.base) || "./";
    if (base === "./") return "./klein_antwerpen.glb";
    return base + "core.glb";
  };

  window.enterDistrict = function enterDistrict(id) {
    const u = new URL(location.href);
    u.searchParams.set("district", id);
    location.href = u.toString();
  };
})();
