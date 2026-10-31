(() => {
  /* ---------- Helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  // el("div", { class: "x", onclick: fn }, child, "text", ...)
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (k === "value") n.value = v;
      else n.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(kid));
    return n;
  };
  const icon = name => el("i", { class: `ph ph-${name}`, "aria-hidden": "true" });
  const pad = n => String(n).padStart(2, "0");
  const IMG = /\.(jpe?g|png|webp)$/i;
  const extOf = name => ((name.match(/\.[a-z0-9]+$/i) || [".jpg"])[0]).toLowerCase();
  const base = name => name.replace(/\.[^.]+$/, "");
  const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true });
  const PROJ = "images/projects";
  const TRASH = "images/_trash";
  const KIND = { posts: "post", stories: "story" };
  const TOOLS = { ps: "Photoshop", ai: "Illustrator", ae: "After Effects", pr: "Premiere Pro", id: "InDesign", lr: "Lightroom", figma: "Figma", canva: "Canva" };

  /* ---------- Talking to tools/admin-server.ps1 ---------- */
  async function call(url, opts = {}) {
    const r = await fetch(url, { ...opts, cache: "no-store", headers: { "X-Admin": "1" } });
    if (!r.ok) throw new Error((await r.text()) || r.statusText);
    return r;
  }
  const q = encodeURIComponent;
  const api = {
    list: async dir => (await call(`/api/list?dir=${q(dir)}`)).json(),
    put: (path, body) => call(`/api/file?path=${q(path)}`, { method: "PUT", body }),
    move: (from, to) => call(`/api/move?from=${q(from)}&to=${q(to)}`, { method: "POST", body: "" }),
    mkdir: path => call(`/api/mkdir?path=${q(path)}`, { method: "POST", body: "" }),
    text: async path => (await call(`/${path}?t=${Date.now()}`)).text()
  };

  /* ---------- State ---------- */
  let SITE = null;         // contents of js/content.js
  const FILES = {};        // folder -> { logo, posts, stories, carousels }
  const FIXED = {};        // images/about etc -> file names
  let view = decodeURIComponent(location.hash.slice(1)) || "profile";    // "profile" or a client folder
  let stamp = Date.now();  // cache-buster for thumbnails

  const status = $("#status");
  const setStatus = (text, err = false) => { status.textContent = text; status.classList.toggle("err", err); };
  const busy = (on, text = "Working…") => { $("#busy").hidden = !on; $("#busyText").textContent = text; };
  const src = path => `${path}?v=${stamp}`;

  /* ---------- Reading what is on disk ---------- */
  async function scanFolder(folder) {
    const { files } = await api.list(`${PROJ}/${folder}`);
    const names = files.map(f => f.name).filter(n => IMG.test(n)).sort(natural);
    const groups = {};
    names.filter(n => /^carousel-\d+-\d+$/.test(base(n))).forEach(n => {
      const c = Number(base(n).split("-")[1]);
      (groups[c] = groups[c] || []).push(n);
    });
    FILES[folder] = {
      logo: names.find(n => base(n) === "logo") || "",
      posts: names.filter(n => /^post-\d+$/.test(base(n))),
      stories: names.filter(n => /^story-\d+$/.test(base(n))),
      carousels: Object.keys(groups).map(Number).sort((a, b) => a - b).map(k => groups[k])
    };
  }
  async function scanFixed() {
    for (const dir of ["images/about", "images/chapter"]) {
      FIXED[dir] = (await api.list(dir)).files.map(f => f.name).filter(n => IMG.test(n));
    }
  }
  const fixedFile = (dir, name) => (FIXED[dir] || []).find(n => base(n) === name) || "";

  const newClient = folder => ({
    folder, name: "New client", handle: "newclient", category: "", heading: "Social media design",
    description: "", tools: ["ps", "ai"], review: "", reviewer: "",
    palette: ["#1b1b1b", "#e0451f", "#efe9df"],
    theme: { bg: "#1b1b1b", ink: "#f1ece3", accent: "#e0451f", outline: "#efe9df" }
  });

  async function load() {
    const w = {};
    new Function("window", await api.text("js/content.js"))(w);
    SITE = w.SITE;
    SITE.projects = SITE.projects || [];
    let changed = false;
    SITE.projects.forEach((p, i) => { if (!p.folder) { p.folder = `project-${pad(i + 1)}`; changed = true; } });

    const folders = (await api.list(PROJ)).dirs.filter(d => /^project-\d+$/.test(d)).sort(natural);
    for (const f of folders) await scanFolder(f);
    // Folders made by the drop script that have no client entry yet.
    for (const f of folders) if (!SITE.projects.some(p => p.folder === f)) { SITE.projects.push(newClient(f)); changed = true; }
    for (const p of SITE.projects) {
      if (!FILES[p.folder]) { await api.mkdir(`${PROJ}/${p.folder}`); FILES[p.folder] = { logo: "", posts: [], stories: [], carousels: [] }; }
    }
    await scanFixed();
    if (changed) await saveContent();
    await writeManifest();
    render();
    setStatus("All changes saved");
  }

  /* ---------- Saving ---------- */
  let timer = null;
  function save() {
    setStatus("Saving…");
    clearTimeout(timer);
    timer = setTimeout(() => saveContent().catch(e => setStatus(`Not saved: ${e.message}`, true)), 500);
  }
  async function saveContent() {
    const text = "// Managed by admin.html (double-click Admin.bat). Hand edits are fine too.\n" +
      `window.SITE = ${JSON.stringify(SITE, null, 2)};\n`;
    await api.put("js/content.js", new Blob([text], { type: "text/plain" }));
    setStatus("All changes saved");
  }
  async function writeManifest() {
    const projects = SITE.projects.filter(p => FILES[p.folder]).map(p => ({ id: p.folder, ...FILES[p.folder] }));
    const text = "// AUTO-GENERATED by admin.html and tools/arrange-images.ps1. Do not edit by hand.\n" +
      `window.MANIFEST = ${JSON.stringify({ projects }, null, 2)};\n`;
    await api.put("js/manifest.js", new Blob([text], { type: "text/plain" }));
  }

  // Wraps every file operation: shows a busy state, rescans, rewrites the manifest, re-renders.
  async function op(label, fn) {
    busy(true, label);
    try {
      await fn();
      await writeManifest();
      stamp = Date.now();
      render();
      setStatus("All changes saved");
    } catch (e) {
      setStatus(`Error: ${e.message}`, true);
      alert(`Something went wrong:\n${e.message}`);
      if (FILES[view]) { await scanFolder(view).catch(() => {}); render(); }
    } finally {
      busy(false);
    }
  }

  /* ---------- File operations (keep names sequential) ---------- */
  const tmpName = (i, name) => `__tmp-${Date.now()}-${i}${extOf(name)}`;
  const toTrash = (folder, name) => api.move(`${PROJ}/${folder}/${name}`, `${TRASH}/${folder}-${Date.now()}-${name}`);

  // Rename files so they read post-01, post-02 ... in the given order.
  async function renumber(folder, kind, order) {
    const dir = `${PROJ}/${folder}`;
    const temps = [];
    for (const [i, name] of order.entries()) { const t = tmpName(i, name); await api.move(`${dir}/${name}`, `${dir}/${t}`); temps.push(t); }
    for (const [i, t] of temps.entries()) await api.move(`${dir}/${t}`, `${dir}/${KIND[kind]}-${pad(i + 1)}${extOf(t)}`);
    await scanFolder(folder);
  }
  async function renumberCarousels(folder, groups) {
    const dir = `${PROJ}/${folder}`;
    const temps = [];
    let i = 0;
    for (const [c, slides] of groups.entries()) {
      for (const [s, name] of slides.entries()) {
        const t = tmpName(i++, name);
        await api.move(`${dir}/${name}`, `${dir}/${t}`);
        temps.push({ t, final: `carousel-${pad(c + 1)}-${pad(s + 1)}${extOf(name)}` });
      }
    }
    for (const { t, final } of temps) await api.move(`${dir}/${t}`, `${dir}/${final}`);
    await scanFolder(folder);
  }
  const imagesOnly = list => [...list].filter(f => IMG.test(f.name)).sort((a, b) => natural(a.name, b.name));
  const lastNumber = names => names.reduce((m, n) => Math.max(m, Number((base(n).match(/(\d+)$/) || [0, 0])[1])), 0);

  async function addImages(folder, kind, fileList) {
    const files = imagesOnly(fileList);
    if (!files.length) return;
    await op(`Adding ${files.length} image${files.length > 1 ? "s" : ""}…`, async () => {
      let n = lastNumber(FILES[folder][kind]);
      for (const f of files) await api.put(`${PROJ}/${folder}/${KIND[kind]}-${pad(++n)}${extOf(f.name)}`, f);
      await scanFolder(folder);
      await renumber(folder, kind, FILES[folder][kind]);
    });
  }
  const moveImage = (folder, kind, index, delta) => op("Reordering…", async () => {
    const order = [...FILES[folder][kind]];
    const [item] = order.splice(index, 1);
    order.splice(Math.max(0, Math.min(order.length, index + delta)), 0, item);
    await renumber(folder, kind, order);
  });
  const deleteImage = (folder, kind, index) => op("Moving to trash…", async () => {
    await toTrash(folder, FILES[folder][kind][index]);
    await scanFolder(folder);
    await renumber(folder, kind, FILES[folder][kind]);
  });

  async function addCarousel(folder, fileList) {
    const files = imagesOnly(fileList);
    if (!files.length) return;
    await op("Adding carousel…", async () => {
      const c = FILES[folder].carousels.length + 1;
      for (const [s, f] of files.entries()) await api.put(`${PROJ}/${folder}/carousel-${pad(c)}-${pad(s + 1)}${extOf(f.name)}`, f);
      await scanFolder(folder);
      await renumberCarousels(folder, FILES[folder].carousels);
    });
  }
  const moveCarousel = (folder, index, delta) => op("Reordering…", async () => {
    const groups = [...FILES[folder].carousels];
    const [g] = groups.splice(index, 1);
    groups.splice(index + delta, 0, g);
    await renumberCarousels(folder, groups);
  });
  const deleteCarousel = (folder, index) => op("Moving to trash…", async () => {
    for (const name of FILES[folder].carousels[index]) await toTrash(folder, name);
    await scanFolder(folder);
    await renumberCarousels(folder, FILES[folder].carousels);
  });

  async function setLogo(folder, file) {
    await op("Saving logo…", async () => {
      if (FILES[folder].logo) await toTrash(folder, FILES[folder].logo);
      if (file) await api.put(`${PROJ}/${folder}/logo${extOf(file.name)}`, file);
      await scanFolder(folder);
    });
  }

  // Fixed photos (portrait, chapter photo, polaroids, cover objects).
  async function setFixed(dir, name, file) {
    await op("Saving photo…", async () => {
      const old = fixedFile(dir, name);
      if (old) await api.move(`${dir}/${old}`, `${TRASH}/${dir.split("/").pop()}-${Date.now()}-${old}`);
      if (file) await api.put(`${dir}/${name}${extOf(file.name)}`, file);
      await scanFixed();
    });
  }

  /* ---------- Clients ---------- */
  async function addClient() {
    await op("Adding client…", async () => {
      const used = SITE.projects.map(p => Number(p.folder.split("-")[1]) || 0)
        .concat((await api.list(PROJ)).dirs.map(d => Number((d.match(/^project-(\d+)$/) || [0, 0])[1])));
      const folder = `project-${pad(Math.max(0, ...used) + 1)}`;
      await api.mkdir(`${PROJ}/${folder}`);
      FILES[folder] = { logo: "", posts: [], stories: [], carousels: [] };
      SITE.projects.push(newClient(folder));
      await saveContent();
      view = folder;
    });
    const name = $("#clientName");
    if (name) { name.focus(); name.select(); }
  }
  const moveClient = (index, delta) => op("Reordering…", async () => {
    const list = SITE.projects;
    const [p] = list.splice(index, 1);
    list.splice(index + delta, 0, p);
    await saveContent();
  });
  async function deleteClient(index) {
    const p = SITE.projects[index];
    if (!confirm(`Delete "${p.name}" from the website?\n\nIts images are moved to images/_trash, so nothing is lost for good.`)) return;
    await op("Deleting client…", async () => {
      await api.move(`${PROJ}/${p.folder}`, `${TRASH}/${p.folder}-${Date.now()}`);
      delete FILES[p.folder];
      SITE.projects.splice(index, 1);
      await saveContent();
      view = SITE.projects[Math.min(index, SITE.projects.length - 1)]?.folder || "profile";
    });
  }

  /* ---------- Form pieces ---------- */
  function field(label, obj, key, opts = {}) {
    const input = opts.rows
      ? el("textarea", { rows: opts.rows, id: opts.id })
      : el("input", { type: opts.type || "text", id: opts.id, placeholder: opts.placeholder });
    input.value = opts.get ? opts.get(obj[key]) : (obj[key] ?? "");
    input.addEventListener("input", () => {
      obj[key] = opts.set ? opts.set(input.value) : input.value;
      if (opts.onChange) opts.onChange();
      save();
    });
    return el("label", { class: `field${opts.wide ? " wide" : ""}` }, el("span", { class: "field-label" }, label), input, opts.hint && el("small", {}, opts.hint));
  }
  function colorField(label, obj, key) {
    const code = el("code", {}, obj[key] || "");
    const input = el("input", { type: "color", value: obj[key] || "#000000", "aria-label": label });
    input.addEventListener("input", () => { obj[key] = input.value; code.textContent = input.value; save(); });
    return el("div", { class: "color-field" }, el("span", { class: "field-label" }, label), el("div", { class: "color-input" }, input, code));
  }
  function toolChips(list, onChange) {
    return el("div", { class: "chips" }, Object.entries(TOOLS).map(([k, label]) => {
      const on = list.includes(k);
      return el("button", {
        class: "chip", type: "button", "aria-pressed": String(on),
        onclick: () => { const i = list.indexOf(k); if (i >= 0) list.splice(i, 1); else list.push(k); onChange(); save(); }
      }, on ? icon("check") : null, label);
    }));
  }
  function filePicker(label, { multiple = false, onPick, cls = "btn", iconName = "upload-simple" }) {
    const input = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp", multiple, hidden: true });
    input.addEventListener("change", () => { if (input.files.length) onPick(input.files); input.value = ""; });
    return el("label", { class: cls }, icon(iconName), label, input);
  }
  function dropZone(node, onFiles) {
    node.classList.add("drop");
    node.addEventListener("dragover", e => { e.preventDefault(); node.classList.add("over"); });
    node.addEventListener("dragleave", () => node.classList.remove("over"));
    node.addEventListener("drop", e => { e.preventDefault(); node.classList.remove("over"); if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files); });
    return node;
  }
  const card = (title, actions, ...body) =>
    el("section", { class: "card" }, el("div", { class: "card-head" }, el("h2", { class: "card-title" }, title), actions), ...body);

  // **bold** in the admin  <->  <strong>bold</strong> on the site
  const escapeHtml = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const toEditable = html => (html || "").replace(/<strong>(.*?)<\/strong>/g, "**$1**").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const toHtml = text => escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  /* ---------- Sidebar ---------- */
  function renderSide() {
    document.querySelectorAll(".side-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
    const list = $("#clientList");
    list.replaceChildren(...SITE.projects.map((p, i) => {
      const f = FILES[p.folder] || { posts: [], stories: [], carousels: [] };
      const th = p.theme || {};
      return el("li", { class: `client-row${view === p.folder ? " active" : ""}` },
        el("button", { class: "client-btn", onclick: () => { view = p.folder; render(); scrollTo(0, 0); } },
          el("span", { class: "client-dot", style: `background:${th.bg || "#1b1b1b"};color:${th.accent || "#e0451f"}` }, (p.name || "?").charAt(0).toUpperCase()),
          el("span", { style: "min-width:0" },
            el("span", { class: "client-name" }, p.name || "Untitled"),
            el("span", { class: "client-meta" }, `${f.posts.length} posts, ${f.stories.length} stories`))),
        el("button", { class: "icon-btn", title: "Move up", "aria-label": `Move ${p.name} up`, disabled: i === 0, onclick: () => moveClient(i, -1) }, icon("arrow-up")),
        el("button", { class: "icon-btn", title: "Move down", "aria-label": `Move ${p.name} down`, disabled: i === SITE.projects.length - 1, onclick: () => moveClient(i, 1) }, icon("arrow-down")));
    }));
  }

  /* ---------- Client view ---------- */
  function imageGrid(folder, kind) {
    const names = FILES[folder][kind];
    const tall = kind === "stories";
    const grid = names.length
      ? el("div", { class: `thumbs${tall ? " tall" : ""}` }, names.map((name, i) =>
          el("figure", { class: "thumb", style: "margin:0" },
            el("img", { src: src(`${PROJ}/${folder}/${name}`), alt: name, loading: "lazy" }),
            el("span", { class: "thumb-num" }, String(i + 1)),
            el("div", { class: "thumb-bar" },
              el("button", { class: "icon-btn", title: "Move earlier", "aria-label": `Move ${name} earlier`, disabled: i === 0, onclick: () => moveImage(folder, kind, i, -1) }, icon("arrow-left")),
              el("button", { class: "icon-btn", title: "Move later", "aria-label": `Move ${name} later`, disabled: i === names.length - 1, onclick: () => moveImage(folder, kind, i, 1) }, icon("arrow-right")),
              el("button", { class: "icon-btn", title: "Delete", "aria-label": `Delete ${name}`, onclick: () => deleteImage(folder, kind, i) }, icon("trash"))))))
      : el("p", { class: "empty" }, `No ${kind} yet. Drag images here or use the button above.`);
    return dropZone(el("div", {}, grid), files => addImages(folder, kind, files));
  }

  function renderClient(index) {
    const p = SITE.projects[index];
    const folder = p.folder;
    const f = FILES[folder];
    p.theme = p.theme || {};
    p.tools = p.tools || [];
    p.palette = p.palette || [];

    const head = el("div", { class: "view-head" },
      el("div", {}, el("h1", { class: "view-title", id: "viewTitle" }, p.name || "Untitled"), el("p", { class: "view-sub" }, `Client ${index + 1} of ${SITE.projects.length}. Images live in images/projects/${folder}`)),
      el("div", { class: "head-actions" },
        el("button", { class: "btn", disabled: index === 0, onclick: () => moveClient(index, -1) }, icon("arrow-up"), "Move up"),
        el("button", { class: "btn", disabled: index === SITE.projects.length - 1, onclick: () => moveClient(index, 1) }, icon("arrow-down"), "Move down"),
        el("button", { class: "btn btn-danger", onclick: () => deleteClient(index) }, icon("trash"), "Delete client")));

    const rename = () => { $("#viewTitle").textContent = p.name || "Untitled"; renderSide(); };
    const details = card("Details", null, el("div", { class: "fields" },
      field("Client name", p, "name", { id: "clientName", onChange: rename }),
      field("Instagram handle", p, "handle", { hint: "Shown on the post mockups, without @", set: v => v.replace(/^@/, "") }),
      field("Category", p, "category", { hint: "e.g. Cafe and restaurant" }),
      field("Heading", p, "heading", { hint: "e.g. Social media design" }),
      field("Description", p, "description", { rows: 4, wide: true }),
      field("Client review", p, "review", { rows: 3, hint: "Leave empty to hide the review box" }),
      field("Reviewer name", p, "reviewer", { hint: "e.g. Priya Sharma, Owner" })));

    const logo = card("Logo", null,
      el("div", { class: "logo-box" },
        el("div", { class: "logo-preview" }, f.logo ? el("img", { src: src(`${PROJ}/${folder}/${f.logo}`), alt: "Logo" }) : el("span", {}, "No logo: the name is shown")),
        filePicker(f.logo ? "Replace logo" : "Upload logo", { onPick: files => setLogo(folder, files[0]) }),
        f.logo && el("button", { class: "btn btn-danger", onclick: () => setLogo(folder, null) }, icon("trash"), "Remove")));

    const posts = card(`Feed posts (${f.posts.length})`,
      filePicker("Add posts", { multiple: true, cls: "btn btn-primary", iconName: "plus", onPick: files => addImages(folder, "posts", files) }),
      el("p", { class: "card-hint" }, "Use the arrows to change the order. Posts 1 and 2 also appear in the Instagram mockups."),
      imageGrid(folder, "posts"));

    const stories = card(`Stories (${f.stories.length})`,
      filePicker("Add stories", { multiple: true, cls: "btn btn-primary", iconName: "plus", onPick: files => addImages(folder, "stories", files) }),
      el("p", { class: "card-hint" }, "Vertical 9:16 images. Story 1 appears in the phone mockup."),
      imageGrid(folder, "stories"));

    const carousels = card(`Carousels (${f.carousels.length})`,
      filePicker("Add carousel", { multiple: true, cls: "btn btn-primary", iconName: "plus", onPick: files => addCarousel(folder, files) }),
      el("p", { class: "card-hint" }, "Select all slides of one carousel at once. Slides keep their file-name order."),
      f.carousels.length
        ? el("div", {}, f.carousels.map((slides, c) => el("div", { class: "carousel-row" },
            el("span", { class: "carousel-label" }, `Carousel ${c + 1}`),
            el("div", { class: "carousel-slides" }, slides.map(s => el("img", { src: src(`${PROJ}/${folder}/${s}`), alt: s, loading: "lazy" }))),
            el("button", { class: "icon-btn", title: "Move up", "aria-label": `Move carousel ${c + 1} up`, disabled: c === 0, onclick: () => moveCarousel(folder, c, -1) }, icon("arrow-up")),
            el("button", { class: "icon-btn", title: "Move down", "aria-label": `Move carousel ${c + 1} down`, disabled: c === f.carousels.length - 1, onclick: () => moveCarousel(folder, c, 1) }, icon("arrow-down")),
            el("button", { class: "icon-btn", title: "Delete", "aria-label": `Delete carousel ${c + 1}`, onclick: () => deleteCarousel(folder, c) }, icon("trash")))))
        : dropZone(el("p", { class: "empty" }, "No carousels yet. Drag all slides of one carousel here."), files => addCarousel(folder, files)));

    const paletteBox = el("div", { class: "swatches" });
    const drawPalette = () => paletteBox.replaceChildren(
      ...p.palette.map((c, i) => el("span", { class: "swatch", style: `background:${c}`, title: c },
        el("button", { type: "button", "aria-label": `Remove ${c}`, onclick: () => { p.palette.splice(i, 1); drawPalette(); save(); } }, "×"))),
      el("label", { class: "swatch-add", title: "Add color" }, icon("plus"),
        el("input", { type: "color", "aria-label": "Add color", onchange: e => { p.palette.push(e.target.value); drawPalette(); save(); } })));
    drawPalette();
    const toolsBox = el("div");
    const drawTools = () => toolsBox.replaceChildren(toolChips(p.tools, drawTools));
    drawTools();

    const look = card("Colors and tools", null,
      el("p", { class: "card-hint" }, "Colors of this client's panel on the website."),
      el("div", { class: "colors" },
        colorField("Background", p.theme, "bg"), colorField("Text", p.theme, "ink"),
        colorField("Accent", p.theme, "accent"), colorField("Mockup border", p.theme, "outline")),
      el("h3", { class: "field-label", style: "margin:20px 0 8px" }, "Brand palette (small squares)"), paletteBox,
      el("h3", { class: "field-label", style: "margin:20px 0 8px" }, "Tools used"), toolsBox);

    return [head, details, logo, posts, stories, carousels, look];
  }

  /* ---------- Profile view ---------- */
  function rowsEditor(list, cols) {
    const box = el("div", { class: "rows" });
    const draw = () => box.replaceChildren(
      el("div", { class: "row" }, cols.map(c => el("span", { class: "row-head" }, c.label)), el("span")),
      ...list.map((item, i) => el("div", { class: "row" },
        cols.map(c => { const inp = el("input", { type: "text", value: item[c.key] || "", "aria-label": c.label }); inp.addEventListener("input", () => { item[c.key] = inp.value; save(); }); return inp; }),
        el("button", { class: "icon-btn", type: "button", "aria-label": "Remove row", onclick: () => { list.splice(i, 1); draw(); save(); } }, icon("x")))),
      el("button", { class: "btn", type: "button", style: "justify-self:start", onclick: () => { list.push({}); draw(); save(); } }, icon("plus"), "Add row"));
    draw();
    return box;
  }
  function photoSlot(label, dir, name) {
    const file = fixedFile(dir, name);
    return el("div", { class: "slot" },
      el("span", { class: "slot-name" }, label),
      el("div", { class: "slot-img" }, file ? el("img", { src: src(`${dir}/${file}`), alt: label }) : "No photo"),
      filePicker(file ? "Replace" : "Upload", { onPick: files => setFixed(dir, name, files[0]) }));
  }

  function renderProfile() {
    const S = SITE;
    S.bio = S.bio || [];
    while (S.bio.length < 2) S.bio.push("");
    S.experience = S.experience || [];
    S.education = S.education || [];
    S.polaroids = S.polaroids || ["", "", ""];
    S.tools = S.tools || [];

    const head = el("div", { class: "view-head" }, el("div", {}, el("h1", { class: "view-title" }, "Profile and contact"), el("p", { class: "view-sub" }, "Your details, photos and the about section.")));

    const you = card("You", null, el("div", { class: "fields" },
      field("First name", S, "firstName"), field("Last name", S, "lastName"),
      field("Line under your name", S, "studio", { hint: "e.g. graphic designer" }),
      field("Stickers next to your name", S, "stickers", { hint: "Separate with commas", get: v => (v || []).join(", "), set: v => v.split(",").map(s => s.trim()).filter(Boolean) }),
      field("About, paragraph 1", S.bio, 0, { rows: 4, wide: true, get: toEditable, set: toHtml, hint: "Put **two stars** around words to make them bold." }),
      field("About, paragraph 2", S.bio, 1, { rows: 4, wide: true, get: toEditable, set: toHtml }),
      field("Focus", S, "focus", { rows: 4, hint: "One per line", get: v => (v || []).join("\n"), set: v => v.split("\n").map(s => s.trim()).filter(Boolean) })));

    const contact = card("Contact", null, el("div", { class: "fields" },
      field("Email", S, "email", { type: "email" }), field("Phone", S, "phone", { type: "tel" }),
      field("Instagram name", S, "instagram", { hint: "e.g. @chandangupta.design" }), field("Instagram link", S, "instagramUrl", { type: "url" }),
      field("Behance link", S, "behanceUrl", { type: "url" })));

    const toolsBox = el("div");
    const drawTools = () => toolsBox.replaceChildren(toolChips(S.tools, drawTools));
    drawTools();

    const history = card("Experience and education", null,
      el("h3", { class: "field-label", style: "margin-bottom:8px" }, "Experience"),
      rowsEditor(S.experience, [{ key: "years", label: "From" }, { key: "until", label: "To" }, { key: "role", label: "Role" }, { key: "place", label: "Company" }]),
      el("h3", { class: "field-label", style: "margin:22px 0 8px" }, "Education"),
      rowsEditor(S.education, [{ key: "years", label: "From" }, { key: "until", label: "To" }, { key: "title", label: "Course" }, { key: "place", label: "College" }]),
      el("h3", { class: "field-label", style: "margin:22px 0 8px" }, "Tools"), toolsBox);

    const photos = card("Photos", null,
      el("p", { class: "card-hint" }, "Cut-out PNGs with a transparent background look best for the portrait and chapter photo."),
      el("div", { class: "photo-slots" },
        photoSlot("Portrait (about)", "images/about", "profile"),
        photoSlot("Photo on Social media cover", "images/chapter", "chapter")),
      el("h3", { class: "field-label", style: "margin:22px 0 8px" }, "Polaroids"),
      el("div", { class: "photo-slots" }, [0, 1, 2].map(i => el("div", { class: "slot" },
        photoSlot(`Polaroid ${i + 1}`, "images/about", `photo-${pad(i + 1)}`),
        field("Handwritten caption", S.polaroids, i)))));

    return [head, you, contact, history, photos];
  }

  /* ---------- Render ---------- */
  function render() {
    if (view !== "profile" && !SITE.projects.some(p => p.folder === view)) view = "profile";
    history.replaceState(null, "", `#${view}`);
    renderSide();
    const main = $("#main");
    const index = SITE.projects.findIndex(p => p.folder === view);
    const y = scrollY;
    main.replaceChildren(...(view === "profile" ? renderProfile() : renderClient(index)));
    scrollTo(0, y);
  }

  $(".side-item[data-view=profile]").addEventListener("click", () => { view = "profile"; render(); scrollTo(0, 0); });
  $("#addClient").addEventListener("click", addClient);
  addEventListener("hashchange", () => { const v = decodeURIComponent(location.hash.slice(1)); if (SITE && v && v !== view) { view = v; render(); scrollTo(0, 0); } });
  addEventListener("beforeunload", e => { if (status.textContent.startsWith("Saving")) e.preventDefault(); });

  if (location.protocol === "file:") {
    $("#blocked").hidden = false;
  } else {
    load().catch(e => { setStatus(`Could not load: ${e.message}`, true); $("#blocked").hidden = false; });
  }
})();
