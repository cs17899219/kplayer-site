# kplayer-site — 自建 XPTV 订阅源（内部维护记录）

> 维护记录，供后续迭代参考。本目录文件通过精确 URL 访问，不链接到站点任何页面。

## 基本信息

| 项 | 值 |
|---|---|
| 仓库 | `/Users/kane/IdeaProjects/kplayer-site` |
| 远端 | `git@github.com:cs17899219/kplayer-site.git`（分支 `main`） |
| 部署 | GitHub Pages → `https://kplayer.uemind.com` |
| 订阅地址 | `https://kplayer.uemind.com/sources/subscription.json` |

## 文件清单（sources/）

| 文件 | 来源 | 说明 |
|---|---|---|
| `subscription.json` | 自建 | TV.json 格式：`{"sites":[{name,type,api,ext}]}`，4 个源 |
| `libvio.js` | **修复版** | 上游 libvio.js + 播放解析修复（见下方"libvio 修复"） |
| `bdys.js` | 上游最新 | 上游站点域名已变（`v.xl01.eu.cc` → `xl01.com.de`），**仓库快照已过期，勿用旧快照** |
| `ole.js` / `ai.js` | 上游最新 | 与仓库快照一致 |

## 订阅内容（4 源）

```json
{ "name": "LIBVIO",       "type": 3, "api": "csp_libvio",   "ext": "…/sources/libvio.js" }
{ "name": "哔滴影视",      "type": 3, "api": "csp_bde4",     "ext": "…/sources/bdys.js" }
{ "name": "欧乐",          "type": 3, "api": "csp_Olevod",   "ext": "…/sources/ole.js" }
{ "name": "ギリギリ动漫",    "type": 3, "api": "csp_ai",       "ext": "…/sources/ai.js" }
```

api 命名对齐上游 XPTV `all.json` 约定（`https://raw.githubusercontent.com/fangkuia/XPTV/refs/heads/main/all.json`）。

## KPlayer 源主键（sourceId）规则 — 覆盖机制

```dart
// lib/sources/models/source_config.dart
sourceId (type 3) = SHA256(normalized_ext)[0:16 hex]
normalized = ext.trim().toLowerCase().去掉尾部斜杠
```

- **覆盖 = ext URL 字符串一致**（大小写/尾斜杠不敏感）。
- 订阅导入去重按 sourceId（`importFromSubscription`）：同 id → 旧手动源被**接管**（subscriptionHash 归属订阅，name/ext 更新）；不同 id → 新源**追加**，旧源保留。
- **身份(ext)与内容来源绑定**：app 订阅条目不支持内联 `js` 字段，无法"同身份 + 换内容"。
- 旧 LIBVIO（GitHub ext）sourceId = `2a01bb52e83c53cd`；自建 ext = `421c3abf144a167c`（新身份，需手动删旧源一次）。

## libvio 修复（2026-08-10 实测）

上游 `libvio.js` 的 `getPlayinfo` 对当前 `www.libvios.com` 全坏（`urls:[]` → AVPlayer `INVALID_ARGS, url required`）。修复要点（对照站点自身 `/static/player/{from}.js` 行为）：

1. `player_aaaa` 精确正则（上游惰性正则会误匹配 `player_data`）。
2. 按 `from` 路由到对应 `/vid/*` 处理器（`yd189`→yd.php、`ty_new1`→ty4.php、`vr2`→直链…）。
3. `encrypt:3` 的 url **不解密**，原样传给处理器。
4. 三种解析器格式：`var vid` / `parse_yd.php`（GET，**必须无 Referer**，签名 exp 约 1 分钟）/ `parseUrl+rawUrl`（POST JSON，6×2s 重试）。
5. 直链 mp4/m3u8 带 Referer 直接放。

修复版在仓库：`/Users/kane/kplayer/docs/reference/upstream-xptv-js/libvio.fixed.js`。验证脚本：`/tmp/sim_libvio/`（live_test.js 直连真实站点）。

**上游 libvio.js 更新时**：拉新上游 → 重放上述 5 点修复 → 更新 `kplayer-site/sources/libvio.js` 与 kplayer 仓库快照。

## 更新/部署流程

```bash
cd /Users/kane/IdeaProjects/kplayer-site
# 改文件 → 提交 → 推送（Pages 自动重建，约 1 分钟生效）
git add -A && git commit -m "..." && git push origin main
# 验证
curl -s https://kplayer.uemind.com/sources/subscription.json
```

## 待办/已知

- kplayer 仓库 `docs/reference/upstream-xptv-js/bdys.js` 快照过期（落后上游 230B），需刷新。
- 若用户要"同身份覆盖"：订阅条目 ext 改回 GitHub URL 即可（但 JS 保持原版，仅保身份/历史数据）。
