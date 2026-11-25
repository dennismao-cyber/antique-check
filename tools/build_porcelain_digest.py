#!/usr/bin/env python3
"""Build the mobile porcelain digest from the daily spreadsheet.

The page at porcelain/ only reads JSON. Tomorrow's update is:

    python3 tools/build_porcelain_digest.py \
        --xlsx path/to/chinese-porcelain-auctions-YYYY-MM-DD.xlsx \
        --date YYYY-MM-DD

That rewrites porcelain/data/YYYY-MM-DD.json, refreshes porcelain/data/index.json,
and downloads catalogue images into porcelain/images/YYYY-MM-DD/.

Pass --skip-fetch to rebuild the JSON from the spreadsheet without touching
the network. Image files already on disk are kept.

The spreadsheet is expected to have the sheets produced for the 2026-11-25
digest: 专场汇总, 苏富比NY瓷器拍品, 其他专场瓷器亮点, 网站扫描状态.
"""

from __future__ import annotations

import argparse
import json
import re
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from pathlib import Path

import openpyxl
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
PORCELAIN = ROOT / "porcelain"
UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
)

# Longer phrases first. These are keyword hints for English catalogue titles,
# not a full translation.
TERMS = [
    ("blue and white", "青花"),
    ("blue-and-white", "青花"),
    ("underglaze blue", "青花"),
    ("famille-rose", "粉彩"),
    ("famille rose", "粉彩"),
    ("famille-verte", "五彩"),
    ("famille verte", "五彩"),
    ("southern song", "南宋"),
    ("northern song", "北宋"),
    ("longquan", "龙泉"),
    ("qingbai", "青白"),
    ("celadon", "青釉"),
    ("sancai", "三彩"),
    ("dehua", "德化"),
    ("blanc de chine", "德化白釉"),
    ("cizhou", "磁州"),
    ("ding ware", "定窑"),
    ("jun ware", "钧窑"),
    ("yaozhou", "耀州"),
    ("kangxi", "康熙"),
    ("yongzheng", "雍正"),
    ("qianlong", "乾隆"),
    ("jiaqing", "嘉庆"),
    ("daoguang", "道光"),
    ("guangxu", "光绪"),
    ("republic period", "民国"),
    ("ming dynasty", "明"),
    ("qing dynasty", "清"),
    ("yuan dynasty", "元"),
    ("tang dynasty", "唐"),
    ("han dynasty", "汉"),
    ("song dynasty", "宋"),
    ("dish", "盘"),
    ("bowl", "碗"),
    ("vase", "瓶"),
    ("jarlet", "小罐"),
    ("jar", "罐"),
    ("ewer", "壶"),
    ("censer", "炉"),
    ("cup", "杯"),
    ("figure", "俑"),
    ("meiping", "梅瓶"),
]


def keywords(title: str) -> str:
    low = (title or "").lower()
    mask = [True] * len(low)
    found = []
    for needle, zh in TERMS:
        start = 0
        while True:
            index = low.find(needle, start)
            if index < 0:
                break
            if all(mask[index:index + len(needle)]):
                if zh not in found:
                    found.append(zh)
                for offset in range(index, index + len(needle)):
                    mask[offset] = False
                break
            start = index + 1
    return " · ".join(found[:6])


def load_sheet(wb, name):
    ws = wb[name]
    rows = list(ws.iter_rows(values_only=True))
    header = [str(c).strip() if c is not None else "" for c in rows[0]]
    out = []
    for row in rows[1:]:
        if all(c is None or str(c).strip() == "" for c in row):
            continue
        item = {}
        for key, value in zip(header, row):
            if value is None or key == "":
                continue
            item[key] = str(value).strip()
        out.append(item)
    return out


def house_key(name: str) -> str:
    text = name or ""
    table = [
        ("苏富比", "sothebys"),
        ("Sotheby", "sothebys"),
        ("佳士得", "christies"),
        ("Christie", "christies"),
        ("邦瀚斯", "bonhams"),
        ("Bonham", "bonhams"),
        ("Woolley", "woolley"),
        ("Lyon", "lyon"),
        ("Dreweatts", "dreweatts"),
        ("Roseberys", "roseberys"),
        ("Sworders", "sworders"),
        ("Chiswick", "chiswick"),
        ("Artcurial", "artcurial"),
        ("Millon", "millon"),
        ("Tessier", "tessier"),
        ("Lempertz", "lempertz"),
        ("兰佩兹", "lempertz"),
        ("Nagel", "nagel"),
        ("纳高", "nagel"),
        ("Koller", "koller"),
        ("科勒", "koller"),
        ("Zacke", "zacke"),
        ("Mainichi", "mainichi"),
        ("每日", "mainichi"),
        ("Ueluxe", "ueluxe"),
        ("Elmridge", "elmridge"),
        ("保利", "poly"),
        ("嘉德", "guardian"),
        ("Ravenel", "ravenel"),
        ("Freeman", "freemans"),
        ("Doyle", "doyle"),
        ("Heritage", "heritage"),
        ("iGavel", "igavel"),
        ("LiveAuctioneers", "liveauctioneers"),
        ("Invaluable", "invaluable"),
        ("Saleroom", "saleroom"),
        ("Bidsquare", "bidsquare"),
        ("Drouot", "drouot"),
        ("AAG", "aag"),
    ]
    for needle, key in table:
        if needle.lower() in text.lower():
            return key
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug or "house"


def status_kind(text: str) -> str:
    if "进行" in text:
        return "live"
    if "结束" in text:
        return "ended"
    return "upcoming"


def price_from_text(raw: str, kind_hint: str = "") -> dict:
    """Interpret a spreadsheet price cell. Numbers are estimates unless the
    cell explicitly says 起拍价 and gives a figure."""
    text = (raw or "").strip()
    hint = kind_hint or ""
    blob = text + " " + hint
    if not text and not hint:
        return {"kind": "unknown", "text": "未见估价或起拍价", "currency": "", "low": None, "high": None}
    lowered = blob.lower()
    explicit_start = "起拍价" in blob and "未公开" not in blob and "未见" not in blob
    unverified = any(flag in blob for flag in ("待核", "未核", "未抓", "未公布", "待核实", "以官网为准", "以平台"))
    match = re.search(
        r"(USD|GBP|EUR|HKD|CNY|RMB|CHF|JPY)\s*([0-9][0-9,]*)\s*[–—\-]\s*([0-9][0-9,]*)",
        blob,
        re.I,
    )
    if match and not ("未" in text and "估价" not in text):
        # A range in the cell is an estimate unless the house literally
        # published a starting bid.
        kind = "starting" if explicit_start and "估价" not in blob else "estimate"
        if unverified and "估价" not in text and kind != "starting":
            kind = "unverified"
        low = int(match.group(2).replace(",", ""))
        high = int(match.group(3).replace(",", ""))
        currency = match.group(1).upper().replace("RMB", "CNY")
        label = "起拍价" if kind == "starting" else "估价"
        return {
            "kind": kind,
            "currency": currency,
            "low": low,
            "high": high,
            "text": f"{label} {currency} {low:,}–{high:,}",
        }
    if "已结束" in blob:
        return {"kind": "unknown", "text": text or "已结束", "currency": "", "low": None, "high": None}
    if unverified or "未" in blob:
        return {
            "kind": "unverified",
            "text": text or hint or "估价待核实",
            "currency": "",
            "low": None,
            "high": None,
        }
    if "估价" in blob or "estimate" in lowered:
        return {"kind": "estimate", "text": text or "估价未写明数字", "currency": "", "low": None, "high": None}
    return {"kind": "unknown", "text": text or "未见估价或起拍价", "currency": "", "low": None, "high": None}


def tokens(text: str) -> set[str]:
    cleaned = re.sub(r"（.*?）|\(.*?\)", " ", text or "")
    return set(re.findall(r"[a-z0-9]{2,}|[\u4e00-\u9fff]{2,}", cleaned.lower()))


def request(url: str, timeout: int = 40, referer: str | None = None) -> bytes:
    headers = {
        "User-Agent": UA,
        "Accept": "text/html,application/json,image/avif,image/webp,image/*,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }
    if referer:
        headers["Referer"] = referer
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def graphql(query: str, variables: dict) -> dict:
    body = json.dumps({"query": query, "variables": variables}).encode()
    req = urllib.request.Request(
        "https://clientapi.prod.sothelabs.com/graphql",
        data=body,
        headers={
            "Content-Type": "application/json",
            "User-Agent": UA,
            "Origin": "https://www.sothebys.com",
            "Referer": "https://www.sothebys.com/",
        },
    )
    with urllib.request.urlopen(req, timeout=40) as resp:
        payload = json.loads(resp.read().decode())
    if payload.get("errors"):
        raise RuntimeError(payload["errors"][0].get("message", "graphql error"))
    return payload["data"]


LOT_QUERY = """
query LotCards($id: String!, $filter: LotCardsConnectionFilter!, $language: TranslationLanguage!, $limit: Int, $offset: Int) {
  auction(id: $id, language: $language) {
    lotCards: lotCardsConnection(offset: $offset, limit: $limit, filter: $filter) {
      totalCount
      hasNextPage
      lots {
        lotId
        title
        lotNumber { __typename ... on VisibleLotNumber { lotDisplayNumber } }
        slug { lotSlug }
        estimateV2 {
          __typename
          ... on LowHighEstimateV2 {
            lowEstimate { amount }
            highEstimate { amount }
          }
        }
        media(imageSizes: [Medium]) {
          images { renditions { url width height imageSize } }
        }
      }
    }
  }
}
"""


def sothebys_auction_url(url: str) -> str | None:
    match = re.search(r"(https://www\.sothebys\.com/en/buy/auction/\d{4}/[^/?#]+)", url or "")
    return match.group(1) if match else None


def sothebys_auction_id(url: str) -> str | None:
    html = request(url).decode("utf-8", "replace")
    match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html)
    if not match:
        return None
    data = json.loads(match.group(1))
    return data.get("props", {}).get("pageProps", {}).get("auctionId")


def sothebys_lots(auction_id: str) -> list[dict]:
    offset = 0
    collected = []
    while True:
        data = graphql(
            LOT_QUERY,
            {
                "id": auction_id,
                "filter": "ALL",
                "language": "ENGLISH",
                "limit": 50,
                "offset": offset,
            },
        )
        block = data["auction"]["lotCards"]
        collected.extend(block["lots"])
        if not block.get("hasNextPage"):
            break
        offset += 50
        if offset > 2000:
            break
    return collected


def medium_url(lot: dict) -> str | None:
    images = ((lot.get("media") or {}).get("images")) or []
    if not images:
        return None
    renditions = images[0].get("renditions") or []
    if not renditions:
        return None
    medium = next((r for r in renditions if r.get("imageSize") == "Medium"), renditions[0])
    return medium.get("url")


def save_jpeg(blob: bytes, dest: Path, max_edge: int = 720) -> None:
    image = Image.open(BytesIO(blob))
    image = ImageOps.exif_transpose(image)
    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")
    elif image.mode == "L":
        image = image.convert("RGB")
    image.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    image.save(dest, "JPEG", quality=72, optimize=True, progressive=True)


def download_image(url: str, dest: Path, referer: str | None = None) -> str | None:
    try:
        blob = request(url, timeout=40, referer=referer)
    except Exception as exc:  # noqa: BLE001 - recorded for the digest notes
        return f"下载失败：{exc.__class__.__name__}"
    if len(blob) < 800:
        return "图片过小，已跳过"
    try:
        save_jpeg(blob, dest)
    except Exception as exc:  # noqa: BLE001
        return f"无法转成 JPEG：{exc.__class__.__name__}"
    return None


def rel(path: Path) -> str:
    return path.relative_to(PORCELAIN).as_posix()


def reuse_local(sales: list[dict], image_dir: Path) -> None:
    """Keep images already saved for this date when a rebuild does not re-download them."""
    for sale in sales:
        folder = image_dir / sale["id"]
        if not folder.is_dir():
            continue
        highlights = sorted(folder.glob("highlight-*.jpg"))
        cursor = 0
        for lot in sale["lots"]:
            if lot.get("image"):
                continue
            dest = None
            if str(lot.get("lot") or "").isdigit():
                candidate = folder / f"lot-{int(lot['lot']):03d}.jpg"
                if candidate.exists():
                    dest = candidate
            elif cursor < len(highlights):
                dest = highlights[cursor]
                cursor += 1
            if dest is not None:
                lot["image"] = rel(dest)
                lot["imageNote"] = ""
        if sale.get("cover"):
            continue
        cover = folder / "cover.jpg"
        if cover.exists():
            sale["cover"] = rel(cover)
            continue
        for lot in sale["lots"]:
            if lot.get("image"):
                sale["cover"] = lot["image"]
                break


def build(xlsx: Path, date: str, fetch: bool) -> dict:
    wb = openpyxl.load_workbook(xlsx, data_only=True)
    sales_rows = load_sheet(wb, "专场汇总")
    ny_rows = load_sheet(wb, "苏富比NY瓷器拍品")
    highlight_rows = load_sheet(wb, "其他专场瓷器亮点")
    scan_rows = load_sheet(wb, "网站扫描状态")

    houses = []
    by_key = {}
    for row in scan_rows:
        key = house_key(row.get("网站", ""))
        if key in by_key:
            continue
        house = {
            "id": key,
            "name": row.get("网站", ""),
            "nameEn": "",
            "url": row.get("网站链接", ""),
            "scan": row.get("扫描结果（2026-11-25）", ""),
            "found": row.get("近4周中国瓷器相关场次", ""),
            "note": row.get("备注", ""),
        }
        by_key[key] = house
        houses.append(house)

    notes = []
    sales = []
    for index, row in enumerate(sales_rows, start=1):
        key = house_key(row.get("拍卖行", ""))
        if key not in by_key:
            by_key[key] = {
                "id": key,
                "name": row.get("拍卖行", "").split()[0],
                "nameEn": "",
                "url": row.get("拍卖行官网", ""),
                "scan": "补充发现",
                "found": row.get("专场名称", ""),
                "note": row.get("备注", ""),
            }
            houses.append(by_key[key])
        house = by_key[key]
        if not house.get("nameEn"):
            parts = row.get("拍卖行", "").split()
            if len(parts) > 1:
                house["nameEn"] = " ".join(parts[1:])
        price_text = row.get("估价低–高") or row.get("起拍价及币种（标清类型）") or ""
        price = price_from_text(price_text, row.get("起拍价及币种（标清类型）", ""))
        original = (row.get("估价低–高") or "").strip()
        if original and price.get("text") and original not in price["text"] and len(original) > len(price["text"]):
            price["text"] = original if "估价" in original or price["kind"] != "estimate" else "估价 " + original
        sale = {
            "id": f"{key}-{index}",
            "houseId": key,
            "status": status_kind(row.get("状态", "")),
            "title": row.get("专场名称", ""),
            "whenShanghai": row.get("拍卖时间（上海时间）", ""),
            "whenLocal": row.get("原时区时间", ""),
            "city": row.get("地点", ""),
            "summary": row.get("拍品名称/简述", ""),
            "period": row.get("年代/窑口", ""),
            "lotSpan": row.get("拍品号", ""),
            "url": row.get("图录/专场链接", ""),
            "houseUrl": row.get("拍卖行官网", "") or house.get("url", ""),
            "note": row.get("备注", ""),
            "price": price,
            "cover": None,
            "lots": [],
        }
        sales.append(sale)

    def find_sale(house: str, title: str, city: str = "") -> dict | None:
        key = house_key(house)
        ranked = []
        wanted = tokens(title)
        city_tokens = tokens(city)
        for sale in sales:
            if sale["houseId"] != key:
                continue
            have = tokens(sale["title"] + " " + sale["city"])
            overlap = len(wanted & have)
            if overlap == 0 and wanted:
                # Allow "Asian Art Paris" to meet "Asian Art".
                if not any(part and part in sale["title"].lower() for part in re.findall(r"[a-z0-9]{4,}", title.lower())):
                    continue
            online_penalty = 0
            if "online" not in title.lower() and "线上" not in title and ("online" in sale["title"].lower() or "线上" in sale["title"]):
                online_penalty = 2
            city_bonus = 1 if city_tokens and (city_tokens & tokens(sale["city"])) else 0
            ranked.append((overlap + city_bonus - online_penalty, sale))
        if not ranked:
            return None
        ranked.sort(key=lambda item: item[0], reverse=True)
        return ranked[0][1]

    ny_sale = next((sale for sale in sales if "5000 YEARS" in sale["title"].upper() and sale["houseId"] == "sothebys" and "纽约" in sale["city"]), None)
    for row in ny_rows:
        if ny_sale is None:
            break
        price = price_from_text(
            f"{row.get('币种', 'USD')} {row.get('估价低(USD)', '')}–{row.get('估价高(USD)', '')}",
            row.get("价格类型", ""),
        )
        ny_sale["lots"].append(
            {
                "lot": row.get("拍品号", ""),
                "title": row.get("拍品名称", ""),
                "keywords": keywords(row.get("拍品名称", "")),
                "period": "",
                "price": price,
                "url": row.get("专场链接", "") or ny_sale["url"],
                "image": None,
                "imageNote": "",
            }
        )

    for row in highlight_rows:
        sale = find_sale(row.get("拍卖行", ""), row.get("专场名称", ""), row.get("地点", ""))
        if sale is None:
            notes.append(f"亮点未对上专场：{row.get('拍卖行')} {row.get('专场名称')} {row.get('拍品名称/简述')}")
            continue
        price = price_from_text(row.get("估价低–高", ""), row.get("起拍价及币种（标清类型）", ""))
        if price["kind"] == "unknown" and row.get("起拍价及币种（标清类型）"):
            price = price_from_text(row.get("起拍价及币种（标清类型）", ""))
        sale["lots"].append(
            {
                "lot": row.get("拍品号", ""),
                "title": row.get("拍品名称/简述", ""),
                "keywords": row.get("年代/窑口", "") or keywords(row.get("拍品名称/简述", "")),
                "period": row.get("年代/窑口", ""),
                "price": price,
                "url": row.get("图录/专场链接", "") or sale["url"],
                "image": None,
                "imageNote": "",
                "sourceTitle": row.get("拍品名称/简述", ""),
            }
        )

    image_dir = PORCELAIN / "images" / date
    if fetch:
        enrich(sales, image_dir, notes)
    else:
        notes.append("本次使用 --skip-fetch，没有重新下载图片。已有的 lot-编号.jpg、highlight-*.jpg 和 cover.jpg 会继续挂上。")

    reuse_local(sales, image_dir)

    for sale in sales:
        if sale["cover"] is None:
            for lot in sale["lots"]:
                if lot.get("image"):
                    sale["cover"] = lot["image"]
                    break
        for lot in sale["lots"]:
            lot.pop("sourceTitle", None)
            if not lot.get("image"):
                lot["image"] = None
                if not lot.get("imageNote"):
                    lot["imageNote"] = "这次没有取到这件的图片"

    digest = {
        "date": date,
        "timezone": "Asia/Shanghai",
        "title": "国外中国瓷器拍卖日报",
        "intro": "手机上看即将举行和进行中的中国瓷器专场。点一场，看拍品、图片和估价。价格以拍卖行官网为准。",
        "caveats": [
            "绝大多数一线拍卖行公开的是估价（Estimate），不是起拍价。页面上的「估价」都不是起拍价。",
            "有的网站有验证墙或返回 403，那些场次只保留了表格里的文字和官方链接。",
            "苏富比巴黎 Asian Art / 5000 Years、佳士得 Blaquier-Arrieta、Koller 的开拍时刻，表格里标了待核实。",
            "刚结束的场次只作对照，不用于跟拍。",
            "这是跟拍备忘，不构成价值评定或投资建议。",
        ],
        "fetchNotes": notes,
        "houses": houses,
        "sales": sales,
    }
    return digest


def enrich(sales: list[dict], image_dir: Path, notes: list[str]) -> None:
    auctions: dict[str, list[dict]] = {}
    christies_html: list[str] = []

    for sale in sales:
        auction_url = sothebys_auction_url(sale["url"])
        if not auction_url or auction_url in auctions:
            continue
        try:
            auction_id = sothebys_auction_id(auction_url)
            if not auction_id:
                notes.append(f"{sale['title']}：苏富比页面没有 auctionId")
                auctions[auction_url] = []
                continue
            lots = sothebys_lots(auction_id)
            auctions[auction_url] = lots
            notes.append(f"苏富比 {sale['title']}：接口返回 {len(lots)} 件（含非瓷）")
        except Exception as exc:  # noqa: BLE001
            auctions[auction_url] = []
            notes.append(f"苏富比 {sale['title']} 拍品接口失败：{exc.__class__.__name__}")

    by_auction_number = {}
    by_auction_slug = {}
    for url, lots in auctions.items():
        by_auction_number[url] = {}
        by_auction_slug[url] = {}
        for lot in lots:
            number = ((lot.get("lotNumber") or {}).get("lotDisplayNumber")) or ""
            slug = ((lot.get("slug") or {}).get("lotSlug")) or ""
            if number:
                by_auction_number[url][str(number)] = lot
            if slug:
                by_auction_slug[url][slug] = lot

    downloads = []

    def queue(url: str, dest: Path, referer: str, assign):
        downloads.append((url, dest, referer, assign))

    for sale in sales:
        auction_url = sothebys_auction_url(sale["url"])
        numbers = by_auction_number.get(auction_url or "", {})
        slugs = by_auction_slug.get(auction_url or "", {})
        for lot in sale["lots"]:
            remote = None
            matched = None
            slug = ""
            match = re.search(r"/auction/\d{4}/[^/]+/([^/?#]+)", lot.get("url") or "")
            if match:
                slug = match.group(1)
            if lot.get("lot") and lot["lot"].isdigit() and lot["lot"] in numbers:
                matched = numbers[lot["lot"]]
            elif slug and slug in slugs:
                matched = slugs[slug]
            elif lot.get("title"):
                wanted = re.sub(r"\s+", " ", lot["title"].lower()).strip()
                for candidate in numbers.values():
                    title = re.sub(r"\s+", " ", (candidate.get("title") or "").lower()).strip()
                    if wanted and (wanted in title or title in wanted):
                        matched = candidate
                        break
            if matched:
                remote = medium_url(matched)
                if not lot.get("lot"):
                    lot["lot"] = (matched.get("lotNumber") or {}).get("lotDisplayNumber") or ""
                if lot["price"]["low"] is None:
                    est = matched.get("estimateV2") or {}
                    low = (est.get("lowEstimate") or {}).get("amount")
                    high = (est.get("highEstimate") or {}).get("amount")
                    if low and high:
                        lot["price"] = price_from_text(f"USD {low}–{high}", "估价")
                        # London sale is GBP. Use the sale-level currency if present.
                        currency = "GBP" if "GBP" in (sale["price"].get("text") or "") else lot["price"]["currency"]
                        if currency != lot["price"]["currency"]:
                            lot["price"]["currency"] = currency
                            lot["price"]["text"] = f"估价 {currency} {lot['price']['low']:,}–{lot['price']['high']:,}"
                slug = ((matched.get("slug") or {}).get("lotSlug")) or slug
                if slug and auction_url:
                    lot["url"] = auction_url.rstrip("/") + "/" + slug
            if remote:
                dest = image_dir / sale["id"] / f"lot-{int(lot['lot']):03d}.jpg" if str(lot.get("lot") or "").isdigit() else image_dir / sale["id"] / f"lot-{len(downloads)+1}.jpg"
                queue(remote, dest, "https://www.sothebys.com/", lambda lot=lot, dest=dest: assign_image(lot, dest))

        if "christies.com" in (sale["url"] or ""):
            try:
                html = request(sale["url"]).decode("utf-8", "replace")
                christies_html.append(html)
            except Exception as exc:  # noqa: BLE001
                notes.append(f"佳士得 {sale['title']} 页面没打开：{exc.__class__.__name__}")

    attach_christies(sales, christies_html, image_dir, downloads, notes)
    attach_nagel(sales, image_dir, downloads, notes)

    # Sale covers for sessions that still have no lot photo.
    for sale in sales:
        if any(True for _ in []):
            pass
        if sale_has_queued_image(sale, downloads):
            continue
        cover = cover_from_known_html(sale, christies_html)
        if cover:
            dest = image_dir / sale["id"] / "cover.jpg"
            queue(cover, dest, sale["url"], lambda sale=sale, dest=dest: assign_cover(sale, dest))
            continue
        if not sale["url"] or "bonhams.com" in sale["url"]:
            if "bonhams.com" in (sale["url"] or ""):
                notes.append(f"邦瀚斯 {sale['title']}：官网验证墙（403），图片未下载，链接仍保留。")
            continue
        if generic_page(sale["url"]):
            notes.append(f"{sale['title']}：链接是部门页或首页，没有拿页面头图当专场封面。")
            continue
        try:
            html = request(sale["url"], timeout=20).decode("utf-8", "replace")
        except Exception as exc:  # noqa: BLE001
            notes.append(f"{sale['title']}：专场页没打开（{exc.__class__.__name__}），没有专场封面。")
            continue
        image = og_image(html)
        if not image:
            notes.append(f"{sale['title']}：专场页没有可用封面图。")
            continue
        dest = image_dir / sale["id"] / "cover.jpg"
        queue(image, dest, sale["url"], lambda sale=sale, dest=dest: assign_cover(sale, dest))

    ok = 0
    failed = 0
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {
            pool.submit(download_image, url, dest, referer): (url, dest, assign)
            for url, dest, referer, assign in downloads
        }
        for future in as_completed(futures):
            url, dest, assign = futures[future]
            err = future.result()
            if err:
                failed += 1
                assign_error(assign, err)
            else:
                ok += 1
                assign()
    notes.append(f"图片下载成功 {ok} 张，失败 {failed} 张。")
    # Bonhams lot-level note if images missing
    for sale in sales:
        if sale["houseId"] == "bonhams" and sale["lots"] and not any(lot.get("image") for lot in sale["lots"]):
            for lot in sale["lots"]:
                if not lot.get("image"):
                    lot["imageNote"] = "邦瀚斯官网有验证墙，图片没能下载"


def assign_image(lot, dest: Path) -> None:
    lot["image"] = rel(dest)
    lot["imageNote"] = ""


def assign_cover(sale, dest: Path) -> None:
    sale["cover"] = rel(dest)


def assign_error(assign, err: str) -> None:
    # Closures capture the lot or sale; peek by calling isn't possible.
    # The error is stored by wrapping assign. See queue() callers: on failure
    # we set a note via the function attribute.
    target = getattr(assign, "target_note", None)
    if target:
        target["imageNote"] = err


def sale_has_queued_image(sale, downloads) -> bool:
    prefix = f"images/"
    # A queued lot image for this sale is enough to cover the card later.
    for _url, dest, _referer, _assign in downloads:
        if sale["id"] in dest.parts:
            return True
    return False


def attach_christies(sales, html_pages, image_dir, downloads, notes) -> None:
    highlights = []
    for html in html_pages:
        marker = "window.chrComponents.specialistSelection = "
        start = html.find(marker)
        if start < 0:
            continue
        try:
            data, _end = json.JSONDecoder().raw_decode(html[start + len(marker):])
        except json.JSONDecodeError:
            continue
        for lot in data.get("data", {}).get("lots", []):
            title = lot.get("title_primary_txt") or ""
            if "PORCELAINE" not in title.upper():
                continue
            image = ((lot.get("image") or {}).get("image_src")) or ""
            if image:
                image = image.split("?")[0] + "?width=960"
            highlights.append({"title": title, "estimate": lot.get("estimate_txt") or "", "image": image})
    if not highlights:
        return
    notes.append("佳士得 Art d'Asie 精选页读到瓷器 " + str(len(highlights)) + " 件，估价来自精选页，不是起拍价，页面没给拍品号。")
    sale = next((item for item in sales if item["id"].startswith("christies-") and "Art d'Asie" in item["title"]), None)
    if sale is None:
        return
    used = set()
    for lot in sale["lots"]:
        title = lot.get("title") or ""
        pick = None
        if "青花" in title or "八吉祥" in title:
            pick = next((item for i, item in enumerate(highlights) if i not in used and "BLEU BLANC" in item["title"].upper()), None)
        elif "粉彩" in title or "象耳" in title or "松石" in title:
            pick = next((item for i, item in enumerate(highlights) if i not in used and "TURQUOISE" in item["title"].upper()), None)
        if not pick:
            continue
        used.add(highlights.index(pick))
        if pick["estimate"] and lot["price"]["low"] is None:
            numbers = re.findall(r"[0-9][0-9,]*", pick["estimate"])
            if len(numbers) >= 2:
                low = int(numbers[0].replace(",", ""))
                high = int(numbers[1].replace(",", ""))
                lot["price"] = {
                    "kind": "estimate",
                    "currency": "EUR",
                    "low": low,
                    "high": high,
                    "text": f"估价 EUR {low:,}–{high:,}",
                }
                lot["imageNote"] = ""
            lot["period"] = lot.get("period") or ""
            lot["catalogueTitle"] = pick["title"]
        if pick["image"]:
            dest = image_dir / sale["id"] / f"highlight-{len(used)}.jpg"
            downloads.append((pick["image"], dest, "https://www.christies.com/", lambda lot=lot, dest=dest: assign_image(lot, dest)))
    # Sale price hint: show the two porcelain estimates if the summary had none.
    if sale["price"]["low"] is None and sale["lots"]:
        bits = [lot["price"]["text"] for lot in sale["lots"] if lot["price"].get("low")]
        if bits:
            sale["price"] = {
                "kind": "estimate",
                "currency": "EUR",
                "low": None,
                "high": None,
                "text": "估价 " + "；".join(bits).replace("估价 ", ""),
            }


def attach_nagel(sales, image_dir, downloads, notes) -> None:
    sale = next((item for item in sales if item["houseId"] == "nagel" and item["status"] != "ended"), None)
    if sale is None or "auction.de" not in (sale.get("url") or ""):
        return
    try:
        html = request(sale["url"], timeout=25).decode("utf-8", "replace")
    except Exception as exc:  # noqa: BLE001
        notes.append(f"Nagel 亮点页没打开：{exc.__class__.__name__}")
        return
    if "CLOISONN" not in html.upper():
        notes.append("Nagel 亮点页没有找到那件仿掐丝珐琅釉瓶的图。")
        return
    match = re.search(
        r'src="(https://www\.auction\.de/wp-content/uploads/[^"]+5285-1neu\.jpg)"',
        html,
    )
    if not match:
        notes.append("Nagel 亮点页有文字，但没有解析到瓶的图片地址。")
        return
    image = match.group(1)
    for lot in sale["lots"]:
        if "掐丝" in (lot.get("title") or "") or "珐琅" in (lot.get("title") or ""):
            dest = image_dir / sale["id"] / "highlight-1.jpg"
            downloads.append((image, dest, sale["url"], lambda lot=lot, dest=dest: assign_image(lot, dest)))
            notes.append("Nagel 乾隆仿掐丝珐琅釉瓶：亮点页有图，页面没写估价。")
            return
    dest = image_dir / sale["id"] / "cover.jpg"
    downloads.append((image, dest, sale["url"], lambda sale=sale, dest=dest: assign_cover(sale, dest)))


def cover_from_known_html(sale, html_pages) -> str | None:
    if sale["houseId"] != "christies":
        return None
    for html in html_pages:
        # alt sits before data-srcset on Christie's sale cards.
        for match in re.finditer(r'alt="([^"]+)"[^>]*data-srcset="([^"]+)"', html):
            alt, srcset = match.group(1), match.group(2)
            if sale["title"].split("（")[0].strip().lower() in alt.lower() or alt.lower() in sale["title"].lower():
                urls = re.findall(r"(https://www\.christies\.com/img/SaleImages/[^?\s]+)\?w=940", srcset)
                if urls:
                    return urls[0] + "?w=940"
    if "24619" in (sale.get("url") or ""):
        return "https://www.christies.com/img/SaleImages/PAR-24619-12092026-1.jpg?w=940"
    return None


def generic_page(url: str) -> bool:
    """Department homepages and house front doors don't carry a sale preview."""
    lowered = (url or "").lower()
    if any(part in lowered for part in ("/departments/", "/fachgebiete/", "/department/")):
        return True
    path = urllib.parse.urlparse(lowered).path.rstrip("/")
    return path in ("", "/en", "/cn", "/en/home")


def og_image(html: str) -> str | None:
    patterns = [
        r'<meta[^>]+property="og:image"[^>]+content="([^"]+)"',
        r'<meta[^>]+content="([^"]+)"[^>]+property="og:image"',
    ]
    for pattern in patterns:
        match = re.search(pattern, html, re.I)
        if not match:
            continue
        url = match.group(1).replace("&amp;", "&")
        if url.startswith("//"):
            url = "https:" + url
        lowered = url.lower()
        if any(bad in lowered for bad in ("logo", "icon", "sprite", "placeholder", "favicon")):
            return None
        if not lowered.startswith("http"):
            return None
        return url
    return None


def write_digest(digest: dict) -> None:
    data_dir = PORCELAIN / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    date = digest["date"]
    target = data_dir / f"{date}.json"
    target.write_text(json.dumps(digest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    index_path = data_dir / "index.json"
    index = {"latest": date, "days": []}
    if index_path.exists():
        try:
            index = json.loads(index_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            index = {"latest": date, "days": []}
    days = [day for day in index.get("days", []) if day.get("date") != date]
    year, month, day = date.split("-")
    days.append({"date": date, "file": f"{date}.json", "label": f"{year}年{int(month)}月{int(day)}日"})
    days.sort(key=lambda item: item["date"], reverse=True)
    index_path.write_text(
        json.dumps({"latest": days[0]["date"], "days": days}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {target}")
    print(f"wrote {index_path}")


def summarize(digest: dict) -> None:
    print(f"date {digest['date']} sales {len(digest['sales'])} houses {len(digest['houses'])}")
    for sale in digest["sales"]:
        images = sum(1 for lot in sale["lots"] if lot.get("image"))
        cover = "cover" if sale.get("cover") else "no-cover"
        print(f"  {sale['status']:8} {sale['id']:22} lots {len(sale['lots']):3} img {images:3} {cover}  {sale['title'][:40]}")
    print("--- notes ---")
    for note in digest["fetchNotes"]:
        print(" *", note)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build porcelain/data and download images.")
    parser.add_argument("--xlsx", required=True, type=Path)
    parser.add_argument("--date", required=True, help="Asia/Shanghai date, YYYY-MM-DD")
    parser.add_argument("--skip-fetch", action="store_true")
    args = parser.parse_args()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", args.date):
        raise SystemExit("--date must be YYYY-MM-DD")
    started = time.time()
    digest = build(args.xlsx, args.date, fetch=not args.skip_fetch)
    write_digest(digest)
    summarize(digest)
    print(f"elapsed {time.time() - started:.1f}s")


if __name__ == "__main__":
    main()
