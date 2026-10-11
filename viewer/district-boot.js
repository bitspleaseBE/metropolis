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
    let id = requested;
    if (!id && index && index.default) id = index.default;
    if (!id) id = "2018-harmonie";
    window.__DISTRICT.id = id;
    window.__DISTRICT.base = baseFor(id);
    if (index && Array.isArray(index.districts)) {
      const meta = index.districts.find((d) => d.id === id);
      if (meta) {
        window.__DISTRICT.title = meta.title || id;
        window.__DISTRICT.summary = meta.summary || "";
      }
      window.__DISTRICT.edges = (index.edges || []).filter((e) => e.from === id);
    }
    // Probe package; fall back to viewer root for unmigrated deploys.
    try {
      const probe = await fetch(window.__DISTRICT.base + "spawn.json", { method: "HEAD" });
      if (!probe.ok) {
        const legacy = await fetch("./spawn.json", { method: "HEAD" });
        if (legacy.ok) window.__DISTRICT.base = "./";
      }
    } catch (_) {
      window.__DISTRICT.base = "./";
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
