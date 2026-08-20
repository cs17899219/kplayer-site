// tv
// 修复记录（2026-08-20 实测）：
// 1. 站点域名 4kmp.com → 4k-av.com（旧域名 301 整体迁移）。
// 2. 站点校验 Accept/Accept-Language 头，仅 UA 一律 403；由 KPlayer `$fetch`
//    默认头接管（设置页「内容语言」驱动 Accept-Language），插件不再自带。
// 3. 搜索正确参数是 x（站点表单 input name=x）：/s?q= 被 CF WAF 永封
//    （Attention Required），/s?x= 正常。高频搜索触发全站限频 403（自定义页，
//    IP 级，数十分钟级），命中 Cloudflare 挑战页时 $utils.openSafari 人工完成，
//    关闭后重试一次；仍失败返回空列表。
// 4. tabs URL 必须带尾斜杠：无斜杠时站点 301，dart:io 跟随重定向会把 UA
//    重置为 Dart 默认 UA（其余自定义头保留），第二跳被按 UA 403（首页无重定向所以一直正常）。
//    平台侧已将 worker dio 的 HttpClient.userAgent 置空根治此问题。

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1'

let appConfig = {
    ver: 1,
    title: '4k-av',
    site: 'https://4k-av.com',
    tabs: [
        {
            name: '首頁',
            ext: {
                id: 0,
                url: 'https://4k-av.com/',
            },
        },
        {
            name: '電影',
            ext: {
                id: 1,
                url: 'https://4k-av.com/movie/',
            },
        },
        {
            name: '電視劇',
            ext: {
                id: 2,
                url: 'https://4k-av.com/tv/',
            },
        },
    ],
}

async function getConfig() {
    return jsonify(appConfig)
}

async function getCards(ext) {
    ext = argsify(ext)
    // 頁數寫入cache
    var lastPage = {
        0: 1,
        1: 1,
        2: 1,
    }
    let val = $cache.get('av')
    if (val) {
        try {
            lastPage = JSON.parse(val)
        } catch (e) {
            $print(`lastPage parse failed: ${e}`)
        }
    }

    let cards = []
    let { id, page = 1, url } = ext

    if (page > 1) {
        url += `page-${lastPage[id] - page + 1}.html`
    }

    $print(`url: ${url}`)

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })

    const elems = $html.elements(data, '#MainContent_newestlist .virow .NTMitem')
    elems.forEach((element) => {
        const href = $html.attr(element, '.title a', 'href')
        const title = $html.text(element, '.title h2')
        const cover = $html.attr(element, '.poster img', 'src')
        const subTitle = $html.text(element, 'label[title=分辨率]').split('/')[0]
        cards.push({
            vod_id: href,
            vod_name: title,
            vod_pic: cover,
            vod_remarks: subTitle,
            ext: {
                url: `${appConfig.site}${href}`,
            },
        })
    })

    // get lastpage
    if (page == 1) {
        const pageNumber = $html.text(data, '#MainContent_header_nav .page-number')
        const num = pageNumber.split('/')[1]
        lastPage[id] = num
        const jsonData = JSON.stringify(lastPage, null, 2)
        $cache.set('av', jsonData)
    }

    return jsonify({
        list: cards,
    })
}

async function getTracks(ext) {
    ext = argsify(ext)
    let tracks = []
    let url = ext.url

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })

    // 檢查是不是多集
    let playlist = $html.elements(data, '#rtlist li')
    if (playlist.length > 0) {
        playlist.forEach((element) => {
            let name = $html.text(element, 'span')
            let url = $html.attr(element, 'img', 'src').replace('screenshot.jpg', '')
            tracks.push({
                name: name,
                pan: '',
                ext: {
                    url,
                },
            })
        })
    } else {
        tracks.push({
            name: '播放',
            pan: '',
            ext: {
                url,
            },
        })
    }

    return jsonify({
        list: [
            {
                title: '默认分组',
                tracks,
            },
        ],
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    let url = ext.url.replace('www.', '')

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })

    let playUrl = $html.attr(data, '#MainContent_videowindow video source', 'src')

    return jsonify({ urls: [playUrl] })
}

async function search(ext) {
    ext = argsify(ext)
    let cards = []

    let text = encodeURIComponent(ext.text)
    let url = appConfig.site + `/s?x=${text}`

    let { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })

    // 非浏览器会话命中 Cloudflare 挑战页：人工完成后重试一次
    if (data.includes('Attention Required!')) {
        await $utils.openSafari(url, UA)
        const retry = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
            },
        })
        data = retry.data
    }
    if (data.includes('Attention Required!')) {
        return jsonify({ list: cards })
    }

    const elems = $html.elements(data, '#MainContent_newestlist .virow .NTMitem')
    elems.forEach((element) => {
        const href = $html.attr(element, '.title a', 'href')
        const title = $html.text(element, '.title h2')
        const cover = $html.attr(element, '.poster img', 'src')
        const subTitle = $html.text(element, 'label[title=分辨率]').split('/')[0]
        cards.push({
            vod_id: href,
            vod_name: title,
            vod_pic: cover,
            vod_remarks: subTitle,
            ext: {
                url: `${appConfig.site}${href}`,
            },
        })
    })

    return jsonify({
        list: cards,
    })
}
