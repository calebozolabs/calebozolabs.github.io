/* ==========================================================================
   Calebozo Labs — headless Tebex storefront
   Talks to the Tebex Headless API: https://docs.tebex.io/developers/headless-api
   You shouldn't need to edit this file. Site settings live in js/config.js.
   ========================================================================== */
(function () {
  "use strict";

  var CFG = window.STORE_CONFIG || {};
  var TOKEN = (CFG.tebexToken || "").trim();
  var DEMO = !TOKEN;
  var API = "https://headless.tebex.io/api";
  var ACCT = API + "/accounts/" + TOKEN;
  var BASKET_KEY = "cl_basket_ident";
  var SITE_BASE = location.origin + location.pathname; // page URL without query/hash

  var state = {
    webstore: null,
    categories: [],   // each with .packages
    basket: null,
    loaded: false
  };

  var app = document.getElementById("app");

  /* ---------------- helpers ---------------- */

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function money(n, cur) {
    var v = Number(n || 0);
    cur = cur || (state.webstore && state.webstore.currency) || "USD";
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(v); }
    catch (e) { return v.toFixed(2) + " " + cur; }
  }

  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, val);
    } catch (e) { return null; }
  }

  function toast(msg, type) {
    var wrap = document.getElementById("toasts");
    var t = document.createElement("div");
    t.className = "toast " + (type || "info");
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(function () { t.style.transition = "opacity .4s"; t.style.opacity = "0"; }, 4500);
    setTimeout(function () { t.remove(); }, 5000);
  }

  function api(method, url, body) {
    var opts = { method: method, headers: { "Accept": "application/json" } };
    if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    return fetch(url, opts).then(function (r) {
      return r.text().then(function (txt) {
        var json = null;
        try { json = txt ? JSON.parse(txt) : null; } catch (e) { /* non-JSON */ }
        if (!r.ok) {
          var msg = (json && (json.detail || json.message || json.title)) || ("Request failed (" + r.status + ")");
          var err = new Error(msg); err.status = r.status; throw err;
        }
        return json;
      });
    });
  }

  function allPackages() {
    var out = [];
    state.categories.forEach(function (c) { (c.packages || []).forEach(function (p) { out.push(p); }); });
    return out;
  }
  function findPackage(id) {
    id = String(id);
    return allPackages().filter(function (p) { return String(p.id) === id; })[0] || null;
  }
  function findCategory(key) {
    key = String(key);
    return state.categories.filter(function (c) { return String(c.slug) === key || String(c.id) === key; })[0] || null;
  }
  function catHref(c) { return "#/category/" + encodeURIComponent(c.slug || c.id); }
  function topCategories() {
    return state.categories.filter(function (c) { return !c.parent || !c.parent.id; });
  }
  function childCategories(parent) {
    return state.categories.filter(function (c) { return c.parent && String(c.parent.id) === String(parent.id); });
  }

  /* ---------------- data loading ---------------- */

  function loadStore() {
    if (DEMO) {
      state.webstore = DEMO_DATA.webstore;
      state.categories = DEMO_DATA.categories;
      return Promise.resolve();
    }
    var ident = store(BASKET_KEY);
    var catUrl = ACCT + "/categories?includePackages=1" + (ident ? "&basketIdent=" + encodeURIComponent(ident) : "");
    return Promise.all([api("GET", ACCT), api("GET", catUrl)]).then(function (res) {
      state.webstore = res[0] && res[0].data;
      state.categories = (res[1] && res[1].data) || [];
      state.categories.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    });
  }

  function loadBasket() {
    if (DEMO) { state.basket = DEMO_DATA.basket(); return Promise.resolve(); }
    var ident = store(BASKET_KEY);
    if (!ident) { state.basket = null; return Promise.resolve(); }
    return api("GET", ACCT + "/baskets/" + encodeURIComponent(ident)).then(function (r) {
      state.basket = r && r.data;
      if (!state.basket || state.basket.complete) { store(BASKET_KEY, null); state.basket = null; }
    }).catch(function () { store(BASKET_KEY, null); state.basket = null; });
  }

  function ensureBasket() {
    if (state.basket) return Promise.resolve(state.basket);
    return api("POST", ACCT + "/baskets", {
      complete_url: SITE_BASE + "?purchase=complete",
      cancel_url: SITE_BASE + "#/basket",
      complete_auto_redirect: true
    }).then(function (r) {
      state.basket = r.data;
      store(BASKET_KEY, state.basket.ident);
      return state.basket;
    });
  }

  function isLoggedIn() {
    return !!(state.basket && (state.basket.username || state.basket.username_id));
  }

  // Sends the customer to Cfx.re login. `after` is added to the return URL query.
  function login(after) {
    if (DEMO) { toast("Demo mode: login works once your Tebex token is added.", "info"); return; }
    ensureBasket().then(function (b) {
      var ret = SITE_BASE + "?auth=1" + (after ? "&" + after : "") + location.hash;
      return api("GET", ACCT + "/baskets/" + encodeURIComponent(b.ident) + "/auth?returnUrl=" + encodeURIComponent(ret));
    }).then(function (providers) {
      var list = Array.isArray(providers) ? providers : (providers && providers.data) || [];
      if (!list.length || !list[0].url) throw new Error("No login provider is set up on the Tebex store.");
      location.href = list[0].url;
    }).catch(function (e) { toast(e.message, "error"); });
  }

  function logout() {
    store(BASKET_KEY, null);
    state.basket = null;
    renderChrome();
    route();
    toast("Signed out.", "info");
  }

  function addToBasket(pkgId, btn) {
    if (DEMO) { DEMO_DATA.add(pkgId); state.basket = DEMO_DATA.basket(); renderChrome(); toast("Added to basket (demo).", "success"); return; }
    if (btn) btn.classList.add("is-loading");
    ensureBasket().then(function (b) {
      if (!isLoggedIn()) { login("add=" + encodeURIComponent(pkgId)); return; }
      return api("POST", API + "/baskets/" + encodeURIComponent(b.ident) + "/packages", { package_id: Number(pkgId), quantity: 1 })
        .then(function (r) {
          state.basket = r.data;
          renderChrome();
          var p = findPackage(pkgId);
          toast((p ? p.name : "Package") + " added to your basket.", "success");
          if (location.hash.indexOf("#/basket") === 0) route();
        });
    }).catch(function (e) { toast(e.message, "error"); })
      .then(function () { if (btn) btn.classList.remove("is-loading"); });
  }

  function removeFromBasket(pkgId) {
    if (DEMO) { DEMO_DATA.remove(pkgId); state.basket = DEMO_DATA.basket(); renderChrome(); route(); return; }
    api("POST", API + "/baskets/" + encodeURIComponent(state.basket.ident) + "/packages/remove", { package_id: Number(pkgId) })
      .then(function (r) { state.basket = r.data; renderChrome(); route(); })
      .catch(function (e) { toast(e.message, "error"); });
  }

  function applyCoupon(code) {
    if (DEMO) { toast("Demo mode: coupons work once your Tebex token is added.", "info"); return; }
    ensureBasket().then(function (b) {
      return api("POST", ACCT + "/baskets/" + encodeURIComponent(b.ident) + "/coupons", { coupon_code: code });
    }).then(function () { return loadBasket(); })
      .then(function () { renderChrome(); route(); toast("Coupon applied.", "success"); })
      .catch(function (e) { toast(e.message, "error"); });
  }

  function removeCoupon(code) {
    api("POST", ACCT + "/baskets/" + encodeURIComponent(state.basket.ident) + "/coupons/remove", { coupon_code: code })
      .then(function () { return loadBasket(); })
      .then(function () { renderChrome(); route(); })
      .catch(function (e) { toast(e.message, "error"); });
  }

  function checkout() {
    if (DEMO) { toast("Demo mode: checkout works once your Tebex token is added.", "info"); return; }
    if (!state.basket || !state.basket.links || !state.basket.links.checkout) { toast("Your basket is empty.", "error"); return; }
    location.href = state.basket.links.checkout;
  }

  /* ---------------- chrome (header/footer) ---------------- */

  var ICONS = {
    discord: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.4C.6 9 0 13.5.3 18a19.9 19.9 0 0 0 6 3l1.3-2a13 13 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12 0l.5.4-2 1 1.3 2a19.8 19.8 0 0 0 6-3c.5-5.2-.8-9.7-3.6-13.6ZM8.5 15.3c-1.2 0-2.1-1-2.1-2.3s.9-2.3 2.1-2.3 2.2 1 2.1 2.3c0 1.2-.9 2.3-2.1 2.3Zm7 0c-1.2 0-2.1-1-2.1-2.3s.9-2.3 2.1-2.3 2.2 1 2.1 2.3c0 1.2-.9 2.3-2.1 2.3Z"/></svg>',
    youtube: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.3 3.6-6.3 3.6Z"/></svg>',
    github: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.4 1.2a11.5 11.5 0 0 1 6 0C17.3 4.6 18.3 5 18.3 5c.7 1.6.2 2.8.1 3.2.8.8 1.3 1.9 1.3 3.2 0 4.6-2.8 5.6-5.5 5.9.5.4.9 1.1.9 2.2v3.3c0 .3.1.7.8.6A12 12 0 0 0 12 .3"/></svg>'
  };

  function renderStatic() {
    document.getElementById("demo-flag").hidden = !DEMO;
    var ann = document.getElementById("announce");
    if (CFG.announcement) { ann.innerHTML = CFG.announcement; ann.hidden = false; }
    var d = document.getElementById("discord-btn");
    if (CFG.discordUrl) { d.href = CFG.discordUrl; d.hidden = false; }
    document.getElementById("footer-about").textContent = CFG.footerAbout || "";
    document.getElementById("year").textContent = new Date().getFullYear();

    var soc = "";
    if (CFG.discordUrl) soc += '<a href="' + esc(CFG.discordUrl) + '" target="_blank" rel="noopener" aria-label="Discord">' + ICONS.discord + "</a>";
    if (CFG.youtubeUrl) soc += '<a href="' + esc(CFG.youtubeUrl) + '" target="_blank" rel="noopener" aria-label="YouTube">' + ICONS.youtube + "</a>";
    if (CFG.githubUrl) soc += '<a href="' + esc(CFG.githubUrl) + '" target="_blank" rel="noopener" aria-label="GitHub">' + ICONS.github + "</a>";
    document.getElementById("socials").innerHTML = soc;

    var sup = "";
    if (CFG.discordUrl) sup += '<li><a href="' + esc(CFG.discordUrl) + '" target="_blank" rel="noopener">Discord Support</a></li>';
    if (CFG.docsUrl) sup += '<li><a href="' + esc(CFG.docsUrl) + '" target="_blank" rel="noopener">Documentation</a></li>';
    sup += '<li><a href="https://keymaster.fivem.net/asset-grants" target="_blank" rel="noopener">CFX Keymaster</a></li>';
    if (CFG.supportEmail) sup += '<li><a href="mailto:' + esc(CFG.supportEmail) + '">' + esc(CFG.supportEmail) + "</a></li>";
    document.getElementById("footer-support").innerHTML = sup;

    var toggle = document.getElementById("menu-toggle");
    var nav = document.getElementById("site-nav");
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.addEventListener("click", function (e) { if (e.target.tagName === "A") nav.classList.remove("is-open"); });
  }

  function renderChrome() {
    // nav
    var nav = '<a href="#/">Home</a>';
    topCategories().forEach(function (c) {
      var kids = childCategories(c);
      if (kids.length) {
        nav += '<div class="nav-dropdown"><a href="' + catHref(c) + '">' + esc(c.name) + ' &#9662;</a><div class="nav-dropdown-menu">' +
          kids.map(function (k) { return '<a href="' + catHref(k) + '">' + esc(k.name) + "</a>"; }).join("") + "</div></div>";
      } else {
        nav += '<a href="' + catHref(c) + '">' + esc(c.name) + "</a>";
      }
    });
    if (CFG.docsUrl) nav += '<a href="' + esc(CFG.docsUrl) + '" target="_blank" rel="noopener">Docs</a>';
    document.getElementById("site-nav").innerHTML = nav;

    document.getElementById("footer-cats").innerHTML = topCategories().slice(0, 6).map(function (c) {
      return '<li><a href="' + catHref(c) + '">' + esc(c.name) + "</a></li>";
    }).join("");

    // account
    var slot = document.getElementById("account-slot");
    if (isLoggedIn()) {
      var name = state.basket.username || "Account";
      slot.innerHTML = '<button class="user-chip hide-sm" type="button" id="logout-btn" title="Sign out" style="cursor:pointer;font:inherit">' +
        '<span class="avatar">' + esc(name.charAt(0).toUpperCase()) + "</span>" + esc(name) + "</button>";
      document.getElementById("logout-btn").onclick = logout;
    } else {
      slot.innerHTML = '<button class="btn btn-ghost btn-sm hide-sm" type="button" id="login-btn">Login</button>';
      document.getElementById("login-btn").onclick = function () { login(); };
    }

    // basket button
    var count = basketItems().length;
    var cnt = document.getElementById("basket-count");
    cnt.textContent = count; cnt.hidden = count === 0;
    document.getElementById("basket-total").textContent = state.basket ? money(state.basket.total_price, state.basket.currency) : "Basket";

    // active link
    var here = location.hash || "#/";
    document.querySelectorAll("#site-nav a").forEach(function (a) {
      a.classList.toggle("is-active", a.getAttribute("href") === here);
    });
  }

  function basketItems() {
    return (state.basket && state.basket.packages) || [];
  }

  /* ---------------- views ---------------- */

  function mark(cls) { return '<svg class="' + (cls || "") + '"><use href="#cl"/></svg>'; }

  function priceHtml(p) {
    var cur = p.currency;
    var html = "";
    if (p.discount && Number(p.discount) > 0) html += "<s>" + esc(money(Number(p.base_price), cur)) + "</s>";
    return html + esc(money(p.total_price != null ? p.total_price : p.base_price, cur));
  }

  function inBasket(p) {
    return basketItems().some(function (b) { return String(b.id) === String(p.id); });
  }

  function card(p) {
    var href = "#/package/" + p.id;
    var badge = "";
    if (p.discount && Number(p.discount) > 0 && Number(p.base_price) > 0) {
      badge = '<span class="badge sale">-' + Math.round(Number(p.discount) / Number(p.base_price) * 100) + "%</span>";
    } else if (inBasket(p)) {
      badge = '<span class="badge">In Basket</span>';
    }
    var media = p.image
      ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy">'
      : '<div class="placeholder">' + mark() + "</div>";
    var tags = (CFG.defaultTags || []).map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("");
    return '<article class="product reveal">' +
      '<a class="product-media" href="' + href + '" aria-label="' + esc(p.name) + '">' + badge + media + "</a>" +
      '<div class="product-body"><h3><a href="' + href + '">' + esc(p.name) + "</a></h3>" +
      (tags ? '<div class="tags">' + tags + "</div>" : "") +
      '<div class="product-foot"><span class="price">' + priceHtml(p) + "</span>" +
      '<button class="btn btn-primary btn-sm" type="button" data-add="' + esc(p.id) + '">Add</button></div></div></article>';
  }

  function sidebar(activeId) {
    var links = topCategories().map(function (c) {
      var kids = childCategories(c);
      return '<a href="' + catHref(c) + '" class="' + (String(c.id) === String(activeId) ? "is-active" : "") + '">' + esc(c.name) +
        ' <span class="muted">' + (c.packages || []).length + "</span></a>" +
        (kids.length ? '<div class="sub">' + kids.map(function (k) {
          return '<a href="' + catHref(k) + '" class="' + (String(k.id) === String(activeId) ? "is-active" : "") + '">' + esc(k.name) + "</a>";
        }).join("") + "</div>" : "");
    }).join("");
    return '<aside class="sidebar"><nav class="side-nav" aria-label="Categories"><h4>Categories</h4>' +
      '<a href="#/scripts" class="' + (activeId === "all" ? "is-active" : "") + '">All Scripts <span class="muted">' + allPackages().length + "</span></a>" +
      links + "</nav></aside>";
  }

  function viewHome() {
    var first = topCategories()[0];
    var stats = (CFG.stats || []).map(function (s) {
      return '<div class="stat"><strong>' + esc(s.value) + "</strong><span>" + esc(s.label) + "</span></div>";
    }).join("");
    var featured = allPackages().slice(0, 6);
    var faq = (CFG.faq || []).map(function (f, i) {
      return "<details" + (i === 0 ? " open" : "") + "><summary>" + esc(f.q) + "</summary><p>" + esc(f.a) + "</p></details>";
    }).join("");

    return '<section class="hero"><div class="hero-glow"></div><div class="container">' +
      mark("hero-mark") +
      '<h1><span class="text-silver">CALEBOZO</span> <span class="text-purple">LABS</span></h1>' +
      '<div class="tagline">FiveM Scripts. <b>Built Different.</b></div>' +
      '<p class="lead">' + esc(CFG.heroLead || "") + "</p>" +
      '<div class="hero-actions"><a class="btn btn-primary" href="#/scripts">Browse Scripts</a>' +
      (CFG.discordUrl ? '<a class="btn btn-ghost" href="' + esc(CFG.discordUrl) + '" target="_blank" rel="noopener">Join the Discord</a>' : "") +
      "</div>" + (stats ? '<div class="stats">' + stats + "</div>" : "") + "</div></section>" +

      '<section class="section"><div class="container"><div class="section-head"><div><span class="eyebrow">Why Calebozo Labs</span><h2 class="text-silver">Engineered, not thrown together.</h2></div></div>' +
      '<div class="features">' +
      feature('<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>', "Optimized", "Event-driven logic and no wasteful loops. Built to sit at 0.00ms when idle.") +
      feature('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>', "Framework Ready", "Works out of the box with ESX, QBCore, QBox and ox_lib, with bridges for custom setups.") +
      feature('<path d="M12 3v6l-5 9a2 2 0 0 0 1.7 3h6.6a2 2 0 0 0 1.7-3l-5-9"/><path d="M9 3h6"/><path d="M7.5 15h9"/>', "Highly Configurable", "Clean config files, exposed open-source bridges and locale support. Make it yours.") +
      feature('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>', "Real Support", "Fast, friendly help on Discord, plus free updates for every script you own.") +
      "</div></div></section>" +

      (featured.length ? '<section class="section"><div class="container"><div class="section-head"><div><span class="eyebrow">The Lab</span><h2 class="text-silver">Latest scripts</h2></div>' +
        '<a class="btn btn-ghost btn-sm" href="#/scripts">View all</a></div><div class="products">' + featured.map(card).join("") + "</div></div></section>" : "") +

      (topCategories().length > 1 ? '<section class="section" style="padding-top:0"><div class="container"><div class="categories">' +
        topCategories().map(function (c) {
          return '<a class="category-tile" href="' + catHref(c) + '"><h3>' + esc(c.name) + '</h3><span class="arrow">' + (c.packages || []).length + " scripts &rarr;</span></a>";
        }).join("") + "</div></div></section>" : "") +

      (faq ? '<section class="section"><div class="container"><div class="section-head"><div><span class="eyebrow">FAQ</span><h2 class="text-silver">Questions, answered.</h2></div></div><div class="faq">' + faq + "</div></div></section>" : "") +

      '<section class="section"><div class="container"><div class="cta"><span class="eyebrow">Community</span><h2 class="text-silver">Join the lab.</h2>' +
      "<p>Sneak peeks, changelogs, giveaways and direct support from the developer.</p>" +
      (CFG.discordUrl ? '<a class="btn btn-primary" href="' + esc(CFG.discordUrl) + '" target="_blank" rel="noopener">Join our Discord</a>' : '<a class="btn btn-primary" href="#/scripts">Browse Scripts</a>') +
      "</div></div></section>";

    function feature(icon, title, text) {
      return '<div class="feature"><div class="feature-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        icon + "</svg></div><h3>" + title + "</h3><p>" + text + "</p></div>";
    }
  }

  function viewList(title, desc, packages, activeId, displayType) {
    var grid = packages.length
      ? '<div class="products' + (displayType === "list" ? " list" : "") + '">' + packages.map(card).join("") + "</div>"
      : '<div class="panel empty">' + mark("hero-mark") + '<h3>Cooking something up&hellip;</h3><p class="muted">Nothing in this category yet. Check back soon or follow our Discord for drops.</p></div>';
    return '<div class="container store-layout">' + sidebar(activeId) +
      '<section style="min-width:0"><header class="page-head"><div class="breadcrumbs"><a href="#/">Home</a> / ' + esc(title) + "</div>" +
      '<h1 class="text-silver">' + esc(title) + "</h1>" + (desc ? '<div class="desc prose">' + desc + "</div>" : "") + "</header>" +
      grid + "</section></div>";
  }

  function viewCategory(key) {
    var c = findCategory(key);
    if (!c) return viewNotFound();
    document.title = c.name + " | Calebozo Labs";
    return viewList(c.name, c.description, c.packages || [], c.id, c.display_type);
  }

  function viewPackage(id) {
    var p = findPackage(id);
    if (!p) return viewNotFound();
    document.title = p.name + " | Calebozo Labs";
    var cat = p.category && findCategory(p.category.id);
    var media = p.image ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '">' :
      '<div class="product-media" style="height:100%"><div class="placeholder">' + mark() + "</div></div>";
    return '<div class="container" style="padding-block:40px 80px">' +
      '<div class="breadcrumbs" style="margin-bottom:20px"><a href="#/">Home</a>' + (cat ? ' / <a href="' + catHref(cat) + '">' + esc(cat.name) + "</a>" : "") + " / " + esc(p.name) + "</div>" +
      '<div class="package-view"><div style="min-width:0"><div class="package-gallery">' + media + "</div>" +
      '<div class="package-desc panel prose">' + (p.description || "<p>No description yet.</p>") + "</div></div>" +
      '<aside class="buy-box"><span class="eyebrow">Calebozo Labs</span><h1 class="text-silver" style="margin-top:10px">' + esc(p.name) + "</h1>" +
      '<span class="price">' + priceHtml(p) + "</span>" +
      '<div class="actions"><button class="btn btn-primary btn-block" type="button" data-add="' + esc(p.id) + '">Add to Basket</button>' +
      (inBasket(p) ? '<a class="btn btn-ghost btn-block" href="#/basket">In basket &middot; Checkout</a>' : "") +
      (CFG.docsUrl ? '<a class="btn btn-ghost btn-block" href="' + esc(CFG.docsUrl) + '" target="_blank" rel="noopener">Read the Docs</a>' : "") +
      "</div>" +
      '<ul class="checklist"><li>Instant delivery via Cfx.re Keymaster</li><li>Free lifetime updates</li><li>ESX, QBCore &amp; QBox support</li><li>Open config, locales &amp; bridges</li><li>Discord support from the developer</li></ul>' +
      "</aside></div></div>";
  }

  function viewBasket() {
    document.title = "Basket | Calebozo Labs";
    var items = basketItems();
    var b = state.basket;
    var list = items.length ? '<div class="basket-items">' + items.map(function (p) {
      var qty = (p.in_basket && p.in_basket.quantity) || 1;
      var price = p.in_basket && p.in_basket.price != null ? p.in_basket.price : (findPackage(p.id) || {}).total_price;
      var img = p.image || (findPackage(p.id) || {}).image;
      return '<div class="basket-item"><div class="thumb">' + (img ? '<img src="' + esc(img) + '" alt="">' : mark()) + "</div>" +
        '<div style="min-width:0"><h3>' + esc(p.name) + '</h3><div class="meta">Qty ' + qty + "</div></div>" +
        '<div class="right"><span class="price" style="font-size:16px">' + esc(money(price, b.currency)) + "</span>" +
        '<button class="remove-link" type="button" data-remove="' + esc(p.id) + '" style="background:none;border:0;cursor:pointer">Remove</button></div></div>';
    }).join("") + "</div>" :
      '<div class="panel empty">' + mark("hero-mark") + '<h3>Your basket is empty</h3><p class="muted">Nothing brewing yet. Go find your next script.</p><a class="btn btn-primary" href="#/scripts">Browse Scripts</a></div>';

    var coupons = (b && b.coupons || []).map(function (c) {
      var code = c.code || c.coupon_code || c;
      return '<span class="coupon-chip">' + esc(code) + ' <button type="button" data-uncoupon="' + esc(code) + '" aria-label="Remove coupon">&times;</button></span>';
    }).join("");

    return '<div class="container checkout"><section style="min-width:0"><header class="page-head"><div class="breadcrumbs"><a href="#/">Home</a> / Basket</div>' +
      '<h1 class="text-silver">Your Basket</h1>' +
      (isLoggedIn() ? '<p class="desc">Purchasing as <strong style="color:#fff">' + esc(b.username) + "</strong>. Scripts are delivered to this Cfx.re account.</p>" :
        '<p class="desc">You\'ll sign in with Cfx.re when you add your first script, so we know where to deliver it.</p>') +
      "</header>" + list + "</section>" +
      '<aside class="panel" style="position:sticky;top:96px"><h3 style="font-size:14px;letter-spacing:.16em">ORDER SUMMARY</h3>' +
      '<form id="coupon-form" style="margin:18px 0 6px"><div class="field" style="margin-bottom:8px"><label for="coupon">Coupon code</label>' +
      '<div class="input-group"><input class="input" id="coupon" name="coupon" placeholder="CODE" autocomplete="off"><button class="btn btn-ghost btn-sm" type="submit">Apply</button></div></div></form>' +
      coupons +
      '<div style="margin-top:16px"><div class="summary-row"><span>Items</span><span>' + items.length + "</span></div>" +
      '<div class="summary-row total"><span>Total</span><span>' + esc(money(b ? b.total_price : 0, b && b.currency)) + "</span></div></div>" +
      '<button class="btn btn-primary btn-block" style="margin-top:18px" type="button" id="checkout-btn"' + (items.length ? "" : " disabled") + ">Secure Checkout</button>" +
      '<p class="muted" style="font-size:12px;text-align:center;margin:12px 0 0">Payments processed securely by Tebex.</p></aside></div>';
  }

  function viewNotFound() {
    return '<div class="container auth"><div class="panel">' + mark("hero-mark") + '<h1 class="text-silver">Not found</h1><p>That page or script doesn\'t exist. It may have been removed.</p><a class="btn btn-primary" href="#/">Back to home</a></div></div>';
  }

  function viewLoading() {
    return '<div class="container" style="padding-block:60px"><div class="products">' +
      '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div></div>';
  }

  function viewError(msg) {
    return '<div class="container auth"><div class="panel">' + mark("hero-mark") + '<h1 class="text-silver">Store unavailable</h1><p>' + esc(msg) +
      '</p><p class="muted" style="font-size:13px">If you own this site, check the Tebex public token in js/config.js.</p><button class="btn btn-primary" type="button" onclick="location.reload()">Try again</button></div></div>';
  }

  /* ---------------- router ---------------- */

  function route() {
    if (!state.loaded) return;
    var h = location.hash.replace(/^#\/?/, "");
    var parts = h.split("/");
    var html;
    document.title = "Calebozo Labs | FiveM Scripts";
    if (!h) html = viewHome();
    else if (parts[0] === "scripts") html = viewList("All Scripts", "Every Calebozo Labs resource. Escrowed core, open config, delivered instantly to Keymaster.", allPackages(), "all");
    else if (parts[0] === "category") html = viewCategory(decodeURIComponent(parts[1] || ""));
    else if (parts[0] === "package") html = viewPackage(parts[1]);
    else if (parts[0] === "basket") html = viewBasket();
    else html = viewNotFound();
    app.innerHTML = html;
    renderChrome();
    window.scrollTo(0, 0);
  }

  app.addEventListener("click", function (e) {
    var add = e.target.closest("[data-add]");
    if (add) { addToBasket(add.getAttribute("data-add"), add); return; }
    var rem = e.target.closest("[data-remove]");
    if (rem) { removeFromBasket(rem.getAttribute("data-remove")); return; }
    var unc = e.target.closest("[data-uncoupon]");
    if (unc) { removeCoupon(unc.getAttribute("data-uncoupon")); return; }
    if (e.target.closest("#checkout-btn")) checkout();
  });
  app.addEventListener("submit", function (e) {
    if (e.target.id === "coupon-form") {
      e.preventDefault();
      var code = e.target.coupon.value.trim();
      if (code) applyCoupon(code);
    }
  });
  window.addEventListener("hashchange", route);

  /* ---------------- boot ---------------- */

  function cleanUrl() {
    try { history.replaceState(null, "", SITE_BASE + location.hash); } catch (e) { /* ignore */ }
  }

  function boot() {
    renderStatic();
    app.innerHTML = viewLoading();
    var q = new URLSearchParams(location.search);

    if (q.get("purchase") === "complete") {
      store(BASKET_KEY, null);
      cleanUrl();
      setTimeout(function () { toast("Thanks for your purchase! Your scripts are on their way to Keymaster.", "success"); }, 300);
    }

    Promise.all([loadStore(), loadBasket()]).then(function () {
      state.loaded = true;
      route();
      if (q.get("auth")) {
        var pending = q.get("add");
        cleanUrl();
        if (isLoggedIn()) {
          toast("Signed in as " + state.basket.username + ".", "success");
          if (pending) addToBasket(pending);
        } else {
          toast("Sign-in didn't complete. Please try again.", "error");
        }
      }
    }).catch(function (e) {
      app.innerHTML = viewError(e.message || "Could not reach Tebex.");
    });
  }

  /* ---------------- demo data (used only when no token is set) ---------------- */

  var DEMO_DATA = (function () {
    var desc = "<p>A fully featured, performance-first resource built for serious roleplay servers.</p>" +
      "<h3>Features</h3><ul><li>0.00ms idle resmon</li><li>ESX, QBCore and QBox bridges</li><li>ox_lib / ox_target support</li><li>Full locale and config support</li></ul>" +
      "<h3>Requirements</h3><ul><li>ox_lib</li><li>OneSync enabled</li></ul>";
    function pkg(id, name, price, cat, discount) {
      return { id: id, name: name, description: desc, image: null, base_price: price, discount: discount || 0,
        total_price: +(price - (discount || 0)).toFixed(2), currency: "USD", category: { id: cat } };
    }
    var cats = [
      { id: 1, slug: "jobs", name: "Jobs", order: 1, packages: [pkg(101, "Chem Lab: Advanced Drug Labs", 29.99, 1, 5), pkg(102, "Mechanic Job: Tuning & Repairs", 19.99, 1)] },
      { id: 2, slug: "heists", name: "Heists", order: 2, packages: [pkg(201, "Vault Heist: Pacific Standard", 29.99, 2)] },
      { id: 3, slug: "ui", name: "UI & HUD", order: 3, packages: [pkg(301, "Labs HUD: Minimal Status UI", 9.99, 3), pkg(302, "Dispatch: Police MDT Alerts", 14.99, 3)] },
      { id: 4, slug: "bundles", name: "Bundles", order: 4, packages: [pkg(401, "The Full Lab Bundle", 99.95, 4, 19.96)] }
    ];
    var items = [];
    function all() { var o = []; cats.forEach(function (c) { o = o.concat(c.packages); }); return o; }
    return {
      webstore: { name: "Calebozo Labs", currency: "USD" },
      categories: cats,
      add: function (id) { if (items.indexOf(String(id)) < 0) items.push(String(id)); },
      remove: function (id) { items = items.filter(function (i) { return i !== String(id); }); },
      basket: function () {
        var pk = all().filter(function (p) { return items.indexOf(String(p.id)) >= 0; }).map(function (p) {
          return { id: p.id, name: p.name, image: p.image, in_basket: { quantity: 1, price: p.total_price } };
        });
        var total = pk.reduce(function (s, p) { return s + p.in_basket.price; }, 0);
        return { ident: "demo", username: "", packages: pk, coupons: [], total_price: +total.toFixed(2), currency: "USD", links: {} };
      }
    };
  })();

  boot();
})();
