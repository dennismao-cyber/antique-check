(function () {
  const app = document.getElementById("app");
  const cache = {};
  let index = null;
  let digest = null;
  let lotQuery = "";
  let lotSort = "lot";

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
    const parts = (location.hash.replace(/^#/, "") || "/").split("/").filter(Boolean);
    let date = index.latest;
    let rest = parts;
    if (parts[0] === "d" && parts[1]) {
      date = decodeURIComponent(parts[1]);
      rest = parts.slice(2);
    }
    const head = rest[0] || "open";
    if (head === "sale") {
      return { date: date, name: "sale", id: decodeURIComponent(rest[1] || "") };
    }
    if (head === "house") {
      return { date: date, name: "house", id: decodeURIComponent(rest[1] || "") };
    }
    const filter = head === "ended" || head === "all" ? head : "open";
    return { date: date, name: "home", filter: filter };
  }

  function prefix(date) {
    if (!date || date === index.latest) return "";
    return "/d/" + encodeURIComponent(date);
  }

  function homeHref(filter, date) {
    const root = prefix(date || (digest && digest.date));
    if (!filter || filter === "open") return "#" + (root || "/");
    return "#" + root + "/" + filter;
  }

  function saleHref(id, date) {
    return "#" + prefix(date || digest.date) + "/sale/" + encodeURIComponent(id);
  }

  function houseHref(id, date) {
    return "#" + prefix(date || digest.date) + "/house/" + encodeURIComponent(id);
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

  const STATUS = { live: "进行中", upcoming: "即将举行", ended: "刚结束" };

  function kindOf(price) {
    const text = (price && price.text) || "";
    if (!price || price.kind === "estimate") return { key: "estimate", label: "估价" };
    if (price.kind === "starting") return { key: "starting", label: "起拍价" };
    if (price.kind === "unverified") return { key: "unverified", label: "待核实" };
    if (text.indexOf("成交") >= 0) return { key: "done", label: "成交" };
    if (text.indexOf("结束") >= 0) return { key: "ended", label: "已结束" };
    return { key: "unknown", label: "未公布" };
  }

  function priceText(price) {
    const text = ((price && price.text) || "").replace(/^(估价|起拍价)\s*/, "");
    return text;
  }

  function photo(src, alt, frameClass) {
    if (!src) {
      return '<div class="frame ' + (frameClass || "") + '"><div class="ph" role="img" aria-label="图片未能下载"><span>图未取到</span></div></div>';
    }
    return '<div class="frame ' + (frameClass || "") + '"><img src="' + esc(asset(src)) + '" alt="' + esc(alt || "拍品图片") + '" loading="lazy" decoding="async"></div>';
  }

  function saleCard(sale, eager) {
    const house = houseById(sale.houseId);
    const kind = kindOf(sale.price);
    const count = sale.lots && sale.lots.length ? sale.lots.length + " 件" : "专场预告";
    const img = sale.cover
      ? '<img src="' + esc(asset(sale.cover)) + '" alt="" loading="' + (eager ? "eager" : "lazy") + '" decoding="async">'
      : '<div class="ph" role="img" aria-label="没有专场封面"><span>无图</span></div>';
    return (
      '<a class="sale" href="' + esc(saleHref(sale.id)) + '">' +
        '<div class="frame">' + img + "</div>" +
        '<div>' +
          '<p class="kicker"><span>' + esc(house ? house.name : sale.houseId) + "</span>" +
            '<span class="pill ' + esc(sale.status) + '">' + esc(STATUS[sale.status] || sale.status) + "</span></p>" +
          "<h2>" + esc(sale.title) + "</h2>" +
          '<p class="when">' + esc([sale.whenShanghai, sale.city].filter(Boolean).join(" · ")) + "</p>" +
          '<p class="hint"><span class="pill ' + kind.key + '">' + esc(kind.label) + "</span> " + esc(priceText(sale.price)) + "</p>" +
          '<p class="count">' + esc(count) + "</p>" +
        "</div>" +
      "</a>"
    );
  }

  function header(title, sub, backHref) {
    const back = backHref
      ? '<a class="back" href="' + esc(backHref) + '">返回</a>'
      : '<div class="seal" aria-hidden="true">瓷</div>';
    return (
      '<header class="top">' + back +
        '<div class="grow"><h1>' + esc(title) + "</h1>" +
        (sub ? "<p>" + esc(sub) + "</p>" : "") +
        "</div></header>"
    );
  }

  function renderHome(route) {
    const sales = (digest.sales || []).filter(function (sale) {
      if (route.filter === "all") return true;
      if (route.filter === "ended") return sale.status === "ended";
      return sale.status !== "ended";
    });
    const withSales = [];
    const without = [];
    (digest.houses || []).forEach(function (house) {
      const mine = salesFor(house.id);
      if (mine.length) withSales.push(house);
      else without.push(house);
    });
    const dayLabel = (index.days.find(function (day) { return day.date === digest.date; }) || {}).label || digest.date;
    const daySwitch = index.days.length > 1
      ? '<div class="chips">' + index.days.map(function (day) {
          const on = day.date === digest.date ? " is-on" : "";
          return '<a class="chip' + on + '" href="' + esc(homeHref("open", day.date)) + '">' + esc(day.label) + "</a>";
        }).join("") + "</div>"
      : "";
    const chips = [
      ["open", "进行中与即将"],
      ["ended", "刚结束"],
      ["all", "全部专场"],
    ].map(function (pair) {
      const on = route.filter === pair[0] ? " is-on" : "";
      return '<a class="chip' + on + '" href="' + esc(homeHref(pair[0])) + '">' + pair[1] + "</a>";
    }).join("");
    const list = sales.length
      ? sales.map(function (sale, i) { return saleCard(sale, i < 3); }).join("")
      : '<p class="empty">这一栏里没有专场。</p>';
    const houseRows = withSales.map(function (house) {
      const mine = salesFor(house.id);
      const open = mine.filter(function (sale) { return sale.status !== "ended"; }).length;
      const ended = mine.length - open;
      const bits = [];
      if (open) bits.push("在跟 " + open + " 场");
      if (ended) bits.push("刚结束 " + ended + " 场");
      return (
        '<a class="house" href="' + esc(houseHref(house.id)) + '">' +
          '<span class="mark">' + esc((house.name || "拍").slice(0, 1)) + "</span>" +
          "<span><strong>" + esc(house.name) + "</strong><small>" + esc(bits.join(" · ") || house.found || "") + "</small></span>" +
          '<span class="chev" aria-hidden="true">›</span></a>'
      );
    }).join("");
    const quiet = without.length
      ? '<details class="fold"><summary>其余 ' + without.length + " 家这次没有专场</summary>" +
          '<div class="houses">' + without.map(function (house) {
            return (
              '<a class="house" href="' + esc(houseHref(house.id)) + '">' +
                '<span class="mark">' + esc((house.name || "拍").slice(0, 1)) + "</span>" +
                "<span><strong>" + esc(house.name) + "</strong><small>" + esc(house.found || house.note || "") + "</small></span>" +
                '<span class="chev" aria-hidden="true">›</span></a>'
            );
          }).join("") + "</div></details>"
      : "";
    const notes = (digest.fetchNotes || []).map(function (note) {
      return "<p>" + esc(note) + "</p>";
    }).join("");
    const caveats = (digest.caveats || []).map(function (line) {
      return "<p>" + esc(line) + "</p>";
    }).join("");
    app.innerHTML =
      header("瓷器日报", dayLabel + " · 上海", "") +
      daySwitch +
      '<p class="lead">' + esc(digest.intro || "") + "</p>" +
      '<a class="sister" href="europe/"><strong>欧洲筛选日报</strong><span>2026年11月25日 · 欧洲 · 瓷器</span></a>' +
      '<div class="chips">' + chips + "</div>" +
      '<p class="section-label">专场</p>' +
      list +
      '<p class="section-label">拍卖行</p>' +
      '<div class="houses">' + houseRows + "</div>" +
      quiet +
      '<details class="fold"><summary>价格口径和没取到的内容</summary>' + caveats + notes + "</details>" +
      '<p class="foot"><a href="../">回鉴瓷</a></p>';
  }

  function scopeLine(sale) {
    if (!sale.lots || !sale.lots.length) {
      return "这次没有逐件拍品，只留下专场预告。数字和时间以官方图录为准。";
    }
    if (sale.lots.length >= 20) {
      return "下面是日报筛进来的瓷器和陶瓷。标成估价的都不是起拍价。";
    }
    return "下面是这次收到的瓷器亮点，不是整场图录。";
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
    const kind = kindOf(lot.price);
    const number = lot.lot ? "拍品 " + lot.lot : "精选";
    const bits = [lot.period, lot.keywords].filter(function (item, index, all) {
      return item && all.indexOf(item) === index;
    });
    const link = lot.url
      ? '<a class="out" href="' + esc(lot.url) + '" target="_blank" rel="noopener">打开官方页面</a>'
      : "";
    const missing = !lot.image && lot.imageNote
      ? '<p class="sub">' + esc(lot.imageNote) + "</p>"
      : "";
    return (
      '<article class="lot">' +
        photo(lot.image, lot.title) +
        '<div class="body">' +
          '<p class="kicker"><span>' + esc(number) + '</span><span class="pill ' + kind.key + '">' + esc(kind.label) + "</span></p>" +
          "<h2>" + esc(lot.title) + "</h2>" +
          (lot.catalogueTitle ? '<p class="sub">' + esc(lot.catalogueTitle) + "</p>" : "") +
          (bits.length ? '<p class="sub">' + esc(bits.join(" · ")) + "</p>" : "") +
          '<p class="hint">' + esc(priceText(lot.price) || "未见估价或起拍价") + "</p>" +
          missing +
          link +
        "</div></article>"
    );
  }

    function renderLots(sale) {
    const lots = sortedLots(sale);
    const box = document.getElementById("lots");
    if (!box) return;
    if (!sale.lots || !sale.lots.length) {
      box.innerHTML = "";
      return;
    }
    const head = '<p class="section-label" id="lot-count">' + lots.length + " / " + sale.lots.length + " 件</p>";
    box.innerHTML = head + (lots.length
      ? lots.map(function (lot) { return lotCard(lot, sale); }).join("")
      : '<p class="empty">没有对上的拍品。</p>');
  }

  function renderSale(route) {
    const sale = saleById(route.id);
    if (!sale) {
      app.innerHTML = header("没有这场", "", homeHref("open")) + '<p class="empty">这场不在这一天的日报里。</p>';
      return;
    }
    const house = houseById(sale.houseId);
    const kind = kindOf(sale.price);
    const catalogue = sale.url
      ? '<a class="ghost" href="' + esc(sale.url) + '" target="_blank" rel="noopener">打开官方图录</a>'
      : "";
    const detailBits = [sale.whenLocal, sale.summary, sale.note].filter(Boolean);
    const detail = detailBits.length
      ? '<details class="fold"><summary>这场说明</summary>' +
          detailBits.map(function (line) { return "<p>" + esc(line) + "</p>"; }).join("") +
        "</details>"
      : "";
    app.innerHTML =
      header(house ? house.name : "专场", sale.title, homeHref("open")) +
      '<div class="block">' +
        '<p class="kicker"><span class="pill ' + esc(sale.status) + '">' + esc(STATUS[sale.status] || "") + "</span>" +
          '<span class="pill ' + kind.key + '">' + esc(kind.label) + "</span></p>" +
        "<h2>" + esc(sale.title) + "</h2>" +
        '<p class="when">' + esc([sale.whenShanghai, sale.city].filter(Boolean).join(" · ")) + "</p>" +
        '<p class="hint">' + esc(priceText(sale.price)) + "</p>" +
        '<p class="note">' + esc(scopeLine(sale)) + "</p>" +
      "</div>" +
      detail +
      catalogue +
      (sale.lots && sale.lots.length
        ? '<div class="tools"><input id="q" type="search" enterkeyhint="search" placeholder="搜拍品号或品名" value="' + esc(lotQuery) + '" aria-label="搜索拍品">' +
            '<button type="button" class="sort' + (lotSort === "lot" ? " is-on" : "") + '" data-sort="lot">按号</button>' +
            '<button type="button" class="sort' + (lotSort === "high" ? " is-on" : "") + '" data-sort="high">估价从高</button></div>'
        : "") +
      '<div id="lots"></div>' +
      '<p class="foot"><a href="' + esc(house ? houseHref(house.id) : homeHref("open")) + '">看这家拍卖行</a></p>';
    renderLots(sale);
    const input = document.getElementById("q");
    if (input) {
      input.addEventListener("input", function () {
        lotQuery = input.value;
        renderLots(sale);
      });
    }
    app.querySelectorAll("[data-sort]").forEach(function (button) {
      button.addEventListener("click", function () {
        lotSort = button.getAttribute("data-sort");
        app.querySelectorAll("[data-sort]").forEach(function (other) {
          other.classList.toggle("is-on", other === button);
        });
        renderLots(sale);
      });
    });
  }

  function renderHouse(route) {
    const house = houseById(route.id);
    if (!house) {
      app.innerHTML = header("没有这家", "", homeHref("open")) + '<p class="empty">这一天的扫描里没有这家。</p>';
      return;
    }
    const mine = salesFor(house.id);
    const site = house.url
      ? '<a class="ghost" href="' + esc(house.url) + '" target="_blank" rel="noopener">打开官网</a>'
      : "";
    const list = mine.length
      ? mine.map(function (sale) { return saleCard(sale, false); }).join("")
      : '<p class="empty">' + esc(house.found || "这次没有排到中国瓷器专场。") + "</p>";
    app.innerHTML =
      header(house.name, house.nameEn || "", homeHref("open")) +
      '<div class="block">' +
        (house.scan ? '<p class="kicker">' + esc(house.scan) + "</p>" : "") +
        (house.found ? '<p class="lead">' + esc(house.found) + "</p>" : "") +
        (house.note ? '<p class="note">' + esc(house.note) + "</p>" : "") +
      "</div>" +
      site +
      '<p class="section-label">专场</p>' +
      list +
      '<p class="foot"><a href="' + esc(homeHref("open")) + '">回今天的日报</a></p>';
  }

  function render() {
    const route = parseRoute();
    if (route.name === "home") {
      lotQuery = "";
      renderHome(route);
      return;
    }
    if (route.name === "house") {
      lotQuery = "";
      renderHouse(route);
      return;
    }
    renderSale(route);
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
