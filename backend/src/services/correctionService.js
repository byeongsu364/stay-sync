const correctionPrompt = require("../prompts/correctionPrompt");
const { callLLMJson } = require("./llmService");

const correctionWords =
    /(아니|아니요|그게 아니라|잘못|틀렸|수정|다시|바꿀게|변경|정정)/;

function detectCorrectionTarget(text, lastQuestionField = null) {
    if (!correctionWords.test(text)) {
        return null;
    }

    if (/(지역|장소|목적지|가평|남양주|파주|고양|서울|부산|제주|강릉)/.test(text)) {
        return "region";
    }

    if (/(기간|일정|날짜|출발|돌아|복귀|도착|내일|모레|당일|1박|2박|며칠)/.test(text)) {
        return "period";
    }

    if (/(숙소|호텔|펜션|리조트|예약)/.test(text)) {
        return "accommodation";
    }

    if (/(출발지|출발|어디서)/.test(text)) {
        return "start_location";
    }

    if (/(인원|몇 명|몇명|명|사람|둘|셋|넷|혼자)/.test(text)) {
        return "people_count";
    }

    if (/(동행|누구|친구|연인|여자친구|남자친구|부모님|아이|가족|혼자|단체)/.test(text)) {
        return "companion_type";
    }

    return lastQuestionField;
}

function rollbackFacts(facts = {}, target) {
    const newFacts = { ...facts };

    if (target === "region") {
        newFacts.region = null;
    }

    if (target === "period") {
        newFacts.period = null;
        newFacts.start_date = null;
        newFacts.end_date = null;
        newFacts.trip_type = null;
    }

    if (target === "accommodation") {
        newFacts.accommodation = {
            name: null,
            mapx: null,
            mapy: null,
        };

        // 숙박 여행에서 숙소를 출발지로 쓰고 있었다면 같이 초기화
        if (newFacts.trip_type === "숙박") {
            newFacts.start_location = {
                name: null,
                mapx: null,
                mapy: null,
            };
        }
    }

    if (target === "start_location") {
        newFacts.start_location = {
            name: null,
            mapx: null,
            mapy: null,
        };
    }

    if (target === "people_count") {
        newFacts.people_count = null;
    }

    if (target === "companion_type") {
        newFacts.companion_type = null;
        newFacts.themes = [];
    }

    return newFacts;
}

function getCorrectionStep(target) {
    const stepMap = {
        region: "ASK_REGION",
        period: "ASK_PERIOD",
        accommodation: "ASK_ACCOMMODATION",
        start_location: "ASK_START_LOCATION",
        people_count: "ASK_PEOPLE_COUNT",
        companion_type: "ASK_COMPANION_TYPE",
    };

    return stepMap[target] || "ASK_REGION";
}

async function handleCorrection({ userMessage, facts, lastQuestionField }) {
    const text = String(userMessage || "").trim();

    const target = detectCorrectionTarget(text, lastQuestionField);

    if (!target) {
        return {
            isCorrection: false,
            facts,
        };
    }

    const rolledBackFacts = rollbackFacts(facts, target);
    const currentStep = getCorrectionStep(target);

    const userPrompt = `
현재 facts:
${JSON.stringify(rolledBackFacts, null, 2)}

사용자 입력:
${text}

수정 대상:
${target}

현재 단계:
${currentStep}
`;

    const llmResult = await callLLMJson(correctionPrompt, userPrompt);

    return {
        isCorrection: true,
        facts: rolledBackFacts,
        correction_target: target,
        current_step: llmResult?.current_step || currentStep,
        last_question_field: target,
        reply: llmResult?.reply || "알겠습니다. 해당 정보를 다시 입력해주세요.",
    };
}

module.exports = {
    handleCorrection,
    detectCorrectionTarget,
    rollbackFacts,
};