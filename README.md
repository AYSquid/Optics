# 工程光学刷题

网址：https://aysquid.github.io/Optics/

按章节、知识点及历年试卷练习；支持独立查看答案与解析、学习状态标记及五种主题。

## 云端记录

使用 Supabase 邮箱登录，同步学习状态、真题选项和试卷位置。账号记录相互隔离；未登录可继续本地使用。支持离线改动队列、同步冲突处理、JSON 导出导入和本机旧记录迁移。

首次设置与迁移请阅读 [云端同步说明](云端同步说明.md)。在 Supabase SQL Editor 执行 [setup.sql](supabase/setup.sql)，并配置登录回跳地址。

## 发布

GitHub Pages 使用 main 分支根目录。网站为纯静态文件，不需要常开的个人电脑。配置只使用 Publishable key；禁止提交后台 Secret key、数据库密码。

登录仅保护个人记录，网页与题库公开可读。仓库不含原始 PDF/TeX 工程和个人学习数据。
