const REGIONS = require("../data/regionData");
const { CURRENT_STEP, ROUTE_NUMBER, SERVICE_TYPE } = require("../data/constants");
const { searchLocation } = require("./locationInputService");

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

async function handleAttractionRegionInput(input, facts) {
    const region = REGIONS.find((item) => String(input).includes(item));
    if (region) {
        return { ...facts, region };
    }

    const location = await searchLocation(input);
    if (!location) return null;
    const locationRegion = REGIONS.find((item) => location.address?.includes(item));
    if (!locationRegion) return null;

    return {
        ...facts,
        region: locationRegion,
        interest_place: {
            name: location.name,
            address: location.address,
            mapx: location.longitude,
            mapy: location.latitude,
        },
    };
}

module.exports = {
    SERVICE_TYPE_PROMPT,
    SERVICE_TYPE_OPTIONS,
    classifyServiceType,
    selectServiceType,
    handleAttractionRegionInput,
    routeNumber: ROUTE_NUMBER.TRAVEL_INFO,
};
