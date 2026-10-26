# CertiScope

CertiScope 是基于 Next.js、React、TypeScript 和 Supabase 的绿色建筑 GV 审核工作台。目前为开发演示版本，完整审核链路仍需验收。

## 使用自己的数据库和密钥

每位使用者创建自己的 Supabase 项目，并使用自己的千问 API Key。分享仓库只提供代码、示例页面资源、规则资源和数据库结构，不提供原开发者的数据库、账号、上传材料或密钥。

1. 使用 Node.js 24 LTS，以及 `package.json` 中 `packageManager` 指定的 pnpm 版本，执行 `pnpm install --frozen-lockfile`。
2. 将 `.env.example` 复制为 `.env.local`，填写自己新建 Supabase 项目的 URL、publishable key，以及本机初始化账号所用的服务端 `SECRET_KEY`。
3. AI 功能需要自己的 `DASHSCOPE_API_KEY`，并填写 `AI_PROVIDER=qwen`、自己的账号及接口支持的 `AI_MODEL`、对应地域的 `AI_BASE_URL`。现有实现使用千问兼容接口；北京接口为 `https://dashscope.aliyuncs.com/compatible-mode/v1`。`GV_HYBRID_RAG_ENABLED` 初始设为 `false`。缺少 AI 配置时不能使用辅助核查和意见草拟。

`.env.local` 已被 Git 忽略。不要将真实密钥填写进 `.env.example`，不要给服务端密钥添加 `NEXT_PUBLIC_` 前缀，也不要上传包含配置的日志或截图。

## 初始化全新 Supabase 项目

在 Supabase 控制台创建自己的全新项目，安装 Supabase CLI 后，在仓库根目录执行：

```bash
supabase init
supabase login
supabase link --project-ref YOUR_OWN_PROJECT_REF
supabase db push --dry-run
supabase db push
```

如果已有 `supabase/config.toml`，跳过 `supabase init`。数据库密码按 CLI 提示输入，不要写进文档或提交。先核对关联的是自己的新项目，再执行迁移。

迁移包含表、函数、RLS 权限、私有存储桶和初始 GV 规则包；不会复制真实业务数据、Auth 账号或存储文件。

**分享副本仅用于全新数据库。** 分享副本将原迁移的时间编号补齐至 14 位，以保持正确执行顺序；不要直接用于已应用原开发编号的数据库。编号对照见分享副本的 `supabase/MIGRATIONS.md`。原开发目录的迁移编号保持不变。尚未在新的云端 Supabase 项目完整执行初始化，若出错应先停止并核对错误信息。

## 创建演示账号

完成迁移后，确认 `.env.local` 指向自己的项目，并填写自己的 `SECRET_KEY`，然后执行：

```bash
node scripts/create-test-accounts.mjs
```

脚本创建 `certiscope-admin@example.com` 和 `certiscope-auditor@example.com`，配置管理员和审核员角色，并在本机终端显示随机密码。自行保存密码，不要分享终端输出；账号已存在时脚本会停止，避免覆盖密码。这些是演示账号，不用于生产运营。

## 本地开发

```bash
pnpm install
pnpm dev
```

打开终端显示的本地地址，使用刚创建的账号登录。新数据库没有真实审核项目，需要自行上传材料、建档和派单。页面中的示例项目仅用于演示，不代表真实审核结论。

## 常用命令

```bash
pnpm check       # Biome 格式与代码检查
pnpm check:fix   # 格式化并应用安全修复
pnpm typecheck   # TypeScript 类型检查
pnpm build       # 构建应用
```

本次交付已通过 TypeScript 检查和现有两项规则测试。全项目 Biome 检查仍有既有格式及静态检查错误；本机生产构建尝试因 Node 内存分配失败而未完成，尚未验证生产构建和全新云数据库初始化。

分享仓库使用独立的初始提交，不携带原开发 Git 历史。本机配置、临时目录、个人文档、测评原始记录及原开发数据库均不在分享范围。仓库为私有时，所有者需先在 GitHub 的 Settings → Collaborators 中邀请朋友，朋友接受后才能克隆或下载。
