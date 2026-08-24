const axios = require("axios");
const env = require("../config/env");

const DETAIL_COMMON_URL =
    "https://apis.data.go.kr/B551011/KorService2/detailCommon2";
const detailCache = new Map();

function normalizeServiceKey(serviceKey) {
    const key = String(serviceKey || "").trim();
    if (!key.includes("%")) return key;

    try {
        return decodeURIComponent(key);
    } catch (error) {
        return key;
    }
}

function stripHtml(value) {
    return String(value || "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .trim();
}

function getItems(data) {
    const items = data?.response?.body?.items?.item;
    if (!items) return [];
    return Array.isArray(items) ? items : [items];
}

async function getTourDetail(contentId) {
    const key = String(contentId || "");
    if (!key || !env.tourApi.serviceKey) return null;
    if (detailCache.has(key)) return detailCache.get(key);

    const request = axios.get(DETAIL_COMMON_URL, {
        params: {
            serviceKey: normalizeServiceKey(env.tourApi.serviceKey),
            MobileOS: "ETC",
            MobileApp: "StaySync",
            _type: "json",
            contentId: key,
        },
        timeout: 10000,
    }).then((response) => {
        const item = getItems(response.data)[0];
        if (!item) return null;
        return {
            image: item.firstimage || item.firstimage2 || null,
            description: stripHtml(item.overview),
            homepage: stripHtml(item.homepage),
        };
    }).catch(() => null);

    detailCache.set(key, request);
    return await request;
}

async function enrichRecommendationItems(items) {
    return await Promise.all(items.map(async (item) => {
        const detail = await getTourDetail(item.contentId);
        return {
            ...item,
            image: item.image || detail?.image || null,
            description: detail?.description || null,
        };
    }));
}

module.exports = {
    stripHtml,
    normalizeServiceKey,
    getTourDetail,
    enrichRecommendationItems,
};
