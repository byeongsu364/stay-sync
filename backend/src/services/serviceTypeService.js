const REGIONS = require("../data/regionData");
const { CURRENT_STEP, ROUTE_NUMBER, SERVICE_TYPE } = require("../data/constants");
const { searchAttractionsByName } = require("../repositories/attractionRepository");
const { mergeSelectedPlaces } = require("./attractionSelectionService");

const SERVICE_TYPE_PROMPT = [
    "어디로 여행을 가시나요?",
    "",
    "숙소를 이미 예약하셨거나 동선만 추천받고 싶다면 아래 항목을 선택해주세요.",
].join("\n");

const SERVICE_TYPE_OPTIONS = [
    { label: "숙소를 이미 예약했어요", value: "2" },
    { label: "동선만 추천받고 싶어요", value: "3" },
];

function classifyServiceType(input) {
    const text = String(input || "").replace(/\s/g, "");
    if (/^(1|1번)$/.test(text) || text.includes("처음부터") || text.includes("숙소추천")) {
        return SERVICE_TYPE.ACCOMMODATION;
    }
    if (/^(2|2번)$/.test(text) || text.includes("숙소는이미") || text.includes("이미예약") || text.includes("숙소예약") || text.includes("관광지추천")) {
        return SERVICE_TYPE.ATTRACTION;
    }
    if (/^(3|3번)$/.test(text) || text.includes("동선만") || text.includes("동선추천")) {
        return SERVICE_TYPE.ROUTE_ONLY;
    }
    return null;
}

function selectServiceType(input, facts) {
    const serviceType = classifyServiceType(input);
    if (!serviceType) {
        return { handled: false, reply: `1번, 2번, 3번 중에서 선택해주세요.\n\n${SERVICE_TYPE_PROMPT}` };
    }

    const nextFacts = { ...facts, service_type: serviceType };
    if (serviceType === SERVICE_TYPE.ACCOMMODATION) {
        return {
            handled: true, facts: nextFacts,
            currentStep: CURRENT_STEP.ASK_REGION,
            lastQuestionField: "region",
            reply: "숙소를 추천받고 싶은 여행 지역을 입력해주세요.",
        };
    }
    if (serviceType === SERVICE_TYPE.ATTRACTION) {
        return {
            handled: true, facts: nextFacts,
            currentStep: CURRENT_STEP.ASK_ATTRACTION_REGION,
            lastQuestionField: "region",
            reply: "여행하고 싶은 지역이나 관심 있는 관광지를 입력해주세요.",
        };
    }
    return {
        handled: true, facts: nextFacts,
        currentStep: CURRENT_STEP.ASK_ROUTE_DAYS,
        lastQuestionField: "travel_days",
        reply: "총 며칠 동안 여행하시나요?\n예: 1일, 2일, 3일",
    };
}

function normalizeName(value) {
    return String(value || "")
        .normalize("NFC")
        .toLowerCase()
        .replace(/[^0-9a-z가-힣]/g, "");
}

function mentionsDestination(text, name) {
    // 이름 안의 띄어쓰기는 유연하게 허용하되 '고양이'를 '고양'으로 읽지 않는다.
    const title = [...normalizeName(name)].join("\\s*");
    if (!title) return false;
    return new RegExp(
        `(?:^|[^가-힣a-z0-9])${title}(?:시|군)?(?=$|[^가-힣a-z0-9]|으로|로|에서|에|을|를|은|는|이랑|랑|하고|와|과)`,
        "i",
    ).test(String(text).normalize("NFC"));
}

function destinationClarification(attractions, regions) {
    return {
        needsDestinationChoice: true,
        reply: "여행할 목적지를 하나만 확인해주세요. 아래에서 선택하거나 가고 싶은 관광지명을 다시 말씀해주세요.",
        quickReplies: [
            ...attractions.map(({ title, region }) => ({ label: `${title} (${region})`, value: `${region} ${title}` })),
            ...regions.map((region) => ({ label: region, value: region })),
        ].slice(0, 8),
    };
}

async function resolveSupportedDestination(input, facts = {}) {
    const text = String(input || "").trim().slice(0, 1000);
    const normalizedInput = normalizeName(text);
    const attractions = await searchAttractionsByName({ name: text, mentionedInText: true });
    const exactMatches = attractions.filter(({ title }) => normalizeName(title) === normalizedInput);
    const mentioned = attractions.filter(({ title }) => mentionsDestination(text, title));
    let candidates = exactMatches.length ? exactMatches : mentioned.filter((place) => (
        !mentioned.some((other) => other.id !== place.id
            && normalizeName(other.title) !== normalizeName(place.title)
            && normalizeName(other.title).includes(normalizeName(place.title)))
    ));
    const regions = REGIONS.filter((region) => mentionsDestination(text, region));
    if (regions.length === 1 && candidates.some((place) => place.region === regions[0])) {
        candidates = candidates.filter((place) => place.region === regions[0]);
    }
    const hasNegativeIntent = /말고|아니|안\s*가|않|싫|제외|취소/.test(text);
    if (candidates.length > 1 || regions.length > 1 || hasNegativeIntent) {
        return destinationClarification(candidates, regions);
    }

    const attraction = candidates[0];
    if (!attraction) {
        return regions.length === 1 ? { ...facts, region: regions[0] } : null;
    }
    if (!REGIONS.includes(attraction.region)) return null;
    if (regions.length && regions[0] !== attraction.region) {
        return destinationClarification(candidates, regions);
    }

    const interestThemes = [...new Set([
        ...(facts.interest_themes || []),
        attraction.theme,
    ].filter(Boolean))];

    const compact = text.replace(/\s/g, "");
    const referenceOnly = /비슷|같은|처럼|근처|주변|궁금|어때|정보/.test(compact);
    const visitConfirmed = !referenceOnly && (
        normalizedInput === normalizeName(attraction.title)
        || /가려고|가려해|가고싶|갈거|갈예정|갈래|갈게|가요|갑니다|방문할|방문하려|방문예정|들를/.test(compact)
    );
    const interestPlace = {
        id: attraction.id,
        name: attraction.title,
        region: attraction.region,
        address: [attraction.address1, attraction.address2].filter(Boolean).join(" "),
        mapx: attraction.mapx,
        mapy: attraction.mapy,
        theme: attraction.theme,
        category: attraction.category,
        visitConfirmed,
    };

    return {
        ...facts,
        region: attraction.region,
        interest_themes: interestThemes,
        themes: [...new Set([...(facts.themes || []), ...interestThemes])],
        interest_place: interestPlace,
        selected_places: visitConfirmed
            ? mergeSelectedPlaces(facts.selected_places || [], [{ ...interestPlace, selectionSource: "destination" }])
            : facts.selected_places || [],
    };
}

async function handleAttractionRegionInput(input, facts) {
    return await resolveSupportedDestination(input, facts);
}

module.exports = {
    SERVICE_TYPE_PROMPT,
    SERVICE_TYPE_OPTIONS,
    classifyServiceType,
    selectServiceType,
    handleAttractionRegionInput,
    resolveSupportedDestination,
    mentionsDestination,
    routeNumber: ROUTE_NUMBER.TRAVEL_INFO,
};
