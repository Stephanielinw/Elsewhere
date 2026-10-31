import type {PresetData} from '../types';
export const legacyPreset={
  "name": "旧附加合成测试",
  "prompts": [
    {
      "identifier": "p",
      "enabled": true,
      "role": "assistant",
      "content": "前置 {{char}} {{user}} {{description}} {{personality}}"
    },
    {
      "identifier": "chatHistory",
      "enabled": true,
      "marker": true
    },
    {
      "identifier": "d1",
      "enabled": true,
      "role": "user",
      "content": "DEPTH_ONE",
      "injection_position": 1,
      "injection_depth": 1
    },
    {
      "identifier": "d0",
      "enabled": true,
      "role": "system",
      "content": "  TAIL_SPACES  ",
      "injection_position": 1,
      "injection_depth": 0
    },
    {
      "identifier": "disabled",
      "content": "DO_NOT_SEND",
      "enabled": false
    }
  ]
} satisfies PresetData;
export default [
  {
    "mode": "chat",
    "at": 1793368800000,
    "expected": [
      {
        "role": "system",
        "content": "<NATIVE_CONTEXT>"
      },
      {
        "role": "assistant",
        "content": "前置 合成甲 测试用户 SYNTHETIC_CANON 自然"
      },
      {
        "role": "user",
        "content": "历史输入"
      },
      {
        "role": "user",
        "content": "DEPTH_ONE"
      },
      {
        "role": "assistant",
        "content": "历史回答"
      },
      {
        "role": "system",
        "content": "  TAIL_SPACES  "
      }
    ]
  },
  {
    "mode": "scene",
    "at": 1793368800000,
    "expected": [
      {
        "role": "system",
        "content": "<NATIVE_CONTEXT>"
      },
      {
        "role": "assistant",
        "content": "前置 合成甲 测试用户 SYNTHETIC_CANON 自然"
      },
      {
        "role": "user",
        "content": "历史输入"
      },
      {
        "role": "user",
        "content": "DEPTH_ONE"
      },
      {
        "role": "assistant",
        "content": "历史回答"
      },
      {
        "role": "system",
        "content": "  TAIL_SPACES  "
      },
      {
        "role": "system",
        "content": "这是面对面的文字小说，仅描述自己和环境，不替用户行动。"
      }
    ]
  },
  {
    "mode": "play",
    "at": 1793368800000,
    "expected": [
      {
        "role": "system",
        "content": "<NATIVE_CONTEXT>"
      },
      {
        "role": "assistant",
        "content": "前置 戏内人物 戏内访客 STAGE_WORLD 戏内人物"
      },
      {
        "role": "user",
        "content": "历史输入"
      },
      {
        "role": "user",
        "content": "DEPTH_ONE"
      },
      {
        "role": "assistant",
        "content": "历史回答"
      },
      {
        "role": "system",
        "content": "  TAIL_SPACES  "
      },
      {
        "role": "system",
        "content": "这是独立戏剧世界，严格遵守本剧角色人设；不要透露戏外知识。"
      }
    ]
  },
  {
    "mode": "intermission",
    "at": 1793368800000,
    "expected": [
      {
        "role": "system",
        "content": "<NATIVE_CONTEXT>"
      },
      {
        "role": "assistant",
        "content": "前置 合成甲 测试用户 SYNTHETIC_CANON 自然"
      },
      {
        "role": "user",
        "content": "历史输入"
      },
      {
        "role": "user",
        "content": "DEPTH_ONE"
      },
      {
        "role": "assistant",
        "content": "历史回答"
      },
      {
        "role": "system",
        "content": "  TAIL_SPACES  "
      },
      {
        "role": "system",
        "content": "这里是幕间讨论。你是戏外演员本人；不推进戏内剧情，不擅自操控用户。"
      }
    ]
  }
] satisfies {mode:'chat'|'scene'|'play'|'intermission';at:number;expected:{role:string;content:string}[]}[];
