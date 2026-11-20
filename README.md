# 鉴瓷

看一张馆藏瓷器的照片，在三个答案里认出它。十题一局，当场见分晓。

不登录，没有服务器。朝代、窑口、工艺、器型混在一局里，每题只问一件事。

## 怎么打开

用浏览器直接打开 `index.html` 即可。

也可以在本目录起一个本地静态服务：

```bash
python3 -m http.server 8080
```

然后访问 `http://localhost:8080`。

手机竖屏是主布局，桌面浏览器里会收成一条窄案。

## 怎么玩

1. 开始页点「开始鉴定」。
2. 每题一张真品照片、一句提问、三个选项。选项顺序和题目顺序每次都会重排。
3. 选定之后，标出正确答案和你的选择，并给一句看得见的线索。
4. 十题结束，给出分数和眼力等级：学徒、入室、行家、掌眼。
5. 「再鉴一次」会重新抽题。

每一局固定抽 **10** 题，而且一定混有这四类：

| 类型 | 每局题数 | 题库 |
| --- | --- | --- |
| 窑口 | 3 | 7 |
| 朝代 / 年号 | 3 | 6 |
| 工艺 / 品种 | 3 | 5 |
| 器型 | 1 | 2 |

三个选项永远是同一种类。不会把「汝窑」和「粉彩」放在同一题里。

## 图片与许可

二十件器物全部来自 [克利夫兰艺术博物馆 Open Access](https://www.clevelandart.org/open-access)。馆方以 [CC0](https://creativecommons.org/publicdomain/zero/1.0/) 发布这些公有领域藏品的图像和数据，可以下载、分享、改作，不必另行申请。

本仓库里的 `images/` 是馆方 print 级 JPEG 缩小后的版本（长边 1600 像素），方便网页加载。没有使用生成图，也没有外链图片。

界面字体是 [Noto Serif SC](https://fonts.google.com/noto/specimen/Noto+Serif+SC) 与 [Noto Sans SC](https://fonts.google.com/noto/specimen/Noto+Sans+SC) 的子集，许可为 SIL Open Font License。

## 题库

答案和说明都按该馆公开著录写。年代含糊的器物（例如德化观音记为明清之际，五彩盖罐记为十七世纪）只问窑口或工艺，不问朝代。说明只讲照片里看得到、且与著录一致的一点：釉、开片、纹样、口沿或轮廓。

器型题里的玉壶春瓶，馆藏英文名是 Pear-Shaped Vase，没有另给中文器型名。喇叭口、细颈、垂腹，在「梅瓶 / 玉壶春瓶 / 天球瓶」里对应玉壶春瓶。

| 馆藏号 | 问法 | 答案 | 著录 |
| --- | --- | --- | --- |
| 1957.40 | 窑口 | 汝窑 | [天青釉笔洗](https://clevelandart.org/art/1957.40) |
| 1957.48 | 窑口 | 官窑 | [青釉开片盆](https://clevelandart.org/art/1957.48) |
| 1957.36 | 窑口 | 钧窑 | [蓝釉紫斑盖罐](https://clevelandart.org/art/1957.36) |
| 1929.995 | 窑口 | 定窑 | [白釉刻花碗](https://clevelandart.org/art/1929.995) |
| 1957.52 | 窑口 | 龙泉窑 | [青釉梅瓶](https://clevelandart.org/art/1957.52) |
| 1950.579 | 窑口 | 德化窑 | [南海观音](https://clevelandart.org/art/1950.579) |
| 1948.206 | 窑口 | 建窑 | [兔毫盏](https://clevelandart.org/art/1948.206) |
| 1962.154 | 朝代 | 元 | [青花狮耳大罐](https://clevelandart.org/art/1962.154) |
| 1917.13 | 朝代 | 明嘉靖 | [青花人物故事罐](https://clevelandart.org/art/1917.13) |
| 1942.668.2 | 朝代 | 清康熙 | [豇豆红莲瓣瓶](https://clevelandart.org/art/1942.668.2) |
| 1944.190 | 朝代 | 清雍正 | [粉青釉双龙尊](https://clevelandart.org/art/1944.190) |
| 1971.145 | 朝代 | 清乾隆 | [珐琅彩锦鸡花卉蒜头瓶](https://clevelandart.org/art/1971.145) |
| 2020.189 | 朝代 | 元 | [青白釉刻龙梅瓶](https://clevelandart.org/art/2020.189) |
| 1957.61 | 工艺 | 斗彩 | [斗彩婴戏杯](https://clevelandart.org/art/1957.61) |
| 1964.201 | 工艺 | 粉彩 | [粉彩花卉碗](https://clevelandart.org/art/1964.201) |
| 2020.179 | 工艺 | 五彩 | [五彩盖罐](https://clevelandart.org/art/2020.179) |
| 1989.314 | 工艺 | 釉里红 | [釉里红龙纹梅瓶](https://clevelandart.org/art/1989.314) |
| 1964.222 | 工艺 | 单色釉 | [洪武红釉碗](https://clevelandart.org/art/1964.222) |
| 1942.716 | 器型 | 梅瓶 | [珐华莲纹梅瓶](https://clevelandart.org/art/1942.716) |
| 1942.727 | 器型 | 玉壶春瓶 | [青花梨形瓶](https://clevelandart.org/art/1942.727) |

人物故事罐用的是馆方不带木座的 alternate 照片（`1917.13_alt0`），避免座子抢画面。
