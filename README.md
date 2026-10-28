# CertiScope

CertiScope 是基于 Next.js、React、TypeScript 和 Supabase 的绿色建筑 GV 审核工作台。目前为开发演示版本，完整审核链路仍需验收。

2026-10-28 最新更新包含 GV 规范问答页和可拖动的悬浮问答助手，使用自己的千问配置并展示官方规则来源；本次问答更新没有新增数据库迁移。变更和验证限制见 `UPDATE-2026-10-28.md`。

## 使用自己的数据库和密钥

每位使用者创建自己的 Supabase 项目，并使用自己的千问 API Key。分享仓库只提供代码、示例页面资源、规则资源和数据库结构，不提供原开发者的数据库、账号、上传材料或密钥。

1. 使用 Node.js 24 LTS，以及 `package.json` 中 `packageManager` 指定的 pnpm 版本，执行 `pnpm install --frozen-lockfile`。
2. 将 `.env.example` 复制为 `.env.local`，填写自己新建 Supabase 项目的 URL、publishable key，以及本机初始化账号所用的服务端 `SECRET_KEY`。
3. AI 功能需要自己的 `DASHSCOPE_API_KEY`，并填写 `AI_PROVIDER=qwen`、自己的账号及接口支持的 `AI_MODEL`、对应地域的 `AI_BASE_URL`。现有实现使用千问兼容接口；北京接口为 `https://dashscope.aliyuncs.com/compatible-mode/v1`。`GV_HYBRID_RAG_ENABLED` 控制精确锚点失效时的依据补充检索，初始设为 `false`；待核问题的 GV 条款解释默认启用，可通过 `GV_RULE_GUIDANCE_RAG_ENABLED=false` 独立关闭生成和页面展示，已有运行记录仍保留。修改环境变量后重新启动本地开发服务。缺少 AI 配置时不能使用辅助核查和意见草拟。

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

首次安装请使用全新数据库。分享副本将原迁移的时间编号补齐至 14 位，以保持正确执行顺序；不要直接用于已应用原开发编号的数据库。编号对照见分享副本的 `supabase/MIGRATIONS.md`。原开发目录的迁移编号保持不变。尚未在新的云端 Supabase 项目完整执行初始化，若出错应先停止并核对错误信息。

## 已安装用户更新

1. Git 克隆的用户先保存本地修改，再执行 `git pull --ff-only`；ZIP 用户重新下载最新版，保留自己的 `.env.local`，不要用空模板覆盖已有配置。
2. 在新代码目录执行 `pnpm install --frozen-lockfile`，对照 `.env.example` 手动补充新增变量。`GV_FIELD_ANCHORED_EVIDENCE` 为实验开关，默认关闭。
3. 如果数据库使用的是本分享仓库的 14 位迁移编号，确认 CLI 仍关联自己的项目，先执行 `supabase db push --dry-run`，再执行 `supabase db push`，仅应用尚未执行的迁移。不要重建或重置已有数据库，也不必重新运行演示账号创建脚本。
4. 重新启动应用。此次 2026-10-28 更新新增清除初审展示、已提交轮次 AI 重审及历史初审展示选择所需的三份迁移（`20261026000300`、`20261026000400`、`20261026000500`），已有项目、材料及意见保留。

最新代码还包含 R05 图纸标识补核、支持事实整合、R06 显示去重、待核问题的规则解释 RAG 和本地图纸车位编号核对。局部项目的实验入口不在分享版本中开放；正式完整初审入口保留。数据库迁移和本地检查不代表真实审核效果已验收。

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

2026-10-26 的交付通过 TypeScript 检查和当时两项规则测试。全项目 Biome 检查仍有既有格式及静态检查错误；此前生产构建尝试因 Node 内存分配失败而未完成，尚未验证生产构建和全新云数据库初始化。本次更新的检查结果见 `UPDATE-2026-10-28.md`（分享副本）。

分享仓库使用独立的初始提交，不携带原开发 Git 历史。本机配置、临时目录、个人文档、测评原始记录及原开发数据库均不在分享范围。仓库为私有时，所有者需先在 GitHub 的 Settings → Collaborators 中邀请朋友，朋友接受后才能克隆或下载。
