(function () {
  const app = document.getElementById("app");
  const cache = {};
  let index = null;
  let digest = null;
  let lotQuery = "";
  let lotSort = "lot";
  let openSale = "";

  const STATUS = { live: "进行中", upcoming: "即将开始", ended: "刚结束" };
  const PINNED = ["sothebys", "christies", "bonhams"];

  function asset(path) {
    return new URL(path, new URL(".", location.href)).href;
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function safeUrl(url) {
    const value = String(url || "");
    return /^https?:\/\//i.test(value) ? value : "";
  }

  function safeAsset(path) {
    if (!path) return "";
    const value = String(path);
    if (/^(?:https?:)?\/\//i.test(value) || value.indexOf("..") >= 0) return "";
    return asset(value);
  }

  function icon(name) {
    const paths = {
      calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3.5v4M16 3.5v4M4 10h16"/>',
      pin: '<path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.1"/>',
      clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/>',
      back: '<path d="M15 5L8 12l7 7"/>',
      share: '<path d="M12 16V4"/><path d="M8 8l4-4 4 4"/><path d="M6 12.5V18a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-5.5"/>',
      heart: '<path d="M12 19.2s-6.6-4.1-6.6-8.4A3.7 3.7 0 0 1 12 8a3.7 3.7 0 0 1 6.6 2.8c0 4.3-6.6 8.4-6.6 8.4z"/>',
      chev: '<path d="M6 9l6 6 6-6"/>',
      jar: '<path d="M9 4h6"/><path d="M10 4c0 2.2-2.2 3.2-2.2 5.4C7.8 14 9.2 16.2 12 16.2s4.2-2.2 4.2-6.8C16.2 7.2 14 6.2 14 4"/><path d="M9.2 16.2h5.6V19H9.2z"/>'
    };
    const cls = name === "heart" ? "icon heart" : "icon";
    return '<svg class="' + cls + '" viewBox="0 0 24 24" aria-hidden="true">' + (paths[name] || "") + "</svg>";
  }

  function cobaltFlower() {
    return '<g fill="#1d4e78" stroke="#1d4e78" stroke-width="0.4">' +
      '<ellipse cx="0" cy="-6.2" rx="2.3" ry="3.8"/>' +
      '<ellipse cx="0" cy="-6.2" rx="2.3" ry="3.8" transform="rotate(60)"/>' +
      '<ellipse cx="0" cy="-6.2" rx="2.3" ry="3.8" transform="rotate(120)"/>' +
      '<circle r="1.7" fill="#f6e7b0" stroke="none"/>' +
      "</g>";
  }

  /* Drawn ornament. Not a catalogue photograph. */
  const VASE = '<svg viewBox="0 0 100 132" aria-hidden="true">' +
    '<path d="M38 8h24c4 0 6 3 6 6v3c0 4-3 6-6 8-1 5 10 10 14 20 5 14 3 30-6 42-7 9-14 14-26 14s-19-5-26-14c-9-12-11-28-6-42 4-10 15-15 14-20-3-2-6-4-6-8V14c0-3 2-6 6-6z" fill="#f7fbfe" stroke="#1d4e78" stroke-width="1.4"/>' +
    '<path d="M42 114h16v6c0 1.6-1.6 3-4 3h-8c-2.4 0-4-1.4-4-3z" fill="#e8f0f7" stroke="#1d4e78" stroke-width="1"/>' +
    '<path d="M40 22h20M36 34c8 2 20 2 28 0M34 100c8 3 24 3 32 0" fill="none" stroke="#1d4e78" stroke-width="1"/>' +
    '<g transform="translate(50 62)">' + cobaltFlower() + "</g>" +
    '<g transform="translate(36 78) scale(0.72)">' + cobaltFlower() + "</g>" +
    '<g transform="translate(64 76) scale(0.72)">' + cobaltFlower() + "</g>" +
    '<path d="M44 46c2 20 1 40-2 58" fill="none" stroke="#fff" stroke-width="2.4" opacity="0.55"/>' +
    "</svg>";

  const BLOOM = '<svg viewBox="0 0 180 150" aria-hidden="true">' +
    '<g fill="none" stroke="#8eabbf" stroke-width="1.2" stroke-linecap="round">' +
      '<path d="M172 10c-36 22-52 28-78 58-16 18-30 28-62 58"/>' +
      '<path d="M118 48c-14 18-18 28-36 42"/>' +
    "</g>" +
    '<g transform="translate(124 42)">' +
      '<g fill="#fbf8f3" stroke="#9eb6c8" stroke-width="0.6">' +
        '<ellipse cx="0" cy="-8" rx="3.2" ry="5.4"/>' +
        '<ellipse cx="0" cy="-8" rx="3.2" ry="5.4" transform="rotate(72)"/>' +
        '<ellipse cx="0" cy="-8" rx="3.2" ry="5.4" transform="rotate(144)"/>' +
        '<ellipse cx="0" cy="-8" rx="3.2" ry="5.4" transform="rotate(216)"/>' +
        '<ellipse cx="0" cy="-8" rx="3.2" ry="5.4" transform="rotate(288)"/>' +
      '</g><circle r="2" fill="#e4cb8e"/>' +
    "</g>" +
    '<g transform="translate(78 92) scale(0.72)">' +
      '<g fill="#e5eef6" stroke="#7f9bb3" stroke-width="0.6">' +
        '<ellipse cx="0" cy="-8" rx="3.2" ry="5.4"/>' +
        '<ellipse cx="0" cy="-8" rx="3.2" ry="5.4" transform="rotate(72)"/>' +
        '<ellipse cx="0" cy="-8" rx="3.2" ry="5.4" transform="rotate(144)"/>' +
        '<ellipse cx="0" cy="-8" rx="3.2" ry="5.4" transform="rotate(216)"/>' +
        '<ellipse cx="0" cy="-8" rx="3.2" ry="5.4" transform="rotate(288)"/>' +
      '</g><circle r="2" fill="#e4cb8e"/>' +
    "</g></svg>";

  const RANGE = '<div class="range" aria-hidden="true"><svg viewBox="0 0 800 120" preserveAspectRatio="none">' +
    '<path d="M0 86C80 58 140 74 200 46 270 16 320 54 390 38 470 20 530 66 610 48 690 28 740 58 800 36V120H0Z" fill="#d7e3dd"/>' +
    '<path d="M0 100C110 74 170 96 250 74 340 48 410 92 510 76 620 58 700 88 800 70V120H0Z" fill="#c7d6d0"/>' +
    "</svg></div>";

  function parseRoute() {
    const parts = (location.hash.replace(/^#/, "") || "/").split("/").filter(Boolean);
    let date = index.latest;
    let i = 0;
    if (parts[0] === "d" && parts[1]) {
      date = decodeURIComponent(parts[1]);
      i = 2;
    }
    const head = parts[i] || "";
    if (head === "sale") {
      const tab = parts[i + 2];
      return {
        date: date,
        name: "sale",
        id: decodeURIComponent(parts[i + 1] || ""),
        tab: tab === "info" || tab === "house" ? tab : "lots"
      };
    }
    if (head === "house") {
      return { date: date, name: "house", id: decodeURIComponent(parts[i + 1] || "") };
    }
    let filter = "all";
    let cursor = i;
    if (head === "open" || head === "ended" || head === "all") {
      filter = head;
      cursor = i + 1;
    }
    let house = "";
    if (parts[cursor] === "f" && parts[cursor + 1]) house = decodeURIComponent(parts[cursor + 1]);
    return { date: date, name: "home", filter: filter, house: house };
  }

  function prefix(date) {
    if (!date || date === index.latest) return "";
    return "/d/" + encodeURIComponent(date);
  }

  function homeHref(filter, date, house) {
    let path = prefix(date || (digest && digest.date));
    if (filter && filter !== "all") path += "/" + filter;
    if (house) path += "/f/" + encodeURIComponent(house);
    return "#" + (path || "/");
  }

  function saleHref(id, date, tab) {
    let path = prefix(date || digest.date) + "/sale/" + encodeURIComponent(id);
    if (tab && tab !== "lots") path += "/" + tab;
    return "#" + path;
  }

  function houseHref(id, date) {
    return "#" + prefix(date || digest.date) + "/house/" + encodeURIComponent(id);
  }

  function rememberHome() {
    try { sessionStorage.setItem("porcelain-home", location.hash || "#/"); } catch (error) { /* private mode */ }
  }

  function savedHome() {
    try { return sessionStorage.getItem("porcelain-home") || homeHref("all"); } catch (error) { return homeHref("all"); }
  }

  function houseById(id) {
    return (digest.houses || []).find(function (house) { return house.id === id; }) || null;
  }

  function saleById(id) {
    return (digest.sales || []).find(function (sale) { return sale.id === id; }) || null;
  }

  function salesFor(houseId) {
    return (digest.sales || []).filter(function (sale) { return sale.houseId === houseId; });
  }

  function housesWithSales() {
    const ids = {};
    (digest.sales || []).forEach(function (sale) { ids[sale.houseId] = true; });
    return (digest.houses || []).filter(function (house) { return ids[house.id]; });
  }

  function splitHouses(list) {
    const byId = {};
    list.forEach(function (house) { byId[house.id] = house; });
    const pinned = [];
    PINNED.forEach(function (id) { if (byId[id]) pinned.push(byId[id]); });
    const pinnedIds = {};
    pinned.forEach(function (house) { pinnedIds[house.id] = true; });
    let rest = list.filter(function (house) { return !pinnedIds[house.id]; });
    const visible = pinned.slice();
    if (!visible.length) {
      visible.push.apply(visible, rest.slice(0, 3));
      rest = rest.slice(visible.length);
    }
    return { visible: visible, rest: rest };
  }

  function shanghaiText(sale) {
    const text = sale.whenShanghai || "时间待公布";
    if (text.indexOf("上海") >= 0) return text;
    if (text.length > 18) return "上海时间 " + text;
    return text + "（上海时间）";
  }

  function shanghaiHtml(sale) {
    const text = shanghaiText(sale);
    const tag = "（上海时间）";
    if (text.slice(-tag.length) === tag) {
      return esc(text.slice(0, -tag.length)) + '<span class="time-tag">' + tag + "</span>";
    }
    return esc(text);
  }

  function cityShort(city) {
    if (!city) return "地点待公布";
    const head = String(city).split(/[（(]/)[0].trim();
    const place = head.match(/^([\u4e00-\u9fff]+(?:\s*\/\s*[\u4e00-\u9fff]+)*)/);
    if (place && place[1]) return place[1];
    return head || city;
  }

  function zoneNote(text) {
    if (!text) return "";
    const named = text.match(/（([^）]+)）/g);
    if (named && named.length) {
      const last = named[named.length - 1].replace(/[（）]/g, "");
      if (last && last.length <= 48) return last;
    }
    return text;
  }

  function lotCount(sale) {
    return (sale.lots && sale.lots.length) || 0;
  }

  function countText(sale) {
    const count = lotCount(sale);
    if (count) return "瓷器拍品 " + count + "件";
    return "瓷器拍品未逐件展开";
  }

  function priceText(price) {
    return ((price && price.text) || "").replace(/^(估价|起拍价)\s*/, "");
  }

  function estimateAmount(price) {
    if (price && price.low != null && price.high != null && price.currency) {
      const fmt = function (value) { return Number(value).toLocaleString("en-US"); };
      return price.currency + " " + fmt(price.low) + "–" + fmt(price.high);
    }
    return priceText(price);
  }

  function quietPrice(price) {
    const text = (priceText(price) || (price && price.text) || "").replace(/或起拍价/g, "").replace(/起拍价/g, "").trim();
    return text || "未见估价";
  }

  function priceBlock(price, verbose) {
    if (!price) return "";
    if (price.kind === "estimate") {
      const amount = verbose ? (priceText(price) || estimateAmount(price)) : estimateAmount(price);
      if (!amount) return '<p class="quiet">未见估价</p>';
      return '<p class="estimate"><span class="estimate-label">估价</span>' + esc(amount) + "</p>";
    }
    return '<p class="quiet">' + esc(quietPrice(price)) + "</p>";
  }

  function lotNames(lot) {
    const title = (lot.title || "").trim();
    const split = title.split(/\s*\/\s*/).filter(Boolean);
    let main = title;
    let sub = "";
    if (split.length >= 2) {
      const zh = split.filter(function (part) { return /[\u4e00-\u9fff]/.test(part); });
      const rest = split.filter(function (part) { return !/[\u4e00-\u9fff]/.test(part); });
      if (zh.length) {
        main = zh.join(" / ");
        sub = rest.join(" / ");
      }
    }
    const period = (lot.period || "").trim();
    const keywords = (lot.keywords || "").trim();
    return { main: main, sub: sub, era: period || keywords, hint: keywords && keywords !== period ? keywords : "" };
  }

  function hearts() {
    try { return JSON.parse(localStorage.getItem("porcelain-hearts") || "{}"); } catch (error) { return {}; }
  }

  function heartKey(sale, lot) {
    return sale.id + ":" + (lot.lot || lot.title || "");
  }

  function thumb(src, eager) {
    if (!src) return '<div class="thumb"><div class="ph" role="img" aria-label="图片未能下载">图未取到</div></div>';
    return '<div class="thumb"><img src="' + esc(safeAsset(src)) + '" alt="" loading="' + (eager ? "eager" : "lazy") + '" decoding="async"></div>';
  }

  function saleCard(sale, eager) {
    const house = houseById(sale.houseId);
    const zone = sale.whenLocal
      ? '<p class="meta zone">' + icon("clock") + "<span>原时区 " + esc(zoneNote(sale.whenLocal)) + "</span></p>"
      : "";
    return (
      '<a class="sale" href="' + esc(saleHref(sale.id)) + '">' +
        thumb(sale.cover, eager) +
        "<div>" +
          '<p class="badges"><span class="badge house">' + esc(house ? house.name : sale.houseId) + "</span>" +
            '<span class="badge ' + esc(sale.status) + '">' + esc(STATUS[sale.status] || sale.status) + "</span></p>" +
          "<h2>" + esc(sale.title) + "</h2>" +
          '<p class="meta">' + icon("pin") + "<span>" + esc(cityShort(sale.city)) + "</span></p>" +
          '<p class="meta">' + icon("clock") + "<span>" + shanghaiHtml(sale) + "</span></p>" +
          zone +
          '<p class="meta">' + icon("jar") + "<span>" + esc(countText(sale)) + "</span></p>" +
        "</div></a>"
    );
  }

  function chip(href, label, on, title) {
    return '<a class="chip' + (on ? " is-on" : "") + '" href="' + esc(href) + '"' +
      (title ? ' title="' + esc(title) + '"' : "") +
      (on ? ' aria-current="page"' : "") + ">" + esc(label) + "</a>";
  }

  function nav(title, backHref, share) {
    const back = backHref
      ? '<a class="icon-btn" href="' + esc(backHref) + '" aria-label="返回">' + icon("back") + "</a>"
      : "<span></span>";
    const action = share
      ? '<button type="button" class="icon-btn" data-share aria-label="分享">' + icon("share") + "</button>"
      : "<span></span>";
    return '<header class="nav">' + back + "<h1>" + esc(title) + "</h1>" + action + "</header>";
  }

  function fold() {
    const intro = digest.intro ? "<p>" + esc(digest.intro) + "</p>" : "";
    const caveats = (digest.caveats || []).map(function (line) { return "<p>" + esc(line) + "</p>"; }).join("");
    const notes = (digest.fetchNotes || []).map(function (line) { return "<p>" + esc(line) + "</p>"; }).join("");
    return '<details class="fold"><summary>说明与价格口径</summary>' + intro + caveats + notes + "</details>";
  }

  function finePrint() {
    return '<p class="fine">拍品图片来自各拍卖行公开图录，仅供跟拍备忘，不是本站原创。</p>' + RANGE;
  }

  function renderHome(route) {
    rememberHome();
    const all = digest.sales || [];
    const openCount = all.filter(function (sale) { return sale.status !== "ended"; }).length;
    const endedCount = all.length - openCount;
    const sales = all.filter(function (sale) {
      if (route.house && sale.houseId !== route.house) return false;
      if (route.filter === "ended") return sale.status === "ended";
      if (route.filter === "open") return sale.status !== "ended";
      return true;
    });
    const groups = splitHouses(housesWithSales());
    const selectedExtra = groups.rest.filter(function (house) { return house.id === route.house; })[0];
    const statusChips = [
      chip(homeHref("all", digest.date, route.house), "全部", route.filter === "all"),
      chip(homeHref("open", digest.date, route.house), "即将进行中", route.filter === "open"),
      chip(homeHref("ended", digest.date, route.house), "刚结束", route.filter === "ended")
    ].join("");
    const houseChips = [chip(homeHref(route.filter, digest.date, ""), "全部", !route.house)].concat(
      groups.visible.map(function (house) {
        return chip(homeHref(route.filter, digest.date, house.id), house.name, route.house === house.id, house.nameEn || "");
      })
    ).join("");
    const more = groups.rest.length
      ? '<details class="more"><summary class="chip more-toggle' + (selectedExtra ? " is-on" : "") + '" aria-label="更多拍卖行">' +
          (selectedExtra ? esc(selectedExtra.name) : "") + icon("chev") + "</summary><div class=\"more-panel\">" +
          groups.rest.map(function (house) {
            return chip(homeHref(route.filter, digest.date, house.id), house.name, route.house === house.id, house.nameEn || "");
          }).join("") +
        "</div></details>"
      : "";
    const days = index.days || [];
    const dayMenu = days.length > 1
      ? '<details class="day-pick"><summary aria-label="切换日期">' + icon("chev") + "</summary><div class=\"day-panel\">" +
          days.map(function (day) {
            const on = day.date === digest.date ? " is-on" : "";
            return '<a class="' + on + '" href="' + esc(homeHref(route.filter, day.date, route.house)) + '">' + esc(day.date) + "</a>";
          }).join("") +
        "</div></details>"
      : "";
    const list = sales.length
      ? '<div class="cards">' + sales.map(function (sale, i) { return saleCard(sale, i < 3); }).join("") + "</div>"
      : '<p class="empty">这一栏里没有专场。</p>';
    document.title = "古董捡漏 · 中国瓷器海外拍卖日报";
    app.innerHTML =
      '<header class="mast">' +
        '<div class="bloom">' + BLOOM + "</div>" +
        '<div class="mast-vase">' + VASE + "</div>" +
        '<div class="mast-main"><h1>古董捡漏</h1><p class="subhead">中国瓷器海外拍卖日报</p></div>' +
        '<div class="date-line">' + icon("calendar") + '<time datetime="' + esc(digest.date) + '">' + esc(digest.date) + "</time>" + dayMenu + "</div>" +
        '<p class="summary"><span class="num">' + openCount + "</span>场即将/进行中拍卖，<span class=\"num\">" + endedCount + "</span>场刚结束</p>" +
      "</header>" +
      '<div class="filters">' +
        '<div class="filter"><span class="filter-label">状态</span><div class="chips">' + statusChips + "</div></div>" +
        '<div class="filter"><span class="filter-label">拍卖行</span><div class="chips">' + houseChips + more + "</div></div>" +
      "</div>" +
      list +
      fold() +
      '<footer class="foot"><p class="foot-links"><a href="europe/">欧洲筛选日报</a><a href="../">回鉴瓷</a></p>' + finePrint() + "</footer>";
  }

  function scopeLine(sale) {
    if (!sale.lots || !sale.lots.length) return "这次没有逐件拍品，只留下专场预告。数字和时间以官方图录为准。";
    if (sale.lots.length >= 20) return "下面是日报筛进来的瓷器和陶瓷。标成估价的都不是起拍价。";
    return "下面是这次收到的瓷器亮点，不是整场图录。标成估价的都不是起拍价。";
  }

  function lotMatches(lot, query) {
    if (!query) return true;
    const blob = [lot.lot, lot.title, lot.keywords, lot.period, lot.catalogueTitle, (lot.price && lot.price.text) || ""]
      .join(" ")
      .toLowerCase();
    return blob.indexOf(query) >= 0;
  }

  function sortedLots(sale) {
    const query = lotQuery.trim().toLowerCase();
    const lots = (sale.lots || []).filter(function (lot) { return lotMatches(lot, query); });
    lots.sort(function (a, b) {
      if (lotSort === "high") {
        const ah = a.price && a.price.high != null ? a.price.high : -1;
        const bh = b.price && b.price.high != null ? b.price.high : -1;
        if (ah !== bh) return bh - ah;
      }
      const an = parseInt(a.lot, 10);
      const bn = parseInt(b.lot, 10);
      if (!isNaN(an) && !isNaN(bn) && an !== bn) return an - bn;
      if (!isNaN(an)) return -1;
      if (!isNaN(bn)) return 1;
      return 0;
    });
    return lots;
  }

  function lotCard(lot, sale) {
    const names = lotNames(lot);
    const saved = !!hearts()[heartKey(sale, lot)];
    const number = lot.lot ? "Lot " + lot.lot : "未编号";
    const photo = lot.image
      ? '<img src="' + esc(safeAsset(lot.image)) + '" alt="' + esc(names.main || "拍品") + '" loading="lazy" decoding="async">'
      : '<div class="ph" role="img" aria-label="图片未能下载">图未取到</div>';
    const link = safeUrl(lot.url)
      ? '<a class="official" href="' + esc(safeUrl(lot.url)) + '" target="_blank" rel="noopener noreferrer">官方页面</a>'
      : "";
    const missing = !lot.image && lot.imageNote ? '<p class="miss">' + esc(lot.imageNote) + "</p>" : "";
    const sub = names.sub ? '<p class="lot-sub">' + esc(names.sub) + "</p>" : "";
    const hint = names.hint && names.hint !== names.era ? '<p class="lot-sub">' + esc(names.hint) + "</p>" : "";
    const era = names.era ? '<p class="era"><span>年代</span>' + esc(names.era) + "</p>" : "";
    return (
      '<article class="lot">' +
        '<div class="lot-photo">' + photo +
          '<button type="button" class="heart' + (saved ? " is-on" : "") + '" data-heart="' + esc(heartKey(sale, lot)) + '" aria-pressed="' + (saved ? "true" : "false") + '" aria-label="收藏这件">' + icon("heart") + "</button>" +
        "</div>" +
        '<div class="lot-copy">' +
          '<p class="lot-no">拍品号<b>' + esc(number) + "</b></p>" +
          '<h3 class="lot-title">' + esc(names.main || "未命名拍品") + "</h3>" +
          sub + hint + era +
          priceBlock(lot.price, false) +
          missing + link +
        "</div></article>"
    );
  }

  function renderLots(sale) {
    const box = document.getElementById("lots");
    if (!box) return;
    if (!sale.lots || !sale.lots.length) {
      box.innerHTML = '<p class="empty">这场没有逐件拍品，只留下专场预告。</p>';
      return;
    }
    const lots = sortedLots(sale);
    const count = lotQuery.trim()
      ? '<p class="result-count">' + lots.length + " / " + sale.lots.length + " 件</p>"
      : "";
    box.innerHTML = count + (lots.length
      ? lots.map(function (lot) { return lotCard(lot, sale); }).join("")
      : '<p class="empty">没有对上的拍品。</p>');
    app.querySelectorAll("[data-sort]").forEach(function (button) {
      button.classList.toggle("is-on", button.getAttribute("data-sort") === lotSort);
    });
  }

  function fact(label, value) {
    if (!value) return "";
    return "<div><dt>" + esc(label) + "</dt><dd>" + esc(value) + "</dd></div>";
  }

  function linkBtn(url, label) {
    const href = safeUrl(url);
    if (!href) return "";
    return '<a class="link-btn" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' + esc(label) + "</a>";
  }

  function renderSale(route, options) {
    const sale = saleById(route.id);
    if (!sale) {
      document.title = "没有这场 · 古董捡漏";
      app.innerHTML = nav("拍卖详情", savedHome(), false) + '<p class="empty">这场不在这一天的日报里。</p>';
      return;
    }
    const house = houseById(sale.houseId);
    const tab = route.tab || "lots";
    const zone = sale.whenLocal
      ? '<p class="meta zone">' + icon("clock") + "<span>原时区 " + esc(sale.whenLocal) + "</span></p>"
      : "";
    const count = lotCount(sale);
    const banner = '<div class="count-banner">' + icon("jar") + "<span>瓷器拍品：" +
      (count ? "<strong>" + count + "</strong>件" : "未逐件展开") + "</span></div>";
    const tabs = '<div class="tabs" role="tablist">' +
      ["lots", "拍品列表", "info", "拍卖信息", "house", "拍卖行"].reduce(function (html, item, index, all) {
        if (index % 2) return html;
        const id = item;
        const label = all[index + 1];
        const on = tab === id ? " is-on" : "";
        return html + '<button type="button" class="tab' + on + '" role="tab" data-tab="' + id + '" aria-selected="' + (tab === id ? "true" : "false") + '">' + label + "</button>";
      }, "") +
      "</div>";
    let panel = "";
    if (tab === "info") {
      const warn = (digest.caveats || [])[0] || "";
      panel = '<div id="panel"><div class="lot-copy">' + priceBlock(sale.price, true) +
        (warn ? '<p class="quiet">' + esc(warn) + "</p>" : "") + "</div><dl class=\"facts\">" +
        fact("地点", sale.city) +
        fact("上海时间", shanghaiText(sale)) +
        fact("原时区", sale.whenLocal) +
        fact("年代", sale.period) +
        fact("范围", sale.lotSpan) +
        fact("简述", sale.summary) +
        fact("备注", sale.note) +
        "</dl>" +
        linkBtn(sale.url, "打开官方图录") +
        "</div>";
    } else if (tab === "house") {
      const mine = house ? salesFor(house.id) : [];
      panel = '<div id="panel">' +
        (house
          ? '<dl class="facts">' +
              fact("拍卖行", house.name + (house.nameEn ? " · " + house.nameEn : "")) +
              fact("扫描", house.scan) +
              fact("近况", house.found) +
              fact("备注", house.note) +
            "</dl>" + linkBtn(house.url, "打开官网")
          : '<p class="empty">这一天的扫描里没有这家。</p>') +
        '<p class="section-label">这家的专场</p>' +
        (mine.length
          ? '<div class="cards">' + mine.map(function (item) { return saleCard(item, false); }).join("") + "</div>"
          : '<p class="empty">这次没有排到专场。</p>') +
        (house ? '<p class="foot"><a href="' + esc(houseHref(house.id)) + '">拍卖行专页</a></p>' : "") +
        "</div>";
    } else {
      const tools = sale.lots && sale.lots.length
        ? '<div class="tools"><input id="q" type="search" enterkeyhint="search" placeholder="搜拍品号或品名" value="' + esc(lotQuery) + '" aria-label="搜索拍品" autocomplete="off">' +
            '<button type="button" class="sort' + (lotSort === "lot" ? " is-on" : "") + '" data-sort="lot">按号</button>' +
            '<button type="button" class="sort' + (lotSort === "high" ? " is-on" : "") + '" data-sort="high">估价从高</button></div>'
        : "";
      panel = '<div id="panel">' + tools + '<div id="lots"></div><p class="scope">' + esc(scopeLine(sale)) + "</p></div>";
    }
    document.title = sale.title + " · 拍卖详情";
    app.innerHTML =
      nav("拍卖详情", savedHome(), true) +
      '<section class="sale-hero">' +
        '<div class="bloom">' + BLOOM + "</div>" +
        '<p class="badges"><span class="badge house">' + esc(house ? house.name : sale.houseId) + "</span>" +
          '<span class="badge ' + esc(sale.status) + '">' + esc(STATUS[sale.status] || "") + "</span></p>" +
        '<h2 class="sale-title">' + esc(sale.title) + "</h2>" +
        '<p class="meta">' + icon("pin") + "<span>" + esc(cityShort(sale.city)) + "</span></p>" +
        '<p class="meta">' + icon("clock") + "<span>" + shanghaiHtml(sale) + "</span></p>" +
        zone +
      "</section>" +
      banner + tabs + panel +
      '<footer class="foot">' + fold() + finePrint() + "</footer>";
    if (tab === "lots") renderLots(sale);
    if (options && options.tab) {
      const tabs = document.querySelector(".tabs");
      if (tabs) {
        const y = tabs.getBoundingClientRect().top + window.scrollY - 56;
        window.scrollTo(0, Math.max(0, y));
      }
    }
  }

  function renderHouse(route) {
    const house = houseById(route.id);
    if (!house) {
      document.title = "没有这家 · 古董捡漏";
      app.innerHTML = nav("拍卖行", savedHome(), false) + '<p class="empty">这一天的扫描里没有这家。</p>';
      return;
    }
    const mine = salesFor(house.id);
    document.title = house.name + " · 拍卖行";
    app.innerHTML =
      nav("拍卖行", savedHome(), false) +
      '<section class="sale-hero"><p class="badges"><span class="badge house">' + esc(house.name) + "</span></p>" +
        '<h2 class="sale-title">' + esc(house.name) + "</h2>" +
        (house.nameEn ? '<p class="meta"><span>' + esc(house.nameEn) + "</span></p>" : "") +
      "</section>" +
      '<dl class="facts">' +
        fact("扫描", house.scan) +
        fact("近况", house.found) +
        fact("备注", house.note) +
      "</dl>" +
      linkBtn(house.url, "打开官网") +
      '<p class="section-label">专场</p>' +
      (mine.length
        ? '<div class="cards">' + mine.map(function (sale) { return saleCard(sale, false); }).join("") + "</div>"
        : '<p class="empty">' + esc(house.found || "这次没有排到中国瓷器专场。") + "</p>") +
      '<footer class="foot"><p class="foot-links"><a href="' + esc(savedHome()) + '">回今天的日报</a><a href="europe/">欧洲筛选日报</a></p>' + finePrint() + "</footer>";
  }

  function render(options) {
    const route = parseRoute();
    const saleId = route.name === "sale" ? route.id : "";
    if (saleId !== openSale) {
      lotQuery = "";
      lotSort = "lot";
      openSale = saleId;
    }
    if (route.name === "home") renderHome(route);
    else if (route.name === "house") renderHouse(route);
    else renderSale(route, options);
  }

  function toast(message) {
    let node = document.getElementById("toast");
    if (!node) {
      node = document.createElement("div");
      node.id = "toast";
      node.className = "toast";
      node.setAttribute("role", "status");
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.add("is-on");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { node.classList.remove("is-on"); }, 1800);
  }

  async function shareCurrent() {
    const route = parseRoute();
    const sale = route.name === "sale" ? saleById(route.id) : null;
    const payload = { title: sale ? sale.title : "古董捡漏", url: location.href };
    if (navigator.share) {
      try {
        await navigator.share(payload);
        return;
      } catch (error) {
        if (error && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(location.href);
      toast("链接已复制");
    } catch (error) {
      toast("请从地址栏复制链接");
    }
  }

  function bind() {
    app.addEventListener("click", function (event) {
      const tab = event.target.closest("[data-tab]");
      if (tab) {
        const route = parseRoute();
        if (route.name !== "sale" || tab.getAttribute("data-tab") === route.tab) return;
        const next = saleHref(route.id, digest.date, tab.getAttribute("data-tab"));
        if (location.hash !== next) history.replaceState(null, "", next);
        render({ tab: true });
        return;
      }
      const sort = event.target.closest("[data-sort]");
      if (sort) {
        lotSort = sort.getAttribute("data-sort");
        const sale = saleById(parseRoute().id);
        if (sale) renderLots(sale);
        return;
      }
      const heart = event.target.closest("[data-heart]");
      if (heart) {
        const key = heart.getAttribute("data-heart");
        const map = hearts();
        if (map[key]) delete map[key];
        else map[key] = 1;
        try { localStorage.setItem("porcelain-hearts", JSON.stringify(map)); } catch (error) { /* ignore */ }
        const on = !!map[key];
        heart.classList.toggle("is-on", on);
        heart.setAttribute("aria-pressed", on ? "true" : "false");
        return;
      }
      if (event.target.closest("[data-share]")) shareCurrent();
    });
    app.addEventListener("input", function (event) {
      if (event.target.id !== "q") return;
      lotQuery = event.target.value;
      const sale = saleById(parseRoute().id);
      if (sale) renderLots(sale);
    });
  }

  async function loadDigest(date) {
    if (cache[date]) return cache[date];
    const day = (index.days || []).find(function (item) { return item.date === date; });
    if (!day) throw new Error("没有这一天");
    const response = await fetch(asset("data/" + day.file));
    if (!response.ok) throw new Error("日报没有打开");
    const data = await response.json();
    cache[date] = data;
    return data;
  }

  async function show() {
    const route = parseRoute();
    try {
      digest = await loadDigest(route.date);
    } catch (error) {
      app.innerHTML = '<p class="error">这一天的日报没有打开。' + esc(error.message || "") + "</p>";
      return;
    }
    render();
    window.scrollTo(0, 0);
  }

  function boot() {
    if (!/\/$|index\.html$/.test(location.pathname)) {
      location.replace(location.pathname + "/" + location.search + location.hash);
      return;
    }
    bind();
    fetch(asset("data/index.json"))
      .then(function (response) {
        if (!response.ok) throw new Error("目录没有打开");
        return response.json();
      })
      .then(function (data) {
        index = data;
        return show();
      })
      .catch(function () {
        app.innerHTML = '<p class="error">日报目录没有打开。</p>';
      });
  }

  window.addEventListener("hashchange", function () {
    if (index) show();
  });
  boot();
})();
