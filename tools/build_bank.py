#!/usr/bin/env python3
"""Build js/questions.js from the Cleveland Museum of Art open-access API.

Only emits a question when the museum record states the answer unambiguously.
Hand-checked notes in /tmp/overrides.json replace generated copy for the
original twenty objects.
"""

import hashlib
import html
import json
import os
import random
import re
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path("/workspace")
IMG_DIR = ROOT / "images"
CACHE = Path("/tmp/cma_full.json")
OVERRIDES = Path("/tmp/overrides.json")

REIGNS = [
    ("hongwu", "明洪武", "洪武"),
    ("yongle", "明永乐", "永乐"),
    ("xuande", "明宣德", "宣德"),
    ("chenghua", "明成化", "成化"),
    ("hongzhi", "明弘治", "弘治"),
    ("zhengde", "明正德", "正德"),
    ("jiajing", "明嘉靖", "嘉靖"),
    ("longqing", "明隆庆", "隆庆"),
    ("wanli", "明万历", "万历"),
    ("tianqi", "明天启", "天启"),
    ("chongzhen", "明崇祯", "崇祯"),
    ("shunzhi", "清顺治", "顺治"),
    ("kangxi", "清康熙", "康熙"),
    ("yongzheng", "清雍正", "雍正"),
    ("qianlong", "清乾隆", "乾隆"),
    ("jiaqing", "清嘉庆", "嘉庆"),
    ("daoguang", "清道光", "道光"),
    ("xianfeng", "清咸丰", "咸丰"),
    ("tongzhi", "清同治", "同治"),
    ("guangxu", "清光绪", "光绪"),
    ("xuantong", "清宣统", "宣统"),
]

KILN_RULES = [
    ("ru-type", None),
    ("guan-type", None),
    ("ge-type", None),
    ("ru ware", "汝窑"),
    ("guan ware", "官窑"),
    ("ge ware", "哥窑"),
    ("jun ware", "钧窑"),
    ("ding ware", "定窑"),
    ("longquan", "龙泉窑"),
    ("dehua", "德化窑"),
    ("jian ware", "建窑"),
    ("cizhou", "磁州窑"),
    ("yaozhou", "耀州窑"),
    ("jizhou", "吉州窑"),
    ("yue ware", "越窑"),
    ("jingdezhen", "景德镇窑"),
]

WARE_RULES = [
    ("falangcai", "珐琅彩"),
    ("doucai", "斗彩"),
    ("docai", "斗彩"),
    ("famille rose", "粉彩"),
    ("wucai", "五彩"),
    ("famille verte", "五彩"),
    ("famille-verte", "五彩"),
    ("peach bloom", "豇豆红"),
    ("peach-bloom", "豇豆红"),
    ("underglaze red", "釉里红"),
    ("painted in underglaze red", "釉里红"),
    ("copper-red glaze", "红釉"),
    ("copper red glaze", "红釉"),
    ("monochrome red", "红釉"),
    ("sang de boeuf", "红釉"),
    ("yellow glaze", "黄釉"),
    ("monochrome yellow", "黄釉"),
    ("qingbai", "青白瓷"),
    ("blue-white", "青白瓷"),
    ("bluish-white", "青白瓷"),
    ("underglaze blue", "青花"),
    ("blue and white", "青花"),
    ("blue-and-white", "青花"),
    ("celadon", "青釉"),
    ("green-glazed", "青釉"),
    ("green glaze", "青釉"),
    ("black glaze", "黑釉"),
    ("hare", "黑釉"),
    ("white porcelain", "白瓷"),
    ("white glaze", "白瓷"),
    ("cream-glazed", "白瓷"),
]

DECOR_RULES = [
    ("pierced", "镂空"),
    ("openwork", "镂空"),
    ("applied", "贴塑"),
    ("molded", "印花"),
    ("moulded", "印花"),
    ("incised", "刻花"),
    ("carved", "刻花"),
    ("slip", "化妆土"),
    ("overglaze enamel", "釉上彩"),
    ("famille rose", "釉上彩"),
    ("famille verte", "釉上彩"),
    ("wucai", "釉上彩"),
    ("enameled", "釉上彩"),
    ("enamelled", "釉上彩"),
    ("underglaze", "釉下彩"),
]

FORM_RULES = [
    (r"meiping|prunus vase", "梅瓶"),
    (r"stem cup", "高足杯"),
    (r"snuff bottle", "鼻烟壶"),
    (r"incense burner|censer", "香炉"),
    (r"brush pot", "笔筒"),
    (r"brush washer|\bwasher\b", "洗"),
    (r"\bpillow\b", "枕"),
    (r"\bewer\b", "执壶"),
    (r"\bamphora\b", "尊"),
    (r"tea\s?bowl", "盏"),
    (r"\bcup\b", "杯"),
    (r"\bbowl\b", "碗"),
    (r"\b(dish|plate|charger|saucer)\b", "盘"),
    (r"\bjar\b", "罐"),
    (r"\b(vase|bottle)\b", "瓶"),
]

CAPS = {
    ("kiln", "景德镇窑"): 70,
    ("ware", "青花"): 80,
    ("ware", "青釉"): 40,
    ("ware", "白瓷"): 30,
    ("ware", "五彩"): 30,
    ("ware", "粉彩"): 30,
    ("decor", "釉下彩"): 70,
    ("decor", "釉上彩"): 45,
    ("decor", "刻花"): 30,
    ("decor", "印花"): 25,
    ("form", "碗"): 22,
    ("form", "盘"): 22,
    ("form", "罐"): 22,
    ("form", "杯"): 14,
    ("form", "瓶"): 22,
    ("form", "盏"): 12,
    ("form", "洗"): 10,
}

REIGN_CAP = 28

KILN_POOL = ["汝窑", "官窑", "哥窑", "钧窑", "定窑", "龙泉窑", "德化窑", "建窑", "磁州窑", "耀州窑", "吉州窑", "景德镇窑", "越窑"]
WARE_POOL = ["青花", "釉里红", "斗彩", "五彩", "粉彩", "珐琅彩", "青釉", "青白瓷", "白瓷", "红釉", "黄釉", "豇豆红", "黑釉"]
DECOR_POOL = ["釉下彩", "釉上彩", "刻花", "印花", "贴塑", "镂空", "化妆土"]
FORM_POOL = ["梅瓶", "玉壶春瓶", "天球瓶", "高足杯", "执壶", "碗", "盘", "罐", "杯", "瓶", "盏", "枕", "尊", "香炉", "笔筒", "洗", "鼻烟壶"]
DYNASTY_POOL = ["唐", "五代", "北宋", "南宋", "金", "元", "明", "清"]
FOOT_POOL = ["支钉支烧", "圈足无釉", "器底满釉", "砂底无釉"]

AXIS_RANK = {
    "mark": "学徒",
    "decor": "学徒",
    "ware": "初级鉴定师",
    "kiln": "初级鉴定师",
    "reign": "中级鉴定师",
    "form": "中级鉴定师",
    "foot": "高级鉴定师",
    "auth": "高级鉴定师",
}


def strip_html(value):
    text = re.sub(r"<[^>]+>", " ", value or "")
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def stable_choice(salt, pool, answer, n=2):
    choices = [item for item in pool if item != answer]
    rng = random.Random(salt)
    rng.shuffle(choices)
    return choices[:n]


def reign_in(culture):
    low = culture.lower()
    if re.search(r"apocryphal|spurious", low):
        return None
    found = [row for row in REIGNS if re.search(r"\b" + row[0] + r"\b", low)]
    if len(found) != 1:
        return None
    return found[0]


def dynasty_of(culture):
    low = culture.lower()
    if " or " in low:
        return None
    if low.count("dynasty") > 1:
        return None
    if "northern song" in low and "southern song" in low:
        return None
    if "northern song" in low:
        return "北宋"
    if "southern song" in low:
        return "南宋"
    if re.search(r"\bsong dynasty\b", low):
        return None
    if "five dynasties" in low:
        return "五代"
    if re.search(r"\btang dynasty\b", low):
        return "唐"
    if re.search(r"\bjin dynasty\b", low) and "1115" in low:
        return "金"
    if re.search(r"\byuan dynasty\b", low):
        return "元"
    if re.search(r"\bming dynasty\b", low):
        return "明"
    if re.search(r"\bqing dynasty\b", low):
        return "清"
    return None


def date_label(item):
    reign = reign_in(item["culture"])
    if reign:
        return reign[1]
    return dynasty_of(item["culture"])


def kiln_of(item):
    blob = (item["tech"] + " " + item["culture"]).lower()
    for needle, label in KILN_RULES:
        if needle in blob:
            return label
    return None


def ware_of(item):
    blob = (item["tech"] + " " + item["title"]).lower()
    # copper-red glaze is a monochrome, not painted underglaze red
    if "copper-red glaze" in blob or "copper red glaze" in blob:
        return "红釉"
    for needle, label in WARE_RULES:
        if needle in blob:
            if needle == "underglaze red" and "glaze" in blob and "painted" not in blob and "decoration" not in blob:
                continue
            return label
    return None


def decor_of(item):
    blob = item["tech"].lower()
    for needle, label in DECOR_RULES:
        if needle in blob:
            return label
    return None


def form_of(title):
    if re.search(r"shard|fragment|sagger|group of|set of|pair of", title, re.I):
        return None
    for pattern, label in FORM_RULES:
        if re.search(pattern, title, re.I):
            return label
    return None


def skip_object(item):
    title = item["title"]
    tech = (item["tech"] or "").lower()
    if not item.get("web"):
        return True
    if re.search(r"\((lid|cover|stopper|stand)\)|shard|fragment|sagger", title, re.I):
        return True
    if "earthenware" in tech or re.search(r"\bpottery\b|terracotta", tech):
        return True
    return False


def foot_of(item):
    text = strip_html(item["desc"] + " " + item["dyk"])
    low = text.lower()
    if re.search(r"similar to this|fragments of|compare", low):
        # The sentence is about other pieces, not this object's foot.
        low_self = re.sub(r".{0,80}(similar to this|fragments of).{0,120}", " ", low)
    else:
        low_self = low
    if "spur" not in low_self:
        return None
    # Require the spur phrase to sit on this object, not a comparison shard.
    window = re.search(r".{0,90}spur.{0,90}", text, re.I)
    if not window:
        return None
    snippet = window.group(0).lower()
    if any(word in snippet for word in ("similar", "fragment", "compare", "excavated")):
        return None
    return ("支钉支烧", "著录写明这件底部有支钉痕，是支钉支烧留下的。")


def auth_of(item):
    tech = (item["tech"] or "").lower()
    culture = item["culture"]
    reign = reign_in(culture)
    if "guan-type" in tech and reign and reign[1] == "清雍正":
        return (
            "清雍正仿官",
            ["清雍正仿官", "南宋官窑", "北宋汝窑"],
            "工艺栏写的是仿官釉（Guan-type），年代是雍正，不是南宋官窑原作。",
        )
    if "ge-type" in tech and reign and reign[1] == "清乾隆":
        return (
            "清乾隆仿哥",
            ["清乾隆仿哥", "宋哥窑", "南宋官窑"],
            "工艺栏写的是仿哥釉（Ge-type），年代是乾隆，不是宋代哥窑原作。",
        )
    return None


def object_name(form, axis):
    if axis == "form":
        return "这件器物"
    if form:
        return form
    return "馆藏瓷器"


def make_question(item, axis, answer, options, prompt, note):
    acc = item["acc"]
    form = form_of(item["title"])
    return {
        "id": f"{acc}-{axis}",
        "objectId": acc,
        "axis": axis,
        "rank": AXIS_RANK[axis],
        "image": item.get("image") or f"images/{acc}.jpg",
        "name": object_name(form, axis),
        "credit": item.get("credit") or "克利夫兰艺术博物馆",
        "license": item.get("license") or "CC0",
        "accession": item.get("accession_display") or acc,
        "source": item["url"] or f"https://clevelandart.org/art/{acc}",
        "prompt": prompt,
        "answer": answer,
        "options": options,
        "note": note,
        "recordDate": item["date"],
    }


def build_questions(items):
    questions = []
    used = Counter()

    def allow(axis, answer):
        if axis == "reign" and answer in DYNASTY_POOL:
            key = ("reign", answer)
            cap = 36
        elif axis == "reign":
            key = ("reign", answer)
            cap = REIGN_CAP
        else:
            key = (axis, answer)
            cap = CAPS.get(key)
        if cap is not None and used[key] >= cap:
            return False
        used[key] += 1
        return True

    for item in items:
        if skip_object(item):
            continue
        acc = item["acc"]
        culture = item["culture"]

        reign = reign_in(culture)
        if reign and re.search(r"\bmark\b", culture, re.I):
            answer = reign[2] + "款"
            pool = [row[2] + "款" for row in REIGNS]
            distractors = stable_choice(acc + "mark", pool, answer)
            if len(distractors) == 2 and allow("mark", answer):
                questions.append(make_question(
                    item, "mark", answer, [answer] + distractors,
                    "著录里的年款是哪一种？",
                    f"馆藏年代栏写明带{answer}。年款多半写在圈足内，全器照片经常拍不到底，识款要以著录或底足为准。",
                ))

        decor = decor_of(item)
        if decor:
            distractors = stable_choice(acc + "decor", DECOR_POOL, decor)
            if len(distractors) == 2 and allow("decor", decor):
                questions.append(make_question(
                    item, "decor", decor, [decor] + distractors,
                    "这件的主要装饰手法是？",
                    f"馆藏工艺栏对应的手法是{decor}。手法和品种不是一回事：手法看刻、印、釉下或釉上，品种才是青花、粉彩这一类。",
                ))

        ware = ware_of(item)
        if ware:
            distractors = stable_choice(acc + "ware", WARE_POOL, ware)
            if len(distractors) == 2 and allow("ware", ware):
                questions.append(make_question(
                    item, "ware", ware, [ware] + distractors,
                    "这件属于哪一品种？",
                    f"按馆藏工艺栏，这件的品种是{ware}。选项里的其他品种是相近门类，用来对照，不是著录里的写法。",
                ))

        kiln = kiln_of(item)
        if kiln:
            distractors = stable_choice(acc + "kiln", KILN_POOL, kiln)
            if len(distractors) == 2 and allow("kiln", kiln):
                questions.append(make_question(
                    item, "kiln", kiln, [kiln] + distractors,
                    "这件出自哪一窑口？",
                    f"馆藏把窑口记为{kiln}。同色的邻窑放在选项里，是为了把窑口分开，不是改著录。",
                ))

        when = date_label(item)
        if when:
            if when in DYNASTY_POOL:
                pool = DYNASTY_POOL
            else:
                prefix = when[:1]
                pool = [row[1] for row in REIGNS if row[1].startswith(prefix)] or [row[1] for row in REIGNS]
            distractors = stable_choice(acc + "reign", pool, when)
            if len(distractors) == 2 and allow("reign", when):
                questions.append(make_question(
                    item, "reign", when, [when] + distractors,
                    "著录里的年代是？",
                    f"馆藏著录的年代是{when}" + (f"（{item['date']}）" if item["date"] else "") + "。跨代或写了“或”的记录没有拿来出题。",
                ))

        form = form_of(item["title"])
        if form:
            distractors = stable_choice(acc + "form", FORM_POOL, form)
            if len(distractors) == 2 and allow("form", form):
                questions.append(make_question(
                    item, "form", form, [form] + distractors,
                    "这件是哪种器型？",
                    f"馆藏品名对应的器型是{form}。先看口、颈、肩和腹，再对器型名。",
                ))

        foot = foot_of(item)
        if foot:
            answer, fact = foot
            distractors = ["垫饼烧、无支钉", "底足包金属扣"]
            questions.append(make_question(
                item, "foot", answer, [answer] + distractors,
                "著录里的底足是哪一种？",
                fact + "这张多半不是底足特写，高级题以馆方写下的底足为准，不把没拍到的部位说成看得见。",
            ))

        auth = auth_of(item)
        if auth:
            answer, options, note = auth
            questions.append(make_question(
                item, "auth", answer, options,
                "依著录，这件应当看作？",
                note + "仿古题只收馆方自己写成 type / 仿釉的例子。",
            ))

    return questions


def apply_overrides(questions):
    if not OVERRIDES.exists():
        return questions
    raw = json.loads(OVERRIDES.read_text())
    index = {(q["accession"], q["axis"]): q for q in questions}
    axis_map = {"technique": "ware"}
    for old in raw:
        axis = axis_map.get(old["axis"], old["axis"])
        key = (old["id"], axis)
        note = old["note"]
        if key in index:
            q = index[key]
            q["prompt"] = old["prompt"]
            q["answer"] = old["answer"]
            q["options"] = old["options"]
            q["note"] = note
            q["name"] = old["name"]
            q["handChecked"] = True
        else:
            # keep the hand-checked question even if a cap skipped it
            q = {
                "id": f"{old['id']}-{axis}",
                "objectId": old["id"],
                "axis": axis,
                "rank": AXIS_RANK[axis],
                "image": old["image"],
                "name": old["name"],
                "credit": old["credit"],
                "accession": old["id"],
                "source": old["source"],
                "prompt": old["prompt"],
                "answer": old["answer"],
                "options": old["options"],
                "note": note,
                "recordDate": "",
                "handChecked": True,
            }
            questions.append(q)
            index[key] = q
    return questions


def fetch_image(acc, url):
    dest = IMG_DIR / f"{acc}.jpg"
    if dest.exists() and dest.stat().st_size > 8000:
        return acc, "kept"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 jianci"})
    with urllib.request.urlopen(req, timeout=60) as response:
        data = response.read()
    image = Image.open(BytesIO(data)).convert("RGB")
    image.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
    image.save(dest, "JPEG", quality=76, optimize=True, progressive=True)
    return acc, "saved"


def main():
    items = json.loads(CACHE.read_text())
    by_acc = {item["acc"]: item for item in items}
    questions = apply_overrides(build_questions(items))
    # drop questions whose image URL is missing
    kept = []
    for q in questions:
        item = by_acc.get(q["accession"])
        if item and item.get("web"):
            kept.append(q)
        elif (IMG_DIR / f"{q['accession']}.jpg").exists():
            kept.append(q)
    questions = kept
    # validate
    for q in questions:
        if q["answer"] not in q["options"] or len(q["options"]) != 3:
            raise SystemExit("bad options " + q["id"])
        if len(set(q["options"])) != 3:
            raise SystemExit("dup options " + q["id"])
    counts = Counter(q["axis"] for q in questions)
    ranks = Counter(q["rank"] for q in questions)
    objects = len({q["accession"] for q in questions})
    print("questions", len(questions), "objects", objects)
    print("axes", dict(counts))
    print("ranks", dict(ranks))

    needed = {}
    for q in questions:
        item = by_acc.get(q["accession"])
        if item and item.get("web"):
            needed[q["accession"]] = item["web"]
    IMG_DIR.mkdir(exist_ok=True)
    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = [pool.submit(fetch_image, acc, url) for acc, url in needed.items()]
        saved = 0
        for future in as_completed(futures):
            acc, status = future.result()
            if status == "saved":
                saved += 1
    print("downloaded", saved, "of", len(needed))

    payload = {
        "source": "Cleveland Museum of Art Open Access, CC0",
        "questions": len(questions),
        "objects": objects,
        "axes": dict(counts),
        "ranks": dict(ranks),
    }
    text = "/* Generated by tools/build_bank.py from Cleveland Open Access (CC0).\n"
    text += json.dumps(payload, ensure_ascii=False, indent=2) + "\n*/\n"
    text += "const QUESTIONS = "
    text += json.dumps(questions, ensure_ascii=False, separators=(",", ":"))
    text += ";\n"
    (ROOT / "js" / "questions.js").write_text(text)
    print("wrote", ROOT / "js" / "questions.js", "bytes", (ROOT / "js" / "questions.js").stat().st_size)


if __name__ == "__main__":
    main()
