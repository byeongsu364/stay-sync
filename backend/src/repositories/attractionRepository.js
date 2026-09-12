const { Prisma } = require("@prisma/client");
const { prisma } = require("../config/db");

const MAX_PAGE_SIZE = 100;

function normalizeText(value) {
    return String(value || "").normalize("NFC").trim();
}

function normalizeName(value) {
    return normalizeText(value)
        .toLowerCase()
        .replace(/[^0-9a-z가-힣]/g, "");
}

function normalizePagination(offset, limit) {
    const parsedOffset = Number.parseInt(offset, 10);
    const parsedLimit = Number.parseInt(limit, 10);

    return {
        offset: Number.isInteger(parsedOffset) && parsedOffset >= 0
            ? parsedOffset
            : 0,
        limit: Number.isInteger(parsedLimit) && parsedLimit > 0
            ? Math.min(parsedLimit, MAX_PAGE_SIZE)
            : 10,
    };
}

async function findLatestSearchMonth(region) {
    const normalizedRegion = normalizeText(region);

    if (!normalizedRegion) return null;

    const result = await prisma.attractionSearchStat.aggregate({
        where: {
            region: normalizedRegion,
            attractionId: {
                not: null,
            },
        },
        _max: {
            yearMonth: true,
        },
    });

    return result._max.yearMonth;
}

async function findAttractionsByName({ region, name, limit = 10 }) {
    const normalizedRegion = normalizeText(region);
    const normalizedName = normalizeName(name);
    const pagination = normalizePagination(0, limit);

    if (!normalizedRegion || !normalizedName) return [];

    return await prisma.attraction.findMany({
        where: {
            region: normalizedRegion,
            normalizedTitle: {
                contains: normalizedName,
            },
        },
        orderBy: [
            { normalizedTitle: "asc" },
            { id: "asc" },
        ],
        take: pagination.limit,
    });
}

async function searchAttractionsByName({ name, limit = 8, mentionedInText = false }) {
    const normalizedName = normalizeName(name);
    const pagination = normalizePagination(0, limit);
    if (!normalizedName) return [];

    // 문장 전체가 제목에 포함되는지 대신, DB 제목이 문장에 포함되는지 조회한다.
    // 제목에는 '구리 동구릉 [유네스코 세계유산]'처럼 지역명과 괄호 설명이 붙어 있어
    // 괄호를 뗀 이름과 지역명을 뗀 이름까지 함께 대조한다.
    // 여기서는 후보를 넉넉히 모으고, 문장 안의 경계 판단은 attractionNameUtils가 맡는다.
    // 사용자 입력은 Prisma의 바인딩 값으로만 전달한다.
    const mentioned = mentionedInText
        ? await prisma.$queryRaw`
            WITH alias AS (
                SELECT
                    id,
                    "normalizedTitle" AS full_name,
                    COALESCE("normalizedTitleEn", '') AS english_name,
                    regexp_replace(
                        lower(regexp_replace(COALESCE("titleEn", ''), '[[(（［].*$', '')),
                        '[^0-9a-z가-힣]', '', 'g'
                    ) AS english_core,
                    regexp_replace(
                        lower(regexp_replace(title, '[[(（［].*$', '')),
                        '[^0-9a-z가-힣]', '', 'g'
                    ) AS core_name,
                    regexp_replace(lower(region), '[^0-9a-z가-힣]', '', 'g') AS region_name
                FROM "Attraction"
                WHERE "normalizedTitle" <> ''
                  AND mapx IS NOT NULL AND mapy IS NOT NULL
            )
            SELECT id FROM alias
            WHERE (char_length(full_name) >= 2 AND POSITION(full_name IN ${normalizedName}) > 0)
               OR (char_length(english_name) >= 3 AND POSITION(english_name IN ${normalizedName}) > 0)
               OR (char_length(english_core) >= 3 AND POSITION(english_core IN ${normalizedName}) > 0)
               OR (char_length(core_name) >= 2 AND POSITION(core_name IN ${normalizedName}) > 0)
               OR (
                    region_name <> ''
                    AND core_name LIKE region_name || '%'
                    AND char_length(core_name) - char_length(region_name) >= 2
                    AND POSITION(
                        substring(core_name FROM char_length(region_name) + 1) IN ${normalizedName}
                    ) > 0
                  )
        `
        : null;

    return await prisma.attraction.findMany({
        where: {
            ...(mentioned
                ? { id: { in: mentioned.map(({ id }) => id) } }
                : {
                    OR: [
                        { normalizedTitle: { contains: normalizedName } },
                        { normalizedTitleEn: { contains: normalizedName } },
                    ],
                }),
            mapx: { not: null },
            mapy: { not: null },
        },
        select: {
            id: true,
            title: true,
            titleEn: true,
            region: true,
            address1: true,
            address2: true,
            mapx: true,
            mapy: true,
            searchStats: {
                select: {
                    middleCategory: true,
                    smallCategory: true,
                    yearMonth: true,
                },
                orderBy: [
                    { yearMonth: "desc" },
                    { rank: "asc" },
                ],
                take: 1,
            },
        },
        orderBy: [
            { normalizedTitle: "asc" },
            { id: "asc" },
        ],
        ...(mentioned ? {} : { take: pagination.limit }),
    }).then((attractions) => attractions.map((attraction) => {
        const latestStat = attraction.searchStats[0] || null;
        return {
            ...attraction,
            searchStats: undefined,
            theme: latestStat?.middleCategory || null,
            category: latestStat?.smallCategory || null,
        };
    }));
}

async function findPopularAttractions({
    region,
    themes = [],
    offset = 0,
    limit = 10,
    excludeAttractionIds = [],
    indoorOutdoor = null,
    englishOnly = false,
}) {
    const normalizedRegion = normalizeText(region);
    const normalizedThemes = [...new Set(
        themes.map(normalizeText).filter(Boolean),
    )];
    const excludedIds = [...new Set(
        excludeAttractionIds
            .map((id) => Number.parseInt(id, 10))
            .filter(Number.isInteger),
    )];
    const normalizedIndoorOutdoor = normalizeText(indoorOutdoor);
    const pagination = normalizePagination(offset, limit);

    if (!normalizedRegion) return [];

    const latestMonth = await findLatestSearchMonth(normalizedRegion);
    if (!latestMonth) return [];

    const latestYear = latestMonth.getUTCFullYear();
    const latestMonthNumber = latestMonth.getUTCMonth() + 1;

    const themeCondition = normalizedThemes.length > 0
        ? Prisma.sql`AND stats."middleCategory" IN (${Prisma.join(normalizedThemes)})`
        : Prisma.empty;
    const excludeCondition = excludedIds.length > 0
        ? Prisma.sql`AND ranked.id NOT IN (${Prisma.join(excludedIds)})`
        : Prisma.empty;
    const indoorOutdoorCondition = normalizedIndoorOutdoor
        ? Prisma.sql`AND attraction."indoorOutdoor" = ${normalizedIndoorOutdoor}`
        : Prisma.empty;
    // 영어 대화에서는 이름을 영어로 보여줄 수 있는 관광지만 추천한다.
    const englishCondition = englishOnly
        ? Prisma.sql`AND attraction."titleEn" IS NOT NULL`
        : Prisma.empty;

    const attractions = await prisma.$queryRaw`
        WITH ranked AS (
            SELECT
                attraction.id,
                attraction."contentId",
                attraction.title,
                attraction."titleEn",
                attraction.region,
                attraction."address1",
                attraction."address2",
                attraction.mapx,
                attraction.mapy,
                attraction."firstImage",
                attraction."indoorOutdoor",
                MIN(stats.rank)::integer AS "searchRank",
                SUM(stats."searchCount")::integer AS "searchCount",
                MIN(stats."middleCategory") AS "middleCategory",
                MIN(stats."smallCategory") AS "smallCategory",
                ROW_NUMBER() OVER (
                    ORDER BY
                        MIN(stats.rank) ASC,
                        SUM(stats."searchCount") DESC,
                        attraction.id ASC
                )::integer AS "popularityPosition"
            FROM "AttractionSearchStat" AS stats
            INNER JOIN "Attraction" AS attraction
                ON attraction.id = stats."attractionId"
            WHERE stats.region = ${normalizedRegion}
              AND stats.year = ${latestYear}
              AND stats.month = ${latestMonthNumber}
              ${themeCondition}
              ${indoorOutdoorCondition}
              ${englishCondition}
            GROUP BY attraction.id
        )
        SELECT *
        FROM ranked
        WHERE ranked."popularityPosition" > ${pagination.offset}
          AND ranked."popularityPosition" <= ${pagination.offset + pagination.limit}
          ${excludeCondition}
        ORDER BY ranked."popularityPosition" ASC
    `;

    return attractions.map((attraction) => ({
        ...attraction,
        searchMonth: latestMonth,
    }));
}

/**
 * 영어로 안내할 수 있는 지역과 관광지 수
 *
 * 영문명이 있어도 최신 월 검색 통계나 좌표가 없으면 추천에 뜨지 않는다.
 * 추천 쿼리와 같은 조건으로 세야 실제로 안내 가능한 지역을 알 수 있다.
 */
async function findEnglishAttractionCountsByRegion() {
    const rows = await prisma.$queryRaw`
        WITH latest AS (
            SELECT region, MAX("yearMonth") AS "yearMonth"
            FROM "AttractionSearchStat"
            WHERE "attractionId" IS NOT NULL
            GROUP BY region
        )
        SELECT attraction.region AS region, COUNT(DISTINCT attraction.id)::integer AS count
        FROM "Attraction" AS attraction
        INNER JOIN "AttractionSearchStat" AS stats
            ON stats."attractionId" = attraction.id
        INNER JOIN latest
            ON latest.region = stats.region
           AND latest."yearMonth" = stats."yearMonth"
        WHERE attraction."titleEn" IS NOT NULL
          AND attraction.mapx IS NOT NULL
          AND attraction.mapy IS NOT NULL
        GROUP BY attraction.region
        ORDER BY attraction.region ASC
    `;

    return new Map(rows.map(({ region, count }) => [region, count]));
}

async function findRecommendationCandidates({
    region,
    themes = [],
    indoorOutdoor = null,
    englishOnly = false,
}) {
    const normalizedRegion = normalizeText(region);
    const normalizedThemes = [...new Set(
        themes.map(normalizeText).filter(Boolean),
    )];
    const normalizedIndoorOutdoor = normalizeText(indoorOutdoor);

    if (!normalizedRegion) return [];

    const latestMonth = await findLatestSearchMonth(normalizedRegion);
    if (!latestMonth) return [];

    const latestYear = latestMonth.getUTCFullYear();
    const latestMonthNumber = latestMonth.getUTCMonth() + 1;
    const themeCondition = normalizedThemes.length > 0
        ? Prisma.sql`AND stats."middleCategory" IN (${Prisma.join(normalizedThemes)})`
        : Prisma.empty;
    const indoorOutdoorCondition = normalizedIndoorOutdoor
        ? Prisma.sql`AND attraction."indoorOutdoor" = ${normalizedIndoorOutdoor}`
        : Prisma.empty;
    const englishCondition = englishOnly
        ? Prisma.sql`AND attraction."titleEn" IS NOT NULL`
        : Prisma.empty;

    const attractions = await prisma.$queryRaw`
        SELECT
            attraction.id,
            attraction."contentId",
            attraction.title,
            attraction."titleEn",
            attraction.region,
            attraction."address1",
            attraction."address2",
            attraction.mapx,
            attraction.mapy,
            attraction."firstImage",
            attraction."indoorOutdoor",
            MIN(stats.rank)::integer AS "searchRank",
            SUM(stats."searchCount")::integer AS "searchCount",
            MIN(stats."middleCategory") AS "middleCategory",
            MIN(stats."smallCategory") AS "smallCategory"
        FROM "AttractionSearchStat" AS stats
        INNER JOIN "Attraction" AS attraction
            ON attraction.id = stats."attractionId"
        WHERE stats.region = ${normalizedRegion}
          AND stats.year = ${latestYear}
          AND stats.month = ${latestMonthNumber}
          AND attraction.mapx IS NOT NULL
          AND attraction.mapy IS NOT NULL
          ${themeCondition}
          ${indoorOutdoorCondition}
          ${englishCondition}
        GROUP BY attraction.id
        ORDER BY attraction.id ASC
    `;

    return attractions.map((attraction) => ({
        ...attraction,
        searchMonth: latestMonth,
    }));
}

module.exports = {
    findLatestSearchMonth,
    findAttractionsByName,
    searchAttractionsByName,
    findPopularAttractions,
    findEnglishAttractionCountsByRegion,
    findRecommendationCandidates,
};
