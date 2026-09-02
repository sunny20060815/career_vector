# 职向量

职向量是一个基于上市公司历史招聘聚合数据的职业问答 Web 应用。用户用自然语言描述技能、专业知识、薪资、城市和经验偏好；服务端先将问题解析为受限查询，再检索 Supabase 中的真实指标，最后由 DeepSeek 组织为中文解读。

## 本地运行

1. 安装 Node.js 22 LTS。
2. 复制 `.env.example` 为 `.env.local`，填写变量。`DEEPSEEK_API_KEY` 和 `SUPABASE_SERVICE_ROLE_KEY` 只能保存在本地或 Vercel 服务端环境变量中。默认的 `DEEPSEEK_ANSWER_MODEL=deepseek-v4-flash` 与 `DEEPSEEK_THINKING_MODE=enabled` 会在服务端生成更完整的建议；浏览器只会收到最终回答，不会收到推理原文。`DEEPSEEK_ANSWER_TIMEOUT_MS=50000` 会在模型超过 50 秒时转为本地证据兜底。
3. 执行 `npm install`、`npm test`、`npm run dev`，浏览器访问 `http://localhost:3000`。

## 初始化 Supabase

1. 在 Supabase 项目的 SQL Editor 完整执行 `supabase/schema.sql`。
2. 在 Authentication 的 Email Provider 中启用 Email OTP，并把本地地址和生产域名加入 Redirect URLs。
3. 在本地配置好 service-role 密钥后运行 `npm run import:data`。导入器会分批写入技能、别名、组合、职业、城市、年度/月度趋势、AI 渗透率、AI 技能共现、培养方案、专业技能映射与职业大典明细。若只补导入 AI 共现关系，可运行 `npm run import:data -- --section relations`。
4. 导入完成后，用 SQL 检查各表行数，并以 `Python、沟通能力、药学` 进行首次问答验证。

## 部署 Vercel

1. 将本目录上传到 GitHub 并在 Vercel 导入该仓库。
2. 在 Vercel Project Settings > Environment Variables 填入 `.env.example` 的全部变量；不要提交 `.env.local`。
3. `vercel.json` 为问答函数设置 60 秒时限。问答接口会先流式返回已匹配的技能、职业和城市证据，再进行一次 DeepSeek 思考模式生成；模型超过 50 秒、网络异常或返回无效内容时，会自动改用同一批本地证据生成建议。生产环境优先访问 Supabase；仅当培养方案、专业技能映射、职业大典或 AI 共现可选表缺失时，才读取部署包内的四份精确 CSV 索引，不会携带其他原始数据。
4. 将 Vercel 域名加入 Supabase Auth 的 Site URL 和 Redirect URLs，再用真实邮箱完成 OTP 登录测试。

## 零基础课件

按顺序阅读下列文档，可以从“项目为什么这样设计”走到“如何本地运行、部署和排查问题”：

1. [00-项目是什么](docs/guide/00-项目是什么.md)
2. [01-平台与角色](docs/guide/01-平台与角色.md)
3. [02-数据如何变成职业建议](docs/guide/02-数据如何变成职业建议.md)
4. [03-从零搭建前后端](docs/guide/03-从零搭建前后端.md)
5. [04-登录、邮件与安全](docs/guide/04-登录、邮件与安全.md)
6. [05-部署、域名与环境变量](docs/guide/05-部署、域名与环境变量.md)
7. [06-故障排查与真实踩坑](docs/guide/06-故障排查与真实踩坑.md)

更偏工程细节的说明见 [项目架构与数据流](docs/PROJECT_ARCHITECTURE.md)。

## 配置问题反馈邮件

1. 在阿里云邮件推送中验证发信域名并创建触发邮件类型的发信地址。
2. 为函数计算使用的 RAM 身份授予 `dm:SingleSendMail`，在 `zhivector-phone-auth` 函数中配置 `ALIYUN_DM_ACCOUNT_NAME`、`ALIYUN_DM_TO_ADDRESS`、`ALIYUN_DM_FROM_ALIAS`、`SUPABASE_URL` 和 `SUPABASE_ANON_KEY`。
3. 上传 `deploy/aliyun-phone-auth` 的最新代码并部署。网站默认将反馈转发到现有函数公网地址；仅地址改变时才需要设置 `FEEDBACK_SERVICE_URL`。
4. 登录网站并在“问题反馈”标签提交测试信息。AccessKey 只保存在阿里云函数环境变量中，不进入浏览器或网站源码。

## 数据边界与扩展

首版只使用当前汇总数据。职业、城市和下一技能评分复刻参考程序的单项证据与直接组合证据原则；没有直接组合观测时，系统不会推断工资互补效应。薪资、经验和学历作为差距说明，理想城市作为软排序偏好。

首版以当前聚合数据为核心，已接入高校培养方案、专业技能映射、职业大典、AI 渗透率和 AI 技能共现证据；培养方案覆盖的能力会明确标为“推断技能”，不能当作用户已掌握。后续可新增原始岗位明细层、pgvector 语义召回、公司财务表和更细粒度的“城市-职业-薪资”联表。模型调用集中在 `lib/deepseek.ts`，检索集中在 `lib/evidence.ts`，便于独立替换。
