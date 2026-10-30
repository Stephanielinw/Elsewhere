// Auto-generated and verified from avatar-frames.js reference
export interface PresetAvatarFrameItem {
  id: string;
  rawId: string;
  rawName: string;
  sourceIndex: number;
  index: number;
  url: string;
  label: string;
  tag: string;
  fileHint: string;
}

export interface AvatarFrameAuditStats {
  totalRawRecords: number;
  noneOptionCount: number;
  rawWithUrlCount: number;
  uniqueGifUrlCount: number;
  duplicateUrlCount: number;
  rawArrayCount: number;
  rawFrameEntryCount: number;
  uniqueUrlCount: number;
  uniqueUrls: number;
  duplicateUrlRecords: {
    rawIndex: number;
    rawId: string;
    rawName: string;
    url: string;
    firstSeenPresetId: string;
  }[];
  uniqueRawIdCountExcludingNone: number;
  duplicateRawIdGroupCount: number;
}

export const AVATAR_FRAME_AUDIT_STATS: AvatarFrameAuditStats = {
  totalRawRecords: 365,
  noneOptionCount: 1,
  rawWithUrlCount: 364,
  uniqueGifUrlCount: 363,
  duplicateUrlCount: 1,
  rawArrayCount: 365,
  rawFrameEntryCount: 364,
  uniqueUrlCount: 363,
  uniqueUrls: 363,
  duplicateUrlRecords: [
    {
      rawIndex: 73,
      rawId: 'frame_flower',
      rawName: '3',
      url: 'https://i.postimg.cc/hj4dkrvj/IMG-5578.gif',
      firstSeenPresetId: 'preset_frame_072',
    },
  ],
  uniqueRawIdCountExcludingNone: 122,
  duplicateRawIdGroupCount: 14,
};

const RAW_PRESET_AVATAR_FRAMES: Omit<PresetAvatarFrameItem, 'index'>[] = [
  {
    "id": "preset_frame_001",
    "rawId": "frame_cat_ear",
    "rawName": "1",
    "sourceIndex": 1,
    "url": "https://i.postimg.cc/fLDnz5Pn/IMG-5574.gif",
    "label": "预设框 #001",
    "tag": "猫耳装饰",
    "fileHint": "IMG-5574"
  },
  {
    "id": "preset_frame_002",
    "rawId": "frame_ribbon",
    "rawName": "2",
    "sourceIndex": 2,
    "url": "https://i.postimg.cc/HxH3cNHz/IMG-6871.gif",
    "label": "预设框 #002",
    "tag": "丝带蝴蝶结",
    "fileHint": "IMG-6871"
  },
  {
    "id": "preset_frame_003",
    "rawId": "frame_flower",
    "rawName": "3",
    "sourceIndex": 3,
    "url": "https://i.postimg.cc/jCVK0fGL/IMG-6890.gif",
    "label": "预设框 #003",
    "tag": "花环花朵",
    "fileHint": "IMG-6890"
  },
  {
    "id": "preset_frame_004",
    "rawId": "frame_tech",
    "rawName": "4",
    "sourceIndex": 4,
    "url": "https://i.postimg.cc/85Zsyjwn/IMG-6895.gif",
    "label": "预设框 #004",
    "tag": "科技流光",
    "fileHint": "IMG-6895"
  },
  {
    "id": "preset_frame_005",
    "rawId": "frame_5",
    "rawName": "5",
    "sourceIndex": 5,
    "url": "https://i.postimg.cc/cJtpZCB3/IMG-6894.gif",
    "label": "预设框 #005",
    "tag": "主题系列 #5",
    "fileHint": "IMG-6894"
  },
  {
    "id": "preset_frame_006",
    "rawId": "frame_6",
    "rawName": "6",
    "sourceIndex": 6,
    "url": "https://i.postimg.cc/63sDQKMm/IMG-6893.gif",
    "label": "预设框 #006",
    "tag": "主题系列 #6",
    "fileHint": "IMG-6893"
  },
  {
    "id": "preset_frame_007",
    "rawId": "frame_7",
    "rawName": "7",
    "sourceIndex": 7,
    "url": "https://i.postimg.cc/cHQPgzj4/IMG-6888.gif",
    "label": "预设框 #007",
    "tag": "主题系列 #7",
    "fileHint": "IMG-6888"
  },
  {
    "id": "preset_frame_008",
    "rawId": "frame_8",
    "rawName": "8",
    "sourceIndex": 8,
    "url": "https://i.postimg.cc/dVLXm3Xf/IMG-6885.gif",
    "label": "预设框 #008",
    "tag": "主题系列 #8",
    "fileHint": "IMG-6885"
  },
  {
    "id": "preset_frame_009",
    "rawId": "frame_9",
    "rawName": "9",
    "sourceIndex": 9,
    "url": "https://i.postimg.cc/kGsZwbq0/IMG-6886.gif",
    "label": "预设框 #009",
    "tag": "主题系列 #9",
    "fileHint": "IMG-6886"
  },
  {
    "id": "preset_frame_010",
    "rawId": "frame_10",
    "rawName": "10",
    "sourceIndex": 10,
    "url": "https://i.postimg.cc/63NmX03s/IMG-4366.gif",
    "label": "预设框 #010",
    "tag": "主题系列 #10",
    "fileHint": "IMG-4366"
  },
  {
    "id": "preset_frame_011",
    "rawId": "frame_11",
    "rawName": "11",
    "sourceIndex": 11,
    "url": "https://i.postimg.cc/zvz2LGK0/IMG-4367.gif",
    "label": "预设框 #011",
    "tag": "主题系列 #11",
    "fileHint": "IMG-4367"
  },
  {
    "id": "preset_frame_012",
    "rawId": "frame_12",
    "rawName": "12",
    "sourceIndex": 12,
    "url": "https://i.postimg.cc/prsGKMBx/IMG-4370.gif",
    "label": "预设框 #012",
    "tag": "主题系列 #12",
    "fileHint": "IMG-4370"
  },
  {
    "id": "preset_frame_013",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 13,
    "url": "https://i.postimg.cc/gk0BmrY0/IMG-4371.gif",
    "label": "预设框 #013",
    "tag": "主题系列 #13",
    "fileHint": "IMG-4371"
  },
  {
    "id": "preset_frame_014",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 14,
    "url": "https://i.postimg.cc/fRt2SFSn/IMG-4368.gif",
    "label": "预设框 #014",
    "tag": "主题系列 #14",
    "fileHint": "IMG-4368"
  },
  {
    "id": "preset_frame_015",
    "rawId": "frame_cat_ear",
    "rawName": "1",
    "sourceIndex": 15,
    "url": "https://i.postimg.cc/kGgwJhPH/IMG-4374.gif",
    "label": "预设框 #015",
    "tag": "猫耳装饰",
    "fileHint": "IMG-4374"
  },
  {
    "id": "preset_frame_016",
    "rawId": "frame_ribbon",
    "rawName": "2",
    "sourceIndex": 16,
    "url": "https://i.postimg.cc/PrcKH436/IMG-4376.gif",
    "label": "预设框 #016",
    "tag": "丝带蝴蝶结",
    "fileHint": "IMG-4376"
  },
  {
    "id": "preset_frame_017",
    "rawId": "frame_flower",
    "rawName": "3",
    "sourceIndex": 17,
    "url": "https://i.postimg.cc/fRV86FMq/IMG-4381.gif",
    "label": "预设框 #017",
    "tag": "花环花朵",
    "fileHint": "IMG-4381"
  },
  {
    "id": "preset_frame_018",
    "rawId": "frame_tech",
    "rawName": "4",
    "sourceIndex": 18,
    "url": "https://i.postimg.cc/HsyqMVyk/IMG-4385.gif",
    "label": "预设框 #018",
    "tag": "科技流光",
    "fileHint": "IMG-4385"
  },
  {
    "id": "preset_frame_019",
    "rawId": "frame_5",
    "rawName": "5",
    "sourceIndex": 19,
    "url": "https://i.postimg.cc/qBbKK7dS/IMG-4386.gif",
    "label": "预设框 #019",
    "tag": "主题系列 #5",
    "fileHint": "IMG-4386"
  },
  {
    "id": "preset_frame_020",
    "rawId": "frame_6",
    "rawName": "6",
    "sourceIndex": 20,
    "url": "https://i.postimg.cc/05wnd389/IMG-4388.gif",
    "label": "预设框 #020",
    "tag": "主题系列 #6",
    "fileHint": "IMG-4388"
  },
  {
    "id": "preset_frame_021",
    "rawId": "frame_7",
    "rawName": "7",
    "sourceIndex": 21,
    "url": "https://i.postimg.cc/RZNLhbbr/IMG-4389.gif",
    "label": "预设框 #021",
    "tag": "主题系列 #7",
    "fileHint": "IMG-4389"
  },
  {
    "id": "preset_frame_022",
    "rawId": "frame_8",
    "rawName": "8",
    "sourceIndex": 22,
    "url": "https://i.postimg.cc/fLTc42dg/IMG-4391.gif",
    "label": "预设框 #022",
    "tag": "主题系列 #8",
    "fileHint": "IMG-4391"
  },
  {
    "id": "preset_frame_023",
    "rawId": "frame_9",
    "rawName": "9",
    "sourceIndex": 23,
    "url": "https://i.postimg.cc/FzbGNdRT/IMG-4392.gif",
    "label": "预设框 #023",
    "tag": "主题系列 #9",
    "fileHint": "IMG-4392"
  },
  {
    "id": "preset_frame_024",
    "rawId": "frame_10",
    "rawName": "10",
    "sourceIndex": 24,
    "url": "https://i.postimg.cc/XY63sTS3/IMG-4393.gif",
    "label": "预设框 #024",
    "tag": "主题系列 #10",
    "fileHint": "IMG-4393"
  },
  {
    "id": "preset_frame_025",
    "rawId": "frame_11",
    "rawName": "11",
    "sourceIndex": 25,
    "url": "https://i.postimg.cc/Cx9vCVWH/IMG-4395.gif",
    "label": "预设框 #025",
    "tag": "主题系列 #11",
    "fileHint": "IMG-4395"
  },
  {
    "id": "preset_frame_026",
    "rawId": "frame_12",
    "rawName": "12",
    "sourceIndex": 26,
    "url": "https://i.postimg.cc/kMfPQBwQ/IMG-4396.gif",
    "label": "预设框 #026",
    "tag": "主题系列 #12",
    "fileHint": "IMG-4396"
  },
  {
    "id": "preset_frame_027",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 27,
    "url": "https://i.postimg.cc/CLrZQMMD/IMG-4398.gif",
    "label": "预设框 #027",
    "tag": "主题系列 #13",
    "fileHint": "IMG-4398"
  },
  {
    "id": "preset_frame_028",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 28,
    "url": "https://i.postimg.cc/L4zwDhTC/IMG-4399.gif",
    "label": "预设框 #028",
    "tag": "主题系列 #14",
    "fileHint": "IMG-4399"
  },
  {
    "id": "preset_frame_029",
    "rawId": "frame_cat_ear",
    "rawName": "1",
    "sourceIndex": 29,
    "url": "https://i.postimg.cc/yN3s8szM/IMG-4400.gif",
    "label": "预设框 #029",
    "tag": "猫耳装饰",
    "fileHint": "IMG-4400"
  },
  {
    "id": "preset_frame_030",
    "rawId": "frame_ribbon",
    "rawName": "2",
    "sourceIndex": 30,
    "url": "https://i.postimg.cc/59Cn1tkB/IMG-4401.gif",
    "label": "预设框 #030",
    "tag": "丝带蝴蝶结",
    "fileHint": "IMG-4401"
  },
  {
    "id": "preset_frame_031",
    "rawId": "frame_flower",
    "rawName": "3",
    "sourceIndex": 31,
    "url": "https://i.postimg.cc/g0s1V0PX/IMG-4402.gif",
    "label": "预设框 #031",
    "tag": "花环花朵",
    "fileHint": "IMG-4402"
  },
  {
    "id": "preset_frame_032",
    "rawId": "frame_tech",
    "rawName": "4",
    "sourceIndex": 32,
    "url": "https://i.postimg.cc/Jn1DFPgY/IMG-4403.gif",
    "label": "预设框 #032",
    "tag": "科技流光",
    "fileHint": "IMG-4403"
  },
  {
    "id": "preset_frame_033",
    "rawId": "frame_5",
    "rawName": "5",
    "sourceIndex": 33,
    "url": "https://i.postimg.cc/q7cQnDy1/IMG-4404.gif",
    "label": "预设框 #033",
    "tag": "主题系列 #5",
    "fileHint": "IMG-4404"
  },
  {
    "id": "preset_frame_034",
    "rawId": "frame_6",
    "rawName": "6",
    "sourceIndex": 34,
    "url": "https://i.postimg.cc/RFK3q2t0/IMG-4407.gif",
    "label": "预设框 #034",
    "tag": "主题系列 #6",
    "fileHint": "IMG-4407"
  },
  {
    "id": "preset_frame_035",
    "rawId": "frame_7",
    "rawName": "7",
    "sourceIndex": 35,
    "url": "https://i.postimg.cc/gcV0VR2t/IMG-4408.gif",
    "label": "预设框 #035",
    "tag": "主题系列 #7",
    "fileHint": "IMG-4408"
  },
  {
    "id": "preset_frame_036",
    "rawId": "frame_8",
    "rawName": "8",
    "sourceIndex": 36,
    "url": "https://i.postimg.cc/W1CjLb4J/IMG-4409.gif",
    "label": "预设框 #036",
    "tag": "主题系列 #8",
    "fileHint": "IMG-4409"
  },
  {
    "id": "preset_frame_037",
    "rawId": "frame_9",
    "rawName": "9",
    "sourceIndex": 37,
    "url": "https://i.postimg.cc/Ss7pM6fW/IMG-4410.gif",
    "label": "预设框 #037",
    "tag": "主题系列 #9",
    "fileHint": "IMG-4410"
  },
  {
    "id": "preset_frame_038",
    "rawId": "frame_10",
    "rawName": "10",
    "sourceIndex": 38,
    "url": "https://i.postimg.cc/nrFfYX3N/IMG-4412.gif",
    "label": "预设框 #038",
    "tag": "主题系列 #10",
    "fileHint": "IMG-4412"
  },
  {
    "id": "preset_frame_039",
    "rawId": "frame_11",
    "rawName": "11",
    "sourceIndex": 39,
    "url": "https://i.postimg.cc/cHWp0KG6/IMG-4413.gif",
    "label": "预设框 #039",
    "tag": "主题系列 #11",
    "fileHint": "IMG-4413"
  },
  {
    "id": "preset_frame_040",
    "rawId": "frame_12",
    "rawName": "12",
    "sourceIndex": 40,
    "url": "https://i.postimg.cc/4yNjHrdg/IMG-4414.gif",
    "label": "预设框 #040",
    "tag": "主题系列 #12",
    "fileHint": "IMG-4414"
  },
  {
    "id": "preset_frame_041",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 41,
    "url": "https://i.postimg.cc/hPX5F8Qp/IMG-4415.gif",
    "label": "预设框 #041",
    "tag": "主题系列 #13",
    "fileHint": "IMG-4415"
  },
  {
    "id": "preset_frame_042",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 42,
    "url": "https://i.postimg.cc/vHCSG1WM/IMG-4416.gif",
    "label": "预设框 #042",
    "tag": "主题系列 #14",
    "fileHint": "IMG-4416"
  },
  {
    "id": "preset_frame_043",
    "rawId": "frame_cat_ear",
    "rawName": "1",
    "sourceIndex": 43,
    "url": "https://i.postimg.cc/x1Hp80Rm/IMG-4417.gif",
    "label": "预设框 #043",
    "tag": "猫耳装饰",
    "fileHint": "IMG-4417"
  },
  {
    "id": "preset_frame_044",
    "rawId": "frame_ribbon",
    "rawName": "2",
    "sourceIndex": 44,
    "url": "https://i.postimg.cc/FHRcCGfH/IMG-4418.gif",
    "label": "预设框 #044",
    "tag": "丝带蝴蝶结",
    "fileHint": "IMG-4418"
  },
  {
    "id": "preset_frame_045",
    "rawId": "frame_flower",
    "rawName": "3",
    "sourceIndex": 45,
    "url": "https://i.postimg.cc/13hhJ77p/IMG-4419.gif",
    "label": "预设框 #045",
    "tag": "花环花朵",
    "fileHint": "IMG-4419"
  },
  {
    "id": "preset_frame_046",
    "rawId": "frame_tech",
    "rawName": "4",
    "sourceIndex": 46,
    "url": "https://i.postimg.cc/J4WCQd2j/IMG-4420.gif",
    "label": "预设框 #046",
    "tag": "科技流光",
    "fileHint": "IMG-4420"
  },
  {
    "id": "preset_frame_047",
    "rawId": "frame_5",
    "rawName": "5",
    "sourceIndex": 47,
    "url": "https://i.postimg.cc/Dydkpd9H/IMG-4421.gif",
    "label": "预设框 #047",
    "tag": "主题系列 #5",
    "fileHint": "IMG-4421"
  },
  {
    "id": "preset_frame_048",
    "rawId": "frame_6",
    "rawName": "6",
    "sourceIndex": 48,
    "url": "https://i.postimg.cc/mrkvDxPW/IMG-4422.gif",
    "label": "预设框 #048",
    "tag": "主题系列 #6",
    "fileHint": "IMG-4422"
  },
  {
    "id": "preset_frame_049",
    "rawId": "frame_7",
    "rawName": "7",
    "sourceIndex": 49,
    "url": "https://i.postimg.cc/76Tj3g1B/IMG-4425.gif",
    "label": "预设框 #049",
    "tag": "主题系列 #7",
    "fileHint": "IMG-4425"
  },
  {
    "id": "preset_frame_050",
    "rawId": "frame_8",
    "rawName": "8",
    "sourceIndex": 50,
    "url": "https://i.postimg.cc/3N5Vndn3/IMG-4426.gif",
    "label": "预设框 #050",
    "tag": "主题系列 #8",
    "fileHint": "IMG-4426"
  },
  {
    "id": "preset_frame_051",
    "rawId": "frame_9",
    "rawName": "9",
    "sourceIndex": 51,
    "url": "https://i.postimg.cc/05DLr0yj/IMG-4427.gif",
    "label": "预设框 #051",
    "tag": "主题系列 #9",
    "fileHint": "IMG-4427"
  },
  {
    "id": "preset_frame_052",
    "rawId": "frame_10",
    "rawName": "10",
    "sourceIndex": 52,
    "url": "https://i.postimg.cc/GhR6DT4Q/IMG-4428.gif",
    "label": "预设框 #052",
    "tag": "主题系列 #10",
    "fileHint": "IMG-4428"
  },
  {
    "id": "preset_frame_053",
    "rawId": "frame_11",
    "rawName": "11",
    "sourceIndex": 53,
    "url": "https://i.postimg.cc/fRTF24jS/IMG-4430.gif",
    "label": "预设框 #053",
    "tag": "主题系列 #11",
    "fileHint": "IMG-4430"
  },
  {
    "id": "preset_frame_054",
    "rawId": "frame_12",
    "rawName": "12",
    "sourceIndex": 54,
    "url": "https://i.postimg.cc/R0WYmcYM/IMG-4431.gif",
    "label": "预设框 #054",
    "tag": "主题系列 #12",
    "fileHint": "IMG-4431"
  },
  {
    "id": "preset_frame_055",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 55,
    "url": "https://i.postimg.cc/nrJSqNhz/IMG-4432.gif",
    "label": "预设框 #055",
    "tag": "主题系列 #13",
    "fileHint": "IMG-4432"
  },
  {
    "id": "preset_frame_056",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 56,
    "url": "https://i.postimg.cc/tC9mJ0cv/IMG-4438.gif",
    "label": "预设框 #056",
    "tag": "主题系列 #14",
    "fileHint": "IMG-4438"
  },
  {
    "id": "preset_frame_057",
    "rawId": "frame_cat_ear",
    "rawName": "1",
    "sourceIndex": 57,
    "url": "https://i.postimg.cc/XNkQTHvf/IMG-5561.gif",
    "label": "预设框 #057",
    "tag": "猫耳装饰",
    "fileHint": "IMG-5561"
  },
  {
    "id": "preset_frame_058",
    "rawId": "frame_ribbon",
    "rawName": "2",
    "sourceIndex": 58,
    "url": "https://i.postimg.cc/Mpv5fzm5/IMG-4439.gif",
    "label": "预设框 #058",
    "tag": "丝带蝴蝶结",
    "fileHint": "IMG-4439"
  },
  {
    "id": "preset_frame_059",
    "rawId": "frame_flower",
    "rawName": "3",
    "sourceIndex": 59,
    "url": "https://i.postimg.cc/T1tjhsyB/IMG-4720.gif",
    "label": "预设框 #059",
    "tag": "花环花朵",
    "fileHint": "IMG-4720"
  },
  {
    "id": "preset_frame_060",
    "rawId": "frame_tech",
    "rawName": "4",
    "sourceIndex": 60,
    "url": "https://i.postimg.cc/c4JMPd2W/IMG-4724.gif",
    "label": "预设框 #060",
    "tag": "科技流光",
    "fileHint": "IMG-4724"
  },
  {
    "id": "preset_frame_061",
    "rawId": "frame_5",
    "rawName": "5",
    "sourceIndex": 61,
    "url": "https://i.postimg.cc/g2XykNGB/IMG-4727.gif",
    "label": "预设框 #061",
    "tag": "主题系列 #5",
    "fileHint": "IMG-4727"
  },
  {
    "id": "preset_frame_062",
    "rawId": "frame_6",
    "rawName": "6",
    "sourceIndex": 62,
    "url": "https://i.postimg.cc/y8MmJcd6/IMG-4728.gif",
    "label": "预设框 #062",
    "tag": "主题系列 #6",
    "fileHint": "IMG-4728"
  },
  {
    "id": "preset_frame_063",
    "rawId": "frame_7",
    "rawName": "7",
    "sourceIndex": 63,
    "url": "https://i.postimg.cc/Lsjzj5Yt/IMG-4729.gif",
    "label": "预设框 #063",
    "tag": "主题系列 #7",
    "fileHint": "IMG-4729"
  },
  {
    "id": "preset_frame_064",
    "rawId": "frame_8",
    "rawName": "8",
    "sourceIndex": 64,
    "url": "https://i.postimg.cc/bNdk33SN/IMG-4893.gif",
    "label": "预设框 #064",
    "tag": "主题系列 #8",
    "fileHint": "IMG-4893"
  },
  {
    "id": "preset_frame_065",
    "rawId": "frame_9",
    "rawName": "9",
    "sourceIndex": 65,
    "url": "https://i.postimg.cc/4x9tTy1D/IMG-5563.gif",
    "label": "预设框 #065",
    "tag": "主题系列 #9",
    "fileHint": "IMG-5563"
  },
  {
    "id": "preset_frame_066",
    "rawId": "frame_10",
    "rawName": "10",
    "sourceIndex": 66,
    "url": "https://i.postimg.cc/DZshzKv6/IMG-5576.gif",
    "label": "预设框 #066",
    "tag": "主题系列 #10",
    "fileHint": "IMG-5576"
  },
  {
    "id": "preset_frame_067",
    "rawId": "frame_11",
    "rawName": "11",
    "sourceIndex": 67,
    "url": "https://i.postimg.cc/Fsvr71JL/IMG-5573.gif",
    "label": "预设框 #067",
    "tag": "主题系列 #11",
    "fileHint": "IMG-5573"
  },
  {
    "id": "preset_frame_068",
    "rawId": "frame_12",
    "rawName": "12",
    "sourceIndex": 68,
    "url": "https://i.postimg.cc/Fz3HwLk9/IMG-5569.gif",
    "label": "预设框 #068",
    "tag": "主题系列 #12",
    "fileHint": "IMG-5569"
  },
  {
    "id": "preset_frame_069",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 69,
    "url": "https://i.postimg.cc/wjH180kn/IMG-5566.gif",
    "label": "预设框 #069",
    "tag": "主题系列 #13",
    "fileHint": "IMG-5566"
  },
  {
    "id": "preset_frame_070",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 70,
    "url": "https://i.postimg.cc/MG6qtLYK/IMG-5565.gif",
    "label": "预设框 #070",
    "tag": "主题系列 #14",
    "fileHint": "IMG-5565"
  },
  {
    "id": "preset_frame_071",
    "rawId": "frame_cat_ear",
    "rawName": "1",
    "sourceIndex": 71,
    "url": "https://i.postimg.cc/CKgDNYVb/IMG-5577.gif",
    "label": "预设框 #071",
    "tag": "猫耳装饰",
    "fileHint": "IMG-5577"
  },
  {
    "id": "preset_frame_072",
    "rawId": "frame_ribbon",
    "rawName": "2",
    "sourceIndex": 72,
    "url": "https://i.postimg.cc/hj4dkrvj/IMG-5578.gif",
    "label": "预设框 #072",
    "tag": "丝带蝴蝶结",
    "fileHint": "IMG-5578"
  },
  {
    "id": "preset_frame_073",
    "rawId": "frame_tech",
    "rawName": "4",
    "sourceIndex": 74,
    "url": "https://i.postimg.cc/C5XnfpNB/IMG-5579.gif",
    "label": "预设框 #073",
    "tag": "科技流光",
    "fileHint": "IMG-5579"
  },
  {
    "id": "preset_frame_074",
    "rawId": "frame_5",
    "rawName": "5",
    "sourceIndex": 75,
    "url": "https://i.postimg.cc/4y7mGFgJ/IMG-5716.gif",
    "label": "预设框 #074",
    "tag": "主题系列 #5",
    "fileHint": "IMG-5716"
  },
  {
    "id": "preset_frame_075",
    "rawId": "frame_6",
    "rawName": "6",
    "sourceIndex": 76,
    "url": "https://i.postimg.cc/FzM1Hgr0/IMG-5717.gif",
    "label": "预设框 #075",
    "tag": "主题系列 #6",
    "fileHint": "IMG-5717"
  },
  {
    "id": "preset_frame_076",
    "rawId": "frame_7",
    "rawName": "7",
    "sourceIndex": 77,
    "url": "https://i.postimg.cc/rF4KYbjj/IMG-5720.gif",
    "label": "预设框 #076",
    "tag": "主题系列 #7",
    "fileHint": "IMG-5720"
  },
  {
    "id": "preset_frame_077",
    "rawId": "frame_8",
    "rawName": "8",
    "sourceIndex": 78,
    "url": "https://i.postimg.cc/6pLTBvDG/IMG-5721.gif",
    "label": "预设框 #077",
    "tag": "主题系列 #8",
    "fileHint": "IMG-5721"
  },
  {
    "id": "preset_frame_078",
    "rawId": "frame_9",
    "rawName": "9",
    "sourceIndex": 79,
    "url": "https://i.postimg.cc/VNK6Ccsf/IMG-5722.gif",
    "label": "预设框 #078",
    "tag": "主题系列 #9",
    "fileHint": "IMG-5722"
  },
  {
    "id": "preset_frame_079",
    "rawId": "frame_10",
    "rawName": "10",
    "sourceIndex": 80,
    "url": "https://i.postimg.cc/wx72fhr2/IMG-5968.gif",
    "label": "预设框 #079",
    "tag": "主题系列 #10",
    "fileHint": "IMG-5968"
  },
  {
    "id": "preset_frame_080",
    "rawId": "frame_11",
    "rawName": "11",
    "sourceIndex": 81,
    "url": "https://i.postimg.cc/QdrqdvdY/IMG-5969.gif",
    "label": "预设框 #080",
    "tag": "主题系列 #11",
    "fileHint": "IMG-5969"
  },
  {
    "id": "preset_frame_081",
    "rawId": "frame_12",
    "rawName": "12",
    "sourceIndex": 82,
    "url": "https://i.postimg.cc/0yd0MZ6k/IMG-5971.gif",
    "label": "预设框 #081",
    "tag": "主题系列 #12",
    "fileHint": "IMG-5971"
  },
  {
    "id": "preset_frame_082",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 83,
    "url": "https://i.postimg.cc/1zmcp66p/IMG-5973.gif",
    "label": "预设框 #082",
    "tag": "主题系列 #13",
    "fileHint": "IMG-5973"
  },
  {
    "id": "preset_frame_083",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 84,
    "url": "https://i.postimg.cc/wBw5Fvcn/IMG-5974.gif",
    "label": "预设框 #083",
    "tag": "主题系列 #14",
    "fileHint": "IMG-5974"
  },
  {
    "id": "preset_frame_084",
    "rawId": "frame_cat_ear",
    "rawName": "1",
    "sourceIndex": 85,
    "url": "https://i.postimg.cc/R0pfKYvB/IMG-5976.gif",
    "label": "预设框 #084",
    "tag": "猫耳装饰",
    "fileHint": "IMG-5976"
  },
  {
    "id": "preset_frame_085",
    "rawId": "frame_ribbon",
    "rawName": "2",
    "sourceIndex": 86,
    "url": "https://i.postimg.cc/9fQZ425b/IMG-5975.gif",
    "label": "预设框 #085",
    "tag": "丝带蝴蝶结",
    "fileHint": "IMG-5975"
  },
  {
    "id": "preset_frame_086",
    "rawId": "frame_flower",
    "rawName": "3",
    "sourceIndex": 87,
    "url": "https://i.postimg.cc/v8V9xXjJ/IMG-6137.gif",
    "label": "预设框 #086",
    "tag": "花环花朵",
    "fileHint": "IMG-6137"
  },
  {
    "id": "preset_frame_087",
    "rawId": "frame_tech",
    "rawName": "4",
    "sourceIndex": 88,
    "url": "https://i.postimg.cc/WbmkXzsS/IMG-6138.gif",
    "label": "预设框 #087",
    "tag": "科技流光",
    "fileHint": "IMG-6138"
  },
  {
    "id": "preset_frame_088",
    "rawId": "frame_5",
    "rawName": "5",
    "sourceIndex": 89,
    "url": "https://i.postimg.cc/Dw2bDhZh/IMG-6140.gif",
    "label": "预设框 #088",
    "tag": "主题系列 #5",
    "fileHint": "IMG-6140"
  },
  {
    "id": "preset_frame_089",
    "rawId": "frame_6",
    "rawName": "6",
    "sourceIndex": 90,
    "url": "https://i.postimg.cc/ZqQBCyLY/IMG-6144.gif",
    "label": "预设框 #089",
    "tag": "主题系列 #6",
    "fileHint": "IMG-6144"
  },
  {
    "id": "preset_frame_090",
    "rawId": "frame_7",
    "rawName": "7",
    "sourceIndex": 91,
    "url": "https://i.postimg.cc/qRCtnMms/IMG-6145.gif",
    "label": "预设框 #090",
    "tag": "主题系列 #7",
    "fileHint": "IMG-6145"
  },
  {
    "id": "preset_frame_091",
    "rawId": "frame_8",
    "rawName": "8",
    "sourceIndex": 92,
    "url": "https://i.postimg.cc/1Rwn3XVP/IMG-6146.gif",
    "label": "预设框 #091",
    "tag": "主题系列 #8",
    "fileHint": "IMG-6146"
  },
  {
    "id": "preset_frame_092",
    "rawId": "frame_9",
    "rawName": "9",
    "sourceIndex": 93,
    "url": "https://i.postimg.cc/Kv51tW5H/IMG-6147.gif",
    "label": "预设框 #092",
    "tag": "主题系列 #9",
    "fileHint": "IMG-6147"
  },
  {
    "id": "preset_frame_093",
    "rawId": "frame_10",
    "rawName": "10",
    "sourceIndex": 94,
    "url": "https://i.postimg.cc/nhcC21Rc/IMG-6148.gif",
    "label": "预设框 #093",
    "tag": "主题系列 #10",
    "fileHint": "IMG-6148"
  },
  {
    "id": "preset_frame_094",
    "rawId": "frame_11",
    "rawName": "11",
    "sourceIndex": 95,
    "url": "https://i.postimg.cc/fTWzQRx8/IMG-6149.gif",
    "label": "预设框 #094",
    "tag": "主题系列 #11",
    "fileHint": "IMG-6149"
  },
  {
    "id": "preset_frame_095",
    "rawId": "frame_12",
    "rawName": "12",
    "sourceIndex": 96,
    "url": "https://i.postimg.cc/LXyyqDbY/IMG-6294.gif",
    "label": "预设框 #095",
    "tag": "主题系列 #12",
    "fileHint": "IMG-6294"
  },
  {
    "id": "preset_frame_096",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 97,
    "url": "https://i.postimg.cc/7Zgm1wRy/IMG-6295.gif",
    "label": "预设框 #096",
    "tag": "主题系列 #13",
    "fileHint": "IMG-6295"
  },
  {
    "id": "preset_frame_097",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 98,
    "url": "https://i.postimg.cc/5tbpnDcQ/IMG-6296.gif",
    "label": "预设框 #097",
    "tag": "主题系列 #14",
    "fileHint": "IMG-6296"
  },
  {
    "id": "preset_frame_098",
    "rawId": "frame_cat_ear",
    "rawName": "1",
    "sourceIndex": 99,
    "url": "https://i.postimg.cc/YSRRV8kn/IMG-6297.gif",
    "label": "预设框 #098",
    "tag": "猫耳装饰",
    "fileHint": "IMG-6297"
  },
  {
    "id": "preset_frame_099",
    "rawId": "frame_ribbon",
    "rawName": "2",
    "sourceIndex": 100,
    "url": "https://i.postimg.cc/k45sd8gn/IMG-6375.gif",
    "label": "预设框 #099",
    "tag": "丝带蝴蝶结",
    "fileHint": "IMG-6375"
  },
  {
    "id": "preset_frame_100",
    "rawId": "frame_flower",
    "rawName": "3",
    "sourceIndex": 101,
    "url": "https://i.postimg.cc/50k390X8/IMG-6376.gif",
    "label": "预设框 #100",
    "tag": "花环花朵",
    "fileHint": "IMG-6376"
  },
  {
    "id": "preset_frame_101",
    "rawId": "frame_tech",
    "rawName": "4",
    "sourceIndex": 102,
    "url": "https://i.postimg.cc/90RBDh9K/IMG-6377.gif",
    "label": "预设框 #101",
    "tag": "科技流光",
    "fileHint": "IMG-6377"
  },
  {
    "id": "preset_frame_102",
    "rawId": "frame_5",
    "rawName": "5",
    "sourceIndex": 103,
    "url": "https://i.postimg.cc/cCpBYbMH/IMG-6552.gif",
    "label": "预设框 #102",
    "tag": "主题系列 #5",
    "fileHint": "IMG-6552"
  },
  {
    "id": "preset_frame_103",
    "rawId": "frame_6",
    "rawName": "6",
    "sourceIndex": 104,
    "url": "https://i.postimg.cc/Pf9g2fSL/IMG-6554.gif",
    "label": "预设框 #103",
    "tag": "主题系列 #6",
    "fileHint": "IMG-6554"
  },
  {
    "id": "preset_frame_104",
    "rawId": "frame_7",
    "rawName": "7",
    "sourceIndex": 105,
    "url": "https://i.postimg.cc/gkhf597g/IMG-6555.gif",
    "label": "预设框 #104",
    "tag": "主题系列 #7",
    "fileHint": "IMG-6555"
  },
  {
    "id": "preset_frame_105",
    "rawId": "frame_8",
    "rawName": "8",
    "sourceIndex": 106,
    "url": "https://i.postimg.cc/g2PfbSFm/IMG-6556.gif",
    "label": "预设框 #105",
    "tag": "主题系列 #8",
    "fileHint": "IMG-6556"
  },
  {
    "id": "preset_frame_106",
    "rawId": "frame_9",
    "rawName": "9",
    "sourceIndex": 107,
    "url": "https://i.postimg.cc/pLY3WfR8/IMG-6557.gif",
    "label": "预设框 #106",
    "tag": "主题系列 #9",
    "fileHint": "IMG-6557"
  },
  {
    "id": "preset_frame_107",
    "rawId": "frame_10",
    "rawName": "10",
    "sourceIndex": 108,
    "url": "https://i.postimg.cc/65Cmcr7S/IMG-6559.gif",
    "label": "预设框 #107",
    "tag": "主题系列 #10",
    "fileHint": "IMG-6559"
  },
  {
    "id": "preset_frame_108",
    "rawId": "frame_11",
    "rawName": "11",
    "sourceIndex": 109,
    "url": "https://i.postimg.cc/Y94XWYKd/IMG-6560.gif",
    "label": "预设框 #108",
    "tag": "主题系列 #11",
    "fileHint": "IMG-6560"
  },
  {
    "id": "preset_frame_109",
    "rawId": "frame_12",
    "rawName": "12",
    "sourceIndex": 110,
    "url": "https://i.postimg.cc/ydwLXx7s/IMG-6562.gif",
    "label": "预设框 #109",
    "tag": "主题系列 #12",
    "fileHint": "IMG-6562"
  },
  {
    "id": "preset_frame_110",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 111,
    "url": "https://i.postimg.cc/G3y73Fj2/IMG-6563.gif",
    "label": "预设框 #110",
    "tag": "主题系列 #13",
    "fileHint": "IMG-6563"
  },
  {
    "id": "preset_frame_111",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 112,
    "url": "https://i.postimg.cc/TYvkKKkc/IMG-6565.gif",
    "label": "预设框 #111",
    "tag": "主题系列 #14",
    "fileHint": "IMG-6565"
  },
  {
    "id": "preset_frame_112",
    "rawId": "frame_cat_ear",
    "rawName": "1",
    "sourceIndex": 113,
    "url": "https://i.postimg.cc/GmcqjZn8/IMG-6566.gif",
    "label": "预设框 #112",
    "tag": "猫耳装饰",
    "fileHint": "IMG-6566"
  },
  {
    "id": "preset_frame_113",
    "rawId": "frame_ribbon",
    "rawName": "2",
    "sourceIndex": 114,
    "url": "https://i.postimg.cc/k5Gs0K47/IMG-6567.gif",
    "label": "预设框 #113",
    "tag": "丝带蝴蝶结",
    "fileHint": "IMG-6567"
  },
  {
    "id": "preset_frame_114",
    "rawId": "frame_flower",
    "rawName": "3",
    "sourceIndex": 115,
    "url": "https://i.postimg.cc/XJy8JWdh/IMG-6568.gif",
    "label": "预设框 #114",
    "tag": "花环花朵",
    "fileHint": "IMG-6568"
  },
  {
    "id": "preset_frame_115",
    "rawId": "frame_tech",
    "rawName": "4",
    "sourceIndex": 116,
    "url": "https://i.postimg.cc/fycfcvHf/IMG-6569.gif",
    "label": "预设框 #115",
    "tag": "科技流光",
    "fileHint": "IMG-6569"
  },
  {
    "id": "preset_frame_116",
    "rawId": "frame_5",
    "rawName": "5",
    "sourceIndex": 117,
    "url": "https://i.postimg.cc/J7ZxC11H/IMG-6570.gif",
    "label": "预设框 #116",
    "tag": "主题系列 #5",
    "fileHint": "IMG-6570"
  },
  {
    "id": "preset_frame_117",
    "rawId": "frame_6",
    "rawName": "6",
    "sourceIndex": 118,
    "url": "https://i.postimg.cc/hPnrSHjy/IMG-4434.gif",
    "label": "预设框 #117",
    "tag": "主题系列 #6",
    "fileHint": "IMG-4434"
  },
  {
    "id": "preset_frame_118",
    "rawId": "frame_7",
    "rawName": "7",
    "sourceIndex": 119,
    "url": "https://i.postimg.cc/YqxxjbLp/IMG-6572.gif",
    "label": "预设框 #118",
    "tag": "主题系列 #7",
    "fileHint": "IMG-6572"
  },
  {
    "id": "preset_frame_119",
    "rawId": "frame_8",
    "rawName": "8",
    "sourceIndex": 120,
    "url": "https://i.postimg.cc/wjfcQMkZ/IMG-6573.gif",
    "label": "预设框 #119",
    "tag": "主题系列 #8",
    "fileHint": "IMG-6573"
  },
  {
    "id": "preset_frame_120",
    "rawId": "frame_9",
    "rawName": "9",
    "sourceIndex": 121,
    "url": "https://i.postimg.cc/Vv8jkCYr/IMG-6574.gif",
    "label": "预设框 #120",
    "tag": "主题系列 #9",
    "fileHint": "IMG-6574"
  },
  {
    "id": "preset_frame_121",
    "rawId": "frame_10",
    "rawName": "10",
    "sourceIndex": 122,
    "url": "https://i.postimg.cc/MZ77rdDy/IMG-6850.gif",
    "label": "预设框 #121",
    "tag": "主题系列 #10",
    "fileHint": "IMG-6850"
  },
  {
    "id": "preset_frame_122",
    "rawId": "frame_11",
    "rawName": "11",
    "sourceIndex": 123,
    "url": "https://i.postimg.cc/T3NvqJCZ/IMG-6851.gif",
    "label": "预设框 #122",
    "tag": "主题系列 #11",
    "fileHint": "IMG-6851"
  },
  {
    "id": "preset_frame_123",
    "rawId": "frame_12",
    "rawName": "12",
    "sourceIndex": 124,
    "url": "https://i.postimg.cc/28TsrxRV/IMG-6852.gif",
    "label": "预设框 #123",
    "tag": "主题系列 #12",
    "fileHint": "IMG-6852"
  },
  {
    "id": "preset_frame_124",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 125,
    "url": "https://i.postimg.cc/VkV2bLNw/IMG-6853.gif",
    "label": "预设框 #124",
    "tag": "主题系列 #13",
    "fileHint": "IMG-6853"
  },
  {
    "id": "preset_frame_125",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 126,
    "url": "https://i.postimg.cc/gJ95NSRB/IMG-6854.gif",
    "label": "预设框 #125",
    "tag": "主题系列 #14",
    "fileHint": "IMG-6854"
  },
  {
    "id": "preset_frame_126",
    "rawId": "frame_cat_ear",
    "rawName": "1",
    "sourceIndex": 127,
    "url": "https://i.postimg.cc/d1qsQsbQ/IMG-6855.gif",
    "label": "预设框 #126",
    "tag": "猫耳装饰",
    "fileHint": "IMG-6855"
  },
  {
    "id": "preset_frame_127",
    "rawId": "frame_ribbon",
    "rawName": "2",
    "sourceIndex": 128,
    "url": "https://i.postimg.cc/gJNYx9pV/IMG-6856.gif",
    "label": "预设框 #127",
    "tag": "丝带蝴蝶结",
    "fileHint": "IMG-6856"
  },
  {
    "id": "preset_frame_128",
    "rawId": "frame_flower",
    "rawName": "3",
    "sourceIndex": 129,
    "url": "https://i.postimg.cc/fyPDvxJk/IMG-6860.gif",
    "label": "预设框 #128",
    "tag": "花环花朵",
    "fileHint": "IMG-6860"
  },
  {
    "id": "preset_frame_129",
    "rawId": "frame_tech",
    "rawName": "4",
    "sourceIndex": 130,
    "url": "https://i.postimg.cc/QMDsSNxg/IMG-6861.gif",
    "label": "预设框 #129",
    "tag": "科技流光",
    "fileHint": "IMG-6861"
  },
  {
    "id": "preset_frame_130",
    "rawId": "frame_5",
    "rawName": "5",
    "sourceIndex": 131,
    "url": "https://i.postimg.cc/vBqsQW7X/IMG-6858.gif",
    "label": "预设框 #130",
    "tag": "主题系列 #5",
    "fileHint": "IMG-6858"
  },
  {
    "id": "preset_frame_131",
    "rawId": "frame_6",
    "rawName": "6",
    "sourceIndex": 132,
    "url": "https://i.postimg.cc/Y0vwjhb7/IMG-6857.gif",
    "label": "预设框 #131",
    "tag": "主题系列 #6",
    "fileHint": "IMG-6857"
  },
  {
    "id": "preset_frame_132",
    "rawId": "frame_7",
    "rawName": "7",
    "sourceIndex": 133,
    "url": "https://i.postimg.cc/90sH9Cn7/IMG-6868.gif",
    "label": "预设框 #132",
    "tag": "主题系列 #7",
    "fileHint": "IMG-6868"
  },
  {
    "id": "preset_frame_133",
    "rawId": "frame_8",
    "rawName": "8",
    "sourceIndex": 134,
    "url": "https://i.postimg.cc/Y2PHZzCC/IMG-6866.gif",
    "label": "预设框 #133",
    "tag": "主题系列 #8",
    "fileHint": "IMG-6866"
  },
  {
    "id": "preset_frame_134",
    "rawId": "frame_9",
    "rawName": "9",
    "sourceIndex": 135,
    "url": "https://i.postimg.cc/7Z8yYP7v/IMG-6889.gif",
    "label": "预设框 #134",
    "tag": "主题系列 #9",
    "fileHint": "IMG-6889"
  },
  {
    "id": "preset_frame_135",
    "rawId": "frame_10",
    "rawName": "10",
    "sourceIndex": 136,
    "url": "https://i.postimg.cc/nryNzTXK/IMG-6915.gif",
    "label": "预设框 #135",
    "tag": "主题系列 #10",
    "fileHint": "IMG-6915"
  },
  {
    "id": "preset_frame_136",
    "rawId": "frame_11",
    "rawName": "11",
    "sourceIndex": 137,
    "url": "https://i.postimg.cc/Qx5dqyJ3/IMG-6917.gif",
    "label": "预设框 #136",
    "tag": "主题系列 #11",
    "fileHint": "IMG-6917"
  },
  {
    "id": "preset_frame_137",
    "rawId": "frame_12",
    "rawName": "12",
    "sourceIndex": 138,
    "url": "https://i.postimg.cc/Wbr0JSDD/IMG-5316.gif",
    "label": "预设框 #137",
    "tag": "主题系列 #12",
    "fileHint": "IMG-5316"
  },
  {
    "id": "preset_frame_138",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 139,
    "url": "https://i.postimg.cc/tgR6wjBP/IMG-5570.gif",
    "label": "预设框 #138",
    "tag": "主题系列 #13",
    "fileHint": "IMG-5570"
  },
  {
    "id": "preset_frame_139",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 140,
    "url": "https://i.postimg.cc/d0WCKxff/IMG-6932.gif",
    "label": "预设框 #139",
    "tag": "主题系列 #14",
    "fileHint": "IMG-6932"
  },
  {
    "id": "preset_frame_140",
    "rawId": "frame_11",
    "rawName": "11",
    "sourceIndex": 141,
    "url": "https://i.postimg.cc/Ss3znzk7/IMG-6934.gif",
    "label": "预设框 #140",
    "tag": "主题系列 #11",
    "fileHint": "IMG-6934"
  },
  {
    "id": "preset_frame_141",
    "rawId": "frame_12",
    "rawName": "12",
    "sourceIndex": 142,
    "url": "https://i.postimg.cc/nrm9BcL8/IMG-6941.gif",
    "label": "预设框 #141",
    "tag": "主题系列 #12",
    "fileHint": "IMG-6941"
  },
  {
    "id": "preset_frame_142",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 143,
    "url": "https://i.postimg.cc/ZYvd1jxf/IMG-6937.gif",
    "label": "预设框 #142",
    "tag": "主题系列 #13",
    "fileHint": "IMG-6937"
  },
  {
    "id": "preset_frame_143",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 144,
    "url": "https://i.postimg.cc/sDFhySn3/IMG-6936.gif",
    "label": "预设框 #143",
    "tag": "主题系列 #14",
    "fileHint": "IMG-6936"
  },
  {
    "id": "preset_frame_144",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 145,
    "url": "https://i.postimg.cc/43PhvxRq/IMG-6922.gif",
    "label": "预设框 #144",
    "tag": "主题系列 #13",
    "fileHint": "IMG-6922"
  },
  {
    "id": "preset_frame_145",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 146,
    "url": "https://i.postimg.cc/3Rb46fRZ/IMG-6923.gif",
    "label": "预设框 #145",
    "tag": "主题系列 #14",
    "fileHint": "IMG-6923"
  },
  {
    "id": "preset_frame_146",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 147,
    "url": "https://i.postimg.cc/PJppkbvn/IMG-6918.gif",
    "label": "预设框 #146",
    "tag": "主题系列 #13",
    "fileHint": "IMG-6918"
  },
  {
    "id": "preset_frame_147",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 148,
    "url": "https://i.postimg.cc/XqRZNZ9G/IMG-6916.gif",
    "label": "预设框 #147",
    "tag": "主题系列 #14",
    "fileHint": "IMG-6916"
  },
  {
    "id": "preset_frame_148",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 149,
    "url": "https://i.postimg.cc/RVt6sRzc/IMG-6939.gif",
    "label": "预设框 #148",
    "tag": "主题系列 #14",
    "fileHint": "IMG-6939"
  },
  {
    "id": "preset_frame_149",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 150,
    "url": "https://i.postimg.cc/mgGc0HbK/IMG-6926.gif",
    "label": "预设框 #149",
    "tag": "主题系列 #13",
    "fileHint": "IMG-6926"
  },
  {
    "id": "preset_frame_150",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 151,
    "url": "https://i.postimg.cc/P5zLh5JJ/IMG-6942.gif",
    "label": "预设框 #150",
    "tag": "主题系列 #14",
    "fileHint": "IMG-6942"
  },
  {
    "id": "preset_frame_151",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 152,
    "url": "https://i.postimg.cc/xCqqKGRN/IMG-6929.gif",
    "label": "预设框 #151",
    "tag": "主题系列 #14",
    "fileHint": "IMG-6929"
  },
  {
    "id": "preset_frame_152",
    "rawId": "frame_12",
    "rawName": "12",
    "sourceIndex": 153,
    "url": "https://i.postimg.cc/7LSRp4hx/e7fa949b9pc84cff0dabe57defceb54c.gif",
    "label": "预设框 #152",
    "tag": "主题系列 #12",
    "fileHint": "e7fa949b9pc84cff0dabe57defceb54c"
  },
  {
    "id": "preset_frame_153",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 154,
    "url": "https://i.postimg.cc/DZgMwc1H/817178fdbpf2ff7740dc98e26ab78759.gif",
    "label": "预设框 #153",
    "tag": "主题系列 #13",
    "fileHint": "817178fdbpf2ff7740dc98e26ab78759"
  },
  {
    "id": "preset_frame_154",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 155,
    "url": "https://i.postimg.cc/3NffgJSZ/e09c07034ld7e62266c0a5de6a36ae62.gif",
    "label": "预设框 #154",
    "tag": "主题系列 #14",
    "fileHint": "e09c07034ld7e62266c0a5de6a36ae62"
  },
  {
    "id": "preset_frame_155",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 156,
    "url": "https://i.postimg.cc/vHDNGfT2/35ac7f372v588bf48d4f659077196b85.gif",
    "label": "预设框 #155",
    "tag": "主题系列 #13",
    "fileHint": "35ac7f372v588bf48d4f659077196b85"
  },
  {
    "id": "preset_frame_156",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 157,
    "url": "https://i.postimg.cc/KvVsjjgG/3c3aa5219s18b90187ef1f54b3db7ba8.gif",
    "label": "预设框 #156",
    "tag": "主题系列 #14",
    "fileHint": "3c3aa5219s18b90187ef1f54b3db7ba8"
  },
  {
    "id": "preset_frame_157",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 158,
    "url": "https://i.postimg.cc/k5P1NHcL/55f3e31d8qbc8a02d152b07b99d31567.gif",
    "label": "预设框 #157",
    "tag": "主题系列 #13",
    "fileHint": "55f3e31d8qbc8a02d152b07b99d31567"
  },
  {
    "id": "preset_frame_158",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 159,
    "url": "https://i.postimg.cc/FFCTCzpy/641bad3b3udc599fdb63ca75fde427e5.gif",
    "label": "预设框 #158",
    "tag": "主题系列 #14",
    "fileHint": "641bad3b3udc599fdb63ca75fde427e5"
  },
  {
    "id": "preset_frame_159",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 160,
    "url": "https://i.postimg.cc/8k7YSLjK/1689aa46aqc4b9ffc0f970e668f56537.gif",
    "label": "预设框 #159",
    "tag": "主题系列 #14",
    "fileHint": "1689aa46aqc4b9ffc0f970e668f56537"
  },
  {
    "id": "preset_frame_160",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 161,
    "url": "https://i.postimg.cc/J0CZSwyW/IMG-6938.gif",
    "label": "预设框 #160",
    "tag": "主题系列 #13",
    "fileHint": "IMG-6938"
  },
  {
    "id": "preset_frame_161",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 162,
    "url": "https://i.postimg.cc/Df1qLzDf/IMG-6927.gif",
    "label": "预设框 #161",
    "tag": "主题系列 #14",
    "fileHint": "IMG-6927"
  },
  {
    "id": "preset_frame_162",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 163,
    "url": "https://i.postimg.cc/CLNkrQSW/IMG-6925.gif",
    "label": "预设框 #162",
    "tag": "主题系列 #14",
    "fileHint": "IMG-6925"
  },
  {
    "id": "preset_frame_163",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 164,
    "url": "https://i.postimg.cc/y8p9s3Jj/IMG-6919.gif",
    "label": "预设框 #163",
    "tag": "主题系列 #13",
    "fileHint": "IMG-6919"
  },
  {
    "id": "preset_frame_164",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 165,
    "url": "https://i.postimg.cc/Lsr1Zd3Z/IMG-6928.gif",
    "label": "预设框 #164",
    "tag": "主题系列 #14",
    "fileHint": "IMG-6928"
  },
  {
    "id": "preset_frame_165",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 166,
    "url": "https://i.postimg.cc/Ssgbv41n/IMG-6876.gif",
    "label": "预设框 #165",
    "tag": "主题系列 #14",
    "fileHint": "IMG-6876"
  },
  {
    "id": "preset_frame_166",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 167,
    "url": "https://i.postimg.cc/SNByPrf9/IMG-7005.gif",
    "label": "预设框 #166",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7005"
  },
  {
    "id": "preset_frame_167",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 168,
    "url": "https://i.postimg.cc/Z5nrCyS5/IMG-7006.gif",
    "label": "预设框 #167",
    "tag": "主题系列 #13",
    "fileHint": "IMG-7006"
  },
  {
    "id": "preset_frame_168",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 169,
    "url": "https://i.postimg.cc/mDfMXXFP/IMG-7007.gif",
    "label": "预设框 #168",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7007"
  },
  {
    "id": "preset_frame_169",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 170,
    "url": "https://i.postimg.cc/DZrGtrqB/IMG-7008.gif",
    "label": "预设框 #169",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7008"
  },
  {
    "id": "preset_frame_170",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 171,
    "url": "https://i.postimg.cc/ZnJNZWHZ/IMG-7009.gif",
    "label": "预设框 #170",
    "tag": "主题系列 #13",
    "fileHint": "IMG-7009"
  },
  {
    "id": "preset_frame_171",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 172,
    "url": "https://i.postimg.cc/RhGH0vpt/IMG-7010.gif",
    "label": "预设框 #171",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7010"
  },
  {
    "id": "preset_frame_172",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 173,
    "url": "https://i.postimg.cc/tRzPkzRg/IMG-7012.gif",
    "label": "预设框 #172",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7012"
  },
  {
    "id": "preset_frame_173",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 174,
    "url": "https://i.postimg.cc/wTTNGs3Q/IMG-7013.gif",
    "label": "预设框 #173",
    "tag": "主题系列 #13",
    "fileHint": "IMG-7013"
  },
  {
    "id": "preset_frame_174",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 175,
    "url": "https://i.postimg.cc/3JSG5Jv5/IMG-7014.gif",
    "label": "预设框 #174",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7014"
  },
  {
    "id": "preset_frame_175",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 176,
    "url": "https://i.postimg.cc/rwDr8X1d/IMG-7015.gif",
    "label": "预设框 #175",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7015"
  },
  {
    "id": "preset_frame_176",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 177,
    "url": "https://i.postimg.cc/DzDy2vS7/IMG-7017.gif",
    "label": "预设框 #176",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7017"
  },
  {
    "id": "preset_frame_177",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 178,
    "url": "https://i.postimg.cc/QMVdG9x6/IMG-7016.gif",
    "label": "预设框 #177",
    "tag": "主题系列 #13",
    "fileHint": "IMG-7016"
  },
  {
    "id": "preset_frame_178",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 179,
    "url": "https://i.postimg.cc/mZ9hgH3J/IMG-7019.gif",
    "label": "预设框 #178",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7019"
  },
  {
    "id": "preset_frame_179",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 180,
    "url": "https://i.postimg.cc/t4ksHGdg/IMG-7020.gif",
    "label": "预设框 #179",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7020"
  },
  {
    "id": "preset_frame_180",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 181,
    "url": "https://i.postimg.cc/hP9JpdfT/IMG-7023.gif",
    "label": "预设框 #180",
    "tag": "主题系列 #13",
    "fileHint": "IMG-7023"
  },
  {
    "id": "preset_frame_181",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 182,
    "url": "https://i.postimg.cc/wTKyXVT9/IMG-7024.gif",
    "label": "预设框 #181",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7024"
  },
  {
    "id": "preset_frame_182",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 183,
    "url": "https://i.postimg.cc/ZqjKXPSv/IMG-7025.gif",
    "label": "预设框 #182",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7025"
  },
  {
    "id": "preset_frame_183",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 184,
    "url": "https://i.postimg.cc/gj3Tmqz5/mmexport1751030241029.gif",
    "label": "预设框 #183",
    "tag": "主题系列 #14",
    "fileHint": "mmexport1751030241029"
  },
  {
    "id": "preset_frame_184",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 185,
    "url": "https://i.postimg.cc/4yCXW52F/mmexport1751030908335.gif",
    "label": "预设框 #184",
    "tag": "主题系列 #13",
    "fileHint": "mmexport1751030908335"
  },
  {
    "id": "preset_frame_185",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 186,
    "url": "https://i.postimg.cc/VkXngG72/mmexport1751031208329.gif",
    "label": "预设框 #185",
    "tag": "主题系列 #14",
    "fileHint": "mmexport1751031208329"
  },
  {
    "id": "preset_frame_186",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 187,
    "url": "https://i.postimg.cc/LscBkxZb/mmexport1751017556565.gif",
    "label": "预设框 #186",
    "tag": "主题系列 #14",
    "fileHint": "mmexport1751017556565"
  },
  {
    "id": "preset_frame_187",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 188,
    "url": "https://i.postimg.cc/1XqzGKwJ/mmexport1751018282681.gif",
    "label": "预设框 #187",
    "tag": "主题系列 #13",
    "fileHint": "mmexport1751018282681"
  },
  {
    "id": "preset_frame_188",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 189,
    "url": "https://i.postimg.cc/8kHCQwbQ/mmexport1751020645824.gif",
    "label": "预设框 #188",
    "tag": "主题系列 #14",
    "fileHint": "mmexport1751020645824"
  },
  {
    "id": "preset_frame_189",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 190,
    "url": "https://i.postimg.cc/HWynLK7f/mmexport1751021724230.gif",
    "label": "预设框 #189",
    "tag": "主题系列 #14",
    "fileHint": "mmexport1751021724230"
  },
  {
    "id": "preset_frame_190",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 191,
    "url": "https://i.postimg.cc/JnwFp3Kx/mmexport1751031208329.gif",
    "label": "预设框 #190",
    "tag": "主题系列 #14",
    "fileHint": "mmexport1751031208329"
  },
  {
    "id": "preset_frame_191",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 192,
    "url": "https://i.postimg.cc/HLZNWkQw/mmexport1751031767634.gif",
    "label": "预设框 #191",
    "tag": "主题系列 #13",
    "fileHint": "mmexport1751031767634"
  },
  {
    "id": "preset_frame_192",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 193,
    "url": "https://i.postimg.cc/vH2X6N1y/mmexport1751032231179.gif",
    "label": "预设框 #192",
    "tag": "主题系列 #14",
    "fileHint": "mmexport1751032231179"
  },
  {
    "id": "preset_frame_193",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 194,
    "url": "https://i.postimg.cc/NFS4ZyvM/mmexport1751032686953.gif",
    "label": "预设框 #193",
    "tag": "主题系列 #14",
    "fileHint": "mmexport1751032686953"
  },
  {
    "id": "preset_frame_194",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 195,
    "url": "https://i.postimg.cc/3RpmWc8c/mmexport1751033102811.gif",
    "label": "预设框 #194",
    "tag": "主题系列 #13",
    "fileHint": "mmexport1751033102811"
  },
  {
    "id": "preset_frame_195",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 196,
    "url": "https://i.postimg.cc/L5RLr3tg/mmexport1751035976943.gif",
    "label": "预设框 #195",
    "tag": "主题系列 #14",
    "fileHint": "mmexport1751035976943"
  },
  {
    "id": "preset_frame_196",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 197,
    "url": "https://i.postimg.cc/4NCPsp5d/mmexport1751034427637.gif",
    "label": "预设框 #196",
    "tag": "主题系列 #14",
    "fileHint": "mmexport1751034427637"
  },
  {
    "id": "preset_frame_197",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 198,
    "url": "https://i.postimg.cc/CMv02LHm/mmexport1751034842120.gif",
    "label": "预设框 #197",
    "tag": "主题系列 #14",
    "fileHint": "mmexport1751034842120"
  },
  {
    "id": "preset_frame_198",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 199,
    "url": "https://i.postimg.cc/rFnSzWGx/mmexport1751035618517.gif",
    "label": "预设框 #198",
    "tag": "主题系列 #13",
    "fileHint": "mmexport1751035618517"
  },
  {
    "id": "preset_frame_199",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 200,
    "url": "https://i.postimg.cc/7YRbzN51/mmexport1751036276038.gif",
    "label": "预设框 #199",
    "tag": "主题系列 #14",
    "fileHint": "mmexport1751036276038"
  },
  {
    "id": "preset_frame_200",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 201,
    "url": "https://i.postimg.cc/cJpbtPWq/mmexport1751036607799.gif",
    "label": "预设框 #200",
    "tag": "主题系列 #14",
    "fileHint": "mmexport1751036607799"
  },
  {
    "id": "preset_frame_201",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 202,
    "url": "https://i.postimg.cc/HxLV5v92/mmexport1751036977582.gif",
    "label": "预设框 #201",
    "tag": "主题系列 #13",
    "fileHint": "mmexport1751036977582"
  },
  {
    "id": "preset_frame_202",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 203,
    "url": "https://i.postimg.cc/D01rYy86/mmexport1751037965259.gif",
    "label": "预设框 #202",
    "tag": "主题系列 #14",
    "fileHint": "mmexport1751037965259"
  },
  {
    "id": "preset_frame_203",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 204,
    "url": "https://i.postimg.cc/J4fwkTLW/mmexport1751038167142.gif",
    "label": "预设框 #203",
    "tag": "主题系列 #14",
    "fileHint": "mmexport1751038167142"
  },
  {
    "id": "preset_frame_204",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 205,
    "url": "https://i.postimg.cc/xjpN4swz/IMG-7240.gif",
    "label": "预设框 #204",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7240"
  },
  {
    "id": "preset_frame_205",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 206,
    "url": "https://i.postimg.cc/ZnzbGdxX/IMG-7239.gif",
    "label": "预设框 #205",
    "tag": "主题系列 #13",
    "fileHint": "IMG-7239"
  },
  {
    "id": "preset_frame_206",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 207,
    "url": "https://i.postimg.cc/DyYDmKtw/IMG-7238.gif",
    "label": "预设框 #206",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7238"
  },
  {
    "id": "preset_frame_207",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 208,
    "url": "https://i.postimg.cc/W40f9qtd/IMG-7098.gif",
    "label": "预设框 #207",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7098"
  },
  {
    "id": "preset_frame_208",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 209,
    "url": "https://i.postimg.cc/8PsK20jQ/IMG-7236.gif",
    "label": "预设框 #208",
    "tag": "主题系列 #13",
    "fileHint": "IMG-7236"
  },
  {
    "id": "preset_frame_209",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 210,
    "url": "https://i.postimg.cc/cHsTXDVz/IMG-7235.gif",
    "label": "预设框 #209",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7235"
  },
  {
    "id": "preset_frame_210",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 211,
    "url": "https://i.postimg.cc/sXwm8Yzg/IMG-7234.gif",
    "label": "预设框 #210",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7234"
  },
  {
    "id": "preset_frame_211",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 212,
    "url": "https://i.postimg.cc/xTk5xN49/IMG-7233.gif",
    "label": "预设框 #211",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7233"
  },
  {
    "id": "preset_frame_212",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 213,
    "url": "https://i.postimg.cc/k5yv6QBv/IMG-7232.gif",
    "label": "预设框 #212",
    "tag": "主题系列 #13",
    "fileHint": "IMG-7232"
  },
  {
    "id": "preset_frame_213",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 214,
    "url": "https://i.postimg.cc/yx2m4nbs/IMG-7231.gif",
    "label": "预设框 #213",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7231"
  },
  {
    "id": "preset_frame_214",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 215,
    "url": "https://i.postimg.cc/vZt0fFKn/IMB-r-HMBXY.gif",
    "label": "预设框 #214",
    "tag": "主题系列 #14",
    "fileHint": "IMB-r-HMBXY"
  },
  {
    "id": "preset_frame_215",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 216,
    "url": "https://i.postimg.cc/pddJj9zN/IMG-7094.gif",
    "label": "预设框 #215",
    "tag": "主题系列 #13",
    "fileHint": "IMG-7094"
  },
  {
    "id": "preset_frame_216",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 217,
    "url": "https://i.postimg.cc/rmB17Qbc/IMB-f-VDf-Fc.gif",
    "label": "预设框 #216",
    "tag": "主题系列 #14",
    "fileHint": "IMB-f-VDf-Fc"
  },
  {
    "id": "preset_frame_217",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 218,
    "url": "https://i.postimg.cc/VkKjzYTK/IMB-f4kk-CT.gif",
    "label": "预设框 #217",
    "tag": "主题系列 #14",
    "fileHint": "IMB-f4kk-CT"
  },
  {
    "id": "preset_frame_218",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 219,
    "url": "https://i.postimg.cc/B6KD52vz/IMG-7096.gif",
    "label": "预设框 #218",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7096"
  },
  {
    "id": "preset_frame_219",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 220,
    "url": "https://i.postimg.cc/9XPwWmwy/IMB-Kf7um-P.gif",
    "label": "预设框 #219",
    "tag": "主题系列 #13",
    "fileHint": "IMB-Kf7um-P"
  },
  {
    "id": "preset_frame_220",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 221,
    "url": "https://i.postimg.cc/mrFhKBGz/IMB-e-QWBpa.gif",
    "label": "预设框 #220",
    "tag": "主题系列 #14",
    "fileHint": "IMB-e-QWBpa"
  },
  {
    "id": "preset_frame_221",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 222,
    "url": "https://i.postimg.cc/bw4wxW2z/IMB-16r-COL.gif",
    "label": "预设框 #221",
    "tag": "主题系列 #14",
    "fileHint": "IMB-16r-COL"
  },
  {
    "id": "preset_frame_222",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 223,
    "url": "https://i.postimg.cc/3x0Kx1fz/IMB-K1u-Jp-P.gif",
    "label": "预设框 #222",
    "tag": "主题系列 #13",
    "fileHint": "IMB-K1u-Jp-P"
  },
  {
    "id": "preset_frame_223",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 224,
    "url": "https://i.postimg.cc/CLz0cJ0d/IMG-7116.gif",
    "label": "预设框 #223",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7116"
  },
  {
    "id": "preset_frame_224",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 225,
    "url": "https://i.postimg.cc/fyyGgW61/IMG-7115.gif",
    "label": "预设框 #224",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7115"
  },
  {
    "id": "preset_frame_225",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 226,
    "url": "https://i.postimg.cc/gkk7s0vD/IMG-6984.gif",
    "label": "预设框 #225",
    "tag": "主题系列 #14",
    "fileHint": "IMG-6984"
  },
  {
    "id": "preset_frame_226",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 227,
    "url": "https://i.postimg.cc/0NpZPgYj/IMG-6985.gif",
    "label": "预设框 #226",
    "tag": "主题系列 #13",
    "fileHint": "IMG-6985"
  },
  {
    "id": "preset_frame_227",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 228,
    "url": "https://i.postimg.cc/tTWKKmTN/IMG-7073.gif",
    "label": "预设框 #227",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7073"
  },
  {
    "id": "preset_frame_228",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 229,
    "url": "https://i.postimg.cc/jS8tc9wW/IMG-7083.gif",
    "label": "预设框 #228",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7083"
  },
  {
    "id": "preset_frame_229",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 230,
    "url": "https://i.postimg.cc/rmRVKJpD/IMG-7087.gif",
    "label": "预设框 #229",
    "tag": "主题系列 #13",
    "fileHint": "IMG-7087"
  },
  {
    "id": "preset_frame_230",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 231,
    "url": "https://i.postimg.cc/zvWGPjms/IMG-7090.gif",
    "label": "预设框 #230",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7090"
  },
  {
    "id": "preset_frame_231",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 232,
    "url": "https://i.postimg.cc/YSkqDg8V/IMG-7092.gif",
    "label": "预设框 #231",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7092"
  },
  {
    "id": "preset_frame_232",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 233,
    "url": "https://i.postimg.cc/FzqHTBng/IMG-7093.gif",
    "label": "预设框 #232",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7093"
  },
  {
    "id": "preset_frame_233",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 234,
    "url": "https://i.postimg.cc/tTpZ6wLs/IMG-7095.gif",
    "label": "预设框 #233",
    "tag": "主题系列 #13",
    "fileHint": "IMG-7095"
  },
  {
    "id": "preset_frame_234",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 235,
    "url": "https://i.postimg.cc/8P5vt8sW/IMG-7097.gif",
    "label": "预设框 #234",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7097"
  },
  {
    "id": "preset_frame_235",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 236,
    "url": "https://i.postimg.cc/wMxmCZVC/IMG-7099.gif",
    "label": "预设框 #235",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7099"
  },
  {
    "id": "preset_frame_236",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 237,
    "url": "https://i.postimg.cc/2jxd0FGp/IMG-7100.gif",
    "label": "预设框 #236",
    "tag": "主题系列 #13",
    "fileHint": "IMG-7100"
  },
  {
    "id": "preset_frame_237",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 238,
    "url": "https://i.postimg.cc/B6T59xGK/IMG-7101.gif",
    "label": "预设框 #237",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7101"
  },
  {
    "id": "preset_frame_238",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 239,
    "url": "https://i.postimg.cc/kXfcgFRN/IMG-7106.gif",
    "label": "预设框 #238",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7106"
  },
  {
    "id": "preset_frame_239",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 240,
    "url": "https://i.postimg.cc/htZppbS4/IMG-7107.gif",
    "label": "预设框 #239",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7107"
  },
  {
    "id": "preset_frame_240",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 241,
    "url": "https://i.postimg.cc/hPgyjtyn/IMG-7108.gif",
    "label": "预设框 #240",
    "tag": "主题系列 #13",
    "fileHint": "IMG-7108"
  },
  {
    "id": "preset_frame_241",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 242,
    "url": "https://i.postimg.cc/HLKvs0Kv/IMG-7109.gif",
    "label": "预设框 #241",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7109"
  },
  {
    "id": "preset_frame_242",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 243,
    "url": "https://i.postimg.cc/wjwbnYkp/IMG-7111.gif",
    "label": "预设框 #242",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7111"
  },
  {
    "id": "preset_frame_243",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 244,
    "url": "https://i.postimg.cc/bJDMQVkj/IMG-7112.gif",
    "label": "预设框 #243",
    "tag": "主题系列 #13",
    "fileHint": "IMG-7112"
  },
  {
    "id": "preset_frame_244",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 245,
    "url": "https://i.postimg.cc/SNWBTP5S/IMG-7113.gif",
    "label": "预设框 #244",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7113"
  },
  {
    "id": "preset_frame_245",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 246,
    "url": "https://i.postimg.cc/jCVMQsKH/IMG-7114.gif",
    "label": "预设框 #245",
    "tag": "主题系列 #14",
    "fileHint": "IMG-7114"
  },
  {
    "id": "preset_frame_246",
    "rawId": "frame_1",
    "rawName": "1",
    "sourceIndex": 247,
    "url": "https://i.postimg.cc/50W2jZGN/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mj-E4SURh-Uz-J2ZVFv-IQUAc-XVu-Z3o.gif",
    "label": "预设框 #246",
    "tag": "主题系列 #1",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mj-E4SURh-Uz-J2ZVFv-IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_247",
    "rawId": "frame_2",
    "rawName": "2",
    "sourceIndex": 248,
    "url": "https://i.postimg.cc/85gzsq3h/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mj-I4SURh-WTRLYk-Fv-IQUAc-XVu-Z3o.gif",
    "label": "预设框 #247",
    "tag": "主题系列 #2",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mj-I4SURh-WTRLYk-Fv-IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_248",
    "rawId": "frame_3",
    "rawName": "3",
    "sourceIndex": 249,
    "url": "https://i.postimg.cc/tTG47LfS/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mj-Jj-SURh-Vmd2ZUFv-IQUAc-XVu-Z3o.gif",
    "label": "预设框 #248",
    "tag": "主题系列 #3",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mj-Jj-SURh-Vmd2ZUFv-IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_249",
    "rawId": "frame_4",
    "rawName": "4",
    "sourceIndex": 250,
    "url": "https://i.postimg.cc/sXPDWTd4/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mj-JNSURh-Vj-Iw-ZWdv-IQUAc-XVu-Z3o.gif",
    "label": "预设框 #249",
    "tag": "主题系列 #4",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mj-JNSURh-Vj-Iw-ZWdv-IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_250",
    "rawId": "frame_5",
    "rawName": "5",
    "sourceIndex": 251,
    "url": "https://i.postimg.cc/SsLN9gFG/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mj-Jz-SURh-Yj-Ru-Ymdv-IQUAc-XVu-Z3o.gif",
    "label": "预设框 #250",
    "tag": "主题系列 #5",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mj-Jz-SURh-Yj-Ru-Ymdv-IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_251",
    "rawId": "frame_6",
    "rawName": "6",
    "sourceIndex": 252,
    "url": "https://i.postimg.cc/SsLN9gb4/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mj-NNSURh-Yz-FZYmdv-IQUAc-XVu-Z3o.gif",
    "label": "预设框 #251",
    "tag": "主题系列 #6",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mj-NNSURh-Yz-FZYmdv-IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_252",
    "rawId": "frame_7",
    "rawName": "7",
    "sourceIndex": 253,
    "url": "https://i.postimg.cc/cJnJxsDg/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mjc4RURh-WDl1R3pn-IQUAc-XVu-Z3o.gif",
    "label": "预设框 #252",
    "tag": "主题系列 #7",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mjc4RURh-WDl1R3pn-IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_253",
    "rawId": "frame_8",
    "rawName": "8",
    "sourceIndex": 254,
    "url": "https://i.postimg.cc/tTG47Lfq/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mjdz-RURh-Un-Vm-SERn-IQUAc-XVu-Z3o.gif",
    "label": "预设框 #253",
    "tag": "主题系列 #8",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mjdz-RURh-Un-Vm-SERn-IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_254",
    "rawId": "frame_9",
    "rawName": "9",
    "sourceIndex": 255,
    "url": "https://i.postimg.cc/DZ3wmtDb/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mjh-NRURh-UW9VRURn-IQUAc-XVu-Z3o.gif",
    "label": "预设框 #254",
    "tag": "主题系列 #9",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mjh-NRURh-UW9VRURn-IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_255",
    "rawId": "frame_10",
    "rawName": "10",
    "sourceIndex": 256,
    "url": "https://i.postimg.cc/76rZbpcG/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mjhj-RURh-Yml-QRHpn-IQUAc-XVu-Z3o.gif",
    "label": "预设框 #255",
    "tag": "主题系列 #10",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mjhj-RURh-Yml-QRHpn-IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_256",
    "rawId": "frame_11",
    "rawName": "11",
    "sourceIndex": 257,
    "url": "https://i.postimg.cc/Pxn5NBcw/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mjhz-RURh-WWgq-RHpn-IQUAc-XVu-Z3o.gif",
    "label": "预设框 #256",
    "tag": "主题系列 #11",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mjhz-RURh-WWgq-RHpn-IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_257",
    "rawId": "frame_12",
    "rawName": "12",
    "sourceIndex": 258,
    "url": "https://i.postimg.cc/bJ0Nnmc4/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mjl-NQURh-YVVm-Rk-Nr-IQUAc-XVu-Z3o.gif",
    "label": "预设框 #257",
    "tag": "主题系列 #12",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mjl-NQURh-YVVm-Rk-Nr-IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_258",
    "rawId": "frame_13",
    "rawName": "13",
    "sourceIndex": 259,
    "url": "https://i.postimg.cc/Ghg3vBVL/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mk-U4RURh-Vmlv-SFNz-IQUAc-XVu-Z3o.gif",
    "label": "预设框 #258",
    "tag": "主题系列 #13",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mk-U4RURh-Vmlv-SFNz-IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_259",
    "rawId": "frame_14",
    "rawName": "14",
    "sourceIndex": 260,
    "url": "https://i.postimg.cc/YC4rRrBS/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mk-Y4RURh-Zm-Jn-RHlz-IQUAc-XVu-Z3o.gif",
    "label": "预设框 #259",
    "tag": "主题系列 #14",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mk-Y4RURh-Zm-Jn-RHlz-IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_260",
    "rawId": "frame_15",
    "rawName": "15",
    "sourceIndex": 261,
    "url": "https://i.postimg.cc/SxXSdSbc/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mk-Y4TURh-ZDY3ZGc0IQUAc-XVu-Z3o.gif",
    "label": "预设框 #260",
    "tag": "动态特效 #260",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mk-Y4TURh-ZDY3ZGc0IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_261",
    "rawId": "frame_16",
    "rawName": "16",
    "sourceIndex": 262,
    "url": "https://i.postimg.cc/rwdVjV2f/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mk-ZNRURh-Vl-VNSFNz-IQUAc-XVu-Z3o.gif",
    "label": "预设框 #261",
    "tag": "动态特效 #261",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mk-ZNRURh-Vl-VNSFNz-IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_262",
    "rawId": "frame_17",
    "rawName": "17",
    "sourceIndex": 263,
    "url": "https://i.postimg.cc/MHWZm1zv/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mk84VURh-Yk-Fjcnp-BIQUAc-XVu-Z3o.gif",
    "label": "预设框 #262",
    "tag": "动态特效 #262",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mk84VURh-Yk-Fjcnp-BIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_263",
    "rawId": "frame_18",
    "rawName": "18",
    "sourceIndex": 264,
    "url": "https://i.postimg.cc/pr2VJKPP/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mk9j-VURh-Zkh-Dd-Wp-BIQUAc-XVu-Z3o.gif",
    "label": "预设框 #263",
    "tag": "动态特效 #263",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mk9j-VURh-Zkh-Dd-Wp-BIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_264",
    "rawId": "frame_19",
    "rawName": "19",
    "sourceIndex": 265,
    "url": "https://i.postimg.cc/C5FMsbwh/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mk9NVURh-WW4ud-Wp-BIQUAc-XVu-Z3o.gif",
    "label": "预设框 #264",
    "tag": "动态特效 #264",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mk9NVURh-WW4ud-Wp-BIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_265",
    "rawId": "frame_20",
    "rawName": "20",
    "sourceIndex": 266,
    "url": "https://i.postimg.cc/QCXNJcjx/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mk9z-VURh-Wmxncnp-BIQUAc-XVu-Z3o.gif",
    "label": "预设框 #265",
    "tag": "动态特效 #265",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mk9z-VURh-Wmxncnp-BIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_266",
    "rawId": "frame_21",
    "rawName": "21",
    "sourceIndex": 267,
    "url": "https://i.postimg.cc/HnpW9bTb/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mkc4TURh-YTBv-YVE0IQUAc-XVu-Z3o.gif",
    "label": "预设框 #266",
    "tag": "动态特效 #266",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mkc4TURh-YTBv-YVE0IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_267",
    "rawId": "frame_22",
    "rawName": "22",
    "sourceIndex": 268,
    "url": "https://i.postimg.cc/HnBYZjLX/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mkd-NRURh-UXV5RHlz-IQUAc-XVu-Z3o.gif",
    "label": "预设框 #267",
    "tag": "动态特效 #267",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mkd-NRURh-UXV5RHlz-IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_268",
    "rawId": "frame_23",
    "rawName": "23",
    "sourceIndex": 269,
    "url": "https://i.postimg.cc/NFpsJL02/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mkd-NTURh-ZW9FZGc0IQUAc-XVu-Z3o.gif",
    "label": "预设框 #268",
    "tag": "动态特效 #268",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mkd-NTURh-ZW9FZGc0IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_269",
    "rawId": "frame_24",
    "rawName": "24",
    "sourceIndex": 270,
    "url": "https://i.postimg.cc/BbMSYtvX/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mkdj-TURh-VGdn-YWc0IQUAc-XVu-Z3o.gif",
    "label": "预设框 #269",
    "tag": "动态特效 #269",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mkdj-TURh-VGdn-YWc0IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_270",
    "rawId": "frame_25",
    "rawName": "25",
    "sourceIndex": 271,
    "url": "https://i.postimg.cc/nr0FRMLY/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mkdz-TURh-ZFBj-YUE0IQUAc-XVu-Z3o.gif",
    "label": "预设框 #270",
    "tag": "动态特效 #270",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mkdz-TURh-ZFBj-YUE0IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_271",
    "rawId": "frame_26",
    "rawName": "26",
    "sourceIndex": 272,
    "url": "https://i.postimg.cc/zv0zt3f6/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mkh-NTURh-USpm-WFE0IQUAc-XVu-Z3o.gif",
    "label": "预设框 #271",
    "tag": "动态特效 #271",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mkh-NTURh-USpm-WFE0IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_272",
    "rawId": "frame_27",
    "rawName": "27",
    "sourceIndex": 273,
    "url": "https://i.postimg.cc/2y2kc35H/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mkhj-TURh-Vm-ZNWEE0IQUAc-XVu-Z3o.gif",
    "label": "预设框 #272",
    "tag": "动态特效 #272",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mkhj-TURh-Vm-ZNWEE0IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_273",
    "rawId": "frame_28",
    "rawName": "28",
    "sourceIndex": 274,
    "url": "https://i.postimg.cc/jqXSd3hx/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mkhz-TURh-Zlh-JWFE0IQUAc-XVu-Z3o.gif",
    "label": "预设框 #273",
    "tag": "动态特效 #273",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mkhz-TURh-Zlh-JWFE0IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_274",
    "rawId": "frame_29",
    "rawName": "29",
    "sourceIndex": 275,
    "url": "https://i.postimg.cc/CMNxLr4b/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mklz-UURh-ZEQ3Tk-I0IQUAc-XVu-Z3o.gif",
    "label": "预设框 #274",
    "tag": "动态特效 #274",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mklz-UURh-ZEQ3Tk-I0IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_275",
    "rawId": "frame_30",
    "rawName": "30",
    "sourceIndex": 276,
    "url": "https://i.postimg.cc/65p57VHv/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mko4QURh-ZEQ3e-EJ3IQUAc-XVu-Z3o.gif",
    "label": "预设框 #275",
    "tag": "动态特效 #275",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mko4QURh-ZEQ3e-EJ3IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_276",
    "rawId": "frame_31",
    "rawName": "31",
    "sourceIndex": 277,
    "url": "https://i.postimg.cc/bNwNG06T/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mko4UURh-ZDl-SS1I0IQUAc-XVu-Z3o.gif",
    "label": "预设框 #276",
    "tag": "动态特效 #276",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mko4UURh-ZDl-SS1I0IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_277",
    "rawId": "frame_32",
    "rawName": "32",
    "sourceIndex": 278,
    "url": "https://i.postimg.cc/8PzPFdKQ/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mkpj-UURh-VFl-GS1I0IQUAc-XVu-Z3o.gif",
    "label": "预设框 #277",
    "tag": "动态特效 #277",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mkpj-UURh-VFl-GS1I0IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_278",
    "rawId": "frame_33",
    "rawName": "33",
    "sourceIndex": 279,
    "url": "https://i.postimg.cc/tCvRF1wj/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mkpz-UURh-U1Jq-S1I0IQUAc-XVu-Z3o.gif",
    "label": "预设框 #278",
    "tag": "动态特效 #278",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mkpz-UURh-U1Jq-S1I0IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_279",
    "rawId": "frame_34",
    "rawName": "34",
    "sourceIndex": 280,
    "url": "https://i.postimg.cc/Jz91dfR5/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-A4SURh-U0R3a-Hd-FIQUAc-XVu-Z3o.gif",
    "label": "预设框 #279",
    "tag": "动态特效 #279",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-A4SURh-U0R3a-Hd-FIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_280",
    "rawId": "frame_35",
    "rawName": "35",
    "sourceIndex": 281,
    "url": "https://i.postimg.cc/cLVs5pdF/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-A4VURh-Zi5Eb1RBIQUAc-XVu-Z3o.gif",
    "label": "预设框 #280",
    "tag": "动态特效 #280",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-A4VURh-Zi5Eb1RBIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_281",
    "rawId": "frame_36",
    "rawName": "36",
    "sourceIndex": 282,
    "url": "https://i.postimg.cc/htHS3kKY/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Bj-VURh-Vl-Fxb3p-BIQUAc-XVu-Z3o.gif",
    "label": "预设框 #281",
    "tag": "动态特效 #281",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Bj-VURh-Vl-Fxb3p-BIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_282",
    "rawId": "frame_37",
    "rawName": "37",
    "sourceIndex": 283,
    "url": "https://i.postimg.cc/YSYpcdSJ/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Bz-VURh-WXZPb2p-BIQUAc-XVu-Z3o.gif",
    "label": "预设框 #282",
    "tag": "动态特效 #282",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Bz-VURh-WXZPb2p-BIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_283",
    "rawId": "frame_38",
    "rawName": "38",
    "sourceIndex": 284,
    "url": "https://i.postimg.cc/5tLxcs0H/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-E4SURh-Wmx-SYmd-FIQUAc-XVu-Z3o.gif",
    "label": "预设框 #283",
    "tag": "动态特效 #283",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-E4SURh-Wmx-SYmd-FIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_284",
    "rawId": "frame_39",
    "rawName": "39",
    "sourceIndex": 285,
    "url": "https://i.postimg.cc/1zw9xvt4/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-E4VURh-Vj-Y0b-VRBIQUAc-XVu-Z3o.gif",
    "label": "预设框 #284",
    "tag": "动态特效 #284",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-E4VURh-Vj-Y0b-VRBIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_285",
    "rawId": "frame_40",
    "rawName": "40",
    "sourceIndex": 286,
    "url": "https://i.postimg.cc/R0KMrgFc/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Fj-SURh-VG9v-ZWd-FIQUAc-XVu-Z3o.gif",
    "label": "预设框 #285",
    "tag": "动态特效 #285",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Fj-SURh-VG9v-ZWd-FIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_286",
    "rawId": "frame_41",
    "rawName": "41",
    "sourceIndex": 287,
    "url": "https://i.postimg.cc/PxHdd1pP/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Fj-VURh-VWh-Sb-Gp-BIQUAc-XVu-Z3o.gif",
    "label": "预设框 #286",
    "tag": "动态特效 #286",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Fj-VURh-VWh-Sb-Gp-BIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_287",
    "rawId": "frame_42",
    "rawName": "42",
    "sourceIndex": 288,
    "url": "https://i.postimg.cc/sXz335Q4/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-FNSURh-Vm-Nx-ZXd-FIQUAc-XVu-Z3o.gif",
    "label": "预设框 #287",
    "tag": "动态特效 #287",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-FNSURh-Vm-Nx-ZXd-FIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_288",
    "rawId": "frame_43",
    "rawName": "43",
    "sourceIndex": 289,
    "url": "https://i.postimg.cc/764qqSGc/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-FNVURh-VE1ub-Gp-BIQUAc-XVu-Z3o.gif",
    "label": "预设框 #288",
    "tag": "动态特效 #288",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-FNVURh-VE1ub-Gp-BIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_289",
    "rawId": "frame_44",
    "rawName": "44",
    "sourceIndex": 290,
    "url": "https://i.postimg.cc/bJRprdkW/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Fz-SURh-UVB2ZVFFIQUAc-XVu-Z3o.gif",
    "label": "预设框 #289",
    "tag": "动态特效 #289",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Fz-SURh-UVB2ZVFFIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_290",
    "rawId": "frame_45",
    "rawName": "45",
    "sourceIndex": 291,
    "url": "https://i.postimg.cc/LXV25hjF/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-I4RURh-Vkw3Nl-Mw-IQUAc-XVu-Z3o.gif",
    "label": "预设框 #290",
    "tag": "动态特效 #290",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-I4RURh-Vkw3Nl-Mw-IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_291",
    "rawId": "frame_46",
    "rawName": "46",
    "sourceIndex": 292,
    "url": "https://i.postimg.cc/ZRL4n06R/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-I4TURh-WDVFKnh-BIQUAc-XVu-Z3o.gif",
    "label": "预设框 #291",
    "tag": "动态特效 #291",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-I4TURh-WDVFKnh-BIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_292",
    "rawId": "frame_47",
    "rawName": "47",
    "sourceIndex": 293,
    "url": "https://i.postimg.cc/Gthryrj1/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-I4VURh-Zm1u-Z1RBIQUAc-XVu-Z3o.gif",
    "label": "预设框 #292",
    "tag": "动态特效 #292",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-I4VURh-Zm1u-Z1RBIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_293",
    "rawId": "frame_48",
    "rawName": "48",
    "sourceIndex": 294,
    "url": "https://i.postimg.cc/4yNZ9Z14/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Jj-RURh-UWx1OWkw-IQUAc-XVu-Z3o.gif",
    "label": "预设框 #293",
    "tag": "动态特效 #293",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Jj-RURh-UWx1OWkw-IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_294",
    "rawId": "frame_49",
    "rawName": "49",
    "sourceIndex": 295,
    "url": "https://i.postimg.cc/zvX5g5kX/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Jj-SURh-Ynd-WYmd-FIQUAc-XVu-Z3o.gif",
    "label": "预设框 #294",
    "tag": "动态特效 #294",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Jj-SURh-Ynd-WYmd-FIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_295",
    "rawId": "frame_50",
    "rawName": "50",
    "sourceIndex": 296,
    "url": "https://i.postimg.cc/2y8mZmxv/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Jj-TURh-U3JSKmh-BIQUAc-XVu-Z3o.gif",
    "label": "预设框 #295",
    "tag": "动态特效 #295",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Jj-TURh-U3JSKmh-BIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_296",
    "rawId": "frame_51",
    "rawName": "51",
    "sourceIndex": 297,
    "url": "https://i.postimg.cc/J04mkmQj/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Jj-VURh-ZS5sa-FRBIQUAc-XVu-Z3o.gif",
    "label": "预设框 #296",
    "tag": "动态特效 #296",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Jj-VURh-ZS5sa-FRBIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_297",
    "rawId": "frame_52",
    "rawName": "52",
    "sourceIndex": 298,
    "url": "https://i.postimg.cc/vTqy7jP9/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-JNRURh-VVVs-OWkw-IQUAc-XVu-Z3o.gif",
    "label": "预设框 #297",
    "tag": "动态特效 #297",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-JNRURh-VVVs-OWkw-IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_298",
    "rawId": "frame_53",
    "rawName": "53",
    "sourceIndex": 299,
    "url": "https://i.postimg.cc/sx6zP8n9/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-JNSURh-ZFc1Yl-FFIQUAc-XVu-Z3o.gif",
    "label": "预设框 #298",
    "tag": "动态特效 #298",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-JNSURh-ZFc1Yl-FFIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_299",
    "rawId": "frame_54",
    "rawName": "54",
    "sourceIndex": 300,
    "url": "https://i.postimg.cc/VvGw9T7D/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-JNTURh-VEd-QQ1JFIQUAc-XVu-Z3o.gif",
    "label": "预设框 #299",
    "tag": "动态特效 #299",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-JNTURh-VEd-QQ1JFIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_300",
    "rawId": "frame_55",
    "rawName": "55",
    "sourceIndex": 301,
    "url": "https://i.postimg.cc/yxQKh5fb/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-JNVURh-UTl2a-Wp-BIQUAc-XVu-Z3o.gif",
    "label": "预设框 #300",
    "tag": "动态特效 #300",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-JNVURh-UTl2a-Wp-BIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_301",
    "rawId": "frame_56",
    "rawName": "56",
    "sourceIndex": 302,
    "url": "https://i.postimg.cc/J7PRWD1z/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Jz-VURh-YXdta-Xp-BIQUAc-XVu-Z3o.gif",
    "label": "预设框 #301",
    "tag": "动态特效 #301",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Jz-VURh-YXdta-Xp-BIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_302",
    "rawId": "frame_57",
    "rawName": "57",
    "sourceIndex": 303,
    "url": "https://i.postimg.cc/J7PRWD1z/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-M4VURh-ZTZx-ZERBIQUAc-XVu-Z3o.gif",
    "label": "预设框 #302",
    "tag": "动态特效 #302",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-M4VURh-ZTZx-ZERBIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_303",
    "rawId": "frame_58",
    "rawName": "58",
    "sourceIndex": 304,
    "url": "https://i.postimg.cc/SQDmp2yn/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Nj-TURh-YWNVOHh-BIQUAc-XVu-Z3o.gif",
    "label": "预设框 #303",
    "tag": "动态特效 #303",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Nj-TURh-YWNVOHh-BIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_304",
    "rawId": "frame_59",
    "rawName": "59",
    "sourceIndex": 305,
    "url": "https://i.postimg.cc/h4pKqzS8/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-NNRURh-WWJ1Nl-Mw-IQUAc-XVu-Z3o.gif",
    "label": "预设框 #304",
    "tag": "动态特效 #304",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-NNRURh-WWJ1Nl-Mw-IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_305",
    "rawId": "frame_60",
    "rawName": "60",
    "sourceIndex": 306,
    "url": "https://i.postimg.cc/vHTb8YBt/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-NNVURh-Zko2Z0RBIQUAc-XVu-Z3o.gif",
    "label": "预设框 #305",
    "tag": "动态特效 #305",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-NNVURh-Zko2Z0RBIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_306",
    "rawId": "frame_61",
    "rawName": "61",
    "sourceIndex": 307,
    "url": "https://i.postimg.cc/4Nys4fdF/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Nz-TURh-ZXo4OFJBIQUAc-XVu-Z3o.gif",
    "label": "预设框 #306",
    "tag": "动态特效 #306",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Nz-TURh-ZXo4OFJBIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_307",
    "rawId": "frame_62",
    "rawName": "62",
    "sourceIndex": 308,
    "url": "https://i.postimg.cc/CL5SMh5M/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Nz-VURh-Zld-DZGp-BIQUAc-XVu-Z3o.gif",
    "label": "预设框 #307",
    "tag": "动态特效 #307",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Nz-VURh-Zld-DZGp-BIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_308",
    "rawId": "frame_63",
    "rawName": "63",
    "sourceIndex": 309,
    "url": "https://i.postimg.cc/SNPqJBYS/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Q4VURh-Y2Fa-WFRBIQUAc-XVu-Z3o.gif",
    "label": "预设框 #308",
    "tag": "动态特效 #308",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Q4VURh-Y2Fa-WFRBIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_309",
    "rawId": "frame_64",
    "rawName": "64",
    "sourceIndex": 310,
    "url": "https://i.postimg.cc/DyNF894W/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-U4VURh-Uk8y-VURBIQUAc-XVu-Z3o.gif",
    "label": "预设框 #309",
    "tag": "动态特效 #309",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-U4VURh-Uk8y-VURBIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_310",
    "rawId": "frame_65",
    "rawName": "65",
    "sourceIndex": 311,
    "url": "https://i.postimg.cc/JzB8JpjD/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Vj-VURh-YS5NWERBIQUAc-XVu-Z3o.gif",
    "label": "预设框 #310",
    "tag": "动态特效 #310",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Vj-VURh-YS5NWERBIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_311",
    "rawId": "frame_66",
    "rawName": "66",
    "sourceIndex": 312,
    "url": "https://i.postimg.cc/dVTFd5GC/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-VNVURh-Wl-Bi-WERBIQUAc-XVu-Z3o.gif",
    "label": "预设框 #311",
    "tag": "动态特效 #311",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-VNVURh-Wl-Bi-WERBIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_312",
    "rawId": "frame_67",
    "rawName": "67",
    "sourceIndex": 313,
    "url": "https://i.postimg.cc/t4VbPBFS/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Y4VURh-ZWdl-Ul-RBIQUAc-XVu-Z3o.gif",
    "label": "预设框 #312",
    "tag": "动态特效 #312",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Y4VURh-ZWdl-Ul-RBIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_313",
    "rawId": "frame_68",
    "rawName": "68",
    "sourceIndex": 314,
    "url": "https://i.postimg.cc/k53myWyT/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-ZNVURh-Wjg3VURBIQUAc-XVu-Z3o.gif",
    "label": "预设框 #313",
    "tag": "动态特效 #313",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-ZNVURh-Wjg3VURBIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_314",
    "rawId": "frame_69",
    "rawName": "69",
    "sourceIndex": 315,
    "url": "https://i.postimg.cc/zfZrkTk2/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Zz-VURh-Zm5GUk-RBIQUAc-XVu-Z3o.gif",
    "label": "预设框 #314",
    "tag": "动态特效 #314",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Ml-Zz-VURh-Zm5GUk-RBIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_315",
    "rawId": "frame_70",
    "rawName": "70",
    "sourceIndex": 316,
    "url": "https://i.postimg.cc/xdM0r6Cn/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mlc4QURh-Vm-ZCNFI4IQUAc-XVu-Z3o.gif",
    "label": "预设框 #315",
    "tag": "动态特效 #315",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mlc4QURh-Vm-ZCNFI4IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_316",
    "rawId": "frame_71",
    "rawName": "71",
    "sourceIndex": 317,
    "url": "https://i.postimg.cc/9fZW3LMW/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mldz-QURh-VDUq-NGg4IQUAc-XVu-Z3o.gif",
    "label": "预设框 #316",
    "tag": "动态特效 #316",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mldz-QURh-VDUq-NGg4IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_317",
    "rawId": "frame_72",
    "rawName": "72",
    "sourceIndex": 318,
    "url": "https://i.postimg.cc/3wXHfWSw/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mm-I4SURh-Y09JSWd-RIQUAc-XVu-Z3o.gif",
    "label": "预设框 #317",
    "tag": "动态特效 #317",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mm-I4SURh-Y09JSWd-RIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_318",
    "rawId": "frame_73",
    "rawName": "73",
    "sourceIndex": 319,
    "url": "https://i.postimg.cc/LstMQhC5/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mm-Jj-SURh-VU9VSXd-RIQUAc-XVu-Z3o.gif",
    "label": "预设框 #318",
    "tag": "动态特效 #318",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mm-Jj-SURh-VU9VSXd-RIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_319",
    "rawId": "frame_74",
    "rawName": "74",
    "sourceIndex": 320,
    "url": "https://i.postimg.cc/7L3ytbs5/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mm-JNSURh-Y2Fu-TFFRIQUAc-XVu-Z3o.gif",
    "label": "预设框 #319",
    "tag": "动态特效 #319",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mm-JNSURh-Y2Fu-TFFRIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_320",
    "rawId": "frame_75",
    "rawName": "75",
    "sourceIndex": 321,
    "url": "https://i.postimg.cc/8CRVXsKr/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mm-Jz-SURh-YWVi-SWd-RIQUAc-XVu-Z3o.gif",
    "label": "预设框 #320",
    "tag": "动态特效 #320",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mm-Jz-SURh-YWVi-SWd-RIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_321",
    "rawId": "frame_76",
    "rawName": "76",
    "sourceIndex": 322,
    "url": "https://i.postimg.cc/63Bxkwgr/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mm-Nj-SURh-U2h-XRmd-RIQUAc-XVu-Z3o.gif",
    "label": "预设框 #321",
    "tag": "动态特效 #321",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mm-Nj-SURh-U2h-XRmd-RIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_322",
    "rawId": "frame_77",
    "rawName": "77",
    "sourceIndex": 323,
    "url": "https://i.postimg.cc/C1wp3YX4/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mm-Nz-SURh-VGYy-Rmd-RIQUAc-XVu-Z3o.gif",
    "label": "预设框 #322",
    "tag": "动态特效 #322",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mm-Nz-SURh-VGYy-Rmd-RIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_323",
    "rawId": "frame_78",
    "rawName": "78",
    "sourceIndex": 324,
    "url": "https://i.postimg.cc/MG2SY1D2/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mm04UURh-VVht-Vk-NZIQUAc-XVu-Z3o.gif",
    "label": "预设框 #323",
    "tag": "动态特效 #323",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mm04UURh-VVht-Vk-NZIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_324",
    "rawId": "frame_79",
    "rawName": "79",
    "sourceIndex": 325,
    "url": "https://i.postimg.cc/Bv90C2Cy/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mm1NUURh-WHI1WUNZIQUAc-XVu-Z3o.gif",
    "label": "预设框 #324",
    "tag": "动态特效 #324",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mm1NUURh-WHI1WUNZIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_325",
    "rawId": "frame_80",
    "rawName": "80",
    "sourceIndex": 326,
    "url": "https://i.postimg.cc/k53myWyL/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mm1z-UURh-VWI1V0NZIQUAc-XVu-Z3o.gif",
    "label": "预设框 #325",
    "tag": "动态特效 #325",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mm1z-UURh-VWI1V0NZIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_326",
    "rawId": "frame_81",
    "rawName": "81",
    "sourceIndex": 327,
    "url": "https://i.postimg.cc/CKTg4bNV/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mm5j-UURh-YXBl-VGl-ZIQUAc-XVu-Z3o.gif",
    "label": "预设框 #326",
    "tag": "动态特效 #326",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mm5j-UURh-YXBl-VGl-ZIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_327",
    "rawId": "frame_82",
    "rawName": "82",
    "sourceIndex": 328,
    "url": "https://i.postimg.cc/QMG3qcb8/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mm5NUURh-VDd-FVUNZIQUAc-XVu-Z3o.gif",
    "label": "预设框 #327",
    "tag": "动态特效 #327",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mm5NUURh-VDd-FVUNZIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_328",
    "rawId": "frame_83",
    "rawName": "83",
    "sourceIndex": 329,
    "url": "https://i.postimg.cc/JhVLQjqn/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mm5z-UURh-VUpz-Uml-ZIQUAc-XVu-Z3o.gif",
    "label": "预设框 #328",
    "tag": "动态特效 #328",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mm5z-UURh-VUpz-Uml-ZIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_329",
    "rawId": "frame_84",
    "rawName": "84",
    "sourceIndex": 330,
    "url": "https://i.postimg.cc/JhNWYt68/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mm84UURh-Vm1XTFNZIQUAc-XVu-Z3o.gif",
    "label": "预设框 #329",
    "tag": "动态特效 #329",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mm84UURh-Vm1XTFNZIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_330",
    "rawId": "frame_85",
    "rawName": "85",
    "sourceIndex": 331,
    "url": "https://i.postimg.cc/GpwCjvQ9/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mm9j-UURh-Um-JJT0NZIQUAc-XVu-Z3o.gif",
    "label": "预设框 #330",
    "tag": "动态特效 #330",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mm9j-UURh-Um-JJT0NZIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_331",
    "rawId": "frame_86",
    "rawName": "86",
    "sourceIndex": 332,
    "url": "https://i.postimg.cc/zfC123tr/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mm9z-UURh-Ylh0Tl-NZIQUAc-XVu-Z3o.gif",
    "label": "预设框 #331",
    "tag": "动态特效 #331",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mm9z-UURh-Ylh0Tl-NZIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_332",
    "rawId": "frame_87",
    "rawName": "87",
    "sourceIndex": 333,
    "url": "https://i.postimg.cc/HLwCvjZp/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmg4TURh-Y2s1NUJRIQUAc-XVu-Z3o.gif",
    "label": "预设框 #332",
    "tag": "动态特效 #332",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmg4TURh-Y2s1NUJRIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_333",
    "rawId": "frame_88",
    "rawName": "88",
    "sourceIndex": 334,
    "url": "https://i.postimg.cc/R07zpqsc/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmk4TURh-VENz-Ml-JRIQUAc-XVu-Z3o.gif",
    "label": "预设框 #333",
    "tag": "动态特效 #333",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmk4TURh-VENz-Ml-JRIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_334",
    "rawId": "frame_89",
    "rawName": "89",
    "sourceIndex": 335,
    "url": "https://i.postimg.cc/jjHr3Cgh/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mml-NTURh-Wk-Q0NGh-RIQUAc-XVu-Z3o.gif",
    "label": "预设框 #334",
    "tag": "动态特效 #334",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mml-NTURh-Wk-Q0NGh-RIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_335",
    "rawId": "frame_90",
    "rawName": "90",
    "sourceIndex": 336,
    "url": "https://i.postimg.cc/q7sdDgbX/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmlj-TURh-Zjh-MMl-JRIQUAc-XVu-Z3o.gif",
    "label": "预设框 #335",
    "tag": "动态特效 #335",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmlj-TURh-Zjh-MMl-JRIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_336",
    "rawId": "frame_91",
    "rawName": "91",
    "sourceIndex": 337,
    "url": "https://i.postimg.cc/1ty1kP2D/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmlz-RURh-VFhzd3p-JIQUAc-XVu-Z3o.gif",
    "label": "预设框 #336",
    "tag": "动态特效 #336",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmlz-RURh-VFhzd3p-JIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_337",
    "rawId": "frame_92",
    "rawName": "92",
    "sourceIndex": 338,
    "url": "https://i.postimg.cc/wv9YCHZ4/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmo4UURh-WVVya0NZIQUAc-XVu-Z3o.gif",
    "label": "预设框 #337",
    "tag": "动态特效 #337",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmo4UURh-WVVya0NZIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_338",
    "rawId": "frame_93",
    "rawName": "93",
    "sourceIndex": 339,
    "url": "https://i.postimg.cc/C1wp3Y9V/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmp-NRURh-Ulkud-Gp-JIQUAc-XVu-Z3o.gif",
    "label": "预设框 #338",
    "tag": "动态特效 #338",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmp-NRURh-Ulkud-Gp-JIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_339",
    "rawId": "frame_94",
    "rawName": "94",
    "sourceIndex": 340,
    "url": "https://i.postimg.cc/xC9VwYh4/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmpj-RURh-Y3Fpdnp-JIQUAc-XVu-Z3o.gif",
    "label": "预设框 #339",
    "tag": "动态特效 #339",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmpj-RURh-Y3Fpdnp-JIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_340",
    "rawId": "frame_95",
    "rawName": "95",
    "sourceIndex": 341,
    "url": "https://i.postimg.cc/4dXRDZjC/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmpj-UURh-WVZJbl-NZIQUAc-XVu-Z3o.gif",
    "label": "预设框 #340",
    "tag": "动态特效 #340",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmpj-UURh-WVZJbl-NZIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_341",
    "rawId": "frame_96",
    "rawName": "96",
    "sourceIndex": 342,
    "url": "https://i.postimg.cc/LXvFRwFb/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmpz-RURh-WTZ6c3p-JIQUAc-XVu-Z3o.gif",
    "label": "预设框 #341",
    "tag": "动态特效 #341",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmpz-RURh-WTZ6c3p-JIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_342",
    "rawId": "frame_97",
    "rawName": "97",
    "sourceIndex": 343,
    "url": "https://i.postimg.cc/MTtJxNJN/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmpz-UURh-Uyoqb-Wl-ZIQUAc-XVu-Z3o.gif",
    "label": "预设框 #342",
    "tag": "动态特效 #342",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmpz-UURh-Uyoqb-Wl-ZIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_343",
    "rawId": "frame_98",
    "rawName": "98",
    "sourceIndex": 344,
    "url": "https://i.postimg.cc/MTtJxN88/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mms4RURh-WGl-FYnp-RIQUAc-XVu-Z3o.gif",
    "label": "预设框 #343",
    "tag": "动态特效 #343",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mms4RURh-WGl-FYnp-RIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_344",
    "rawId": "frame_99",
    "rawName": "99",
    "sourceIndex": 345,
    "url": "https://i.postimg.cc/V64P1pcz/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mms4UURh-ZGFYZ3l-ZIQUAc-XVu-Z3o.gif",
    "label": "预设框 #344",
    "tag": "动态特效 #344",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mms4UURh-ZGFYZ3l-ZIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_345",
    "rawId": "frame_100",
    "rawName": "100",
    "sourceIndex": 346,
    "url": "https://i.postimg.cc/fL5QZpht/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmt-NUURh-Uzkyanl-ZIQUAc-XVu-Z3o.gif",
    "label": "预设框 #345",
    "tag": "动态特效 #345",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmt-NUURh-Uzkyanl-ZIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_346",
    "rawId": "frame_101",
    "rawName": "101",
    "sourceIndex": 347,
    "url": "https://i.postimg.cc/9M1HVKjW/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmtj-RURh-Wn-Nab-Xp-JIQUAc-XVu-Z3o.gif",
    "label": "预设框 #346",
    "tag": "动态特效 #346",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmtj-RURh-Wn-Nab-Xp-JIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_347",
    "rawId": "frame_102",
    "rawName": "102",
    "sourceIndex": 348,
    "url": "https://i.postimg.cc/Y98BkZw9/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmtj-UURh-V21oak-NZIQUAc-XVu-Z3o.gif",
    "label": "预设框 #347",
    "tag": "动态特效 #347",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmtj-UURh-V21oak-NZIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_348",
    "rawId": "frame_103",
    "rawName": "103",
    "sourceIndex": 349,
    "url": "https://i.postimg.cc/G2znrV1s/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmw4UURh-U1da-ZENZIQUAc-XVu-Z3o.gif",
    "label": "预设框 #348",
    "tag": "动态特效 #348",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmw4UURh-U1da-ZENZIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_349",
    "rawId": "frame_104",
    "rawName": "104",
    "sourceIndex": 350,
    "url": "https://i.postimg.cc/tJTQgkXs/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmx-NUURh-Vj-NBZ0NZIQUAc-XVu-Z3o.gif",
    "label": "预设框 #349",
    "tag": "动态特效 #349",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmx-NUURh-Vj-NBZ0NZIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_350",
    "rawId": "frame_105",
    "rawName": "105",
    "sourceIndex": 351,
    "url": "https://i.postimg.cc/MHT2G5WT/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmxj-UURh-Zl-NYZFNZIQUAc-XVu-Z3o.gif",
    "label": "预设框 #350",
    "tag": "动态特效 #350",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmxj-UURh-Zl-NYZFNZIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_351",
    "rawId": "frame_106",
    "rawName": "106",
    "sourceIndex": 352,
    "url": "https://i.postimg.cc/RhF50dMJ/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmxz-UURh-Zk-NIZFNZIQUAc-XVu-Z3o.gif",
    "label": "预设框 #351",
    "tag": "动态特效 #351",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mmxz-UURh-Zk-NIZFNZIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_352",
    "rawId": "frame_107",
    "rawName": "107",
    "sourceIndex": 353,
    "url": "https://i.postimg.cc/2y6R5GzZ/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mn-A4UURh-U3JYTml-ZIQUAc-XVu-Z3o.gif",
    "label": "预设框 #352",
    "tag": "动态特效 #352",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mn-A4UURh-U3JYTml-ZIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_353",
    "rawId": "frame_108",
    "rawName": "108",
    "sourceIndex": 354,
    "url": "https://i.postimg.cc/SRsFKdyC/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mn-Bj-UURh-VDcq-S1NZIQUAc-XVu-Z3o.gif",
    "label": "预设框 #353",
    "tag": "动态特效 #353",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mn-Bj-UURh-VDcq-S1NZIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_354",
    "rawId": "frame_109",
    "rawName": "109",
    "sourceIndex": 355,
    "url": "https://i.postimg.cc/D0Zkz62q/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mn-Bz-UURh-Ynha-SVNZIQUAc-XVu-Z3o.gif",
    "label": "预设框 #354",
    "tag": "动态特效 #354",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mn-Bz-UURh-Ynha-SVNZIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_355",
    "rawId": "frame_110",
    "rawName": "110",
    "sourceIndex": 356,
    "url": "https://i.postimg.cc/5y0dtgxp/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mn-Fj-UURh-Um-FBSHl-ZIQUAc-XVu-Z3o.gif",
    "label": "预设框 #355",
    "tag": "动态特效 #355",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mn-Fj-UURh-Um-FBSHl-ZIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_356",
    "rawId": "frame_111",
    "rawName": "111",
    "sourceIndex": 357,
    "url": "https://i.postimg.cc/yxd4NjVf/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mn-FNUURh-ZEV5SUNZIQUAc-XVu-Z3o.gif",
    "label": "预设框 #356",
    "tag": "动态特效 #356",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mn-FNUURh-ZEV5SUNZIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_357",
    "rawId": "frame_112",
    "rawName": "112",
    "sourceIndex": 358,
    "url": "https://i.postimg.cc/zvBZf7J2/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mn-Fz-UURh-Ym-Zq-RXl-ZIQUAc-XVu-Z3o.gif",
    "label": "预设框 #357",
    "tag": "动态特效 #357",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mn-Fz-UURh-Ym-Zq-RXl-ZIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_358",
    "rawId": "frame_113",
    "rawName": "113",
    "sourceIndex": 359,
    "url": "https://i.postimg.cc/rsP6R4mS/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mn-I4SURh-WXNMSGdn-IQUAc-XVu-Z3o.gif",
    "label": "预设框 #358",
    "tag": "动态特效 #358",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mn-I4SURh-WXNMSGdn-IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_359",
    "rawId": "frame_114",
    "rawName": "114",
    "sourceIndex": 360,
    "url": "https://i.postimg.cc/x84rNmC3/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mn-Jj-SURh-ZWps-UHdn-IQUAc-XVu-Z3o.gif",
    "label": "预设框 #359",
    "tag": "动态特效 #359",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mn-Jj-SURh-ZWps-UHdn-IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_360",
    "rawId": "frame_115",
    "rawName": "115",
    "sourceIndex": 361,
    "url": "https://i.postimg.cc/1XjxVFtj/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mn-JNSURh-ZVU3U3dn-IQUAc-XVu-Z3o.gif",
    "label": "预设框 #360",
    "tag": "动态特效 #360",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mn-JNSURh-ZVU3U3dn-IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_361",
    "rawId": "frame_116",
    "rawName": "116",
    "sourceIndex": 362,
    "url": "https://i.postimg.cc/nrP89mzW/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mn-JNUURh-WElp-RXl-ZIQUAc-XVu-Z3o.gif",
    "label": "预设框 #361",
    "tag": "动态特效 #361",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mn-JNUURh-WElp-RXl-ZIQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_362",
    "rawId": "frame_117",
    "rawName": "117",
    "sourceIndex": 363,
    "url": "https://i.postimg.cc/5tCt4xPt/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mn-M4SURh-VUt-UM3dr-IQUAc-XVu-Z3o.gif",
    "label": "预设框 #362",
    "tag": "动态特效 #362",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mn-M4SURh-VUt-UM3dr-IQUAc-XVu-Z3o"
  },
  {
    "id": "preset_frame_363",
    "rawId": "frame_118",
    "rawName": "118",
    "sourceIndex": 364,
    "url": "https://i.postimg.cc/6QvQW9H7/NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mn-Nj-SURh-ZTZPTk-Fn-IQUAc-XVu-Z3o.gif",
    "label": "预设框 #363",
    "tag": "动态特效 #363",
    "fileHint": "NR8AVj-Vi-Q2d-Be-E1EVTBPVEE1Tk-Rn-Mn-Nj-SURh-ZTZPTk-Fn-IQUAc-XVu-Z3o"
  }
];

export const PRESET_AVATAR_FRAMES: PresetAvatarFrameItem[] =
  RAW_PRESET_AVATAR_FRAMES.map((item, idx) => ({
    ...item,
    index: idx + 1,
    tag: `动态 GIF · #${String(idx + 1).padStart(3, '0')}`,
  }));

export function filterPresetAvatarFrames(
  arg1?:
    | string
    | {
        query?: string;
      }
): PresetAvatarFrameItem[] {
  let query = '';
  if (arg1 && typeof arg1 === 'object') {
    query = String(arg1.query || '').trim().toLowerCase();
  } else {
    query = String(arg1 || '').trim().toLowerCase();
  }

  if (!query) return PRESET_AVATAR_FRAMES;

  return PRESET_AVATAR_FRAMES.filter((item) => {
    const paddedIdx = `#${String(item.index).padStart(3, '0')}`;
    const rawIdx = String(item.index);
    return (
      item.id.toLowerCase().includes(query) ||
      paddedIdx.includes(query) ||
      rawIdx === query ||
      item.label.toLowerCase().includes(query) ||
      item.rawId.toLowerCase().includes(query) ||
      item.rawName.toLowerCase().includes(query) ||
      item.fileHint.toLowerCase().includes(query)
    );
  });
}

export function findPresetFrameByIdOrUrl(
  idOrUrl?: string | null
): PresetAvatarFrameItem | undefined {
  if (!idOrUrl) return undefined;
  return PRESET_AVATAR_FRAMES.find(
    (x) => x.id === idOrUrl || x.url === idOrUrl
  );
}

export const findPresetAvatarFrameById = findPresetFrameByIdOrUrl;

export function isAllowedFrameSource(src?: string | null): boolean {
  if (!src) return false;
  const s = String(src).trim();
  if (/^data:image\/(png|svg\+xml|gif|webp);base64,[a-zA-Z0-9+/=]+$/i.test(s)) {
    return true;
  }
  if (/^https:\/\/i\.postimg\.cc\/[a-zA-Z0-9/_-]+\.gif$/i.test(s)) {
    return true;
  }
  return false;
}

export const isAllowedAvatarFrameSource = isAllowedFrameSource;

