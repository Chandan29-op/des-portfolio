(() => {
  const S = window.SITE;
  const M = window.MANIFEST || { projects: [] };
  const EXTS = ["jpg", "jpeg", "png", "webp"];
  const pad = n => String(n).padStart(2, "0");
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, cls, html) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------- Image loading ---------- */
  // `candidates` are paths, with or without extension. Paths without one try jpg, jpeg, png, webp.
  // If nothing loads, the <img> becomes a dashed placeholder naming the file it expects.
  const hasExt = p => /\.[a-z0-9]{3,4}$/i.test(p);
  function loadImg(img, candidates, label) {
    const tries = [].concat(candidates).flatMap(p => hasExt(p) ? [p] : EXTS.map(e => `${p}.${e}`));
    let i = 0;
    img.decoding = "async";
    img.onerror = () => {
      i += 1;
      if (i < tries.length) { img.src = tries[i]; return; }
      img.onerror = null;
      const slot = el("div", "img-slot", `<i class="ph ph-image-square"></i><span>${esc(label)}</span>`);
      slot.setAttribute("role", "img");
      slot.setAttribute("aria-label", `Image missing: ${label}`);
      img.replaceWith(slot);
    };
    img.src = tries[0];
    return img;
  }
  const img = (candidates, label, alt = "", lazy = true) => {
    const node = document.createElement("img");
    node.alt = alt;
    if (lazy) node.loading = "lazy";
    return loadImg(node, candidates, label);
  };

  /* ---------- Projects: content.js text + manifest.js file lists ---------- */
  // Order comes from content.js. Each client points at its folder in images/projects.
  // Folders with no client entry (added by the drop script) are shown after the others.
  const found = M.projects || [];
  const entries = S.projects.map((p, i) => ({ ...p, folder: p.folder || `project-${pad(i + 1)}` }));
  found.forEach(m => {
    if (!entries.some(e => e.folder === m.id)) entries.push({ folder: m.id, name: "New client", handle: m.id, heading: "Social media design", tools: [], palette: [], theme: {} });
  });
  const useFallback = found.length === 0;   // nothing arranged yet: show numbered placeholders
  const projects = entries.map((text, i) => {
    const id = text.folder;
    const files = found.find(m => m.id === id);
    const numbered = (n, kind) => useFallback ? Array.from({ length: n }, (_, k) => `${kind}-${pad(k + 1)}`) : [];
    return {
      ...text, id, dir: `images/projects/${id}/`, num: i + 1,
      posts: files ? files.posts : numbered(S.fallback.posts, "post"),
      stories: files ? files.stories : numbered(S.fallback.stories, "story"),
      carousels: files ? files.carousels : [],
      logo: files ? files.logo : ""
    };
  });

  /* ---------- Text bindings ---------- */
  const first = S.firstName;
  const split = Math.ceil(first.length / 2) + 1;
  const derived = {
    fullName: `${S.firstName} ${S.lastName}`,
    firstNameShort: first.slice(0, split),
    firstNameRest: first.slice(split)
  };
  const get = key => key in derived ? derived[key] : key.split(".").reduce((o, k) => (o ? o[k] : ""), S);
  document.querySelectorAll("[data-bind]").forEach(n => { n.textContent = get(n.dataset.bind); });
  document.querySelectorAll("img[data-img]").forEach(n => loadImg(n, n.dataset.img, n.dataset.label));

  /* ---------- Cover: tool icons with blurred motion-trail copies (paused while off-screen) ---------- */
  const FLYERS = {
    figma: `<svg viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="#f4f1ec"/>
      <g transform="translate(35.75 30) scale(.75)">
        <path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" fill="#1abcfe"/>
        <path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" fill="#0acf83"/>
        <path d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" fill="#ff7262"/>
        <path d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" fill="#f24e1e"/>
        <path d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" fill="#a259ff"/></g></svg>`,
    ps: `<svg viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="#001e36"/>
      <text x="50" y="65" text-anchor="middle" font-family="DM Sans, Arial, sans-serif" font-weight="700" font-size="44" fill="#31a8ff">Ps</text></svg>`,
    ai: `<svg viewBox="0 0 100 100"><rect width="100" height="100" rx="24" fill="#330000"/>
      <text x="50" y="65" text-anchor="middle" font-family="DM Sans, Arial, sans-serif" font-weight="700" font-size="44" fill="#ff9a00">Ai</text></svg>`
  };
  const TRAIL = 5;
  document.querySelectorAll("[data-flyer]").forEach(f => {
    const icon = FLYERS[f.dataset.flyer];
    for (let i = TRAIL; i > 0; i--) {
      const ghost = el("div", "fly ghost", icon);
      ghost.style.setProperty("--i", i);
      f.append(ghost);
    }
    f.append(el("div", "fly", icon));
  });
  const cover = $(".cover");
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([en]) => cover.classList.toggle("is-off", !en.isIntersecting)).observe(cover);
  }

  /* ---------- About ---------- */
  $("#stickers").append(...S.stickers.map((s, i) => el("span", `tag sticker s-${i + 1}`, esc(s))));
  $("#bio").append(...S.bio.map(p => el("p", "", p)));
  const timeline = (title, place, e) => el("li", "", `
    <span class="t-years"><b>${esc(e.years)}</b><b>${esc(e.until)}</b></span>
    <span><strong>${esc(title)}</strong><small>${esc(place)}</small></span>`);
  $("#experience").append(...S.experience.map(e => timeline(e.role, e.place, e)));
  $("#education").append(...S.education.map(e => timeline(e.title, e.place, e)));
  $("#focus").append(...S.focus.map(f => el("li", "", `<i class="ph ph-check"></i>${esc(f)}`)));

  const TOOLS = {
    ps: { t: "Ps", name: "Photoshop", bg: "#001e36", fg: "#31a8ff" },
    ai: { t: "Ai", name: "Illustrator", bg: "#330000", fg: "#ff9a00" },
    ae: { t: "Ae", name: "After Effects", bg: "#00005b", fg: "#9999ff" },
    pr: { t: "Pr", name: "Premiere Pro", bg: "#00005b", fg: "#9999ff" },
    id: { t: "Id", name: "InDesign", bg: "#49021f", fg: "#ff3366" },
    lr: { t: "Lr", name: "Lightroom", bg: "#001e36", fg: "#31a8ff" },
    figma: { i: "ph-figma-logo", name: "Figma", bg: "#1e1e1e", fg: "#ffffff" },
    canva: { t: "Cv", name: "Canva", bg: "#00a3aa", fg: "#ffffff" }
  };
  const toolIcon = key => {
    const t = TOOLS[key];
    if (!t) return "";
    const inner = t.i ? `<i class="ph ${t.i}"></i>` : t.t;
    return `<li class="tool-ic" style="--tb:${t.bg};--tf:${t.fg}" title="${t.name}"><span aria-hidden="true">${inner}</span><span class="sr">${t.name}</span></li>`;
  };
  $("#tools").innerHTML = S.tools.map(toolIcon).join("");

  $("#polaroids").append(...S.polaroids.map((caption, i) => {
    const f = el("figure", `polaroid p-${i + 1}`);
    f.append(img(`images/about/photo-${pad(i + 1)}`, `about/photo-${pad(i + 1)}.jpg`, caption));
    f.append(el("figcaption", "", esc(caption)));
    return f;
  }));

  /* ---------- Marquee strip (paused while off-screen) ---------- */
  const strip = $("#strip");
  for (let i = 0; i < 16; i++) strip.append(el("span", "strip-item", `${esc(S.marquee)}<span class="mark strip-mark">cg</span>`));
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([en]) => strip.parentElement.classList.toggle("is-off", !en.isIntersecting)).observe(strip.parentElement);
  }

  /* ---------- Folder tabs ---------- */
  $("#folderTabs").append(...projects.map(p => {
    const a = el("a", "folder-tab", esc(p.name));
    a.href = `#${p.id}`;
    return a;
  }));

  /* ---------- Project panels ---------- */
  const fileLabel = (p, f) => `${p.id}/${f}${hasExt(f) ? "" : ".jpg"}`;
  const igCard = (p, file, cls) => {
    const card = el("div", `ig ${cls}`);
    card.innerHTML = `
      <div class="ig-head"><span class="ig-av">${esc(p.name.charAt(0))}</span><b>${esc(p.handle || p.id)}</b><i class="ph ph-dots-three"></i></div>
      <div class="ig-img"></div>
      <div class="ig-foot"><i class="ph ph-heart"></i><i class="ph ph-chat-circle"></i><i class="ph ph-paper-plane-tilt"></i><i class="ph ph-bookmark-simple"></i></div>`;
    $(".ig-img", card).append(img(p.dir + file, fileLabel(p, file), `${p.name} post`));
    return card;
  };
  const tile = (item, list, index, cls) => {
    const b = el("button", `tile ${cls}`);
    b.type = "button";
    b.setAttribute("aria-label", `Open ${item.caption}`);
    b.append(img(item.path, item.label, item.caption));
    b.addEventListener("click", () => openLightbox(list, index));
    return b;
  };

  const host = $("#projects");
  projects.forEach(p => {
    const th = p.theme || {};
    const sec = el("section", "project");
    sec.id = p.id;
    sec.style.cssText = `--p-bg:${th.bg || "#1b1b1b"};--p-ink:${th.ink || "#f1ece3"};--p-accent:${th.accent || "#e0451f"};--p-outline:${th.outline || "#efe9df"}`;

    const review = p.review ? `
      <div class="review"><p class="review-head">Client review <span aria-label="5 stars">${'<i class="ph-fill ph-star"></i>'.repeat(5)}</span></p>
      <p>${esc(p.review)}</p>${p.reviewer ? `<p class="review-by">${esc(p.reviewer)}</p>` : ""}</div>` : "";

    sec.innerHTML = `
      <span class="pill">Social media</span>
      <span class="mark corner-mark" aria-hidden="true">cg</span>
      <div class="project-grid">
        <div class="project-copy">
          <p class="project-num">Project ${pad(p.num)} <span>/</span> ${esc(p.category || "")}</p>
          <div class="project-brand"></div>
          <h3 class="project-heading">${esc(p.heading || "")}</h3>
          <p class="project-desc"><strong>${esc(p.name)}</strong> ${esc(p.description || "")}</p>
          ${p.tools && p.tools.length ? `<p class="tools-label">Tools I used :)</p><ul class="tool-icons small">${p.tools.map(toolIcon).join("")}</ul>` : ""}
          ${review}
          ${p.palette && p.palette.length ? `<ul class="palette" aria-label="Color palette">${p.palette.map(c => `<li style="background:${c}" title="${c}"></li>`).join("")}</ul>` : ""}
        </div>
        <div class="collage"></div>
      </div>
      <div class="feed">
        <div class="feed-grid" data-kind="posts"></div>
        <div class="feed-more"></div>
        <div class="feed-grid stories" data-kind="stories"></div>
        <div class="feed-grid carousels" data-kind="carousels"></div>
      </div>`;

    // Brand: logo image if the manifest found one, else the name in display type.
    const brand = $(".project-brand", sec);
    if (p.logo) brand.append(img(p.dir + p.logo, `${p.id}/${p.logo}`, p.name, false));
    else brand.append(el("span", "brand-text", esc(p.name)));

    // Collage: two Instagram post mockups and a phone showing a story.
    const collage = $(".collage", sec);
    const pick = n => p.posts[n] || p.posts[0] || "post-01";
    collage.append(igCard(p, pick(0), "ig-a"), igCard(p, pick(1), "ig-b"));
    const phone = el("div", "phone", `<span class="phone-notch"></span>`);
    const storyFile = p.stories[0] || pick(2);
    phone.append(img(p.dir + storyFile, fileLabel(p, storyFile), `${p.name} story`));
    collage.append(phone);

    // Feed: posts (with "See all"), stories, carousels. Each opens the lightbox.
    const postItems = p.posts.map((f, i) => ({ path: p.dir + f, caption: `${p.name}, post ${i + 1} of ${p.posts.length}`, label: fileLabel(p, f) }));
    const storyItems = p.stories.map((f, i) => ({ path: p.dir + f, caption: `${p.name}, story ${i + 1} of ${p.stories.length}`, label: fileLabel(p, f) }));

    const postGrid = $('[data-kind="posts"]', sec);
    const more = el("button", "btn-outline");
    more.type = "button";
    let shown = 0;
    const showMore = n => {
      postItems.slice(shown, shown + n).forEach((it, i) => postGrid.append(tile(it, postItems, shown + i, "tile-post")));
      shown = Math.min(postItems.length, shown + n);
      more.hidden = shown >= postItems.length;
      more.textContent = `See all ${postItems.length} posts`;
    };
    more.addEventListener("click", () => showMore(postItems.length));
    $(".feed-more", sec).append(more);
    showMore(S.feedPreview);

    const storyGrid = $('[data-kind="stories"]', sec);
    storyItems.forEach((it, i) => storyGrid.append(tile(it, storyItems, i, "tile-story")));

    const carGrid = $('[data-kind="carousels"]', sec);
    p.carousels.forEach((slides, c) => {
      const list = slides.map((f, s) => ({ path: p.dir + f, caption: `${p.name}, carousel ${c + 1}, slide ${s + 1} of ${slides.length}`, label: `${p.id}/${f}` }));
      const t = tile(list[0], list, 0, "tile-post");
      t.append(el("span", "tile-badge", `<i class="ph ph-copy"></i>${slides.length}`));
      carGrid.append(t);
    });

    host.append(sec);
  });

  /* ---------- Contact ---------- */
  const contacts = [
    { icon: "ph-phone", text: S.phone, href: `tel:${(S.phone || "").replace(/\s/g, "")}` },
    { icon: "ph-envelope-simple", text: S.email, href: `mailto:${S.email}` },
    { icon: "ph-instagram-logo", text: S.instagram, href: S.instagramUrl },
    { icon: "ph-behance-logo", text: "Behance", href: S.behanceUrl }
  ];
  $("#contactRow").append(...contacts.filter(c => c.text).map(c =>
    el("li", "", `<a href="${esc(c.href)}"${c.href.startsWith("http") ? ' target="_blank" rel="noopener"' : ""}><i class="ph ${c.icon}"></i>${esc(c.text)}</a>`)));

  /* ---------- Lightbox ---------- */
  const lb = $("#lightbox");
  const lbImg = $("#lbImg");
  const lbCap = $("#lbCaption");
  let lbList = [];
  let lbIndex = 0;
  function showLb() {
    const item = lbList[lbIndex];
    const slot = $(".lb-figure .img-slot");
    if (slot) slot.replaceWith(lbImg);
    lbImg.alt = item.caption;
    loadImg(lbImg, item.path, item.label);
    lbCap.textContent = item.caption;
    lb.classList.toggle("is-single", lbList.length < 2);
  }
  function openLightbox(list, index) {
    lbList = list;
    lbIndex = index;
    showLb();
    lb.showModal();
  }
  const step = d => { lbIndex = (lbIndex + d + lbList.length) % lbList.length; showLb(); };
  lb.addEventListener("click", e => {
    const action = e.target.closest("[data-lb]")?.dataset.lb;
    if (action === "close" || e.target === lb) lb.close();
    if (action === "prev") step(-1);
    if (action === "next") step(1);
  });
  lb.addEventListener("keydown", e => {
    if (e.key === "ArrowLeft") step(-1);
    if (e.key === "ArrowRight") step(1);
  });
  let touchX = null;
  lb.addEventListener("touchstart", e => { touchX = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener("touchend", e => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
    touchX = null;
  });
})();
