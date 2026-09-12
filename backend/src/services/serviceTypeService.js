const REGIONS = require("../data/regionData");
const REGION_ALIASES = require("../data/regionAliases");
const { CURRENT_STEP, ROUTE_NUMBER, SERVICE_TYPE } = require("../data/constants");
const { searchAttractionsByName } = require("../repositories/attractionRepository");
const { mergeSelectedPlaces } = require("./attractionSelectionService");
const { normalizeName, buildTitleAliases } = require("../utils/attractionNameUtils");
const { detectInterestThemes } = require("./ontologyService");
const { t } = require("./messageService");

function buildServiceTypePrompt(language = "ko") {
    return t("serviceType.prompt", {}, language);
}

function buildServiceTypeOptions(language = "ko") {
    return [
        { label: t("serviceType.option.booked", {}, language), value: "2" },
        { label: t("serviceType.option.routeOnly", {}, language), value: "3" },
    ];
}

function classifyServiceType(input) {
    const original = String(input || "");
    const text = original.replace(/\s/g, "");
    if (/^(1|1번)$/.test(text) || text.includes("처음부터") || text.includes("숙소추천")
        || /\b(?:recommend|find|need)\s+(?:a\s+)?(?:place\s+to\s+stay|hotel|accommodation)\b/i.test(original)) {
        return SERVICE_TYPE.ACCOMMODATION;
    }
    if (/^(2|2번)$/.test(text) || text.includes("숙소는이미") || text.includes("이미예약") || text.includes("숙소예약") || text.includes("관광지추천")
        || /\balready\s+booked\b|\bbooked\s+(?:my|the)\s+(?:hotel|stay|accommodation)\b|\brecommend\s+attractions?\b/i.test(original)) {
        return SERVICE_TYPE.ATTRACTION;
    }
    if (/^(3|3번)$/.test(text) || text.includes("동선만") || text.includes("동선추천")
        || /\b(?:just|only)\s+(?:the\s+)?(?:route|itinerary)\b|\broute\s+only\b/i.test(original)) {
        return SERVICE_TYPE.ROUTE_ONLY;
    }
    return null;
}

function selectServiceType(input, facts) {
    const language = facts?.language || "ko";
    const serviceType = classifyServiceType(input);
    if (!serviceType) {
        return {
            handled: false,
            reply: t("serviceType.invalid", { prompt: buildServiceTypePrompt(language) }, language),
        };
    }

    const nextFacts = { ...facts, service_type: serviceType };
    if (serviceType === SERVICE_TYPE.ACCOMMODATION) {
        return {
            handled: true, facts: nextFacts,
            currentStep: CURRENT_STEP.ASK_REGION,
            lastQuestionField: "region",
            reply: t("region.askForAccommodation", {}, language),
        };
    }
    if (serviceType === SERVICE_TYPE.ATTRACTION) {
        return {
            handled: true, facts: nextFacts,
            currentStep: CURRENT_STEP.ASK_ATTRACTION_REGION,
            lastQuestionField: "region",
            reply: t("region.askForAttraction", {}, language),
        };
    }
    return {
        handled: true, facts: nextFacts,
        currentStep: CURRENT_STEP.ASK_ROUTE_DAYS,
        lastQuestionField: "travel_days",
        reply: t("routeOnly.askDays", {}, language),
    };
}

function mentionsAlias(text, alias) {
    // 이름 안의 띄어쓰기는 유연하게 허용하되 '고양이'를 '고양'으로 읽지 않는다.
    const title = [...alias].join("\\s*");
    if (!title) return false;
    return new RegExp(
        `(?:^|[^가-힣a-z0-9])${title}(?:시|군)?(?=$|[^가-힣a-z0-9]|으로|로|에서|에|을|를|은|는|이랑|랑|하고|와|과)`,
        "i",
    ).test(String(text).normalize("NFC"));
}

// 관광지는 '구리 동구릉 [유네스코 세계유산]'처럼 지역명·괄호 설명이 붙은 제목이고,
// 지역은 'Gapyeong'처럼 영문으로 말할 수 있어 별칭 중 하나만 언급돼도 인정한다.
function mentionsDestination(text, name, region, titleEn = null) {
    const aliases = region
        ? buildTitleAliases(name, region, titleEn)
        : [normalizeName(name), ...(REGION_ALIASES[name] || [])];
    return aliases.some((alias) => mentionsAlias(text, alias));
}

function destinationClarification(attractions, regions, language = "ko") {
    return {
        needsDestinationChoice: true,
        reply: t("destination.chooseOne", {}, language),
        quickReplies: [
            ...attractions.map(({ title, region }) => ({ label: `${title} (${region})`, value: `${region} ${title}` })),
            ...regions.map((region) => ({ label: region, value: region })),
        ].slice(0, 8),
    };
}

// 장소 이름과 지역명을 걷어내고 남는 말이 없으면 목적지만 나열한 입력으로 본다.
// '가평 자라섬 아침고요수목원'처럼 여러 곳을 한 번에 말한 경우를 방문 확정으로 읽기 위함이다.
function mentionsOnlyDestinations(normalizedInput, places, regions) {
    const aliases = [
        ...places.flatMap(({ title, region, titleEn }) => buildTitleAliases(title, region, titleEn)),
        ...regions.map(normalizeName),
    ].sort((a, b) => b.length - a.length);

    return aliases.reduce((rest, alias) => rest.split(alias).join(""), normalizedInput) === "";
}

// 관심 테마는 동행자 유형과 함께 추천 테마를 결정하는 근거가 된다.
function withInterestThemes(facts, themes) {
    const interestThemes = [...new Set([
        ...(facts.interest_themes || []),
        ...themes,
    ].filter(Boolean))];

    return {
        ...facts,
        interest_themes: interestThemes,
        themes: [...new Set([...(facts.themes || []), ...interestThemes])],
    };
}

async function resolveSupportedDestination(input, facts = {}) {
    const text = String(input || "").trim().slice(0, 1000);
    const normalizedInput = normalizeName(text);
    const attractions = await searchAttractionsByName({ name: text, mentionedInText: true });
    const exactMatches = attractions.filter(({ title, region, titleEn }) => (
        buildTitleAliases(title, region, titleEn).includes(normalizedInput)
    ));
    const mentioned = attractions.filter(({ title, region, titleEn }) => (
        mentionsDestination(text, title, region, titleEn)
    ));
    let candidates = exactMatches.length ? exactMatches : mentioned.filter((place) => (
        !mentioned.some((other) => other.id !== place.id
            && normalizeName(other.title) !== normalizeName(place.title)
            && normalizeName(other.title).includes(normalizeName(place.title)))
    ));
    const regions = REGIONS.filter((region) => mentionsDestination(text, region));
    if (regions.length === 1 && candidates.some((place) => place.region === regions[0])) {
        candidates = candidates.filter((place) => place.region === regions[0]);
    }
    const candidateRegions = [...new Set(candidates.map(({ region }) => region))];
    const hasNegativeIntent = /말고|아니|안\s*가|않|싫|제외|취소/.test(text);

    // 한 지역 안의 관광지는 여러 곳을 한 번에 말해도 모두 받아들인다.
    // 지역이 갈리거나 제외 표현이 섞이면 어디를 가려는지 알 수 없으므로 되묻는다.
    if (hasNegativeIntent || regions.length > 1 || candidateRegions.length > 1) {
        return destinationClarification(candidates, regions);
    }

    // '빠지', '글램핑'처럼 관광지명이 아니라 하고 싶은 활동을 말하는 경우가 있다.
    // 저장할 관광지는 없지만 관심 테마는 추천의 근거가 되므로 함께 담는다.
    const activityThemes = detectInterestThemes(text);

    if (candidates.length === 0) {
        if (regions.length !== 1) return null;
        return withInterestThemes({ ...facts, region: regions[0] }, activityThemes);
    }

    const region = candidateRegions[0];
    if (!REGIONS.includes(region)) return null;
    if (regions.length && regions[0] !== region) {
        return destinationClarification(candidates, regions, facts.language);
    }

    const compact = text.replace(/\s/g, "");
    const referenceOnly = /비슷|같은|처럼|근처|주변|궁금|어때|정보/.test(compact);
    const visitConfirmed = !referenceOnly && (
        mentionsOnlyDestinations(normalizedInput, candidates, regions)
        || /가려고|가려해|가고싶|갈거|갈예정|갈래|갈게|가요|갑니다|하고싶|하려고|하러|할래|방문할|방문하려|방문예정|들를/.test(compact)
    );

    const interestPlaces = candidates.map((attraction) => ({
        id: attraction.id,
        name: attraction.title,
        nameEn: attraction.titleEn || null,
        region: attraction.region,
        address: [attraction.address1, attraction.address2].filter(Boolean).join(" "),
        mapx: attraction.mapx,
        mapy: attraction.mapy,
        theme: attraction.theme,
        category: attraction.category,
        visitConfirmed,
    }));

    return {
        ...withInterestThemes(facts, [
            ...activityThemes,
            ...interestPlaces.map(({ theme }) => theme),
        ]),
        region,
        interest_places: interestPlaces,
        selected_places: visitConfirmed
            ? mergeSelectedPlaces(
                facts.selected_places || [],
                interestPlaces.map((place) => ({ ...place, selectionSource: "destination" })),
            )
            : facts.selected_places || [],
    };
}

async function handleAttractionRegionInput(input, facts) {
    return await resolveSupportedDestination(input, facts);
}

module.exports = {
    buildServiceTypePrompt,
    buildServiceTypeOptions,
    classifyServiceType,
    selectServiceType,
    handleAttractionRegionInput,
    resolveSupportedDestination,
    mentionsDestination,
    routeNumber: ROUTE_NUMBER.TRAVEL_INFO,
};
