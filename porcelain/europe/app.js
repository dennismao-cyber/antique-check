(function () {
  const app = document.getElementById("app");
  let index = null;
  let digest = null;
  let timer = null;

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

  function parseRoute() {
    const raw = (location.hash.replace(/^#/, "") || "/");
    const qIndex = raw.indexOf("?");
    const path = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
    const query = new URLSearchParams(qIndex >= 0 ? raw.slice(qIndex + 1) : "");
    const parts = path.split("/").filter(Boolean);
    const head = parts[0] || "home";
    if (head === "lot") return { name: "lot", id: decodeURIComponent(parts[1] || ""), query: query };
    if (head === "house") return { name: "house", id: decodeURIComponent(parts[1] || ""), query: query };
    if (head === "lots") return { name: "lots", query: query };
    return { name: "home", query: query };
  }

  function href(path, params) {
    let hash = "#" + (path || "/");
    if (params) {
      const q = new URLSearchParams();
      Object.keys(params).forEach(function (key) {
        if (params[key]) q.set(key, params[key]);
      });
      const s = q.toString();
      if (s) hash += "?" + s;
    }
    return hash;
  }

  function allLots() {
    return (digest.lots || []).concat(digest.reminders || []);
  }

  function lotById(id) {
    return allLots().find(function (lot) { return lot.id === id; }) || null;
  }

  function houseById(id) {
    return (digest.houses || []).find(function (house) { return house.id === id; }) || null;
  }

  function photo(src, alt, eager) {
    if (!src) {
      return '<div class="frame"><div class="ph" role="img" aria-label="没有图片"><span>无图</span></div></div>';
    }
    return (
      '<div class="frame"><img src="' + esc(asset(src)) + '" alt="' + esc(alt || "拍品图片") +
      '" loading="' + (eager ? "eager" : "lazy") + '" decoding="async"></div>'
    );
  }

  function remain(iso, timing, now) {
    const ms = new Date(iso).getTime() - now;
    if (isNaN(new Date(iso).getTime())) return { past: false, text: "" };
    if (ms <= 0) return { past: true, text: timing === "截拍" ? "已截拍" : "已开拍" };
    const total = Math.floor(ms / 1000);
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const bits = [];
    if (d) bits.push(d + " 天");
    if (d || h) bits.push(h + " 小时");
    bits.push(m + " 分");
    return { past: false, text: timing + "还剩 " + bits.join(" ") };
  }

  function liveLine(iso, timing) {
    const r = remain(iso, timing, Date.now());
    return '<p class="live' + (r.past ? " is-past" : "") + '" data-iso="' + esc(iso) + '" data-timing="' + esc(timing) + '">' + esc(r.text) + "</p>";
  }

  function badges(lot) {
    const bits = [];
    if (lot.score != null) bits.push('<span class="pill score">关注 ' + esc(lot.score) + " 分</span>");
    if (lot.badge === "今日新") bits.push('<span class="pill today">今日新</span>');
    else if (lot.badge === "昨日新") bits.push('<span class="pill yesterday">昨日新</span>');
    else if (lot.badge === "此前推过") bits.push('<span class="pill prev">此前推过</span>');
    (lot.flags || []).forEach(function (flag) {
      bits.push('<span class="pill ' + (flag === "描述有损伤" ? "damage" : "material") + '">' + esc(flag) + "</span>");
    });
    return bits.join("");
  }

  function priceLine(lot) {
    if (!lot.price || !lot.price.text) return "未见估价";
    return "估价 " + lot.price.text;
  }

  function placeLine(lot) {
    return [lot.house, [lot.country, lot.city].filter(Boolean).join(" "), lot.sale, lot.lotNo ? "第 " + lot.lotNo + " 号" : ""]
      .filter(Boolean)
      .join(" · ");
  }

  function timeLine(lot) {
    return lot.timing + " 当地 " + lot.localTime + "（北京 " + lot.beijingTime + "）";
  }

  function header(title, sub, backHref) {
    const back = backHref
      ? '<a class="back" href="' + esc(backHref) + '">返回</a>'
      : '<div class="seal" aria-hidden="true">欧</div>';
    return (
      '<header class="top">' + back +
        '<div class="grow"><h1>' + esc(title) + "</h1>" +
        (sub ? "<p>" + esc(sub) + "</p>" : "") +
        "</div></header>"
    );
  }

  function footer() {
    const fx = digest.fx || {};
    const caveats = (digest.caveats || []).map(function (line) {
      return "<p>" + esc(line) + "</p>";
    }).join("");
    return (
      '<div class="foot">' +
        "<p>汇率：" + esc(fx.label || "") + "。" + esc(fx.note || "") + "</p>" +
        "<p>生成时间：" + esc(digest.generatedLabel || "") + "（北京时间）。</p>" +
        caveats +
        '<p><a href="../">瓷器日报</a> · <a href="../../">鉴瓷</a></p>' +
      "</div>"
    );
  }

  function countdownPool() {
    const map = {};
    (digest.countdown || []).forEach(function (item) {
      const lot = lotById(item.lotId) || {};
      map[item.lotId] = Object.assign({}, lot, {
        id: item.lotId,
        title: item.title || lot.title,
        house: item.house || lot.house,
        houseId: item.houseId || lot.houseId,
        badge: item.badge || lot.badge,
        timing: item.timing || lot.timing,
        beijingTime: item.beijingTime || lot.beijingTime,
        beijingIso: item.beijingIso || lot.beijingIso,
        hoursAtGeneration: item.hoursAtGeneration,
        image: lot.image || item.image,
        listedOnCover: true,
      });
    });
    (digest.reminders || []).forEach(function (lot) {
      if (!map[lot.id]) {
        map[lot.id] = Object.assign({}, lot, { listedOnCover: false });
      }
    });
    return Object.keys(map).map(function (id) { return map[id]; }).sort(function (a, b) {
      return new Date(a.beijingIso) - new Date(b.beijingIso);
    });
  }

  function soonRow(lot, i) {
    const gen = lot.timing + " " + lot.hoursAtGeneration + " 小时";
    return (
      '<a class="soon" href="' + esc(href("/lot/" + lot.id)) + '">' +
        photo(lot.image, lot.title, i < 4) +
        "<div>" +
          '<p class="kicker">' + badges(lot) + "</p>" +
          "<h3>" + esc(lot.title) + "</h3>" +
          '<p class="when">' + esc(lot.house) + " · 北京 " + esc(lot.beijingTime) + "</p>" +
          liveLine(lot.beijingIso, lot.timing) +
          '<p class="sub">生成时：' + esc(gen) + "</p>" +
        "</div></a>"
    );
  }

  function compactRow(lot, i) {
    return (
      '<a class="row" href="' + esc(href("/lot/" + lot.id)) + '">' +
        photo(lot.image, lot.title, i < 2) +
        "<div>" +
          '<p class="kicker">' + badges(lot) + "</p>" +
          "<h3>" + esc(lot.title) + "</h3>" +
          '<p class="when">' + esc(placeLine(lot)) + "</p>" +
          '<p class="hint"><span class="pill estimate">估价</span> ' + esc((lot.price && lot.price.text) || "未见估价") + "</p>" +
          '<p class="sub">' + esc(timeLine(lot)) + "</p>" +
          (Date.now() + 72 * 3600 * 1000 > new Date(lot.beijingIso).getTime() ? liveLine(lot.beijingIso, lot.timing) : "") +
        "</div></a>"
    );
  }

  function featureCard(lot, i) {
    return (
      '<a class="lot" href="' + esc(href("/lot/" + lot.id)) + '">' +
        photo(lot.image, lot.title, i < 2) +
        '<div class="body">' +
          '<p class="kicker">' + badges(lot) + (lot.id && lot.source === "new" ? "<span>编号 " + esc(lot.id) + "</span>" : "") + "</p>" +
          "<h2>" + esc(lot.title) + "</h2>" +
          '<p class="when">' + esc(placeLine(lot)) + "</p>" +
          '<p class="hint"><span class="pill estimate">估价</span> ' + esc((lot.price && lot.price.text) || "未见估价") + "</p>" +
          '<p class="sub">' + esc(timeLine(lot)) + "</p>" +
        "</div></a>"
    );
  }

  function renderHome() {
    const stats = digest.stats || {};
    const soon = countdownPool();
    const featured = (digest.lots || []).filter(function (lot) { return lot.score >= 5; });
    const housesWithNew = (digest.houses || []).filter(function (house) { return house.newCount; });
    const housesReminderOnly = (digest.houses || []).filter(function (house) { return !house.newCount && house.reminderCount; });
    const houseRows = housesWithNew.map(function (house) {
      const place = [house.country, house.city].filter(Boolean).join(" ");
      return (
        '<a class="house" href="' + esc(href("/house/" + house.id)) + '">' +
          '<span class="mark">' + esc((house.name || "拍").slice(0, 1)) + "</span>" +
          "<span><strong>" + esc(house.name) + "</strong><small>" +
            esc((place ? place + " · " : "") + "新入选 " + house.newCount + " 件") +
          "</small></span>" +
          '<span class="chev" aria-hidden="true">›</span></a>'
      );
    }).join("");
    const reminderHouses = housesReminderOnly.length
      ? '<details class="fold"><summary>其余 ' + housesReminderOnly.length + " 家出现在 72 小时提醒里</summary>" +
          '<div class="houses">' + housesReminderOnly.map(function (house) {
            return (
              '<a class="house" href="' + esc(href("/house/" + house.id)) + '">' +
                '<span class="mark">' + esc((house.name || "拍").slice(0, 1)) + "</span>" +
                "<span><strong>" + esc(house.name) + "</strong><small>" + esc((house.country || "") + " · 提醒 " + house.reminderCount + " 件") + "</small></span>" +
                '<span class="chev" aria-hidden="true">›</span></a>'
            );
          }).join("") + "</div></details>"
      : "";
    const howto = (digest.howto || []).map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("");
    app.innerHTML =
      header("欧洲筛选日报", (digest.subtitle || "") + " · " + (index.days[0] && index.days[0].label || digest.date), "") +
      '<section class="hero">' +
        '<p class="kicker">' + esc(digest.kicker || "") + "</p>" +
        "<h2>" + esc(digest.title) + "</h2>" +
        '<p class="sub">' + esc((index.days[0] && index.days[0].label) || digest.date) + " · " + esc(digest.subtitle || "") + "</p>" +
        '<div class="stats">' +
          '<div class="stat"><b>' + esc(stats.newLots) + "</b><span>新入选</span></div>" +
          '<div class="stat"><b>' + esc(stats.housesInvolved) + "</b><span>涉及拍行</span></div>" +
          '<div class="stat"><b>' + esc(stats.lotsOnSale) + "</b><span>在拍拍品</span></div>" +
          '<div class="stat"><b>' + esc(stats.housesMonitored) + "</b><span>监测拍行</span></div>" +
        "</div>" +
      "</section>" +
      '<p class="lead">' + esc(digest.intro || "") + "</p>" +
      '<div class="chips">' +
        '<a class="chip" href="' + esc(href("/lots", { badge: "今日新" })) + '">今日新 ' + esc(stats.todayNew) + "</a>" +
        '<a class="chip" href="' + esc(href("/lots", { badge: "昨日新" })) + '">昨日新 ' + esc(stats.yesterdayNew) + "</a>" +
        '<a class="chip" href="' + esc(href("/lots")) + '">全部 ' + esc(stats.newLots) + "</a>" +
      "</div>" +
      '<p class="section-label">72 小时内开拍或截拍</p>' +
      '<p class="omit">' + esc(digest.countdownNote || "") + "</p>" +
      soon.map(soonRow).join("") +
      '<p class="omit">' + esc(digest.countdownOmitted || "") + " " + esc(digest.reminderNote || "") + "</p>" +
      '<p class="section-label">新入选高关注</p>' +
      featured.map(featureCard).join("") +
      '<a class="ghost" href="' + esc(href("/lots")) + '">查看全部 ' + esc(stats.newLots) + " 件新入选</a>" +
      '<p class="section-label">拍卖行</p>' +
      '<div class="houses">' + houseRows + "</div>" +
      reminderHouses +
      '<details class="fold"><summary>怎么用这份日报</summary>' + howto + "</details>" +
      footer();
  }

  function filterLots(query) {
    const badge = query.get("badge") || "";
    const house = query.get("house") || "";
    const score = query.get("score") || "";
    const flag = query.get("flag") || "";
    const q = (query.get("q") || "").trim().toLowerCase();
    const sort = query.get("sort") || "score";
    let lots = (digest.lots || []).slice();
    if (badge) lots = lots.filter(function (lot) { return lot.badge === badge; });
    if (house) lots = lots.filter(function (lot) { return lot.houseId === house; });
    if (score) lots = lots.filter(function (lot) { return String(lot.score) === String(score); });
    if (flag) lots = lots.filter(function (lot) { return (lot.flags || []).indexOf(flag) >= 0; });
    if (q) {
      lots = lots.filter(function (lot) {
        const blob = [lot.id, lot.title, lot.house, lot.sale, lot.lotNo, lot.reason, lot.catalogueTitle, (lot.price && lot.price.text) || ""]
          .join(" ")
          .toLowerCase();
        return blob.indexOf(q) >= 0;
      });
    }
    lots.sort(function (a, b) {
      if (sort === "time") {
        const dt = new Date(a.beijingIso) - new Date(b.beijingIso);
        if (dt !== 0) return dt;
        return (b.score || 0) - (a.score || 0);
      }
      const ds = (b.score || 0) - (a.score || 0);
      if (ds !== 0) return ds;
      return new Date(a.beijingIso) - new Date(b.beijingIso);
    });
    return { lots: lots, badge: badge, house: house, score: score, flag: flag, q: query.get("q") || "", sort: sort };
  }

  function renderLots(route) {
    const f = filterLots(route.query);
    const total = (digest.lots || []).length;
    const houseOptions = ['<option value="">全部拍行</option>']
      .concat((digest.houses || []).filter(function (h) { return h.newCount; }).map(function (h) {
        return '<option value="' + esc(h.id) + '"' + (f.house === h.id ? " selected" : "") + ">" + esc(h.name) + "（" + h.newCount + "）</option>";
      }))
      .join("");
    const chip = function (key, value, label) {
      const on = (key === "badge" ? f.badge : key === "score" ? f.score : f.flag) === value ? " is-on" : "";
      const params = { badge: f.badge, house: f.house, score: f.score, flag: f.flag, sort: f.sort, q: f.q };
      params[key] = (params[key] === value) ? "" : value;
      return '<a class="chip' + on + '" href="' + esc(href("/lots", params)) + '">' + esc(label) + "</a>";
    };
    const sortBtn = function (value, label) {
      const on = f.sort === value ? " is-on" : "";
      const params = { badge: f.badge, house: f.house, score: f.score, flag: f.flag, sort: value, q: f.q };
      return '<a class="sort' + on + '" href="' + esc(href("/lots", params)) + '">' + esc(label) + "</a>";
    };
    const list = f.lots.length
      ? f.lots.map(function (lot, i) { return compactRow(lot, i); }).join("")
      : '<p class="empty">没有对上的拍品。</p>';
    app.innerHTML =
      header("新入选", total + " 件 · " + (digest.newLotsNote || ""), href("/")) +
      '<div class="chips">' +
        chip("badge", "今日新", "今日新 " + (digest.stats && digest.stats.todayNew || "")) +
        chip("badge", "昨日新", "昨日新 " + (digest.stats && digest.stats.yesterdayNew || "")) +
        chip("flag", "描述有损伤", "描述有损伤") +
      "</div>" +
      '<div class="chips">' +
        chip("score", "5", "关注 5 分") +
        chip("score", "4", "关注 4 分") +
        chip("score", "3", "关注 3 分") +
        chip("score", "2", "关注 2 分") +
      "</div>" +
      '<form class="tools" action="#" onsubmit="return false;">' +
        '<input id="q" type="search" enterkeyhint="search" placeholder="搜编号、品名或拍行" value="' + esc(f.q) + '" aria-label="搜索拍品">' +
        '<select id="house" aria-label="按拍行筛选">' + houseOptions + "</select>" +
        sortBtn("score", "按关注分") +
        sortBtn("time", "按开拍时间") +
      "</form>" +
      '<p class="section-label">' + f.lots.length + " / " + total + " 件</p>" +
      list +
      footer();
    const input = document.getElementById("q");
    const houseSel = document.getElementById("house");
    function pushFilters(nextQ, nextHouse) {
      location.hash = href("/lots", {
        badge: f.badge,
        house: nextHouse != null ? nextHouse : f.house,
        score: f.score,
        flag: f.flag,
        sort: f.sort,
        q: nextQ != null ? nextQ : f.q,
      }).replace(/^#/, "#");
    }
    if (input) {
      let t = null;
      input.addEventListener("input", function () {
        clearTimeout(t);
        t = setTimeout(function () { pushFilters(input.value, null); }, 250);
      });
    }
    if (houseSel) {
      houseSel.addEventListener("change", function () {
        pushFilters(null, houseSel.value);
      });
    }
  }

  function renderHouse(route) {
    const house = houseById(route.id);
    if (!house) {
      app.innerHTML = header("没有这家", "", href("/")) + '<p class="empty">这一天的日报里没有这家拍卖行。</p>';
      return;
    }
    const mineNew = (digest.lots || []).filter(function (lot) { return lot.houseId === house.id; });
    const mineRem = (digest.reminders || []).filter(function (lot) { return lot.houseId === house.id; });
    const site = house.url
      ? '<a class="ghost" href="' + esc(house.url) + '" target="_blank" rel="noopener">打开官网</a>'
      : "";
    const place = [house.country, house.city].filter(Boolean).join(" ");
    app.innerHTML =
      header(house.name, place, href("/")) +
      '<div class="block">' +
        (place ? '<p class="when">' + esc(place) + "</p>" : "") +
        '<p class="note">下面是本日报收录的拍品，不是整场图录。估价以拍行官网为准。</p>' +
      "</div>" +
      site +
      (mineNew.length ? '<p class="section-label">新入选 ' + mineNew.length + " 件</p>" + mineNew.map(compactRow).join("") : "") +
      (mineRem.length ? '<p class="section-label">72 小时提醒 ' + mineRem.length + " 件</p>" + mineRem.map(soonRow).join("") : "") +
      (!mineNew.length && !mineRem.length ? '<p class="empty">这家这次没有列入的拍品。</p>' : "") +
      footer();
  }

  function renderLot(route) {
    const lot = lotById(route.id);
    if (!lot) {
      app.innerHTML = header("没有这件", "", href("/")) + '<p class="empty">这件拍品不在这一天的日报里。</p>';
      return;
    }
    const back = lot.source === "new" ? href("/lots") : href("/");
    const official = lot.url
      ? '<a class="out" href="' + esc(lot.url) + '" target="_blank" rel="noopener">打开原拍品页面</a>'
      : "";
    const rows = [
      ["拍行", placeLine(lot)],
      [lot.timing, "当地 " + lot.localTime + "（北京 " + lot.beijingTime + "）"],
      ["估价", (lot.price && lot.price.text) || "未见估价"],
    ];
    if (lot.source === "new" && lot.id) rows.unshift(["编号", lot.id]);
    const table = '<div class="meta-table">' + rows.map(function (row) {
      return "<div><span class=\"k\">" + esc(row[0]) + "</span><span class=\"v\">" + esc(row[1]) + "</span></div>";
    }).join("") + "</div>";
    const reason = lot.reason ? '<p class="reason"><strong>入选理由：</strong>' + esc(lot.reason) + "</p>" : "";
    const cat = lot.catalogueTitle ? '<p class="sub">拍行标题：' + esc(lot.catalogueTitle) + "</p>" : "";
    app.innerHTML =
      header(lot.house || "拍品", lot.timing + " 北京 " + lot.beijingTime, back) +
      '<article class="lot">' +
        photo(lot.image, lot.title, true) +
        '<div class="body">' +
          '<p class="kicker">' + badges(lot) + "</p>" +
          "<h2>" + esc(lot.title) + "</h2>" +
          liveLine(lot.beijingIso, lot.timing) +
          (lot.hoursAtGeneration != null && lot.hoursAtGeneration <= 72
            ? '<p class="sub">生成时：' + esc(lot.timing + " " + lot.hoursAtGeneration + " 小时") + "</p>"
            : "") +
          table +
          reason +
          cat +
          official +
        "</div></article>" +
      (houseById(lot.houseId) ? '<a class="ghost" href="' + esc(href("/house/" + lot.houseId)) + '">看这家拍卖行的其它拍品</a>' : "") +
      '<p class="omit">关注分只按拍行文字描述归档，不是鉴定或估值。请到拍行网站看照片、完整描述和品相后再自行决定是否出价。现场拍卖的开拍时间是整场开始时间，具体拍品轮到会更晚。</p>' +
      footer();
  }

  function tickLive() {
    const now = Date.now();
    app.querySelectorAll(".live[data-iso]").forEach(function (el) {
      const r = remain(el.getAttribute("data-iso"), el.getAttribute("data-timing"), now);
      el.textContent = r.text;
      el.classList.toggle("is-past", r.past);
    });
  }

  let lastRouteName = "";

  function render(opts) {
    const keep = opts && opts.keepScroll;
    const active = document.activeElement;
    const keepSearch = keep && active && active.id === "q";
    const caret = keepSearch ? active.selectionStart : null;
    const route = parseRoute();
    if (route.name === "lot") renderLot(route);
    else if (route.name === "house") renderHouse(route);
    else if (route.name === "lots") renderLots(route);
    else renderHome();
    tickLive();
    if (!keep || lastRouteName !== route.name) window.scrollTo(0, 0);
    lastRouteName = route.name;
    if (keepSearch) {
      const input = document.getElementById("q");
      if (input) {
        input.focus();
        if (caret != null) {
          try { input.setSelectionRange(caret, caret); } catch (e) {}
        }
      }
    }
  }

  function boot() {
    if (!/\/$|index\.html$/.test(location.pathname)) {
      location.replace(location.pathname + "/" + location.search + location.hash);
      return;
    }
    fetch(asset("data/index.json"))
      .then(function (response) {
        if (!response.ok) throw new Error("目录没有打开");
        return response.json();
      })
      .then(function (data) {
        index = data;
        const day = (index.days || []).find(function (item) { return item.date === index.latest; }) || index.days[0];
        return fetch(asset("data/" + day.file)).then(function (response) {
          if (!response.ok) throw new Error("日报没有打开");
          return response.json();
        });
      })
      .then(function (data) {
        digest = data;
        render();
        if (timer) clearInterval(timer);
        timer = setInterval(tickLive, 30000);
      })
      .catch(function (error) {
        app.innerHTML = '<p class="error">日报没有打开。请用本地网页服务打开这一页，不要直接用文件路径。' + esc(error && error.message ? error.message : "") + "</p>";
      });
  }

  window.addEventListener("hashchange", function () {
    if (digest) render({ keepScroll: true });
  });
  boot();
})();
