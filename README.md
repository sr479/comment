# 延安梵玛西 · 匿名意见箱

手机优先的门店意见箱：顾客扫码，无需登录即可匿名评价；管理员登录后查看全部评价、管理处理状态和员工名单、导出记录及下载二维码。

## 已实现

- 顾客端：门店或员工评价、1–5 星满意度、可选标签、文字意见、提交回执、隐私说明。
- 管理端 `/admin`：概览、趋势、满意度分布、搜索、日期/对象/状态/评分筛选、分页。
- 每条评价支持“待查看 / 跟进中 / 已处理”和仅管理员可见的内部备注。
- 员工可添加、停用和重新启用；历史评价保留提交时的员工称呼。
- 导出筛选后的 CSV（含中文 BOM、转义和公式注入保护）。
- 下载真实二维码 PNG，打印 A5 门店立牌；二维码始终指向站点首页。
- SQLite 持久化、管理员密码 scrypt 哈希、服务端会话、CSRF/Origin 校验、安全 Cookie、限流和幂等提交。
- 不要求姓名、手机号、微信；不在评价记录中保存 IP 或 User-Agent；评价不公开展示。

没有虚构顾客评价或员工名单。首次上线需要管理员录入实际员工。

## 本地开发

使用 Node.js **22.16+**（建议 Node.js 24）。不需要额外安装数据库。

```bash
npm ci
npm run dev
```

打开 <http://127.0.0.1:3086>，后台为 <http://127.0.0.1:3086/admin>。

首次开发启动生成随机管理员密码，保存在本机 `.local/admin-credentials`（权限 `0600`，已忽略）。这是开发账号，正式环境必须单独初始化。评价保存在 `data/feedback.sqlite`。

```bash
npm test
npm run build
```

测试使用隔离的内存或临时数据库，不污染开发和生产数据。

## 推荐域名与隔离方式

正式入口：`https://pingjia.xiangzhen.site/`，后台：`https://pingjia.xiangzhen.site/admin`。

只新增 `pingjia` 的 A 记录，不修改 `@`、`www`、`api` 或其他已有记录。新服务仅监听本机 `3086`，Nginx 只新增精确匹配 `pingjia.xiangzhen.site` 的虚拟主机，不设置 `default_server`、通配 `server_name` 或根域 Cookie。

腾讯云控制台检查时，`@`、`www` 指向 GitHub Pages，`api` 指向 `140.143.127.97`；部署时应再次以实际记录为准。现有服务器全局 Node.js 18 无需升级，新站通过独立 Node.js 24 容器运行。

腾讯云关于已备案域名的子域名及接入商要求，见 [是否需要备案](https://cloud.tencent.com/document/api/243/19630)。请以实际备案主体、业务和接入商信息为准，在 `.env` 的 `ICP_NUMBER` 填入真实备案号。不要编造备案号。

## Docker 部署（推荐）

先检查服务器的现有端口、Nginx 配置、磁盘和可用内存，记录原业务的健康状态。不要替换原有站点配置，不要执行全局 Node 升级或停止其他容器。

```bash
git clone https://github.com/sr479/comment.git /opt/fanmaxi-feedback
cd /opt/fanmaxi-feedback
cp .env.example .env
chmod 600 .env
docker compose build
docker compose run --rm feedback npm run admin:init
docker compose up -d
curl -fsS http://127.0.0.1:3086/api/health
```

管理员初始化命令交互输入账号和密码，密码输入不会回显，不将明文密码写入源码或配置。若当前账号没有 Docker 权限，在命令前添加 `sudo`；无需额外授予账号 Docker 权限。

1. DNSPod 新增：主机记录 `pingjia`、记录类型 `A`、记录值为部署服务器公网 IP、默认线路、TTL 600。保留所有已有记录。
2. 将 `deploy/nginx-http.conf` 安装为独立站点，例如 `/etc/nginx/sites-available/fanmaxi-feedback`，为它建立 `sites-enabled` 软链接。
3. `sudo nginx -t` 成功后才执行 `sudo systemctl reload nginx`，不重启其他应用。
4. 用现有证书工具为该子域名单独签发可信 HTTPS 证书。HTTP-01 验证目录是 `/var/www/fanmaxi-acme`。使用 ACME 服务前按其要求处理相关条款。
5. 证书路径确认后，将本站配置换为 `deploy/nginx-https.conf`，再次检查并 reload。若证书路径不同，修改本站配置中的对应路径。
6. 确认证书自动续期和续期后 reload 正常。为避免影响现有业务，不自动改写全局 Certbot 配置。
7. 用手机检查首页、扫码、提交、后台登录；确认现有域名和业务仍正常，再打印二维码。

生产环境只支持 HTTPS，使用 Secure Cookie。HTTP 阶段用于证书验证，不能用明文 HTTP 作为正式后台入口。

`compose.yaml` 只绑定 `127.0.0.1:3086`，不必在云防火墙中开放 3086。Nginx 覆盖 `X-Forwarded-For`，容器仅信任一层代理；不要在未经调整的情况下将容器端口公开绑定到 `0.0.0.0`。

## 不使用 Docker

可用独立 Node.js 24 安装路径运行，切勿替换已有业务依赖的 Node.js。先运行 `npm ci`、`npm test`、`npm run build`、`npm run admin:init`。`deploy/fanmaxi.service` 提供 systemd 模板：创建专用 `fanmaxi` 系统用户，确认 `ExecStart` 的 Node 路径，赋予该用户项目读取权限及 `data/`、`backups/` 写入权限后安装。配置文件仅对服务账号开放。

当前服务器 Docker Hub 连接超时时，可将官方 Node.js 24 安装在 `/opt/fanmaxi-node`，先用 Node.js 官方 `SHASUMS256.txt` 校验下载包，再使用该目录的 `node`/`npm`。服务模板默认采用此路径，并限制到 256MB 内存和 50% CPU；不会修改 `/usr/bin/node` 或其他服务的运行时。

## 维护与备份

```bash
# SQLite 在线一致性备份，使用 SQLite backup API，不能只复制正在写入的主文件
docker compose exec feedback npm run backup

# 查看状态/日志（应用不输出评价正文、网络地址或密码）
docker compose ps
docker compose logs --tail=80 feedback

# 更新前先备份，再拉取代码并重建本站容器
git pull --ff-only
docker compose build
docker compose up -d

# 忘记密码时由服务器维护者交互重置，已有登录全部失效
docker compose exec feedback npm run admin:init -- --username admin --reset
```

生产数据存放在独立的 `feedback_data` Docker volume 中，容器重建不丢失。备份放在 `feedback_backups` volume。需要恢复时先停止**本站**容器、另存当前数据，再将一致性备份恢复为 `feedback.sqlite` 并检查文件所有者；主库恢复时不要遗留旧的 `-wal` 和 `-shm`。不要执行 `docker compose down -v`，该命令会删除数据卷。应定期将备份复制到服务器以外的受控位置，并按门店实际需要设置数据保留期限。

后台登录有效期 12 小时。密码修改会注销该管理员所有设备。默认限制每个网络来源每小时 20 次提交、每 15 分钟 10 次登录尝试；共享门店 Wi-Fi 的顾客可能共用限额，可根据实际流量调整 `server/app.js`。

## 项目结构

```text
src/          顾客端与管理端 React 页面
server/       Express API、鉴权、SQLite
scripts/      管理员初始化与在线备份
deploy/       独立 Nginx 站点和 systemd 模板
test/         权限、提交流程、持久化与安全集成测试
```

源码可以公开；`.env`、数据库、备份和本机账号文件禁止提交到 Git。公网部署后请使用正式域名打开后台下载二维码，本机 `127.0.0.1` 预览二维码无法供其他手机访问。
