const {
    findPopularAttractions,
    findRecommendationCandidates,
} = require("../repositories/attractionRepository");
const { getRoadDistances } = require("./roadNetworkService");
const { enrichRecommendationItems } = require("./tourApiService");
const { displayName } = require("../utils/attractionNameUtils");
const { t, themeLabel } = require("./messageService");

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
        nameEn: attraction.titleEn || null,
        region: attraction.region,
        address: [attraction.address1, attraction.address2]
            .filter(Boolean)
            .join(" "),
        mapx: attraction.mapx,
        mapy: attraction.mapy,
        image: attraction.firstImage,
        description: attraction.description || null,
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

function buildRecommendationReply({ recommendations, page, hasMore, language = "ko" }) {
    const lines = recommendations.map((attraction, index) => t("recommendation.item", {
        index: index + 1,
        name: displayName(attraction, language),
        theme: themeLabel(attraction.theme, language),
        address: attraction.address,
    }, language));

    const nextMessage = hasMore
        ? t("recommendation.hasMore", {}, language)
        : t("recommendation.last", {}, language);

    return (
        `${t("recommendation.header", { startRank: page.startRank, endRank: page.endRank }, language)}\n\n`
        + lines.join("\n\n")
        + `\n\n${nextMessage}`
    );
}

async function recommendPopularAttractions({
    region,
    themes = [],
    tripType,
    recommendationRound = 1,
    recommendedHistory = [],
    indoorOutdoor = null,
    englishOnly = false,
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
        englishOnly,
    });

    const hasMore = candidates.length > page.limit;
    const recommendations = await enrichRecommendationItems(
        candidates.slice(0, page.limit).map(toRecommendationItem),
    );
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
            reply: t("recommendation.exhausted", {}, englishOnly ? "en" : "ko"),
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
            language: englishOnly ? "en" : "ko",
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
    englishOnly = false,
}) {
    if (tripType === "당일치기") {
        return await recommendPopularAttractions({
            region,
            themes,
            tripType,
            recommendationRound,
            recommendedHistory,
            indoorOutdoor,
            englishOnly,
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
        englishOnly,
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
                englishOnly,
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
            nearby = await enrichRecommendationItems(
                pageNearby.slice(0, page.limit).map(toRecommendationItem),
            );
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
