const axios = require("axios");
const env = require("../src/config/env");
const { prisma } = require("../src/config/db");

/**
 * ==========================================================
 * 영문 관광 정보(EngService2) 점검
 * ==========================================================
 *
 * 1) 서비스 키가 영문 서비스에 승인되어 있는지 확인한다.
 * 2) 승인되어 있으면 우리 관광지 중 영문 제목이 있는 비율을 센다.
 *
 * 주의
 * ----------------------------------------------------------
 * 한국어 서비스와 영문 서비스는 contentId 체계가 다르다.
 * 확인 결과 경기도 329건 중 우리 DB와 겹치는 contentId는 0건이었다.
 *
 * 대신 영문 제목이
 *   'East Nine Royal Tombs [UNESCO World Heritage] (구리 동구릉 [유네스코 세계문화유산])'
 * 처럼 한글명을 괄호로 달고 나오므로, 그 한글명으로 우리 제목과 맞춘다.
 *
 * 영문 DB는 주요 관광지 위주라 전부 있지는 않다.
 * 커버리지를 먼저 재야 영어 화면을 어떻게 만들지 정할 수 있다.
 *
 * 사용법
 *   node scripts/checkEnglishTourApi.js
 * ==========================================================
 */

const ENGLISH_BASE = "https://apis.data.go.kr/B551011/EngService2";
const GYEONGGI_AREA_CODE = 31;

function parseArgs(argv) {
    const sample = argv.find((value) => value.startsWith("--sample="));
    return {
        all: argv.includes("--all"),
        sampleSize: sample ? Number.parseInt(sample.split("=")[1], 10) : 20,
    };
}

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
        timeout: 15000,
        validateStatus: () => true,
    });
    return response;
}

function readItems(data) {
    const items = data?.response?.body?.items?.item;
    if (!items) return [];
    return Array.isArray(items) ? items : [items];
}

async function checkAuthorization() {
    const response = await callEnglishApi("areaCode2", { numOfRows: 1 });

    if (response.status === 403) {
        return { authorized: false, reason: "403 (활용신청 미승인)" };
    }
    if (response.status !== 200) {
        return { authorized: false, reason: `HTTP ${response.status}` };
    }

    const header = response.data?.response?.header;
    if (header?.resultCode && header.resultCode !== "0000") {
        return { authorized: false, reason: `${header.resultCode} ${header.resultMsg}` };
    }
    if (typeof response.data === "string" && response.data.includes("SERVICE")) {
        return { authorized: false, reason: response.data.slice(0, 120) };
    }

    return { authorized: true };
}

// 영문 제목 끝의 괄호 안 한글명을 떼어낸다.
function splitEnglishTitle(title) {
    const value = String(title || "").trim();
    const match = value.match(/^(.*?)\s*\(([^()]*[가-힣][^()]*)\)\s*$/);
    if (!match) return { english: value, korean: null };
    return { english: match[1].trim(), korean: match[2].trim() };
}

// 시군구 코드가 '1.0'처럼 저장된 행이 있어 정수로 맞춘다.
function normalizeSigunguCode(value) {
    const parsed = Number.parseInt(String(value ?? "").replace(/\.0+$/, ""), 10);
    return Number.isInteger(parsed) ? String(parsed) : null;
}

async function fetchEnglishAttractions(areaCode) {
    const collected = [];
    let page = 1;

    while (page <= 50) {
        const response = await callEnglishApi("areaBasedList2", {
            areaCode,
            numOfRows: 100,
            pageNo: page,
        });
        const pageItems = readItems(response.data);
        collected.push(...pageItems);

        const total = Number(response.data?.response?.body?.totalCount || 0);
        if (collected.length >= total || pageItems.length === 0) break;
        page += 1;
    }

    return collected;
}

async function main() {
    if (!serviceKey) {
        console.log("TOUR_API_ENG_SERVICE_KEY 또는 TOUR_API_SERVICE_KEY가 비어 있습니다.");
        process.exitCode = 1;
        return;
    }

    const authorization = await checkAuthorization();
    if (!authorization.authorized) {
        console.log(`영문 서비스 호출 불가: ${authorization.reason}`);
        console.log("");
        console.log("data.go.kr에서 '한국관광공사_영문 관광정보 서비스(EngService2)'를 활용신청한 뒤,");
        console.log("발급된 키를 .env의 TOUR_API_ENG_SERVICE_KEY에 넣고 다시 실행해주세요.");
        console.log("같은 인증키로 열리는 경우에는 비워둬도 됩니다.");
        process.exitCode = 1;
        return;
    }

    console.log("영문 서비스 호출 가능. 커버리지를 확인합니다.\n");

    const englishItems = await fetchEnglishAttractions(GYEONGGI_AREA_CODE);
    console.log(`경기도 영문 관광지 ${englishItems.length}건 수집`);

    const regionRows = await prisma.$queryRaw`
        SELECT region, "sigunguCode" AS code
        FROM "Attraction"
        WHERE "sigunguCode" IS NOT NULL
        GROUP BY 1, 2
    `;
    const regionBySigungu = new Map(
        regionRows
            .map(({ region, code }) => [normalizeSigunguCode(code), region])
            .filter(([code]) => code),
    );

    const inServiceRegions = englishItems.filter(
        (item) => regionBySigungu.has(normalizeSigunguCode(item.sigungucode)),
    );
    console.log(`그중 지원 지역 ${inServiceRegions.length}건\n`);

    // 괄호 안 한글명으로 우리 관광지와 맞춘다.
    const named = inServiceRegions
        .map((item) => ({ ...splitEnglishTitle(item.title), item }))
        .filter(({ korean }) => korean);
    const koreanTitles = [...new Set(named.map(({ korean }) => korean))];
    const matched = await prisma.attraction.findMany({
        where: { title: { in: koreanTitles } },
        select: { title: true, region: true },
    });
    const matchedTitles = new Map(matched.map(({ title, region }) => [title, region]));

    const totals = await prisma.attraction.groupBy({
        by: ["region"],
        _count: { _all: true },
    });

    const stats = new Map(totals.map(({ region, _count }) => [region, { total: _count._all, matched: 0, samples: [] }]));
    for (const { english, korean } of named) {
        const region = matchedTitles.get(korean);
        if (!region) continue;
        const stat = stats.get(region);
        if (!stat) continue;
        stat.matched += 1;
        if (stat.samples.length < 2) stat.samples.push(`${korean} → ${english}`);
    }

    console.log("지역        보유   영문있음  비율");
    let total = 0;
    let found = 0;
    for (const [region, stat] of [...stats].sort()) {
        total += stat.total;
        found += stat.matched;
        const rate = ((stat.matched / stat.total) * 100).toFixed(1);
        console.log(`${region.padEnd(10)} ${String(stat.total).padStart(5)} ${String(stat.matched).padStart(9)}  ${rate}%`);
    }
    console.log(`\n전체 ${found}/${total} (${((found / total) * 100).toFixed(1)}%)`);

    const unmatched = named.length - found;
    if (unmatched > 0) {
        console.log(`영문에는 있으나 우리 DB에 같은 제목이 없는 것: ${unmatched}건`);
    }

    const examples = [...stats.values()].flatMap(({ samples }) => samples).slice(0, 12);
    if (examples.length) {
        console.log("\n예시");
        examples.forEach((line) => console.log(`  ${line}`));
    }
}

main()
    .catch((error) => {
        console.error("점검 실패:", error.message);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
