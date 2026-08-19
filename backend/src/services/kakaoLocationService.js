const axios = require("axios");
const env = require("../config/env");

const KAKAO_KEYWORD_SEARCH_URL =
    "https://dapi.kakao.com/v2/local/search/keyword.json";

function normalizeText(value) {
    return String(value || "")
        .normalize("NFC")
        .toLowerCase()
        .replace(/\s/g, "");
}

function toLocation(document) {
    const longitude = Number(document.x);
    const latitude = Number(document.y);

    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
        return null;
    }

    return {
        kakaoPlaceId: document.id,
        name: document.place_name,
        address: document.road_address_name || document.address_name,
        roadAddress: document.road_address_name || null,
        lotAddress: document.address_name || null,
        latitude,
        longitude,
        category: document.category_name || null,
        categoryGroupCode: document.category_group_code || null,
        placeUrl: document.place_url || null,
    };
}

function selectBestLocation(locations, { keyword, region, preferredCategory }) {
    const normalizedKeyword = normalizeText(keyword);
    const normalizedRegion = normalizeText(region);

    return [...locations]
        .map((location, index) => {
            const normalizedName = normalizeText(location.name);
            const normalizedAddress = normalizeText(location.address);
            let score = -index;

            if (normalizedName === normalizedKeyword) score += 100;
            if (normalizedName.includes(normalizedKeyword)) score += 50;
            if (normalizedRegion && normalizedAddress.includes(normalizedRegion)) {
                score += 30;
            }
            if (
                preferredCategory &&
                location.categoryGroupCode === preferredCategory
            ) {
                score += 20;
            }

            return { location, score };
        })
        .sort((left, right) => right.score - left.score)[0]?.location || null;
}

async function requestKeywordSearch({ query, categoryGroupCode }) {
    if (!env.kakao.restApiKey) {
        const error = new Error("KAKAO_REST_API_KEY가 설정되지 않았습니다.");
        error.code = "KAKAO_KEY_MISSING";
        throw error;
    }

    const response = await axios.get(KAKAO_KEYWORD_SEARCH_URL, {
        headers: {
            Authorization: `KakaoAK ${env.kakao.restApiKey}`,
        },
        params: {
            query,
            size: 10,
            sort: "accuracy",
            ...(categoryGroupCode ? {
                category_group_code: categoryGroupCode,
            } : {}),
        },
        timeout: 10000,
    });

    return (response.data?.documents || [])
        .map(toLocation)
        .filter(Boolean);
}

async function searchLocation({ keyword, region, categoryGroupCode = null }) {
    const trimmedKeyword = String(keyword || "").trim();
    const trimmedRegion = String(region || "").trim();

    if (!trimmedKeyword) return null;

    const query = trimmedRegion
        ? `${trimmedRegion} ${trimmedKeyword}`
        : trimmedKeyword;
    let locations = await requestKeywordSearch({
        query,
        categoryGroupCode,
    });

    if (locations.length === 0 && categoryGroupCode) {
        locations = await requestKeywordSearch({ query });
    }

    return selectBestLocation(locations, {
        keyword: trimmedKeyword,
        region: trimmedRegion,
        preferredCategory: categoryGroupCode,
    });
}

async function searchLocations({ query, categoryGroupCode = null }) {
    const trimmedQuery = String(query || "").trim();
    if (!trimmedQuery) return [];
    return await requestKeywordSearch({
        query: trimmedQuery,
        categoryGroupCode,
    });
}

module.exports = {
    toLocation,
    selectBestLocation,
    searchLocation,
    searchLocations,
};
