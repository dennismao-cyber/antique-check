(function () {
  const RANKS = [
    { name: "学徒", axes: ["mark", "decor"], focus: "款识、装饰手法" },
    { name: "初级鉴定师", axes: ["ware", "kiln"], focus: "品种、窑口" },
    { name: "中级鉴定师", axes: ["reign", "form"], focus: "年代、器型" },
    { name: "高级鉴定师", axes: ["foot", "auth"], focus: "底足、真伪" },
  ];
  const AXIS_LABEL = {
    mark: "款识",
    decor: "装饰",
    ware: "品种",
    kiln: "窑口",
    reign: "年代",
    form: "器型",
    foot: "底足",
    auth: "真伪",
  };
  const NEED_CORRECT = 100;
  const NEED_ACC = 0.7;
  const STORE = "jianci-v2";
  const TEACHER_RANKS = ["中级鉴定师", "高级鉴定师"];

  const app = document.querySelector("#app");
  let round = [];
  let index = 0;
  let locked = false;
  let sessionHits = 0;
  let sessionRank = 0;

  function shuffle(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function blankStats() {
    const stats = {};
    RANKS.forEach(function (rank) {
      stats[rank.name] = { correct: 0, attempts: 0 };
    });
    return stats;
  }

  function blankProfile(name) {
    return {
      id: Math.random().toString(36).slice(2, 8),
      name: name || "未署名",
      rankIndex: 0,
      stats: blankStats(),
      cards: {},
      misses: {},
      mentor: null,
      teacherNotes: {},
      reports: [],
    };
  }

  function loadStore() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE) || "null");
      if (raw && raw.profiles && raw.profiles.length) return raw;
    } catch (err) {
      /* 坏档就重开 */
    }
    const first = blankProfile("未署名");
    return { active: first.id, profiles: [first] };
  }

  let store = loadStore();

  function save() {
    localStorage.setItem(STORE, JSON.stringify(store));
  }

  function profile() {
    return store.profiles.find(function (item) { return item.id === store.active; }) || store.profiles[0];
  }

  function rankOf(person) {
    return RANKS[Math.max(0, Math.min(RANKS.length - 1, person.rankIndex || 0))];
  }

  function statOf(person) {
    const name = rankOf(person).name;
    if (!person.stats[name]) person.stats[name] = { correct: 0, attempts: 0 };
    return person.stats[name];
  }

  function accuracy(stat) {
    if (!stat.attempts) return 0;
    return stat.correct / stat.attempts;
  }

  function gate(stat) {
    return stat.correct >= NEED_CORRECT && accuracy(stat) >= NEED_ACC;
  }

  function stillNeed(stat) {
    const lines = [];
    if (stat.correct < NEED_CORRECT) lines.push("答对还差 " + (NEED_CORRECT - stat.correct) + " 题");
    if (accuracy(stat) < NEED_ACC) lines.push("正确率还不到 70%");
    if (!lines.length) lines.push("这一级的门坎已经够了");
    return lines.join("，");
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function clearApp() {
    app.replaceChildren();
    window.scrollTo(0, 0);
  }

  function backButton(label) {
    const button = el("button", "back", label || "回案头");
    button.type = "button";
    button.addEventListener("click", showHome);
    return button;
  }

  function encodeCode(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let bin = "";
    bytes.forEach(function (b) { bin += String.fromCharCode(b); });
    return "JC1." + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function decodeCode(text) {
    const raw = (text || "").replace(/\s+/g, "").replace(/^JC1\./, "");
    const pad = raw.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(pad);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function questionById(id) {
    return QUESTIONS.find(function (q) { return q.id === id; });
  }

  function showHome() {
    const person = profile();
    const rank = rankOf(person);
    const stat = statOf(person);
    clearApp();
    const screen = el("section", "screen screen-home");
    const hero = el("div", "hero");
    hero.appendChild(el("div", "seal", "鉴"));
    hero.appendChild(el("p", "rank-chip", rank.name));
    hero.appendChild(el("h1", "title", "鉴瓷"));
    hero.appendChild(el("p", "premise", "这一级先看" + rank.focus + "。"));
    const block = el("div", "progress-block");
    const accText = stat.attempts ? Math.round(accuracy(stat) * 100) + "%" : "还没开题";
    block.appendChild(el("p", "progress-line", "答对 " + stat.correct + " / " + NEED_CORRECT));
    const bar = el("div", "bar");
    const fill = el("span");
    fill.style.width = Math.min(100, (stat.correct / NEED_CORRECT) * 100) + "%";
    bar.appendChild(fill);
    block.appendChild(bar);
    block.appendChild(el("p", "progress-line", "正确率 " + accText + " · 目标 70%"));
    block.appendChild(el("p", "fine", stillNeed(stat) + "。作答 " + stat.attempts + " 题。"));
    hero.appendChild(block);
    screen.appendChild(hero);

    const menu = el("div", "menu");
    const start = el("button", "primary", "开始鉴定");
    start.type = "button";
    start.addEventListener("click", startRound);
    menu.appendChild(start);
    [["图鉴", showAtlas], ["拜师", showMentor], ["市场指导估价", showMarket]].forEach(function (pair) {
      const button = el("button", "ghost", pair[0]);
      button.type = "button";
      button.addEventListener("click", pair[1]);
      menu.appendChild(button);
    });
    screen.appendChild(menu);

    const name = el("input", "field");
    name.value = person.name === "未署名" ? "" : person.name;
    name.placeholder = "怎么称呼（拜师时用）";
    name.addEventListener("change", function () {
      person.name = name.value.trim() || "未署名";
      save();
    });
    screen.appendChild(name);
    screen.appendChild(el("p", "fine", "等级记在这台设备上。十题一局。"));
    app.appendChild(screen);
  }

  function poolFor(rank) {
    return QUESTIONS.filter(function (q) { return q.rank === rank.name; });
  }

  function startRound() {
    const person = profile();
    sessionRank = person.rankIndex;
    const rank = RANKS[sessionRank];
    const pool = poolFor(rank);
    round = shuffle(pool).slice(0, Math.min(10, pool.length));
    index = 0;
    locked = false;
    sessionHits = 0;
    if (!round.length) {
      clearApp();
      const screen = el("section", "screen");
      screen.appendChild(backButton());
      screen.appendChild(el("h2", "prompt", "这一级暂时没有题。"));
      app.appendChild(screen);
      return;
    }
    showQuestion();
  }

  function showQuestion() {
    locked = false;
    const q = round[index];
    const person = profile();
    clearApp();
    const screen = el("section", "screen screen-q");
    const head = el("header", "q-head");
    const meta = el("div", "q-meta");
    meta.appendChild(el("span", "count", "第 " + (index + 1) + " / " + round.length + " 题"));
    meta.appendChild(el("span", "axis", AXIS_LABEL[q.axis] || q.axis));
    head.appendChild(meta);
    const bar = el("div", "progress");
    const fill = el("span");
    fill.style.width = ((index / round.length) * 100) + "%";
    bar.appendChild(fill);
    head.appendChild(bar);
    screen.appendChild(head);
    screen.appendChild(el("p", "fine", rankOf(person).name + " · " + rankOf(person).focus));

    const frame = el("figure", "frame");
    const photo = el("div", "photo");
    const img = document.createElement("img");
    img.alt = q.name;
    function ready() { photo.classList.add("is-ready"); }
    img.addEventListener("load", ready);
    img.src = q.image;
    if (img.complete && img.naturalWidth > 0) ready();
    photo.appendChild(img);
    frame.appendChild(photo);
    const cap = el("figcaption", "credit");
    cap.appendChild(el("span", "obj-name", q.name));
    const link = document.createElement("a");
    link.href = q.source;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = q.credit + " " + q.accession;
    cap.appendChild(link);
    frame.appendChild(cap);
    screen.appendChild(frame);

    screen.appendChild(el("h2", "prompt", q.prompt));
    const options = el("div", "options");
    shuffle(q.options).forEach(function (label) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "option";
      btn.appendChild(el("span", "opt-label", label));
      btn.appendChild(el("span", "mark", ""));
      btn.addEventListener("click", function () { choose(q, label, options); });
      options.appendChild(btn);
    });
    screen.appendChild(options);

    const feedback = el("div", "feedback");
    feedback.hidden = true;
    feedback.appendChild(el("p", "note"));
    const next = el("button", "primary next", index === round.length - 1 ? "看这一局" : "下一题");
    next.type = "button";
    next.addEventListener("click", advance);
    feedback.appendChild(next);
    screen.appendChild(feedback);
    app.appendChild(screen);
  }

  function unlock(q, wrong) {
    const person = profile();
    person.cards[q.id] = { at: Date.now(), wrong: wrong || !!(person.cards[q.id] && person.cards[q.id].wrong) };
    if (wrong) person.misses[q.id] = (person.misses[q.id] || 0) + 1;
  }

  function choose(q, label, options) {
    if (locked) return;
    locked = true;
    const person = profile();
    const stat = person.stats[RANKS[sessionRank].name];
    const ok = label === q.answer;
    stat.attempts += 1;
    if (ok) {
      stat.correct += 1;
      sessionHits += 1;
    }
    unlock(q, !ok);
    save();
    Array.prototype.forEach.call(options.children, function (btn) {
      const text = btn.querySelector(".opt-label").textContent;
      btn.disabled = true;
      if (text === q.answer) {
        btn.classList.add("is-correct");
        btn.querySelector(".mark").textContent = "正";
      } else if (text === label) {
        btn.classList.add("is-wrong");
        btn.querySelector(".mark").textContent = "误";
      } else btn.classList.add("is-idle");
    });
    const feedback = app.querySelector(".feedback");
    feedback.hidden = false;
    feedback.classList.add(ok ? "is-right" : "is-miss");
    feedback.querySelector(".note").textContent = (ok ? "看对了。" : "应是「" + q.answer + "」。") + q.note;
    if (!ok) openTeach(q);
    else feedback.querySelector(".next").scrollIntoView({ block: "nearest" });
  }

  function openTeach(q) {
    const person = profile();
    const back = el("div", "modal-back");
    const modal = el("div", "modal");
    modal.appendChild(el("p", "eyebrow", "知识点"));
    modal.appendChild(el("h3", null, AXIS_LABEL[q.axis] + " · " + q.answer));
    if (person.mentor) {
      const who = person.mentor.preview ? "预演师父" : "师父";
      modal.appendChild(el("p", "teacher-line", who + " " + person.mentor.name + " 点拨"));
      const custom = person.teacherNotes[q.id];
      if (custom) modal.appendChild(el("p", "note", custom));
    }
    modal.appendChild(el("p", "note", q.note));
    modal.appendChild(el("p", "fine", q.credit + " " + q.accession + " · 已收入图鉴"));
    const close = el("button", "primary", "知道了");
    close.type = "button";
    close.addEventListener("click", function () { back.remove(); });
    modal.appendChild(close);
    back.addEventListener("click", function (event) {
      if (event.target === back) back.remove();
    });
    back.appendChild(modal);
    document.body.appendChild(back);
  }

  function advance() {
    index += 1;
    if (index >= round.length) showResult();
    else showQuestion();
  }

  function showResult() {
    const person = profile();
    const before = sessionRank;
    const stat = person.stats[RANKS[before].name];
    let promoted = false;
    if (before < RANKS.length - 1 && gate(stat)) {
      person.rankIndex = before + 1;
      promoted = true;
      save();
    }
    clearApp();
    const screen = el("section", "screen screen-end");
    const hero = el("div", "hero");
    hero.appendChild(el("p", "eyebrow", promoted ? "晋级" : "这一局"));
    hero.appendChild(el("h2", "rank", promoted ? RANKS[person.rankIndex].name : RANKS[before].name));
    const score = el("p", "score");
    score.appendChild(el("strong", null, String(sessionHits)));
    score.appendChild(el("span", null, " / " + round.length));
    hero.appendChild(score);
    hero.appendChild(el("p", "flavor", promoted
      ? "这一级的答对题数和正确率都过线了。下一局改看" + RANKS[person.rankIndex].focus + "。"
      : stillNeed(stat) + "。"));
    screen.appendChild(hero);
    const list = el("ul", "breakdown");
    [["本级答对", stat.correct + " / " + NEED_CORRECT], ["本级正确率", (stat.attempts ? Math.round(accuracy(stat) * 100) : 0) + "%"], ["本级作答", String(stat.attempts)]].forEach(function (row) {
      const li = el("li");
      li.appendChild(el("span", null, row[0]));
      li.appendChild(el("b", null, row[1]));
      list.appendChild(li);
    });
    screen.appendChild(list);
    if (person.mentor && person.rankIndex > 0) {
      screen.appendChild(el("p", "fine", "你已经不是学徒，可以向师父出师。"));
    }
    const again = el("button", "primary", "再鉴一次");
    again.type = "button";
    again.addEventListener("click", startRound);
    screen.appendChild(again);
    const home = el("button", "ghost", "回案头");
    home.type = "button";
    home.addEventListener("click", showHome);
    screen.appendChild(home);
    app.appendChild(screen);
  }

  function showAtlas() {
    const person = profile();
    let filter = "全部";
    clearApp();
    const screen = el("section", "screen");
    screen.appendChild(backButton());
    screen.appendChild(el("h2", "prompt", "图鉴"));
    const ids = Object.keys(person.cards);
    screen.appendChild(el("p", "fine", "已收下 " + ids.length + " 条。答错会弹出，答对也收进图鉴。"));
    const filters = el("div", "filters");
    ["全部"].concat(Object.keys(AXIS_LABEL)).forEach(function (key) {
      const chip = el("button", "chip" + (key === filter ? " is-on" : ""), key === "全部" ? "全部" : AXIS_LABEL[key]);
      chip.type = "button";
      chip.addEventListener("click", function () { filter = key; draw(); });
      filters.appendChild(chip);
    });
    screen.appendChild(filters);
    const list = el("ul", "card-list");
    const detail = el("div");
    screen.appendChild(list);
    screen.appendChild(detail);

    function draw() {
      filters.querySelectorAll(".chip").forEach(function (chip, i) {
        const key = ["全部"].concat(Object.keys(AXIS_LABEL))[i];
        chip.classList.toggle("is-on", key === filter);
      });
      list.replaceChildren();
      const rows = ids.map(questionById).filter(Boolean).filter(function (q) {
        return filter === "全部" || q.axis === filter;
      });
      if (!rows.length) {
        list.appendChild(el("li", "fine", ids.length ? "这一类还没解开。" : "还没有卡片。答错一题就会收下第一条。"));
        return;
      }
      rows.forEach(function (q) {
        const li = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.appendChild(el("span", null, (AXIS_LABEL[q.axis] || "") + " · " + q.answer));
        const misses = person.misses[q.id] || 0;
        button.appendChild(el("small", null, q.accession + (misses ? " · 错过 " + misses + " 次" : "")));
        button.addEventListener("click", function () {
          detail.replaceChildren();
          detail.appendChild(el("h3", "prompt", q.prompt));
          detail.appendChild(el("p", "note", q.note));
          const link = document.createElement("a");
          link.href = q.source;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = "馆藏著录";
          detail.appendChild(link);
        });
        li.appendChild(button);
        list.appendChild(li);
      });
    }
    draw();
    app.appendChild(screen);
  }

  function playRite(caption) {
    const box = el("div", "rite");
    const pupil = el("div", "seal pupil", "徒");
    const master = el("div", "seal master", "师");
    box.appendChild(pupil);
    box.appendChild(master);
    const note = el("p", "rite-caption", caption || "拜师礼成");
    const wrap = el("div");
    wrap.appendChild(box);
    wrap.appendChild(note);
    return wrap;
  }

  function showMentor() {
    const person = profile();
    clearApp();
    const screen = el("section", "screen");
    screen.appendChild(backButton());
    screen.appendChild(el("h2", "prompt", "拜师"));
    screen.appendChild(el("p", "note", "学徒只能拜中级鉴定师或高级鉴定师。升到初级鉴定师就可以出师。任何一方都能解除关系，解除只发生在自己这台设备上。"));

    if (person.mentor) {
      screen.appendChild(el("p", "teacher-line", (person.mentor.preview ? "预演师父 " : "师父 ") + person.mentor.name + " · " + person.mentor.rank));
      const end = el("button", "ghost", person.rankIndex > 0 ? "出师" : "解除师徒");
      end.type = "button";
      end.addEventListener("click", function () {
        person.mentor = null;
        save();
        showMentor();
      });
      screen.appendChild(end);
    } else if (rankOf(person).name === "学徒") {
      const input = el("textarea", "area");
      input.placeholder = "贴上师父的拜师帖";
      screen.appendChild(input);
      const go = el("button", "primary", "行礼");
      go.type = "button";
      go.addEventListener("click", function () {
        let data;
        try { data = decodeCode(input.value); } catch (err) { data = null; }
        if (!data || data.k !== "in" || TEACHER_RANKS.indexOf(data.r) < 0) {
          input.placeholder = "这张帖子不是中级或以上的拜师帖";
          return;
        }
        person.mentor = { name: data.n, rank: data.r, id: data.id, preview: false };
        save();
        const rite = playRite("拜师礼成");
        screen.appendChild(rite);
        rite.scrollIntoView({ block: "center" });
      });
      screen.appendChild(go);
    } else {
      screen.appendChild(el("p", "fine", "你已经出了学徒，这一级不再拜师。"));
    }

    if (TEACHER_RANKS.indexOf(rankOf(person).name) >= 0) {
      screen.appendChild(el("h3", "prompt", "收徒"));
      const invite = encodeCode({ v: 1, k: "in", n: person.name, r: rankOf(person).name, id: person.id });
      const box = el("textarea", "area");
      box.readOnly = true;
      box.value = invite;
      screen.appendChild(el("p", "fine", "把这张拜师帖交给学徒。"));
      screen.appendChild(box);
      const report = el("textarea", "area");
      report.placeholder = "贴上学徒的学情帖，看他最常错的知识点";
      screen.appendChild(report);
      const read = el("button", "ghost", "看学情");
      read.type = "button";
      const reportView = el("div");
      read.addEventListener("click", function () {
        reportView.replaceChildren();
        let data;
        try { data = decodeCode(report.value); } catch (err) { data = null; }
        if (!data || data.k !== "rp" || !data.m) {
          reportView.appendChild(el("p", "fine", "学情帖读不出来。"));
          return;
        }
        reportView.appendChild(el("p", "teacher-line", data.n + " 最常错过"));
        if (!data.m.length) reportView.appendChild(el("p", "fine", "帖子里没有错题。"));
        data.m.forEach(function (pair) {
          const q = questionById(pair[0]);
          reportView.appendChild(el("p", "note", (q ? AXIS_LABEL[q.axis] + " · " + q.answer : pair[0]) + " · " + pair[1] + " 次"));
          if (q) reportView.appendChild(el("p", "fine", q.note));
        });
        const comment = el("textarea", "area");
        comment.placeholder = "写一句指点，生成指点帖给徒弟";
        const which = el("input", "field");
        which.placeholder = "要指点的题号，例如 1957.40-kiln";
        if (data.m[0]) which.value = data.m[0][0];
        const make = el("button", "ghost", "生成指点帖");
        make.type = "button";
        const out = el("textarea", "area");
        out.readOnly = true;
        make.addEventListener("click", function () {
          out.value = encodeCode({ v: 1, k: "nt", q: which.value.trim(), t: comment.value.trim() });
        });
        reportView.appendChild(which);
        reportView.appendChild(comment);
        reportView.appendChild(make);
        reportView.appendChild(out);
      });
      screen.appendChild(read);
      screen.appendChild(reportView);
    }

    screen.appendChild(el("h3", "prompt", "学情帖"));
    const misses = Object.keys(person.misses).map(function (id) { return [id, person.misses[id]]; });
    misses.sort(function (a, b) { return b[1] - a[1]; });
    const reportCode = encodeCode({ v: 1, k: "rp", n: person.name, id: person.id, m: misses.slice(0, 8) });
    const reportBox = el("textarea", "area");
    reportBox.readOnly = true;
    reportBox.value = misses.length ? reportCode : "";
    screen.appendChild(el("p", "fine", misses.length ? "把学情帖交给师父。" : "还没有错过的题，学情帖先空着。"));
    if (misses.length) screen.appendChild(reportBox);
    const noteIn = el("textarea", "area");
    noteIn.placeholder = "贴上师父的指点帖";
    const take = el("button", "ghost", "收下指点");
    take.type = "button";
    take.addEventListener("click", function () {
      let data;
      try { data = decodeCode(noteIn.value); } catch (err) { data = null; }
      if (!data || data.k !== "nt" || !data.q || !data.t) return;
      person.teacherNotes[data.q] = data.t;
      save();
      take.textContent = "已收下";
    });
    screen.appendChild(noteIn);
    screen.appendChild(take);

    screen.appendChild(el("h3", "prompt", "预演"));
    screen.appendChild(el("p", "fine", "预演不改变正式等级，师父也是预演的。正式拜师仍要中级或以上的拜师帖。"));
    const preview = el("button", "ghost", "看一遍拜师礼");
    preview.type = "button";
    const riteSlot = el("div");
    preview.addEventListener("click", function () {
      riteSlot.replaceChildren(playRite("预演 · 拜师礼成"));
      riteSlot.scrollIntoView({ block: "center" });
      if (!person.mentor) {
        person.mentor = { name: "预演", rank: "中级鉴定师", id: "preview", preview: true };
        save();
      }
    });
    screen.appendChild(preview);
    screen.appendChild(riteSlot);

    if (store.profiles.length > 1) {
      const jump = el("button", "ghost", "换到另一个身份");
      jump.type = "button";
      jump.addEventListener("click", function () {
        const others = store.profiles.filter(function (item) { return item.id !== person.id; });
        store.active = others[0].id;
        save();
        showHome();
      });
      screen.appendChild(jump);
    }
    const extra = el("button", "ghost", "本机再开一个学徒身份");
    extra.type = "button";
    extra.addEventListener("click", function () {
      const next = blankProfile("另一人");
      store.profiles.push(next);
      store.active = next.id;
      save();
      showHome();
    });
    screen.appendChild(extra);
    app.appendChild(screen);
  }

  function median(values) {
    const sorted = values.slice().sort(function (a, b) { return a - b; });
    const mid = Math.floor(sorted.length / 2);
    if (!sorted.length) return 0;
    if (sorted.length % 2) return sorted[mid];
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function weigh(lot) {
    const ref = new Date("2026-11-20T00:00:00Z").getTime();
    const then = new Date(lot.date + "T00:00:00Z").getTime();
    const years = Math.max(0, (ref - then) / (365.25 * 24 * 3600 * 1000));
    return Math.pow(0.5, years / 5);
  }

  function showMarket() {
    let current = 0;
    clearApp();
    const screen = el("section", "screen");
    screen.appendChild(backButton());
    screen.appendChild(el("h2", "prompt", "市场指导估价"));
    screen.appendChild(el("p", "disclaimer", "仅供参考，不构成价值评定或投资建议。"));
    const filters = el("div", "filters");
    const body = el("div");
    MARKET.varieties.forEach(function (variety, i) {
      const chip = el("button", "chip" + (i === 0 ? " is-on" : ""), variety.name);
      chip.type = "button";
      chip.addEventListener("click", function () {
        current = i;
        filters.querySelectorAll(".chip").forEach(function (node, j) { node.classList.toggle("is-on", j === i); });
        draw();
      });
      filters.appendChild(chip);
    });
    screen.appendChild(filters);
    screen.appendChild(body);

    function draw() {
      const variety = MARKET.varieties[current];
      body.replaceChildren();
      body.appendChild(el("p", "note", variety.blurb));
      const prices = variety.lots.map(function (lot) { return lot.cny; });
      const mid = median(prices);
      const marked = variety.lots.map(function (lot) {
        const outlier = mid > 0 && (lot.cny > mid * 3 || lot.cny < mid / 3);
        return { lot: lot, outlier: outlier, weight: weigh(lot) };
      });
      const used = marked.filter(function (row) { return !row.outlier; });
      const thin = variety.lots.length < 4 || used.length < 2;
      if (thin) {
        body.appendChild(el("p", "flag", "样本不足"));
        body.appendChild(el("p", "fine", "公开成交条数不够，不把这几件当成这一品种的市场指导价。下面仍列出已核对的成交。"));
      } else {
        let sum = 0;
        let wsum = 0;
        used.forEach(function (row) {
          sum += row.lot.cny * row.weight;
          wsum += row.weight;
        });
        const avg = Math.round(sum / wsum);
        const hero = el("p", "price-hero");
        hero.appendChild(el("span", null, "时间加权参考价 "));
        hero.appendChild(el("strong", null, avg.toLocaleString("zh-CN")));
        hero.appendChild(el("span", null, " 元"));
        body.appendChild(hero);
        body.appendChild(el("p", "fine", "已去掉异常值 " + (marked.length - used.length) + " 条。权重每五年大约减半。"));
      }
      body.appendChild(buildChart(marked));
      body.appendChild(el("p", "fine", "纵轴做过压缩，免得大件把小件挤在底上。红点是异常值。"));
      const list = el("ul", "lot-list");
      marked.slice().sort(function (a, b) { return a.lot.date < b.lot.date ? 1 : -1; }).forEach(function (row) {
        const li = document.createElement("li");
        const link = document.createElement("a");
        link.href = row.lot.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.appendChild(el("span", null, row.lot.date + " · " + row.lot.house + " " + row.lot.lot));
        link.appendChild(el("small", null, row.lot.title + " · " + row.lot.original + " · 约 " + row.lot.cny.toLocaleString("zh-CN") + " 元" + (row.outlier ? " · 异常值" : "")));
        li.appendChild(link);
        list.appendChild(li);
      });
      body.appendChild(list);
    }
    draw();
    screen.appendChild(el("p", "note", "算法：以 2026年11月20日 为基准，权重是 0.5 的（距今年数 ÷ 5）次方。价格用拍卖行公布的含佣金成交价，流拍不收。超过同品种中位数三倍，或不到三分之一，标为异常值，不计入均价。" + MARKET.fxNote));
    screen.appendChild(el("p", "fine", MARKET.coverage));
    screen.appendChild(el("p", "fine", "汇率来源：" + MARKET.fxSource + "。"));
    app.appendChild(screen);
  }

  function buildChart(rows) {
    const width = 320;
    const height = 160;
    const pad = 16;
    const years = rows.map(function (row) { return new Date(row.lot.date).getFullYear(); });
    const minY = Math.min.apply(null, years.concat([2016]));
    const maxY = Math.max.apply(null, years.concat([2026]));
    const maxP = Math.max.apply(null, rows.map(function (row) { return row.lot.cny; }));
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("class", "chart");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "近十年成交散点");
    rows.forEach(function (row) {
      const year = new Date(row.lot.date).getFullYear();
      const x = pad + ((year - minY) / Math.max(1, maxY - minY)) * (width - pad * 2);
      const y = height - pad - Math.sqrt(row.lot.cny / maxP) * (height - pad * 2);
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("cx", x.toFixed(1));
      dot.setAttribute("cy", y.toFixed(1));
      dot.setAttribute("r", row.outlier ? "5" : "4");
      dot.setAttribute("fill", row.outlier ? "#8d3b32" : "#2c6a4f");
      svg.appendChild(dot);
    });
    return svg;
  }

  showHome();
})();
