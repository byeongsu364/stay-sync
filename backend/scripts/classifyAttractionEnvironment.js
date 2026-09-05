require("dotenv").config();
const { prisma } = require("../src/config/db");

const INDOOR_CATEGORY2 = new Set(["A0206", "A0401", "A0502"]);
const OUTDOOR_CATEGORY1 = new Set(["A01", "A03", "C01"]);
const OUTDOOR_CATEGORY2 = new Set(["A0202", "A0203", "A0205", "A0207"]);

const INDOOR_KEYWORDS = [
    "박물관", "미술관", "과학관", "전시관", "기념관", "문학관", "역사관",
    "체험관", "홍보관", "문화관", "공연장", "극장", "아트센터", "문화센터",
    "수족관", "아쿠아리움", "실내", "도서관", "쇼핑몰", "백화점",
];
const OUTDOOR_KEYWORDS = [
    "수목원", "식물원", "공원", "계곡", "폭포", "해수욕장", "캠핑", "야영장",
    "휴양림", "둘레길", "산책로", "등산로", "숲길", "자연휴양림", "생태공원",
    "목장", "농장", "섬", "호수", "수상레저",
];

function includesAny(text, keywords) {
    const normalized = String(text || "").replace(/\s/g, "");
    return keywords.some((keyword) => normalized.includes(keyword));
}

function classifyEnvironment(attraction) {
    const title = attraction.title || "";
    if (includesAny(title, INDOOR_KEYWORDS)) return "실내";
    if (includesAny(title, OUTDOOR_KEYWORDS)) return "실외";
    if (INDOOR_CATEGORY2.has(attraction.category2)) return "실내";
    if (OUTDOOR_CATEGORY1.has(attraction.category1)) return "실외";
    if (OUTDOOR_CATEGORY2.has(attraction.category2)) return "실외";
    return null;
}

async function main() {
    const apply = process.argv.includes("--apply");
    const attractions = await prisma.attraction.findMany({
        where: { indoorOutdoor: null },
        select: { id: true, title: true, category1: true, category2: true },
    });
    const classified = attractions
        .map((attraction) => ({
            id: attraction.id,
            indoorOutdoor: classifyEnvironment(attraction),
        }))
        .filter(({ indoorOutdoor }) => indoorOutdoor);
    const counts = classified.reduce((result, item) => ({
        ...result,
        [item.indoorOutdoor]: (result[item.indoorOutdoor] || 0) + 1,
    }), {});

    if (apply) {
        for (let index = 0; index < classified.length; index += 200) {
            const chunk = classified.slice(index, index + 200);
            await prisma.$transaction(chunk.map(({ id, indoorOutdoor }) => (
                prisma.attraction.update({ where: { id }, data: { indoorOutdoor } })
            )));
        }
    }

    console.log(JSON.stringify({
        mode: apply ? "applied" : "dry-run",
        total: attractions.length,
        classified: classified.length,
        unknown: attractions.length - classified.length,
        counts,
    }, null, 2));
}

if (require.main === module) {
    main()
        .catch((error) => {
            console.error(error);
            process.exitCode = 1;
        })
        .finally(async () => prisma.$disconnect());
}

module.exports = { classifyEnvironment };
