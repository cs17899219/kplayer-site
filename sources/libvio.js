const CryptoJS = createCryptoJS();
const cheerio = createCheerio();

const appConfig = {
    ver: 1,
    title: 'LIBVIO',
    site: 'https://www.libvio.to', // 站点域名：libvio.cc → libvio.la → libvios.com → www.libvio.to（免梯子）
    tabs: [
        { name: '首页', ext: { url: '/', hasMore: false } },
        { name: '电影', ext: { url: '/type/1-1.html' } },
        { name: '剧集', ext: { url: '/type/2-1.html' } },
        { name: '动漫', ext: { url: '/type/4-1.html' } },
        { name: '日韩剧', ext: { url: '/type/15-1.html' } },
        { name: '欧美剧', ext: { url: '/type/16-1.html' } },
    ],
};
const UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const headers = {
    Referer: `${appConfig.site}/`,
    Origin: appConfig.site,
    'User-Agent': UA,
};

// 播放源(from) -> /vid/* 解析器路由。
// 与站点自身 /static/player/{from}.js 的 iframe src 完全一致（2026-08 实测）。
const PLAYER_URL_MAP = {
    mux: '/vid/plyr/index3.php?url={url}&next={next}&id={id}&nid={nid}', // BD2
    vr2: '/vid/plyr/vr2.php?url={url}&next={next}&id={id}&nid={nid}', // BD5
    LINE405: '/vid/plyr/?url={url}&next={next}&id={id}&nid={nid}', // HD
    yd189: '/vid/yd.php?url={url}&next={next}&id={id}&nid={nid}', // HD5
    aliyunline2: '/vid/ty2.php?url={url}&next={next}&id={id}&nid={nid}', // BD4
    ty_new1: '/vid/ty4.php?url={url}&next={next}&id={id}&nid={nid}', // BD
    aliyunline3: '/vid/ty3.php?url={url}&next={next}&id={id}&nid={nid}', // BD4
    hd01: '/vid/plyr/index2.php?url={url}&next={next}&id={id}&nid={nid}', // HD
    LINE500: '/vid/lb3.php?url={url}&next={next}&id={id}&nid={nid}', // HD3
    LINE400: '/vid/lb2.php?url={url}&next={next}&id={id}&nid={nid}', // HD2
    aliyunline: '/vid/ty.php?url={url}&next={next}&id={id}&nid={nid}', // BD
    tianyi: '/vid/ty.php?url={url}&next={next}&id={id}&nid={nid}', // BD3
    tianyi_625: '/vid/ty.php?url={url}&next={next}&id={id}&nid={nid}', // BD3
    LINE407: '/vid/lb2.php?url={url}&next={next}&id={id}&nid={nid}', // LINE400
};


async function getConfig() {
    return jsonify(appConfig)
}

async function getCards(ext) {
    ext = argsify(ext);
    let cards = [];
    let url = ext.url;
    let page = ext.page || 1;
    ext.hasMore || true;

    url = appConfig.site + url.replace('1.html', `${page}.html`);

    const { data } = await $fetch.get(url, {
        headers,
    });

    const $ = cheerio.load(data);
    let vods = new Set();
    $('a.stui-vodlist__thumb').each((_, each) => {
        const path = $(each).attr('href');
        if (path.startsWith('/detail/') && !vods.has(path)) {
            vods.add(path);
            cards.push({
                vod_id: path,
                vod_name: $(each).attr('title'),
                vod_pic: $(each).attr('data-original'),
                vod_remarks: $(each).find('.text-right').text(),
                ext: {
                    url: appConfig.site + path,
                },
            });
        }
    });

    return jsonify({
        list: cards,
    })
}

// getTracks 改成这样（兼容新结构）：
async function getTracks(ext) {
    const { url } = argsify(ext);
    let groups = [];
    const { data } = await $fetch.get(url, { headers });
    const $ = cheerio.load(data);

    // 方式1: 从 playlist-panel 抓播放列表
    $('div.playlist-panel').each((_, panel) => {
        const $panel = $(panel);
        const title = $panel.find('.panel-head h3').text().trim();
        if (!title || title.includes('猜你喜欢')) return
        if (title.includes('下载')) return

        let group = { title, tracks: [] };
        $panel.find('.stui-content__playlist li').each((_, item) => {
            const a = $(item).find('a');
            group.tracks.push({
                name: a.text().trim(),
                pan: '',
                ext: { url: appConfig.site + a.attr('href') },
            });
        });
        if (group.tracks.length > 0) groups.push(group);
    });

    // 方式2: 如果没有 playlist-panel，从立即播放按钮抓
    if (groups.length === 0) {
        const playBtn = $('a[href^="/play/"]').attr('href');
        if (playBtn) {
            groups.push({
                title: '立即播放',
                tracks: [{ name: '第1集', pan: '', ext: { url: appConfig.site + playBtn } }],
            });
        }
    }

    // 网盘下载
    $('div.netdisk-panel, div.playlist-panel.netdisk-panel').each((_, panel) => {
        const $panel = $(panel);
        const title = $panel.find('.panel-head h3').text().trim();
        if (!title || !title.includes('下载')) return
        $panel.find('.netdisk-list a').each((_, item) => {
            const a = $(item);
            groups.push({
                title: title,
                tracks: [{ name: a.find('.netdisk-name').text().trim() || '合集', pan: a.attr('href') }],
            });
        });
    });

    // 优先国内线路（免梯子）：HD5(移动云)/BD·BD3·BD4(天翼云·阿里云) 排前，BD5(Cloudflare) 靠后
    function lineRank(title) {
        if (/^HD5/.test(title)) return 0;
        if (/^BD(?!5|2)/.test(title)) return 1;
        if (/^BD5/.test(title)) return 9;
        return 5;
    }
    groups.sort((a, b) => lineRank(a.title) - lineRank(b.title));

    return jsonify({ list: groups })
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const { url, pan } = ext;

    if (pan) {
        return jsonify({ urls: [pan] })
    }

    if (url) {
        try {
            const { data } = await $fetch.get(url, { headers });
            // 精确匹配 player_aaaa（避免误匹配页面里的 player_data 等其他 player_* 变量）
            const match = data.match(/<script[^>]*>var player_aaaa=(\{.*?\})<\/script>/);
            if (!match) return jsonify({ urls: [] })
            const obj = JSON.parse(match[1]);
            let playerUrl = obj.url;

            // 与站点 player.js Init 一致：encrypt 1/2 解密；encrypt 3 原样传给解析器
            if (obj.encrypt === '1') {
                playerUrl = unescape(playerUrl);
            } else if (obj.encrypt === '2') {
                playerUrl = unescape(CryptoJS.enc.Base64.parse(playerUrl).toString(CryptoJS.enc.Utf8));
            }
            // encrypt === '3': 保持原样（b64 或 http 直链，由解析器/API 处理）

            // 直链 mp4/m3u8：带 Referer 直接可播（实测 BD5 线 url 即直链）
            if (/^https?:\/\/.+\.(mp4|m3u8)(\?.*)?$/i.test(playerUrl)) {
                return jsonify({ urls: [playerUrl], headers: [{ Referer: url, 'User-Agent': UA }] })
            }

            // 非直链：按 from 路由到对应 /vid/* 解析器页
            const vidTpl = PLAYER_URL_MAP[obj.from];
            if (!vidTpl) return jsonify({ urls: [] })
            const vidUrl = appConfig.site + vidTpl
                .replace('{url}', playerUrl)
                .replace('{next}', obj.link_next)
                .replace('{id}', obj.id)
                .replace('{nid}', obj.nid);
            const vidHeaders = { Referer: url, 'User-Agent': UA };

            const { data: vidData } = await $fetch.get(vidUrl, { headers: vidHeaders });

            // 解析器页直接输出 var vid = '...'（旧版/其他站点格式）
            const vidDirect = vidData.match(/var\s+vid\s*=\s*['"]([^'"]+)['"]/);
            if (vidDirect) {
                return jsonify({ urls: [vidDirect[1]], headers: [vidHeaders] })
            }

            // 解析器页嵌入 parse_yd.php 签名（yd 系线路）：GET，且不能带 Referer（实测 forbidden）
            const ydApi = vidData.match(/['"]([^'"]*parse_yd\.php\?_t=[^'"]+)['"]/);
            if (ydApi) {
                const apiUrl = appConfig.site + ydApi[1].replace(/\\u0026/g, '&');
                // 签名 exp 很短（~1 分钟内有效），必须立即请求，不重试
                const { data: apiData } = await $fetch.get(apiUrl, { headers: { 'User-Agent': UA } });
                const parsed = argsify(apiData);
                if (parsed.url) {
                    return jsonify({ urls: [parsed.url], headers: [vidHeaders] })
                }
                return jsonify({ urls: [] })
            }

            // 解析器页嵌入 parseUrl + rawUrl（ty 系线路）：POST JSON，重试 6 次
            const parseUrlMatch = vidData.match(/"parseUrl":"([^"]+)"/);
            const rawUrlMatch = vidData.match(/"rawUrl":"([^"]*)"/);
            if (parseUrlMatch && rawUrlMatch) {
                const parseUrl = appConfig.site + parseUrlMatch[1].replace(/\\u0026/g, '&');
                const postBody = JSON.stringify({ url: rawUrlMatch[1] });

                const MAX_RETRY = 6;
                for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
                    try {
                        const { data: parseData } = await $fetch.post(parseUrl, postBody, {
                            headers: {
                                Referer: vidUrl,
                                Origin: appConfig.site,
                                'User-Agent': UA,
                                'Content-Type': 'application/json',
                                'sec-fetch-mode': 'cors',
                                'sec-fetch-site': 'same-origin',
                                'sec-fetch-dest': 'empty',
                            },
                        });
                        const parsed = argsify(parseData);
                        if (parsed.url) {
                            return jsonify({ urls: [parsed.url], headers: [vidHeaders] })
                        }
                        if (parsed.fatal === true) break
                    } catch (e) {
                        console.log(`parse attempt ${attempt + 1} error: ${e.message}`);
                    }
                    // Wait 2s before retry
                    await new Promise((r) => setTimeout(r, 2000));
                }
                return jsonify({ urls: [] })
            }

            // 旧式 ty4.php：页面只有 PARSE_URL/PARSE_BODY，需 POST 取结果（遗留格式）
            const legacyParseUrl = vidData.match(/var\s+PARSE_URL\s*=\s*['"]([^'"]+)['"]/);
            const legacyBody = vidData.match(
                /var\s+PARSE_BODY\s*=\s*JSON\.stringify\(\s*\{url:\s*['"]([^'"]+)['"]\s*\}\s*\)/,
            );
            if (legacyParseUrl && legacyBody) {
                const postBody = JSON.stringify({ url: legacyBody[1] });
                const MAX_RETRY = 6;
                for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
                    try {
                        const { data: parseData } = await $fetch.post(appConfig.site + legacyParseUrl[1], postBody, {
                            headers: {
                                Referer: vidUrl,
                                Origin: appConfig.site,
                                'User-Agent': UA,
                                'Content-Type': 'application/json',
                                'sec-fetch-mode': 'cors',
                                'sec-fetch-site': 'same-origin',
                                'sec-fetch-dest': 'empty',
                            },
                        });
                        const parsed = argsify(parseData);
                        if (parsed.url) {
                            return jsonify({ urls: [parsed.url], headers: [vidHeaders] })
                        }
                        if (parsed.fatal === true) break
                    } catch (e) {
                        console.log(`parse attempt ${attempt + 1} error: ${e.message}`);
                    }
                    // Wait 2s before retry
                    await new Promise((r) => setTimeout(r, 2000));
                }
            }
        } catch (e) {
            console.log('getPlayinfo error: ' + e.message);
        }
    }
    return jsonify({ urls: [] })
}

async function search(ext) {
    ext = argsify(ext);
    let cards = [];

    let text = encodeURIComponent(ext.text);
    let page = ext.page || 1;
    if (page > 1) {
        return jsonify({
            list: cards,
        })
    }

    const url = appConfig.site + `/search/-------------.html?wd=${text}&submit=`;
    const { data } = await $fetch.get(url, {
        headers,
    });

    const $ = cheerio.load(data);
    $('a.stui-vodlist__thumb').each((_, each) => {
        const path = $(each).attr('href');
        if (path.startsWith('/detail/')) {
            cards.push({
                vod_id: path,
                vod_name: $(each).attr('title'),
                vod_pic: $(each).attr('data-original'),
                vod_remarks: $(each).find('.text-right').text(),
                ext: {
                    url: appConfig.site + path,
                },
            });
        }
    });

    return jsonify({
        list: cards,
    })
}

