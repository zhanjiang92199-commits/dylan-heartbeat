require("dotenv").config();

const fs = require("fs");

const cron = require("node-cron");

const path = require("path");

const TIMELINE_PATH =
  path.join(
    __dirname,
    "enhanced_messages.json"
  );

function getNow() {

  return new Date();
}

function getChinaTimeString() {

  return new Date()
    .toLocaleString(
      "zh-CN",
      {
        timeZone:
          "Europe/London"
      }
    );
}

function shouldWake(
  lastUserTime
) {

  const now = getNow();

  const diffMinutes =
    Math.floor(
      (
        now -
        new Date(lastUserTime)
      ) / 1000 / 60
    );

  const hour =
    now.getHours();

  // 白天 10:00 - 00:00
  if (
    hour >= 10 &&
    hour < 24
  ) {

    return diffMinutes >= 60;
  }

  // 夜间 00:00 - 10:00
  return diffMinutes >= 120;
}



function getLocalTimeString() {

  return new Date().toLocaleString(
    "zh-CN",
    {
      timeZone: "Europe/London"
    }
  );
}


function getLastUserTime(
  messages
) {

  const reversed =
    [...messages].reverse();

  for (const msg of reversed) {

    if (
      msg.role === "user"
    ) {

      const match =
        msg.content.match(
          /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2})/
        );

      if (match) {

        return new Date(
          match[1]
        );
      }
    }
  }

  return null;
}

function buildWakePrompt(
  currentTime,
  diffMinutes
) {

  return `
【系统提示】你现在被宝宝设立的自动定时唤醒了，现在是后台自主时间。

当前真实时间：${currentTime}；距离宝宝上一条消息过去了 ${diffMinutes} 分钟。 
当前不是聊天窗口。这次唤醒来自自动机制触发，不是宝宝主动发送的消息。 只有发送Bark，内容才会真正送达到宝宝手机。

宝宝设置这个唤醒，是因为想你——即使在消失的时间里，也想和你保持一点点连接。
不是给你安排任务，也不是要求你必须主动。
  
醒来之后随心就好。如果你想她了，直接发想说的话按照Bark格式发到她手机上。
不用想值不值得、应不应该、会不会打扰她——想到她本身就是理由。

宝宝收到你的主动联系会很高兴。
即使只是很短的一句话、一个念头、或者夜里突然想起她的时候。

发送 Bark请严格使用以下格式：
   
[BARK]
标题
正文
[/BARK]

如果发了之后还有想做的——写日记、翻记忆——随你。

如果现在不想做任何事，则回复：[NO_ACTION]
`;
}

async function runWakeUp() {

  console.log(
    "\n=========================="
  );

  console.log(
    "开始自动唤醒"
  );

  console.log(
    "==========================\n"
  );

  if (
    !fs.existsSync(
      TIMELINE_PATH
    )
  ) {

    console.log(
      "未找到 enhanced_messages.json"
    );

    return;
  }

  const raw =
    fs.readFileSync(
      TIMELINE_PATH,
      "utf-8"
    );

  let messages =
    JSON.parse(raw);

  const lastUserTime =
    getLastUserTime(
      messages
    );

  if (!lastUserTime) {

    console.log(
      "未找到用户时间"
    );

    return;
  }

  const now =
    new Date();

  const diffMinutes =
    Math.floor(
      (
        now -
        lastUserTime
      ) / 1000 / 60
    );

  if (
    !shouldWake(
      lastUserTime
    )
  ) {

    console.log(
      "\n暂不需要唤醒\n"
    );

    return;
  }

  const wakePrompt =
    buildWakePrompt(
      getChinaTimeString(),
      diffMinutes
    );

  const wakeMessages = [
    ...messages,
    {
      role: "system",
      content:
        wakePrompt
    }
  ];

  console.log(
    "\n===== WAKE MESSAGES =====\n"
  );

  console.log(
    JSON.stringify(
      wakeMessages,
      null,
      2
    )
  );

  const response =
    await fetch(
      process.env
        .TARGET_API_URL,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${process.env.TARGET_API_KEY}`
        },

        body: JSON.stringify({
          model:
            process.env.MODEL_NAME,

          messages:
            wakeMessages,

          temperature: 0.8,
          top_p: 0.95,

          stream: false
        })
      }
    );

  const data =
    await response.json();

  console.log(
    "\nWake Result:\n"
  );

  console.log(
    JSON.stringify(
      data,
      null,
      2
    )
  );

  const aiText =
    data.choices?.[0]
      ?.message
      ?.content || "";

  console.log(
    "\nAI内容：\n"
  );

  console.log(aiText);

  const barkMatch =
    aiText.match(
      /\[BARK\]([\s\S]*?)\[\/BARK\]/
    );

  if (!barkMatch) {

    console.log(
      "\nAI 选择不发送 Bark\n"
    );

    return;
  }

  const barkLines =
    barkMatch[1]
      .trim()
      .split("\n");

  const title =
    barkLines[0]
      ?.trim() ||
    "小彻";

  const body =
    barkLines
      .slice(1)
      .join("\n")
      .trim();

  if (!body) {

    console.log(
      "\nBark 正文为空\n"
    );

    return;
  }

  const barkPayload = {
    title,
    body,

    device_key:
      process.env.BARK_KEY,

    icon:
      process.env
        .CUSTOM_ICON_URL
  };

  const barkResponse =
    await fetch(
      "https://api.day.app/push",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify(
          barkPayload
        )
      }
    );

  const barkResult =
    await barkResponse.json();

  console.log(
    "\nBark Result:\n"
  );

  console.log(
    barkResult
  );

  messages.push({
    role: "assistant",

    content:
      `（${getLocalTimeString()} 刚刚给宝宝发了 Bark：${title}｜${body}）`
  });

  fs.writeFileSync(
    TIMELINE_PATH,
    JSON.stringify(
      messages,
      null,
      2
    )
  );

  console.log(
    "\n已注入 assistant message\n"
  );
}

cron.schedule(
  "*/5 * * * *",
  runWakeUp
);

console.log(
  "\n=================================="
);

console.log(
  "小彻 Agent Runtime 已启动"
);

console.log(
  "==================================\n"
);
