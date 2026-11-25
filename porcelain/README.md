# 瓷器日报

手机上读的国外中国瓷器拍卖摘要。页面在本目录，网站根目录的鉴瓷游戏不动。

公开地址：`https://dennismao-cyber.github.io/antique-check/porcelain/`

本地看：在仓库根目录执行 `python3 -m http.server 8080`，打开 `http://localhost:8080/porcelain/`。

## 页面读什么

`data/index.json` 指出最新一天。`data/YYYY-MM-DD.json` 是那天的专场、拍品、价格和图片相对路径。图片在 `images/YYYY-MM-DD/`，是下载后缩小的 JPEG，不外链拍卖行原图。

价格字段 `kind`：

| kind | 页面上的字 | 含义 |
| --- | --- | --- |
| `estimate` | 估价 | 拍卖行公开的 Estimate，不是起拍价 |
| `starting` | 起拍价 | 只有原文写明起拍价时才用 |
| `unverified` | 待核实 | 表格里标了还没核到 |
| `unknown` | 未公布、已结束或成交 | 没有可标的估价区间 |

## 换一天的数据

把新的表格放在任意路径，在仓库根目录执行：

```bash
python3 tools/build_porcelain_digest.py \
  --xlsx /path/to/chinese-porcelain-auctions-YYYY-MM-DD.xlsx \
  --date YYYY-MM-DD
```

脚本会：

1. 读四个工作表：`专场汇总`、`苏富比NY瓷器拍品`、`其他专场瓷器亮点`、`网站扫描状态`。
2. 写成 `porcelain/data/YYYY-MM-DD.json`，并把 `porcelain/data/index.json` 的 `latest` 指到这一天。旧的日期还留在 `days` 里，页面上能切回去。
3. 能打开的图录会下载图片，缩到最长边 720 像素的 JPEG，放进 `porcelain/images/YYYY-MM-DD/`。

苏富比专场走公开接口，按拍品号对上表格。佳士得专场页能读到的瓷器精选会写入估价。邦瀚斯会优先走拍品列表/拍品页的 `__NEXT_DATA__` 下主图；仍打不开的站点只保留文字和官方链接，页面上写「图未取到」。图片都缩成最长边 720 的本地 JPEG，不外链原图。

已经下过图、只改表格文字时可以加 `--skip-fetch`。同名的 `lot-编号.jpg`、`highlight-*.jpg` 和 `cover.jpg` 会继续挂上，不会重新访问拍卖行。

不跑脚本也可以：按同一份 JSON 结构放进 `data/`，改 `index.json` 的 `latest`，图片路径相对 `porcelain/`。前端不用改。

依赖：`python3`、`openpyxl`、`Pillow`。

## 图片来源

页面上的拍品图来自各拍卖行公开图录，仅用于本日报跟拍备忘，不是本站原创。点进拍品可回到拍卖行页面。
