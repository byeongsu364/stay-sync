const REGIONS = require("../data/regionData");
const { findEnglishAttractionCountsByRegion } = require("../repositories/attractionRepository");
const { t, regionLabel } = require("./messageService");

/**
 * ==========================================================
 * English Coverage Service
 * ==========================================================
 *
 * 영어로 안내할 수 있는 지역을 판단한다.
 *
 * 한국관광공사 영문 서비스에 등록된 관광지만 영문명을 가진다.
 * 영문명이 하나도 없는 지역은 영어로 추천할 것이 없으므로
 * 지역을 고르는 자리에서 미리 알리고 진행하지 않는다.
 *
 * 한국어 대화는 이 판단을 거치지 않는다.
 * ==========================================================
 */

// 관광지 데이터는 임포트할 때만 바뀌므로 한 번만 조회한다.
let countsPromise = null;

function loadCounts() {
    if (!countsPromise) {
        countsPromise = findEnglishAttractionCountsByRegion().catch((error) => {
            countsPromise = null;
            throw error;
        });
    }
    return countsPromise;
}

function resetCache() {
    countsPromise = null;
}

async function getEnglishRegionCounts() {
    return await loadCounts();
}

async function isRegionAvailableInEnglish(region) {
    if (!region) return false;
    const counts = await getEnglishRegionCounts();
    return (counts.get(region) || 0) > 0;
}

async function getAvailableEnglishRegions() {
    const counts = await getEnglishRegionCounts();
    return REGIONS.filter((region) => (counts.get(region) || 0) > 0);
}

function formatRegionForEnglish(region) {
    return `${regionLabel(region, "en")}(${region})`;
}

/**
 * 영어로 안내할 수 없는 지역임을 알리는 응답
 *
 * 안내 가능한 지역을 함께 보여줘 다시 고를 수 있게 한다.
 */
async function buildUnavailableRegionReply(region) {
    const available = await getAvailableEnglishRegions();

    return {
        // 이 안내는 영어 사용자만 보므로 영어 문구를 그대로 쓴다.
        reply: t("english.regionUnavailable", {
            region: `${regionLabel(region, "en")}(${region})`,
            regions: available.map(formatRegionForEnglish),
        }, "en"),
        quickReplies: available.map((available_region) => ({
            label: formatRegionForEnglish(available_region),
            value: available_region,
        })),
    };
}

module.exports = {
    resetCache,
    getEnglishRegionCounts,
    isRegionAvailableInEnglish,
    getAvailableEnglishRegions,
    buildUnavailableRegionReply,
};
