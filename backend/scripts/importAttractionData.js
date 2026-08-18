const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const DATA_DIR = path.join(__dirname, "..", "src", "data");
const BATCH_SIZE = 1000;

function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];

        if (quoted) {
            if (character === '"' && text[index + 1] === '"') {
                field += '"';
                index += 1;
            } else if (character === '"') {
                quoted = false;
            } else {
                field += character;
            }
        } else if (character === '"') {
            quoted = true;
        } else if (character === ",") {
            row.push(field);
            field = "";
        } else if (character === "\n") {
            row.push(field.replace(/\r$/, ""));
            rows.push(row);
            row = [];
            field = "";
        } else {
            field += character;
        }
    }

    if (field || row.length) {
        row.push(field.replace(/\r$/, ""));
        rows.push(row);
    }

    return rows;
}

function readCsv(filePath) {
    const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    const [headers, ...values] = parseCsv(text);

    return values
        .filter((row) => row.some((value) => value !== ""))
        .map((row) => Object.fromEntries(
            headers.map((header, index) => [header.trim(), row[index] ?? ""]),
        ));
}

function normalizeName(value) {
    return String(value || "")
        .normalize("NFC")
        .toLowerCase()
        .replace(/[^0-9a-z가-힣]/g, "");
}

function normalizeText(value) {
    return String(value || "").normalize("NFC").trim();
}

function nullable(value) {
    const normalized = normalizeText(value);
    return normalized || null;
}

function nullableNumber(value) {
    const normalized = nullable(value);
    if (normalized === null) return null;

    const parsed = Number(normalized.replaceAll(",", ""));
    return Number.isFinite(parsed) ? parsed : null;
}

function requiredInteger(value, fieldName, fileName) {
    const parsed = Number.parseInt(String(value).replaceAll(",", ""), 10);

    if (!Number.isInteger(parsed)) {
        throw new Error(`${fileName}: ${fieldName} 값이 올바르지 않습니다: ${value}`);
    }

    return parsed;
}

function extractRegion(address) {
    const match = String(address || "").normalize("NFC").match(
        /경기(?:도)?\s+(고양|파주|의정부|양주|동두천|포천|남양주|구리|가평|연천)(?:시|군)?/,
    );

    return match?.[1] || null;
}

function findCsvFiles() {
    return fs.readdirSync(DATA_DIR)
        .filter((fileName) => fileName.toLowerCase().endsWith(".csv"))
        .map((fileName) => path.join(DATA_DIR, fileName));
}

async function createInBatches(model, records) {
    for (let start = 0; start < records.length; start += BATCH_SIZE) {
        const batch = records.slice(start, start + BATCH_SIZE);
        await model.createMany({ data: batch });
    }
}

async function main() {
    const csvFiles = findCsvFiles();
    const parsedFiles = csvFiles.map((filePath) => ({
        filePath,
        fileName: path.basename(filePath).normalize("NFC"),
        rows: readCsv(filePath),
    }));

    const masterFile = parsedFiles.find(({ rows }) => rows[0]?.contentid);
    const searchFiles = parsedFiles.filter(({ rows }) => rows[0]?.["검색건수"] !== undefined);

    if (!masterFile) throw new Error("관광지 마스터 CSV를 찾지 못했습니다.");
    if (searchFiles.length === 0) throw new Error("지역별 검색 CSV를 찾지 못했습니다.");

    const [attractionCount, searchStatCount] = await Promise.all([
        prisma.attraction.count(),
        prisma.attractionSearchStat.count(),
    ]);

    const replaceExisting = process.argv.includes("--replace");

    if ((attractionCount > 0 || searchStatCount > 0) && !replaceExisting) {
        throw new Error(
            `관광지 테이블이 비어 있지 않습니다. Attraction=${attractionCount}, `
            + `AttractionSearchStat=${searchStatCount}`,
        );
    }

    if (replaceExisting) {
        await prisma.$transaction([
            prisma.attractionSearchStat.deleteMany(),
            prisma.attraction.deleteMany(),
        ]);
    }

    const attractions = masterFile.rows.map((row) => {
        const region = extractRegion(row.addr1);

        if (!region) {
            throw new Error(`지원 지역을 추출할 수 없습니다: ${row.title} / ${row.addr1}`);
        }

        return {
            contentId: row.contentid.trim(),
            title: normalizeText(row.title),
            normalizedTitle: normalizeName(row.title),
            region,
            address1: normalizeText(row.addr1),
            address2: nullable(row.addr2),
            zipCode: nullable(row.zipcode),
            mapx: nullableNumber(row.mapx),
            mapy: nullableNumber(row.mapy),
            mapLevel: nullableNumber(row.mlevel),
            areaCode: nullable(row.areacode),
            sigunguCode: nullable(row.sigungucode),
            contentTypeId: nullable(row.contenttypeid),
            category1: nullable(row.cat1),
            category2: nullable(row.cat2),
            category3: nullable(row.cat3),
            classification1: nullable(row.lclsSystm1),
            classification2: nullable(row.lclsSystm2),
            classification3: nullable(row.lclsSystm3),
            firstImage: nullable(row.firstimage),
            firstImage2: nullable(row.firstimage2),
            telephone: nullable(row.tel),
            copyrightDivisionCode: nullable(row.cpyrhtDivCd),
            sourceCreatedTime: nullable(row.createdtime),
            sourceModifiedTime: nullable(row.modifiedtime),
            legalDistrictRegionCode: nullable(row.lDongRegnCd),
            legalDistrictSigunguCode: nullable(row.lDongSignguCd),
        };
    });

    await createInBatches(prisma.attraction, attractions);

    const savedAttractions = await prisma.attraction.findMany({
        select: { id: true, region: true, normalizedTitle: true },
    });
    const attractionByRegionAndName = new Map(
        savedAttractions.map((attraction) => [
            `${attraction.region}:${attraction.normalizedTitle}`,
            attraction.id,
        ]),
    );

    let matchedCount = 0;
    const searchStats = searchFiles.flatMap(({ fileName, rows }) => rows.map((row) => {
        const region = normalizeText(row["지역"]);
        const normalizedName = normalizeName(row["관광지명"]);
        const attractionId = attractionByRegionAndName.get(`${region}:${normalizedName}`) || null;
        const year = requiredInteger(row["연도"], "연도", fileName);
        const month = requiredInteger(row["월"], "월", fileName);

        if (attractionId) matchedCount += 1;

        return {
            attractionId,
            region,
            detailRegion: nullable(row["세부지역"]),
            year,
            month,
            yearMonth: new Date(Date.UTC(year, month - 1, 1)),
            rank: requiredInteger(row["순위"], "순위", fileName),
            placeName: normalizeText(row["관광지명"]),
            normalizedName,
            searchCount: requiredInteger(row["검색건수"], "검색건수", fileName),
            middleCategory: normalizeText(row["중분류 카테고리"]),
            smallCategory: normalizeText(row["소분류 카테고리"]),
            sourceFile: nullable(row["원본파일"]),
        };
    }));

    await createInBatches(prisma.attractionSearchStat, searchStats);

    console.log(JSON.stringify({
        attractions: attractions.length,
        searchStats: searchStats.length,
        matchedSearchStats: matchedCount,
        unmatchedSearchStats: searchStats.length - matchedCount,
    }, null, 2));
}

main()
    .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
