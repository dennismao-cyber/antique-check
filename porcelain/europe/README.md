# 欧洲筛选日报

把《欧洲筛选日报》做成可在手机上翻的网页，和旁边的瓷器日报同一套阅读方式：先看图片和估价，再点进拍行原页。

本目录是 `porcelain/` 的姊妹页，不会覆盖中国瓷器日报。

本地看：在仓库根目录执行 `python3 -m http.server 8080`，打开 `http://localhost:8080/porcelain/europe/`。

## 这一天读什么

`data/index.json` 指出最新一天。`data/YYYY-MM-DD.json` 是那天的新入选拍品、72 小时提醒、拍行和关注分。图片在 `images/YYYY-MM-DD/`，从当日 PDF 日报里抽出的图录照片，不外链拍卖行原图。每件都保留官方“原拍品页面”链接。

价格一律标成「估价」，只有原文写明起拍价时才改用「起拍价」。本日报没有起拍价字段。灰色人民币金额是估价按 CFETS 中间价换算，不含买家佣金、运费和税费。

关注分 0–10 只用来排序，不是估值，也不是鉴定。入选门槛是 2 分；外销瓷不列入。

## 换一天的数据

把新的 PDF 放到任意路径，在仓库根目录（需已安装 PyMuPDF 的 Python）执行：

```bash
python3 tools/build_europe_digest.py \
  --pdf /path/to/欧洲筛选日报-YYYY-MM-DD.pdf \
  --out porcelain/europe
```

脚本会解析拍品文字、拼接被换行断开的官方链接、抽出图片，写成 `data/YYYY-MM-DD.json`。日期目前写在脚本里的生成信息中，换日时要一并核对。

依赖：`python3`、`PyMuPDF`（`pymupdf`）。
