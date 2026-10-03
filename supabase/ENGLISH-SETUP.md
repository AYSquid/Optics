# 英语进度与批改部署

前端客观题判分、草稿、计时及版本保存均可独立使用。未部署后端时明确显示“本机已保存 / 云端未连接”；AI 不返回模拟分数。

1. 在现有 Supabase 项目的 SQL Editor 执行 `english-setup.sql`。它只新增英语表及 `english_sync`，不改工程光学数据。
2. 在该项目 Edge Functions 的服务端 secrets 设置 `DEEPSEEK_API_KEY`（可选的管理员密钥）。模型固定为 DeepSeek V4.1 Flash 的 `deepseek-flash`。用户也可在云端记录面板填写个人 API Key：默认仅本次会话使用，可选择在当前设备记住；只随批改请求发给经过登录验证的函数，不写云同步、导出记录或仓库。
3. 如网站域名不是 `https://aysquid.github.io`，设置 `ENGLISH_ALLOWED_ORIGINS` 为允许来源，多个完整 origin 用英文逗号分隔。
4. 通过现有 Supabase CLI 项目部署：`supabase functions deploy english-grade --project-ref <项目ID>`。使用新签名密钥的项目可用 `--no-verify-jwt`；函数自身始终通过 Supabase `/auth/v1/user` 验证登录，不能删除这一步。
5. 登录后检查：英语年份首页显示英语已同步；提交一条翻译返回真实结构化结果；换设备可取回草稿与版本。当前开发验证使用隔离夹具，不会写生产数据库或调用付费模型。

`functions/_shared/english-grading-data.js` 由 `node tools/import-english.mjs` 从已有英语资料生成，仅供服务端使用；引用原始翻译采分点及完整作文标准，禁止手改生成文件。没有分项分值的翻译只做定性逐点反馈，整体估分明确说明，不编造权重。

计时按用户、科目、年份保存在本机，不自动调用批改；答题记录走独立英语云端命名空间。所有批改版本会保留，失败可以重试。

客观题模式记录位于 `settings:mode`，提交快照位于 `submission:practice:...` 或 `submission:paper:...`。更新后重新执行 SQL 文件，以允许新的记录键。刷题模式逐篇提交；套卷模式按完形、四篇阅读、新题型顺序，在新题型结束时提示提交，未答按零分计入。

DeepSeek 接口：`POST https://api.deepseek.com/responses`，模型 `deepseek-flash`；传入原题、题图、原始翻译采分点（含分值）、参考译文和原作文评分标准，使用 JSON Schema 并在服务端验证结果。前端提供的采分点只作请求上下文，实际评分以服务端原资料为准。官方说明：https://api-docs.deepseek.com/guides/responses_api/

当前线上函数实际 slug 为 `super-action`，显示名称为 english-grade。前端通过 cloud-config.js 的 englishGradeFunction 指向 super-action。更新现有函数时在该 slug 下部署；新项目可建立 english-grade 并相应调整前端配置。
