const axios = require("axios");
const env = require("../src/config/env");
const { prisma } = require("../src/config/db");
const { normalizeName, stripSupplement } = require("../src/utils/attractionNameUtils");

/**
 * ==========================================================
 * 영문 관광지명 가져오기
 * ==========================================================
 *
 * 한국관광공사 영문 서비스(EngService2)에서 경기도 관광지를 받아
 * 우리 Attraction의 titleEn을 채운다.
 *
 * 주의
 * ----------------------------------------------------------
 * 한국어 서비스와 영문 서비스는 contentId 체계가 다르다.
 * 같은 관광지도 ID가 달라(청평자연휴양림: 127929 / 950668) ID로는 맞출 수 없다.
 *
 * 대신 영문 제목이
 *   'Cheongpyeong Recreational Forest (청평자연휴양림)'
 * 처럼 한글명을 괄호로 달고 나오므로 그 한글명으로 맞춘다.
 *
 * 같은 곳인데 표기가 조금씩 달라(세계유산 / 세계문화유산) 정확히 같지 않은 경우가 있어
 * 공백과 기호를 지운 normalizedTitle로 맞추고, 그래도 안 되면 괄호 설명을 뗀 이름으로 맞춘다.
 *
 * 영문 서비스에 등록된 경기도 관광지는 329건뿐이라
 * 채워지는 건 우리 3,173건 중 일부다. 나머지는 null로 남고 한글명을 쓴다.
 *
 * 사용법
 *   node scripts/importEnglishTitles.js
 *   node scripts/importEnglishTitles.js --dry-run
 * ==========================================================
 */

const ENGLISH_BASE = "https://apis.data.go.kr/B551011/EngService2";
const GYEONGGI_AREA_CODE = 31;
const MAX_PAGES = 50;
const PAGE_SIZE = 100;

function normalizeServiceKey(serviceKey) {
    const key = String(serviceKey || "").trim();
    if (!key.includes("%")) return key;
    try {
        return decodeURIComponent(key);
    } catch (error) {
        return key;
    }
}

const serviceKey = normalizeServiceKey(env.tourApi.englishServiceKey);

async function callEnglishApi(path, params) {
    const response = await axios.get(`${ENGLISH_BASE}/${path}`, {
        params: {
            serviceKey,
            MobileOS: "ETC",
            MobileApp: "StaySync",
            _type: "json",
            ...params,
        },
        timeout: 20000,
        validateStatus: () => true,
    });
    return response;
}

function readItems(data) {
    const items = data?.response?.body?.items?.item;
    if (!items) return [];
    return Array.isArray(items) ? items : [items];
}

// 'Gana Art Park (가나아트파크)' → { english, korean }
function splitEnglishTitle(title) {
    const value = String(title || "").trim();
    const match = value.match(/^(.*?)\s*\(([^()]*[가-힣][^()]*)\)\s*$/);
    if (!match) return { english: value, korean: null };
    return { english: match[1].trim(), korean: match[2].trim() };
}

async function fetchEnglishAttractions() {
    const collected = [];

    for (let page = 1; page <= MAX_PAGES; page += 1) {
        const response = await callEnglishApi("areaBasedList2", {
            areaCode: GYEONGGI_AREA_CODE,
            numOfRows: PAGE_SIZE,
            pageNo: page,
        });

        if (response.status !== 200) {
            throw new Error(`영문 서비스 호출 실패: HTTP ${response.status}`);
        }

        const pageItems = readItems(response.data);
        collected.push(...pageItems);

        const total = Number(response.data?.response?.body?.totalCount || 0);
        if (pageItems.length === 0 || collected.length >= total) break;
    }

    return collected;
}

async function main() {
    if (!serviceKey) {
        console.log("TOUR_API_ENG_SERVICE_KEY 또는 TOUR_API_SERVICE_KEY가 비어 있습니다.");
        process.exitCode = 1;
        return;
    }

    const dryRun = process.argv.includes("--dry-run");
    const englishItems = await fetchEnglishAttractions();
    console.log(`영문 관광지 ${englishItems.length}건 수집`);

    // 한 한글명에 여러 영문이 오면 먼저 온 것을 쓴다.
    const englishByKorean = new Map();
    for (const item of englishItems) {
        const { english, korean } = splitEnglishTitle(item.title);
        if (!korean || !english) continue;
        if (!englishByKorean.has(korean)) englishByKorean.set(korean, english);
    }
    console.log(`한글명이 함께 적힌 것 ${englishByKorean.size}건`);

    // 표기 차이를 흡수하기 위해 정규화한 이름과 괄호를 뗀 이름 두 가지로 색인한다.
    const englishByKey = new Map();
    for (const [korean, english] of englishByKorean) {
        for (const key of [normalizeName(korean), normalizeName(stripSupplement(korean))]) {
            if (key.length >= 2 && !englishByKey.has(key)) englishByKey.set(key, english);
        }
    }

    const attractions = await prisma.attraction.findMany({
        select: { id: true, title: true, region: true, titleEn: true },
    });
    const updates = attractions
        .map((attraction) => ({
            attraction,
            titleEn:
                englishByKey.get(normalizeName(attraction.title))
                || englishByKey.get(normalizeName(stripSupplement(attraction.title)))
                || null,
        }))
        .filter(({ attraction, titleEn }) => titleEn && attraction.titleEn !== titleEn);
    console.log(`우리 DB와 맞는 관광지 ${updates.length}건\n`);

    if (dryRun) {
        updates.forEach(({ attraction, titleEn }) => {
            console.log(`  ${attraction.title} (${attraction.region}) → ${titleEn}`);
        });
        console.log(`\n[dry-run] ${updates.length}건을 채울 예정입니다.`);
        return;
    }

    for (const { attraction, titleEn } of updates) {
        await prisma.attraction.update({
            where: { id: attraction.id },
            data: { titleEn, normalizedTitleEn: normalizeName(titleEn) },
        });
    }

    const filled = await prisma.attraction.count({ where: { titleEn: { not: null } } });
    const total = await prisma.attraction.count();
    console.log(`${updates.length}건 갱신. 영문명 보유 ${filled}/${total} (${((filled / total) * 100).toFixed(1)}%)`);

    const samples = await prisma.attraction.findMany({
        where: { titleEn: { not: null } },
        select: { title: true, titleEn: true, region: true },
        orderBy: { id: "asc" },
        take: 8,
    });
    console.log("\n예시");
    samples.forEach(({ title, titleEn, region }) => console.log(`  ${title} (${region}) → ${titleEn}`));
}

main()
    .catch((error) => {
        console.error("영문명 가져오기 실패:", error.message);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
