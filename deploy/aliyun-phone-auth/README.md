# 阿里云登录与反馈服务

该函数同时提供短信验证码登录与问题反馈邮件转发：

- `POST /send`：发送短信验证码
- `POST /verify`：核验短信验证码
- `POST /feedback/send`：核验 Supabase 登录令牌后，通过阿里云邮件推送发送反馈

## 邮件推送配置

1. 在阿里云邮件推送控制台验证发信域名，并创建“触发邮件”类型的发信地址。
2. 为当前 AccessKey 对应的 RAM 身份增加 `dm:SingleSendMail` 权限。
3. 在函数计算的“配置 > 环境变量”中补充：

```text
ALIYUN_DM_ACCOUNT_NAME=已验证的完整发信地址
ALIYUN_DM_TO_ADDRESS=32024030101@cueb.edu.cn
ALIYUN_DM_FROM_ALIAS=职向量
SUPABASE_URL=项目的 Supabase URL
SUPABASE_ANON_KEY=项目的公开 anon key
```

4. 上传包含 `index.js`、`package.json`、锁文件和生产依赖的 ZIP，保存并部署。

AccessKey、发信地址和 Supabase 配置只放在函数环境变量中，不写入代码。
