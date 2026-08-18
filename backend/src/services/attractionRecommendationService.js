const {
    findPopularAttractions,
} = require("../repositories/attractionRepository");

function normalizeRound(recommendationRound) {
    const parsed = Number.parseInt(recommendationRound, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function getRecommendationPage({ tripType, recommendationRound }) {
    let limit;

    if (tripType === "숙박") {
        limit = 5;
    } else if (tripType === "당일치기") {
        limit = 10;
    } else {
        throw new Error(`지원하지 않는 여행 유형입니다: ${tripType}`);
    }

    const round = normalizeRound(recommendationRound);

    return {
        round,
        limit,
        offset: (round - 1) * limit,
        startRank: (round - 1) * limit + 1,
        endRank: round * limit,
    };
}

function extractHistoryIds(recommendedHistory = []) {
    return [...new Set(
        recommendedHistory
            .map((item) => {
                if (typeof item === "object" && item !== null) {
                    return Number.parseInt(item.id ?? item.attractionId, 10);
                }

                return Number.parseInt(item, 10);
            })
            .filter(Number.isInteger),
    )];
}

function toRecommendationItem(attraction) {
    return {
        id: attraction.id,
        contentId: attraction.contentId,
        name: attraction.title,
        region: attraction.region,
        address: [attraction.address1, attraction.address2]
            .filter(Boolean)
            .join(" "),
        mapx: attraction.mapx,
        mapy: attraction.mapy,
        image: attraction.firstImage,
        indoorOutdoor: attraction.indoorOutdoor,
        theme: attraction.middleCategory,
        category: attraction.smallCategory,
        searchRank: attraction.searchRank,
        searchCount: attraction.searchCount,
        popularityPosition: attraction.popularityPosition,
        searchMonth: attraction.searchMonth,
    };
}

function buildRecommendationReply({ recommendations, page, hasMore }) {
    const lines = recommendations.map((attraction, index) => (
        `${index + 1}. ${attraction.name}\n`
        + `   - 테마: ${attraction.theme}\n`
        + `   - 주소: ${attraction.address}`
    ));

    const nextMessage = hasMore
        ? "\n\n마음에 드는 관광지를 선택해주세요. 선택 후 추가 추천도 받을 수 있습니다."
        : "\n\n현재 조건으로 추천할 수 있는 마지막 관광지입니다. 마음에 드는 관광지를 선택해주세요.";

    return (
        `검색순 ${page.startRank}~${page.endRank} 관광지 추천입니다.\n\n`
        + lines.join("\n\n")
        + nextMessage
    );
}

async function recommendPopularAttractions({
    region,
    themes = [],
    tripType,
    recommendationRound = 1,
    recommendedHistory = [],
    indoorOutdoor = null,
}) {
    const page = getRecommendationPage({
        tripType,
        recommendationRound,
    });
    const historyIds = extractHistoryIds(recommendedHistory);

    const candidates = await findPopularAttractions({
        region,
        themes,
        offset: page.offset,
        limit: page.limit + 1,
        excludeAttractionIds: historyIds,
        indoorOutdoor,
    });

    const hasMore = candidates.length > page.limit;
    const recommendations = candidates
        .slice(0, page.limit)
        .map(toRecommendationItem);
    const recommendationIds = recommendations.map(({ id }) => id);
    const nextHistory = [...new Set([...historyIds, ...recommendationIds])];
    const exhausted = recommendations.length === 0;

    if (exhausted) {
        return {
            recommendations: [],
            recommendedHistory: historyIds,
            recommendationRound: page.round,
            nextRecommendationRound: null,
            hasMore: false,
            exhausted: true,
            reply: "현재 지역과 테마에 맞는 관광지가 더 이상 없습니다.",
        };
    }

    return {
        recommendations,
        recommendedHistory: nextHistory,
        recommendationRound: page.round,
        nextRecommendationRound: hasMore ? page.round + 1 : null,
        hasMore,
        exhausted: false,
        reply: buildRecommendationReply({
            recommendations,
            page,
            hasMore,
        }),
    };
}

module.exports = {
    getRecommendationPage,
    extractHistoryIds,
    recommendPopularAttractions,
};
