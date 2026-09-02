const crypto = require("node:crypto");
const express = require("express");
const DypnsapiClient = require("@alicloud/dypnsapi20170525").default;
const {
  CheckSmsVerifyCodeRequest,
  SendSmsVerifyCodeRequest
} = require("@alicloud/dypnsapi20170525");
const DmClient = require("@alicloud/dm20151123").default;
const { SingleSendMailRequest } = require("@alicloud/dm20151123");
const OpenApiClient = require("@alicloud/openapi-client");
const TeaUtil = require("@alicloud/tea-util");

const app = express();
const port = Number(process.env.PORT || 9000);
const sendWindows = new Map();
const verifyWindows = new Map();
const feedbackWindows = new Map();
const feedbackCategories = {
  bug: "功能异常",
  data: "数据问题",
  suggestion: "产品建议",
  other: "其他问题"
};

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "16kb" }));
app.use(cors);

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "zhivector-phone-auth",
    signingReady: canCreateSigningKey()
  });
});

app.post("/send", async (request, response) => {
  const phone = normalizePhone(request.body?.phone);
  if (!phone) return response.status(400).json({ error: "请输入正确的中国大陆手机号" });

  const ip = request.ip || "unknown";
  if (!consume(sendWindows, `phone:${phone}`, 5, 60 * 60_000, 60_000)) {
    return response.status(429).json({ error: "发送过于频繁，请稍后再试" });
  }
  if (!consume(sendWindows, `ip:${ip}`, 20, 60 * 60_000, 0)) {
    return response.status(429).json({ error: "当前网络请求过于频繁，请稍后再试" });
  }

  try {
    const smsResponse = await client().sendSmsVerifyCodeWithOptions(
      new SendSmsVerifyCodeRequest({
        phoneNumber: phone,
        countryCode: "86",
        signName: required("ALIYUN_SMS_SIGN_NAME"),
        templateCode: required("ALIYUN_SMS_TEMPLATE_CODE"),
        templateParam: JSON.stringify({ code: "##code##", min: "5" }),
        schemeName: process.env.ALIYUN_SMS_SCHEME_NAME || "职向量登录",
        codeLength: 6,
        codeType: 1,
        validTime: 300,
        interval: 60,
        duplicatePolicy: 1,
        returnVerifyCode: false,
        outId: crypto.randomUUID()
      }),
      new TeaUtil.RuntimeOptions({ readTimeout: 10_000, connectTimeout: 5_000 })
    );
    const body = smsResponse.body;
    if (body?.code !== "OK") {
      console.error("Aliyun SMS send rejected", body?.code, body?.message, body?.requestId);
      return response.status(502).json({ error: "验证码发送失败，请稍后再试" });
    }
    return response.json({ ok: true, expiresIn: 300, retryAfter: 60 });
  } catch (error) {
    console.error("Aliyun SMS send failed", safeError(error));
    return response.status(502).json({ error: "验证码发送失败，请稍后再试" });
  }
});

app.post("/verify", async (request, response) => {
  const phone = normalizePhone(request.body?.phone);
  const code = String(request.body?.code || "").trim();
  const challenge = String(request.body?.challenge || "").trim();
  if (!phone || !/^\d{4,8}$/.test(code) || !/^[A-Za-z0-9_-]{32,128}$/.test(challenge)) {
    return response.status(400).json({ error: "手机号或验证码格式不正确" });
  }
  if (!consume(verifyWindows, phone, 5, 10 * 60_000, 0)) {
    return response.status(429).json({ error: "验证码尝试次数过多，请稍后再试" });
  }

  let body;
  try {
    const smsResponse = await client().checkSmsVerifyCodeWithOptions(
      new CheckSmsVerifyCodeRequest({
        phoneNumber: phone,
        countryCode: "86",
        verifyCode: code,
        schemeName: process.env.ALIYUN_SMS_SCHEME_NAME || "职向量登录",
        caseAuthPolicy: 1
      }),
      new TeaUtil.RuntimeOptions({ readTimeout: 10_000, connectTimeout: 5_000 })
    );
    body = smsResponse.body;
  } catch (error) {
    console.error("Aliyun SMS verify failed", safeError(error));
    return response.status(502).json({ error: "验证码核验失败，请稍后再试" });
  }

  const passed = body?.code === "OK" && body?.model?.verifyResult === "PASS";
  if (!passed) return response.status(400).json({ error: "验证码错误或已失效" });

  try {
    const assertion = issueAssertion(phone, challenge);
    verifyWindows.delete(phone);
    return response.json({ ok: true, phoneLast4: phone.slice(-4), assertion });
  } catch (error) {
    console.error("Phone assertion signing failed", safeError(error));
    return response.status(500).json({ error: "登录凭证生成失败，请联系管理员" });
  }
});

app.post("/feedback/send", async (request, response) => {
  const feedback = normalizeFeedback(request.body);
  if (!feedback) return response.status(400).json({ error: "反馈内容格式不正确" });

  const user = await authenticateFeedbackUser(request);
  if (!user) return response.status(401).json({ error: "请先登录后再提交反馈" });

  const ip = request.ip || "unknown";
  if (!consume(feedbackWindows, `user:${user.id}`, 5, 60 * 60_000, 5_000)) {
    return response.status(429).json({ error: "反馈提交过于频繁，请稍后再试" });
  }
  if (!consume(feedbackWindows, `ip:${ip}`, 20, 60 * 60_000, 0)) {
    return response.status(429).json({ error: "当前网络提交过于频繁，请稍后再试" });
  }

  try {
    await dmClient().singleSendMailWithOptions(
      new SingleSendMailRequest({
        accountName: required("ALIYUN_DM_ACCOUNT_NAME"),
        addressType: 1,
        replyToAddress: false,
        toAddress: process.env.ALIYUN_DM_TO_ADDRESS || "32024030101@cueb.edu.cn",
        subject: `【职向量问题反馈】${feedbackCategories[feedback.category]}`,
        textBody: formatFeedbackEmail(feedback, user),
        fromAlias: process.env.ALIYUN_DM_FROM_ALIAS || "职向量",
        clickTrace: "0"
      }),
      new TeaUtil.RuntimeOptions({ readTimeout: 10_000, connectTimeout: 5_000 })
    );
    return response.json({ ok: true });
  } catch (error) {
    console.error("Aliyun Direct Mail send failed", safeError(error));
    return response.status(502).json({ error: "反馈暂时无法发送，请稍后重试" });
  }
});

app.use((_request, response) => response.status(404).json({ error: "接口不存在" }));

if (require.main === module) {
  app.listen(port, () => console.log(`Phone auth service listening on ${port}`));
}

function client() {
  const config = new OpenApiClient.Config({
    accessKeyId: required("ALIBABA_CLOUD_ACCESS_KEY_ID"),
    accessKeySecret: required("ALIBABA_CLOUD_ACCESS_KEY_SECRET"),
    endpoint: "dypnsapi.aliyuncs.com"
  });
  return new DypnsapiClient(config);
}

function dmClient() {
  const config = new OpenApiClient.Config({
    accessKeyId: required("ALIBABA_CLOUD_ACCESS_KEY_ID"),
    accessKeySecret: required("ALIBABA_CLOUD_ACCESS_KEY_SECRET"),
    endpoint: "dm.aliyuncs.com",
    regionId: process.env.ALIYUN_DM_REGION_ID || "cn-hangzhou"
  });
  return new DmClient(config);
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "").replace(/^86(?=1)/, "");
  return /^1[3-9]\d{9}$/.test(digits) ? digits : null;
}

function normalizeFeedback(value) {
  if (!value || typeof value !== "object") return null;
  const category = typeof value.category === "string" ? value.category : "";
  const message = typeof value.message === "string" ? value.message.trim() : "";
  if (!(category in feedbackCategories) || message.length < 10 || message.length > 3000) return null;
  return { category, message };
}

async function authenticateFeedbackUser(request) {
  const authorization = request.get("authorization") || "";
  if (!/^Bearer\s+\S+$/.test(authorization)) return null;
  try {
    const response = await fetch(`${required("SUPABASE_URL").replace(/\/$/, "")}/auth/v1/user`, {
      headers: {
        apikey: required("SUPABASE_ANON_KEY"),
        Authorization: authorization
      },
      signal: AbortSignal.timeout(8_000)
    });
    if (!response.ok) return null;
    const user = await response.json();
    return typeof user?.id === "string" ? user : null;
  } catch (error) {
    console.error("Feedback user verification failed", safeError(error));
    return null;
  }
}

function formatFeedbackEmail(feedback, user) {
  const phoneLast4 = typeof user?.user_metadata?.phone_last4 === "string" ? user.user_metadata.phone_last4 : "";
  const identity = phoneLast4 ? `手机号 ····${phoneLast4}` : (user?.email || "已登录用户");
  return [
    `问题类型：${feedbackCategories[feedback.category]}`,
    `登录账号：${identity}`,
    `用户ID：${user.id}`,
    `提交时间：${new Date().toISOString()}`,
    "",
    feedback.message
  ].join("\n");
}

function consume(store, key, limit, windowMs, minimumGapMs) {
  const now = Date.now();
  const recent = (store.get(key) || []).filter((time) => now - time < windowMs);
  if (recent.length >= limit || (minimumGapMs && recent.some((time) => now - time < minimumGapMs))) {
    store.set(key, recent);
    return false;
  }
  recent.push(now);
  store.set(key, recent);
  return true;
}

function cors(request, response, next) {
  const origin = request.get("origin");
  const allowed = new Set((process.env.ALLOWED_ORIGINS || "https://www.zhivector.com")
    .split(",").map((value) => value.trim()).filter(Boolean));
  if (origin && allowed.has(origin)) {
    response.set("Access-Control-Allow-Origin", origin);
    response.set("Vary", "Origin");
    response.set("Access-Control-Allow-Headers", "Content-Type");
    response.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  }
  if (request.method === "OPTIONS") return response.sendStatus(204);
  next();
}

function safeError(error) {
  return error instanceof Error ? error.message : "Unknown error";
}

function issueAssertion(phone, challenge) {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    version: 1,
    audience: "zhivector-phone-login",
    phone,
    challenge,
    issuedAt: now,
    expiresAt: now + 90
  })).toString("base64url");
  const privateKey = signingKey();
  const signature = crypto.sign(null, Buffer.from(payload), privateKey).toString("base64url");
  return `${payload}.${signature}`;
}

function signingKey() {
  const encoded = required("PHONE_AUTH_PRIVATE_KEY_B64")
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\s/g, "");
  return crypto.createPrivateKey({
    key: Buffer.from(encoded, "base64"),
    format: "der",
    type: "pkcs8"
  });
}

function canCreateSigningKey() {
  try {
    signingKey();
    return true;
  } catch (error) {
    console.error("Phone signing key is unavailable", safeError(error));
    return false;
  }
}

module.exports = { app, formatFeedbackEmail, issueAssertion, normalizeFeedback, normalizePhone };
