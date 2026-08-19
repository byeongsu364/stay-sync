const {
    findPopularAttractions,
    findRecommendationCandidates,
} = require("../repositories/attractionRepository");
const { getRoadDistances } = require("./roadNetworkService");

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
        recommendationType: attraction.recommendationType || "popular",
        roadDistanceMeters: attraction.roadDistanceMeters ?? null,
        roadDistanceKm: attraction.roadDistanceKm ?? null,
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

function buildCombinedRecommendationReply({ popular, nearby, page, distanceUnavailable }) {
    const formatItems = (items, startIndex = 0) => items.map((attraction, index) => {
        const distance = attraction.roadDistanceKm !== null
            ? `\n   - 숙소 기준 도로거리: ${attraction.roadDistanceKm}km`
            : "";
        return (
            `${startIndex + index + 1}. ${attraction.name}\n`
            + `   - 테마: ${attraction.theme}\n`
            + `   - 주소: ${attraction.address}${distance}`
        );
    }).join("\n\n");
    const sections = [];

    if (popular.length > 0) {
        sections.push(
            `검색순 ${page.startRank}~${page.endRank}\n${formatItems(popular)}`,
        );
    }

    if (nearby.length > 0) {
        sections.push(
            `거리순 ${page.startRank}~${page.endRank}\n${formatItems(nearby, popular.length)}`,
        );
    } else if (distanceUnavailable) {
        sections.push("도로망 서버에 연결할 수 없어 이번에는 검색순 관광지만 추천합니다.");
    }

    return (
        `${sections.join("\n\n")}\n\n`
        + "마음에 드는 관광지를 번호나 관광지명으로 선택해주세요."
    );
}

async function recommendAttractions({
    region,
    themes = [],
    tripType,
    recommendationRound = 1,
    recommendedHistory = [],
    indoorOutdoor = null,
    origin = null,
}) {
    if (tripType === "당일치기") {
        return await recommendPopularAttractions({
            region,
            themes,
            tripType,
            recommendationRound,
            recommendedHistory,
            indoorOutdoor,
        });
    }

    const page = getRecommendationPage({ tripType, recommendationRound });
    const historyIds = extractHistoryIds(recommendedHistory);
    const popularResult = await recommendPopularAttractions({
        region,
        themes,
        tripType,
        recommendationRound,
        recommendedHistory,
        indoorOutdoor,
    });
    const popular = popularResult.recommendations.map((attraction) => ({
        ...attraction,
        recommendationType: "popular",
    }));
    const currentPopularIds = new Set(popular.map(({ id }) => id));
    const excludedIds = new Set([...historyIds, ...currentPopularIds]);
    let nearby = [];
    let distanceUnavailable = false;
    let hasMoreNearby = false;

    if (origin) {
        try {
            const candidates = await findRecommendationCandidates({
                region,
                themes,
                indoorOutdoor,
            });
            const distances = await getRoadDistances({
                origin,
                destinations: candidates.map((candidate) => ({
                    ...candidate,
                    name: candidate.title,
                })),
            });
            const candidateById = new Map(
                candidates.map((candidate) => [String(candidate.id), candidate]),
            );
            const rankedNearby = distances
                .filter(({ reachable }) => reachable)
                .map((distance, index) => ({
                    ...candidateById.get(String(distance.id)),
                    popularityPosition: index + 1,
                    recommendationType: "distance",
                    roadDistanceMeters: distance.distanceMeters,
                    roadDistanceKm: distance.distanceKm,
                }));
            const pageNearby = rankedNearby
                .filter(({ id }) => !excludedIds.has(id))
                .slice(0, page.limit + 1);

            hasMoreNearby = pageNearby.length > page.limit;
            nearby = pageNearby
                .slice(0, page.limit)
                .map(toRecommendationItem);
        } catch (error) {
            distanceUnavailable = true;
        }
    } else {
        distanceUnavailable = true;
    }

    const recommendations = [...popular, ...nearby];
    const recommendationIds = recommendations.map(({ id }) => id);
    const nextHistory = [...new Set([...historyIds, ...recommendationIds])];
    const hasMore = popularResult.hasMore || hasMoreNearby;
    const exhausted = recommendations.length === 0;

    if (exhausted) {
        return {
            ...popularResult,
            distanceUnavailable,
        };
    }

    return {
        recommendations,
        recommendedHistory: nextHistory,
        recommendationRound: page.round,
        nextRecommendationRound: hasMore ? page.round + 1 : null,
        hasMore,
        exhausted: false,
        distanceUnavailable,
        reply: buildCombinedRecommendationReply({
            popular,
            nearby,
            page,
            distanceUnavailable,
        }),
    };
}

module.exports = {
    getRecommendationPage,
    extractHistoryIds,
    recommendPopularAttractions,
    recommendAttractions,
};
