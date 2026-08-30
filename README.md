# 职向量

职向量是一个基于上市公司历史招聘聚合数据的职业问答 Web 应用。用户用自然语言描述技能、专业知识、薪资、城市和经验偏好；服务端先将问题解析为受限查询，再检索 Supabase 中的真实指标，最后由 DeepSeek 组织为中文解读。

## 本地运行

1. 安装 Node.js 22 LTS。
2. 复制 `.env.example` 为 `.env.local`，填写变量。`DEEPSEEK_API_KEY` 和 `SUPABASE_SERVICE_ROLE_KEY` 只能保存在本地或 Vercel 服务端环境变量中。
3. 执行 `npm install`、`npm test`、`npm run dev`，浏览器访问 `http://localhost:3000`。

## 初始化 Supabase

1. 在 Supabase 项目的 SQL Editor 完整执行 `supabase/schema.sql`。
2. 在 Authentication 的 Email Provider 中启用 Email OTP，并把本地地址和生产域名加入 Redirect URLs。
3. 在本地配置好 service-role 密钥后运行 `npm run import:data`。导入器会分批写入技能、别名、组合、职业、城市、年度/月度趋势与 AI 指标表。
4. 导入完成后，用 SQL 检查各表行数，并以 `Python、沟通能力、药学` 进行首次问答验证。

## 部署 Vercel

1. 将本目录上传到 GitHub 并在 Vercel 导入该仓库。
2. 在 Vercel Project Settings > Environment Variables 填入 `.env.example` 的全部变量；不要提交 `.env.local`。
3. 保持 `vercel.json` 的 30 秒问答函数时限。`data/` 已被 `.vercelignore` 排除，生产请求只访问 Supabase。
4. 将 Vercel 域名加入 Supabase Auth 的 Site URL 和 Redirect URLs，再用真实邮箱完成 OTP 登录测试。

## 数据边界与扩展

首版只使用当前汇总数据。职业、城市和下一技能评分复刻参考程序的单项证据与直接组合证据原则；没有直接组合观测时，系统不会推断工资互补效应。薪资、经验和学历作为差距说明，理想城市作为软排序偏好。

后续可新增原始岗位明细层、pgvector 语义召回、高校培养方案、公司财务表和更细粒度的“城市-职业-薪资”联表。模型调用集中在 `lib/deepseek.ts`，检索集中在 `lib/evidence.ts`，便于独立替换。
