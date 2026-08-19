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

async function searchAttractionsByName({ name, limit = 8 }) {
    const normalizedName = normalizeName(name);
    const pagination = normalizePagination(0, limit);
    if (!normalizedName) return [];

    return await prisma.attraction.findMany({
        where: {
            normalizedTitle: { contains: normalizedName },
            mapx: { not: null },
            mapy: { not: null },
        },
        select: {
            id: true,
            title: true,
            region: true,
            address1: true,
            address2: true,
            mapx: true,
            mapy: true,
        },
        orderBy: [
            { normalizedTitle: "asc" },
            { id: "asc" },
        ],
        take: pagination.limit,
    });
}

async function findPopularAttractions({
    region,
    themes = [],
    offset = 0,
    limit = 10,
    excludeAttractionIds = [],
    indoorOutdoor = null,
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

    const attractions = await prisma.$queryRaw`
        WITH ranked AS (
            SELECT
                attraction.id,
                attraction."contentId",
                attraction.title,
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

async function findRecommendationCandidates({
    region,
    themes = [],
    indoorOutdoor = null,
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

    const attractions = await prisma.$queryRaw`
        SELECT
            attraction.id,
            attraction."contentId",
            attraction.title,
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
    findRecommendationCandidates,
};
