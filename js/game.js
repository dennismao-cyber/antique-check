(function () {
  const AXIS_LABEL = {
    kiln: "窑口",
    reign: "朝代",
    technique: "工艺",
    form: "器型",
  };

  const PLAN = [
    ["kiln", 3],
    ["reign", 3],
    ["technique", 3],
    ["form", 1],
  ];

  const app = document.querySelector("#app");
  let round = [];
  let index = 0;
  let locked = false;
  let score = 0;
  const tally = {};

  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function buildRound() {
    const groups = {};
    QUESTIONS.forEach(function (q) {
      if (!groups[q.axis]) groups[q.axis] = [];
      groups[q.axis].push(q);
    });
    const picked = [];
    PLAN.forEach(function (pair) {
      const axis = pair[0];
      const n = pair[1];
      const pool = groups[axis] || [];
      if (pool.length < n) {
        throw new Error("题库不足：" + axis);
      }
      picked.push.apply(picked, shuffle(pool).slice(0, n));
    });
    return shuffle(picked);
  }

  function rankFor(n) {
    if (n <= 3) {
      return {
        name: "学徒",
        line: "釉色刚刚入眼。先记住开片、紫斑和青花。",
      };
    }
    if (n <= 6) {
      return {
        name: "入室",
        line: "几件已经能分开。窑口和彩绘，再看几眼。",
      };
    }
    if (n <= 8) {
      return {
        name: "行家",
        line: "釉色、纹样和器型，已经对得上号。",
      };
    }
    if (n === 10) {
      return {
        name: "掌眼",
        line: "十件全中。这眼力，可以上场了。",
      };
    }
    return {
      name: "掌眼",
      line: "只差一件。再看足部、口沿和开片。",
    };
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function preload(src) {
    if (!src) return;
    const img = new Image();
    img.src = src;
  }

  function showStart() {
    app.replaceChildren();
    const screen = el("section", "screen screen-start");

    const hero = el("div", "hero");
    hero.appendChild(el("div", "seal", "鉴"));
    hero.appendChild(el("p", "eyebrow", "古董瓷器小识"));
    hero.appendChild(el("h1", "title", "鉴瓷"));
    hero.appendChild(
      el("p", "premise", "看一张照片，在三个答案里认出它。")
    );
    screen.appendChild(hero);

    const foot = el("div", "start-foot");
    const start = el("button", "primary", "开始鉴定");
    start.type = "button";
    start.addEventListener("click", startRound);
    foot.appendChild(start);
    foot.appendChild(el("p", "fine", "十题一局 · 馆藏真品 · 只练眼，不收藏"));
    screen.appendChild(foot);
    app.appendChild(screen);
  }

  function startRound() {
    round = buildRound();
    index = 0;
    score = 0;
    Object.keys(tally).forEach(function (k) {
      delete tally[k];
    });
    PLAN.forEach(function (pair) {
      tally[pair[0]] = { hit: 0, total: 0 };
    });
    showQuestion();
  }

  function showQuestion() {
    locked = false;
    const q = round[index];
    preload(round[index + 1] && round[index + 1].image);
    app.replaceChildren();

    const screen = el("section", "screen screen-q");

    const head = el("header", "q-head");
    const meta = el("div", "q-meta");
    meta.appendChild(el("span", "count", "第 " + (index + 1) + " / " + round.length + " 题"));
    meta.appendChild(el("span", "axis", AXIS_LABEL[q.axis]));
    head.appendChild(meta);
    const bar = el("div", "progress");
    const fill = el("span");
    fill.style.width = ((index / round.length) * 100).toFixed(2) + "%";
    bar.appendChild(fill);
    head.appendChild(bar);
    screen.appendChild(head);

    const frame = el("figure", "frame");
    const photo = el("div", "photo");
    const img = document.createElement("img");
    img.alt = q.name;
    function markReady() {
      photo.classList.add("is-ready");
    }
    img.addEventListener("load", markReady);
    img.src = q.image;
    if (img.complete && img.naturalWidth > 0) markReady();
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
      btn.addEventListener("click", function () {
        choose(q, label, options);
      });
      options.appendChild(btn);
    });
    screen.appendChild(options);

    const feedback = el("div", "feedback");
    feedback.hidden = true;
    feedback.appendChild(el("p", "note"));
    const next = el("button", "primary next", index === round.length - 1 ? "看结果" : "下一题");
    next.type = "button";
    next.addEventListener("click", advance);
    feedback.appendChild(next);
    screen.appendChild(feedback);

    app.appendChild(screen);
    window.scrollTo(0, 0);
  }

  function choose(q, label, options) {
    if (locked) return;
    locked = true;
    const ok = label === q.answer;
    tally[q.axis].total += 1;
    if (ok) {
      score += 1;
      tally[q.axis].hit += 1;
    }

    Array.prototype.forEach.call(options.children, function (btn) {
      const text = btn.querySelector(".opt-label").textContent;
      btn.disabled = true;
      if (text === q.answer) {
        btn.classList.add("is-correct");
        btn.querySelector(".mark").textContent = "正";
      } else if (text === label) {
        btn.classList.add("is-wrong");
        btn.querySelector(".mark").textContent = "误";
      } else {
        btn.classList.add("is-idle");
      }
    });

    const feedback = app.querySelector(".feedback");
    feedback.hidden = false;
    feedback.classList.add(ok ? "is-right" : "is-miss");
    const verdict = ok ? "看对了。" : "应是「" + q.answer + "」。";
    feedback.querySelector(".note").textContent = verdict + q.note;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    feedback.querySelector(".next").scrollIntoView({
      behavior: motion ? "auto" : "smooth",
      block: "nearest",
    });
  }

  function advance() {
    index += 1;
    if (index >= round.length) showResult();
    else showQuestion();
  }

  function showResult() {
    const rank = rankFor(score);
    app.replaceChildren();
    const screen = el("section", "screen screen-end");

    const hero = el("div", "hero");
    hero.appendChild(el("p", "eyebrow", "本局眼力"));
    hero.appendChild(el("h2", "rank", rank.name));
    const scoreLine = el("p", "score");
    scoreLine.appendChild(el("strong", null, String(score)));
    scoreLine.appendChild(el("span", null, " / " + round.length));
    hero.appendChild(scoreLine);
    hero.appendChild(el("p", "flavor", rank.line));
    screen.appendChild(hero);

    const list = el("ul", "breakdown");
    PLAN.forEach(function (pair) {
      const axis = pair[0];
      const row = tally[axis];
      const li = el("li");
      li.appendChild(el("span", null, AXIS_LABEL[axis]));
      li.appendChild(el("b", null, row.hit + " / " + row.total));
      list.appendChild(li);
    });
    screen.appendChild(list);

    const again = el("button", "primary", "再鉴一次");
    again.type = "button";
    again.addEventListener("click", startRound);
    screen.appendChild(again);
    screen.appendChild(el("p", "fine", "同一题库，每次抽十件，顺序都会换。"));
    app.appendChild(screen);
    window.scrollTo(0, 0);
  }

  showStart();
})();
