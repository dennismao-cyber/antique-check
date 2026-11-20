#!/usr/bin/env python3
"""Add public-domain Chinese ceramics from the Met and the Art Institute of Chicago.

Only objects with isPublicDomain / is_public_domain and a downloadable image are kept.
Questions are built with tools/build_bank.py, then Ming/Qing reign answers are folded
into the existing period-style buckets. Vague dynasty-only dates are not asked.
"""

import importlib.util
import json
import re
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path("/workspace")
CACHE = Path("/tmp/expand_cache")
CACHE.mkdir(exist_ok=True)

SPEC = importlib.util.spec_from_file_location("build_bank", ROOT / "tools" / "build_bank.py")
bb = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(bb)

# The expansion is here to add objects, not to keep the old per-answer caps.
bb.REIGN_CAP = 4000
for key in list(bb.CAPS):
    bb.CAPS[key] = 4000

API_HEADERS = {"User-Agent": "jianci-study/1.0 (educational catalog; contact local)"}
IMG_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Referer": "https://www.metmuseum.org/",
}

PERIOD = {
    "明洪武": "明早期", "明永乐": "明早期", "明宣德": "明早期",
    "明正统": "明早期", "明景泰": "明早期", "明天顺": "明早期",
    "明成化": "明中期", "明弘治": "明中期", "明正德": "明中期",
    "明嘉靖": "明晚期", "明隆庆": "明晚期", "明万历": "明晚期",
    "明天启": "明晚期", "明崇祯": "明晚期",
    "清顺治": "清早期", "清康熙": "清早期",
    "清雍正": "清中期", "清乾隆": "清中期", "清嘉庆": "清中期",
    "清道光": "清晚期", "清咸丰": "清晚期", "清同治": "清晚期",
    "清光绪": "清晚期", "清宣统": "清晚期",
}
PERIOD_NOTE = {
    "明早期": "明早期从洪武到宣德；正统、景泰、天顺只有著录落在这几年才归这里。",
    "明中期": "明中期是成化、弘治、正德。",
    "明晚期": "明晚期是嘉靖、隆庆、万历、天启、崇祯。",
    "清早期": "清早期是顺治、康熙。",
    "清中期": "清中期是雍正、乾隆、嘉庆。嘉庆仍沿雍乾的做法，所以算中期；从道光起才算清晚期。",
    "清晚期": "清晚期从道光起，包括咸丰、同治、光绪、宣统。",
}
PERIOD_OPTIONS = {
    "明": ["明早期", "明中期", "明晚期"],
    "清": ["清早期", "清中期", "清晚期"],
}
MAX_MET = 900


def get_json(url, data=None, headers=None, timeout=50, tries=4):
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers=headers or API_HEADERS)
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return json.load(response)
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(0.6 * (attempt + 1))
    raise last


def search_met(query):
    ids = []
    offset = 0
    total = None
    while True:
        url = (
            "https://collectionapi.metmuseum.org/public/collection/v1.1/search?"
            + urllib.parse.urlencode({
                "q": query,
                "departmentId": 6,
                "isPublicDomain": "true",
                "hasImages": "true",
                "offset": offset,
            })
        )
        payload = get_json(url)
        batch = payload.get("objectIDs") or []
        total = payload.get("total") or 0
        if not batch:
            break
        ids.extend(batch)
        offset += len(batch)
        print(f"  met search {query!r} {offset}/{total}", flush=True)
        if offset >= total:
            break
    return ids


_last_api = [0.0]
_api_lock = __import__("threading").Lock()


def fetch_met_object(oid):
    path = CACHE / f"met-{oid}.json"
    if path.exists() and path.stat().st_size > 40:
        try:
            return json.loads(path.read_text())
        except json.JSONDecodeError:
            path.unlink()
    url = f"https://collectionapi.metmuseum.org/public/collection/v1/objects/{oid}"
    # The object endpoint starts returning 403 if it is hit in a tight pool.
    with _api_lock:
        wait = 0.28 - (time.time() - _last_api[0])
        if wait > 0:
            time.sleep(wait)
        _last_api[0] = time.time()
    try:
        obj = get_json(url, tries=6)
    except Exception as exc:  # noqa: BLE001
        print("  miss", oid, type(exc).__name__, flush=True)
        return None
    path.write_text(json.dumps(obj))
    return obj


def chinese_ceramic(obj):
    if not obj or not obj.get("isPublicDomain") or not obj.get("primaryImage"):
        return False
    culture = (obj.get("culture") or "").strip()
    low = culture.lower()
    if "china" not in low:
        return False
    if low.startswith("japan") or low.startswith("korea") or low.startswith("vietnam"):
        return False
    title = obj.get("title") or ""
    if re.search(r"\b(fragment|shard|sherd|sagger)\b", title, re.I):
        return False
    medium = ((obj.get("medium") or "") + " " + (obj.get("classification") or "")).lower()
    if not any(word in medium for word in ("porcelain", "stoneware", "celadon")):
        return False
    if "earthenware" in medium and "porcelain" not in medium and "stoneware" not in medium:
        return False
    return True


def met_item(obj):
    oid = obj["objectID"]
    parts = [obj.get("culture") or "", obj.get("period") or "", obj.get("dynasty") or "", obj.get("reign") or "", obj.get("objectDate") or ""]
    culture = " | ".join(part for part in parts if part)
    title = obj.get("title") or "Ceramic"
    if re.search(r"\bmark\b", title, re.I) and not re.search(r"\bmark\b", culture, re.I):
        culture = culture + " | " + title
    accession = (obj.get("accessionNumber") or str(oid)).strip()
    images = [obj.get("primaryImage")] + list(obj.get("additionalImages") or [])
    images = [url for url in images if url]
    return {
        "acc": f"met-{oid}",
        "accession_display": accession,
        "title": title,
        "culture": culture,
        "tech": obj.get("medium") or "",
        "date": obj.get("objectDate") or "",
        "url": obj.get("objectURL") or f"https://www.metmuseum.org/art/collection/search/{oid}",
        "web": images[0],
        "extras": images[1:3],
        "desc": "",
        "dyk": "",
        "credit": "大都会艺术博物馆",
        "license": "CC0",
        "image": f"images/met-{oid}.jpg",
        "museum": "met",
    }


def fetch_aic():
    fields = [
        "id", "title", "image_id", "alt_image_ids", "date_display", "medium_display",
        "place_of_origin", "is_public_domain", "credit_line", "api_link",
        "main_reference_number",
    ]
    rows = []
    start = 0
    while True:
        body = json.dumps({
            "query": {"bool": {"must": [
                {"term": {"is_public_domain": True}},
                {"match": {"place_of_origin": "China"}},
                {"match": {"classification_title": "ceramic"}},
            ]}},
            "fields": fields,
            "limit": 100,
            "from": start,
        }).encode()
        payload = get_json(
            "https://api.artic.edu/api/v1/artworks/search",
            data=body,
            headers={**API_HEADERS, "Content-Type": "application/json"},
        )
        batch = payload.get("data") or []
        rows.extend(batch)
        total = payload["pagination"]["total"]
        start += len(batch)
        print(f"  aic {start}/{total}", flush=True)
        if not batch or start >= total:
            break
    return rows


def aic_item(row):
    medium = row.get("medium_display") or ""
    low = medium.lower()
    title = row.get("title") or ""
    if not row.get("is_public_domain") or not row.get("image_id"):
        return None
    if not any(word in low for word in ("porcelain", "stoneware", "celadon")):
        return None
    if re.search(r"\b(fragment|shard|sherd)\b", title, re.I):
        return None
    if "earthenware" in low and "porcelain" not in low and "stoneware" not in low:
        return None
    culture = "China | " + (row.get("date_display") or "")
    if re.search(r"\bmark\b", title + " " + medium, re.I):
        culture += " | " + title + " " + medium
    iid = row["id"]
    image_id = row["image_id"]
    extras = []
    for alt in (row.get("alt_image_ids") or [])[:2]:
        extras.append(f"https://www.artic.edu/iiif/2/{alt}/full/843,/0/default.jpg")
    accession = (row.get("main_reference_number") or str(iid)).strip()
    return {
        "acc": f"aic-{iid}",
        "accession_display": accession,
        "title": title,
        "culture": culture,
        "tech": medium,
        "date": row.get("date_display") or "",
        "url": f"https://www.artic.edu/artworks/{iid}",
        "web": f"https://www.artic.edu/iiif/2/{image_id}/full/843,/0/default.jpg",
        "extras": extras,
        "desc": "",
        "dyk": "",
        "credit": "芝加哥艺术博物馆",
        "license": "CC0",
        "image": f"images/aic-{iid}.jpg",
        "museum": "aic",
        "referer": "https://www.artic.edu/",
    }


def fold_period(question):
    if question["axis"] != "reign":
        return question
    answer = question["answer"]
    if answer in ("明", "清"):
        return None
    bucket = PERIOD.get(answer)
    if not bucket:
        return question
    question["answer"] = bucket
    question["options"] = PERIOD_OPTIONS[bucket[0]]
    short = answer[1:]
    question["prompt"] = "这件的时代风格属于哪一段？"
    question["note"] = f"著录年代是{short}，所以归入{bucket}。{PERIOD_NOTE[bucket]}"
    return question


def extra_auth(item):
    blob = (item["tech"] + " " + item["title"] + " " + item["culture"]).lower()
    explicit = any(token in blob for token in (
        "-type", "imitation", "in the style of", "style of", "reproduction", "copy of",
    ))
    if not explicit:
        return None
    if re.search(r"imitation\s+ru\b|ru-type|ru type", blob):
        kind, original = "仿汝", "北宋汝窑"
    elif re.search(r"imitation\s+guan\b|guan-type|guan type", blob):
        kind, original = "仿官", "南宋官窑"
    elif re.search(r"imitation\s+ge\b|ge-type|ge type", blob):
        kind, original = "仿哥", "宋哥窑"
    elif re.search(r"imitation\s+ding\b|ding-type|ding type", blob):
        kind, original = "仿定", "北宋定窑"
    elif re.search(r"imitation\s+jun\b|jun-type|jun type", blob):
        kind, original = "仿钧", "宋钧窑"
    else:
        return None
    modern = re.search(r"\b(20th|21st) century\b|modern reproduction|contemporary copy", blob)
    if modern:
        answer = "现代仿古"
        note = f"馆方把这件记成后期的{kind}，年代落到二十世纪或更晚，不当成古代原作。"
    else:
        reign = bb.reign_in(item["culture"])
        dynasty = bb.dynasty_of(item["culture"])
        if reign and (reign[1].startswith("明") or reign[1].startswith("清")):
            answer = reign[1] + kind
            note = f"馆方写成{kind}，著录年代是{reign[2]}，这是后期仿古，不是原窑原作。"
        elif dynasty in ("明", "清"):
            answer = dynasty + kind
            note = f"馆方写成{kind}，著录只到{dynasty}代，没有更细的年号。这是后期仿古，不是原窑原作。"
        else:
            return None
    return answer, [answer, original, "同时代真品原作"], note


def load_questions():
    bank = ROOT / "js" / "bank"
    files = list(bank.glob("*.js")) if bank.exists() else []
    if files:
        questions = []
        for path in sorted(files):
            text = path.read_text(encoding="utf-8")
            if "= [" not in text:
                continue
            questions.extend(json.loads(text[text.index("= [") + 2:].rstrip().rstrip(";")))
        if questions:
            return questions
    text = (ROOT / "js" / "questions.js").read_text(encoding="utf-8")
    return json.loads(text[text.index("["):].rstrip().rstrip(";"))


def load_views():
    text = (ROOT / "js" / "views.js").read_text(encoding="utf-8")
    return json.loads(text[text.index("{"):].rstrip().rstrip(";"))


def save_jpeg(data, dest):
    image = Image.open(BytesIO(data))
    image = image.convert("RGB")
    image.thumbnail((1100, 1100), Image.Resampling.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    image.save(dest, "JPEG", quality=74, optimize=True, progressive=True)


def download(url, dest, referer):
    if dest.exists() and dest.stat().st_size > 4000:
        return True
    headers = dict(IMG_HEADERS)
    headers["Referer"] = referer
    last = None
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=45) as response:
                data = response.read()
            if data[:2] != b"\xff\xd8" or len(data) < 4000:
                raise ValueError(f"not a jpeg ({len(data)} bytes)")
            save_jpeg(data, dest)
            return True
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(1.2 * (attempt + 1))
    print("  image fail", dest.name, last, flush=True)
    return False


def market_of(answers):
    blob = " ".join(answers)
    if "粉彩" in answers:
        return "fencai"
    if "青花" in answers:
        return "qinghua"
    if "仿汝" in blob:
        return "ru-type"
    return ""


def main():
    id_path = CACHE / "met-ids.json"
    if id_path.exists():
        ids = json.loads(id_path.read_text())
        print("loaded met ids", len(ids), flush=True)
    else:
        print("searching Met", flush=True)
        ids = []
        for query in ("porcelain", "celadon", "stoneware"):
            ids.extend(search_met(query))
        ids = list(dict.fromkeys(ids))
        id_path.write_text(json.dumps(ids))
        print("unique met ids", len(ids), flush=True)

    objects = []
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(fetch_met_object, oid) for oid in ids]
        done = 0
        for future in as_completed(futures):
            done += 1
            obj = future.result()
            if chinese_ceramic(obj):
                objects.append(obj)
            if done % 400 == 0:
                print(f"  fetched {done}/{len(ids)} chinese {len(objects)}", flush=True)
    print("chinese met ceramics", len(objects), flush=True)

    met_items = [met_item(obj) for obj in objects]
    aic_items = [item for item in (aic_item(row) for row in fetch_aic()) if item]
    print("aic kept", len(aic_items), flush=True)

    # Prefer multi-view and marked pieces when the Met set is larger than the cap.
    met_items.sort(key=lambda item: (
        0 if item["extras"] else 1,
        0 if re.search(r"\bmark\b", item["culture"], re.I) else 1,
        0 if bb.reign_in(item["culture"]) else 1,
        item["acc"],
    ))
    if len(met_items) > MAX_MET:
        print(f"capping met {len(met_items)} -> {MAX_MET}", flush=True)
        met_items = met_items[:MAX_MET]

    fresh = met_items + aic_items
    questions = []
    by_acc = {}
    for item in fresh:
        by_acc[item["acc"]] = item
        built = [fold_period(q) for q in bb.build_questions([item])]
        built = [q for q in built if q]
        if not any(q["axis"] == "auth" for q in built):
            auth = extra_auth(item)
            if auth:
                answer, options, note = auth
                questions_auth = bb.make_question(
                    item, "auth", answer, options,
                    "依著录，这件应当看作？",
                    note + "仿古题只收馆方自己写成 type、imitation 或 style of 的例子。",
                )
                built.append(questions_auth)
        questions.extend(built)
    print("new questions before images", len(questions), "objects", len({q["objectId"] for q in questions}), flush=True)

    # Download only objects that produced a question. One extra view when the museum published one.
    needed = {}
    for q in questions:
        needed.setdefault(q["objectId"], by_acc[q["objectId"]])
    print("downloading", len(needed), flush=True)
    ok = {}
    view_files = {}
    # Low concurrency: the Met image host rate-limits scripted downloads.
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {}
        for acc, item in needed.items():
            referer = item.get("referer") or "https://www.metmuseum.org/"
            dest = ROOT / item["image"]
            futures[pool.submit(download, item["web"], dest, referer)] = (acc, "main", None)
            if item["extras"]:
                extra = item["extras"][0]
                vdest = ROOT / "images" / "views" / f"{acc}-v0.jpg"
                futures[pool.submit(download, extra, vdest, referer)] = (acc, "extra", vdest)
        done = 0
        for future in as_completed(futures):
            acc, kind, dest = futures[future]
            done += 1
            good = future.result()
            if kind == "main":
                ok[acc] = good
            elif good:
                view_files.setdefault(acc, []).append(str(dest.relative_to(ROOT)))
            if done % 100 == 0:
                print(f"  images {done}/{len(futures)} mains {sum(ok.values())}", flush=True)

    questions = [q for q in questions if ok.get(q["objectId"])]
    print("new questions with images", len(questions), flush=True)

    existing = [
        q for q in load_questions()
        if not str(q.get("objectId", "")).startswith(("met-", "aic-"))
    ]
    for q in existing:
        q.setdefault("license", "CC0")
        q.setdefault("credit", "克利夫兰艺术博物馆")
    all_q = existing + questions
    grouped = defaultdict(list)
    for q in all_q:
        grouped[q["objectId"]].append(q["answer"])
    for q in all_q:
        q["market"] = market_of(grouped[q["objectId"]])

    # Accession strings are what the view switcher looks up. Avoid clashing with Cleveland numbers.
    views = load_views()
    used_accessions = {q["accession"] for q in existing}
    for q in questions:
        item = by_acc[q["objectId"]]
        accession = item["accession_display"]
        if accession in used_accessions or accession in views:
            accession = ("Met " if item["museum"] == "met" else "AIC ") + accession
        q["accession"] = accession
        used_accessions.add(accession)
    # Same object must share one accession after the collision check.
    # The loop above may prefix only the first question if later ones see it as used.
    # Recompute per object instead.
    used_accessions = {q["accession"] for q in existing}
    accession_for = {}
    for item in fresh:
        if not ok.get(item["acc"]):
            continue
        accession = item["accession_display"]
        if accession in used_accessions or accession in views or accession in accession_for.values():
            accession = ("Met " if item["museum"] == "met" else "AIC ") + item["accession_display"]
        accession_for[item["acc"]] = accession
        used_accessions.add(accession)
    for q in questions:
        q["accession"] = accession_for[q["objectId"]]

    for acc, files in view_files.items():
        if not ok.get(acc):
            continue
        key = accession_for[acc]
        entry = [{"src": by_acc[acc]["image"], "kind": "main", "label": "全器"}]
        for path in files:
            entry.append({"src": path, "kind": "other", "label": "其他角度"})
        views[key] = entry

    for q in questions:
        if q["answer"] not in q["options"] or len(set(q["options"])) != 3:
            raise SystemExit("bad options " + q["id"])

    counts = Counter(q["axis"] for q in all_q)
    ranks = Counter(q["rank"] for q in all_q)
    museums = Counter()
    for q in all_q:
        museums[q["credit"]] += 1
    print("TOTAL questions", len(all_q), "objects", len({q["objectId"] for q in all_q}))
    print("axes", dict(counts))
    print("ranks", dict(ranks))
    print("credits", dict(museums))
    print("views", len(views), "new multi", sum(1 for acc in view_files if ok.get(acc)))

    rank_files = {
        "学徒": "xuetu.js",
        "初级鉴定师": "chuji.js",
        "中级鉴定师": "zhongji.js",
        "高级鉴定师": "gaoji.js",
    }
    bank_dir = ROOT / "js" / "bank"
    bank_dir.mkdir(exist_ok=True)
    for rank, filename in rank_files.items():
        part = [q for q in all_q if q["rank"] == rank]
        body = "window.BANK_PARTS = window.BANK_PARTS || {};\n"
        body += "window.BANK_PARTS[" + json.dumps(rank, ensure_ascii=False) + "] = "
        body += json.dumps(part, ensure_ascii=False, separators=(",", ":"))
        body += ";\n"
        (bank_dir / filename).write_text(body, encoding="utf-8")
    (ROOT / "js" / "questions.js").write_text(
        "/* 题库按等级放在 js/bank/，进入对应等级时再打开。 */\n",
        encoding="utf-8",
    )
    (ROOT / "js" / "views.js").write_text(
        "const VIEWS = " + json.dumps(views, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    summary = {
        "questions": len(all_q),
        "objects": len({q["objectId"] for q in all_q}),
        "axes": dict(counts),
        "ranks": dict(ranks),
        "new_objects": len({q["objectId"] for q in questions}),
        "new_questions": len(questions),
        "met_objects": len({q["objectId"] for q in questions if q["objectId"].startswith("met-")}),
        "aic_objects": len({q["objectId"] for q in questions if q["objectId"].startswith("aic-")}),
        "auth": counts.get("auth", 0),
        "foot": counts.get("foot", 0),
    }
    (CACHE / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2))
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
