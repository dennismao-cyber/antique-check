/* 市场指导估价用的成交记录。
   每一条都对着拍卖行自己的成交页核对过，不收估价、不收流拍。
   佳士得用页面上的 Price realised，邦瀚斯用 Sold for … inc. premium，都是含买方佣金的成交价。
   人民币按世界银行当年官方汇率年均价 PA.NUS.FCRF（本币兑美元）折算。
   苏富比、保利、嘉德、中汉这次没有逐条核到可引用的官方成交页，所以不编进表里。 */
const MARKET = {
  asOf: "2026-11-20",
  priceKind: "含买方佣金的成交价",
  fxSource: "世界银行官方汇率年均价 PA.NUS.FCRF（本币兑美元）",
  fxNote: "人民币金额 = 原币金额 ÷ 当年该币兑美元年均价 × 当年人民币兑美元年均价。美元则直接乘当年人民币兑美元年均价。",
  coverage: "只收录核对过官方成交页的佳士得、邦瀚斯记录。苏富比页面上这次只看到估价，没有写成成交价，故不收入。保利、嘉德、中汉没有核到可逐条打开的官方成交页。以公开成交结果为准，不是全市场统计。",
  varieties: [
    {
      id: "ru-type",
      name: "清仿汝釉",
      blurb: "清雍正、乾隆的仿汝釉器物。不是北宋汝窑原作，两套价钱不能混在一起。",
      lots: [
        {
          house: "佳士得",
          place: "伦敦",
          date: "2016-11-08",
          lot: "30",
          title: "清雍正 仿汝釉葵口小盘",
          original: "GBP 75,000",
          cny: 672850,
          fxYear: 2016,
          url: "https://www.christies.com/en/lot/lot-6035670"
        },
        {
          house: "佳士得",
          place: "香港",
          date: "2019-05-29",
          lot: "2808",
          title: "清乾隆 仿汝釉方壶",
          original: "HKD 4,925,000",
          cny: 4342031,
          fxYear: 2019,
          url: "https://www.christies.com/en/lot/lot-6209330"
        },
        {
          house: "佳士得",
          place: "香港",
          date: "2022-05-30",
          lot: "2717",
          title: "清乾隆 仿汝釉蒜头瓶",
          original: "HKD 2,268,000",
          cny: 1951100,
          fxYear: 2022,
          url: "https://www.christies.com/en/lot/lot-6372408"
        }
      ]
    },
    {
      id: "fencai",
      name: "粉彩",
      blurb: "清粉彩碗盘，另有一对大瓶。器型差很多，大件会被标成异常值。",
      lots: [
        {
          house: "佳士得",
          place: "纽约",
          date: "2023-01-20",
          lot: "606",
          title: "清乾隆 粉彩人物大瓶一对（外销）",
          original: "USD 100,800",
          cny: 714067,
          fxYear: 2023,
          url: "https://www.christies.com/en/lot/lot-6410727"
        },
        {
          house: "佳士得",
          place: "纽约",
          date: "2024-03-21",
          lot: "980",
          title: "清雍正 粉彩仕女婴戏盘",
          original: "USD 11,340",
          cny: 81620,
          fxYear: 2024,
          url: "https://www.christies.com/en/lot/lot-6470776"
        },
        {
          house: "佳士得",
          place: "纽约",
          date: "2024-03-21",
          lot: "981",
          title: "清雍正 粉彩仕女高士盘",
          original: "USD 6,930",
          cny: 49879,
          fxYear: 2024,
          url: "https://www.christies.com/en/lot/lot-6470777"
        },
        {
          house: "佳士得",
          place: "纽约",
          date: "2024-03-21",
          lot: "982",
          title: "清雍正 粉彩胭脂红仕女盘",
          original: "USD 6,930",
          cny: 49879,
          fxYear: 2024,
          url: "https://www.christies.com/en/lot/lot-6470778"
        },
        {
          house: "佳士得",
          place: "纽约",
          date: "2024-09-19",
          lot: "1081",
          title: "清乾隆 黄地粉彩碗一对",
          original: "USD 239,400",
          cny: 1723079,
          fxYear: 2024,
          url: "https://www.christies.com/en/lot/lot-6494942"
        }
      ]
    },
    {
      id: "qinghua",
      name: "青花",
      blurb: "邦瀚斯已成交的青花单件或成对碗。元、清混在同一品种里，只作参照。",
      lots: [
        {
          house: "邦瀚斯",
          place: "香港",
          date: "2018-11-27",
          lot: "51",
          title: "元 青花番莲纹匜",
          original: "HKD 437,500",
          cny: 369265,
          fxYear: 2018,
          url: "https://www.bonhams.com/auction/24780/lot/51/a-rare-blue-and-white-pouring-bowl-yuan-dynasty/"
        },
        {
          house: "邦瀚斯",
          place: "香港",
          date: "2018-11-27",
          lot: "70",
          title: "清雍正 青花穿花龙纹高足碗",
          original: "HKD 187,500",
          cny: 158256,
          fxYear: 2018,
          url: "https://www.bonhams.com/auction/24780/lot/70/a-rare-blue-and-white-dragons-and-lotus-stem-bowl-yongzheng-seal-mark-and-of-the-period/"
        },
        {
          house: "邦瀚斯",
          place: "香港",
          date: "2023-05-29",
          lot: "843",
          title: "清道光 青花莲纹碗一对",
          original: "HKD 230,400",
          cny: 208460,
          fxYear: 2023,
          url: "https://www.bonhams.com/auction/28274/lot/843/a-fine-and-rare-pair-of-blue-and-white-lotus-bowls-daoguang-seal-marks-and-of-the-period-3/"
        }
      ]
    }
  ]
};
