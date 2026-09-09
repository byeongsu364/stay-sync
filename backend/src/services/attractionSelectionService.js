function normalizeText(value) {
    return String(value || "")
        .normalize("NFC")
        .toLowerCase()
        .replace(/\s/g, "");
}

function mergeSelectedPlaces(previousSelections = [], newSelections = []) {
    const selectedById = new Map();

    for (const place of [...previousSelections, ...newSelections]) {
        if (place?.id !== undefined && place?.id !== null) {
            const id = String(place.id);
            selectedById.set(id, { ...selectedById.get(id), ...place });
        }
    }

    return [...selectedById.values()];
}

function selectAttractions({ userMessage, recommendations = [], selectedPlaces = [] }) {
    const message = normalizeText(userMessage);
    const selectedIndexes = new Set(
        [...String(userMessage || "").matchAll(/(\d+)\s*번?/g)]
            .map((match) => Number.parseInt(match[1], 10) - 1)
            .filter((index) => index >= 0 && index < recommendations.length),
    );

    const selections = recommendations.filter((recommendation, index) => {
        if (selectedIndexes.has(index)) return true;

        const normalizedName = normalizeText(recommendation.name);
        return normalizedName && message.includes(normalizedName);
    });

    if (selections.length === 0) {
        return {
            handled: false,
            selectedPlaces,
            newSelections: [],
            reply:
                "선택할 관광지를 찾지 못했습니다. "
                + "추천 목록의 번호나 관광지명을 입력해주세요.\n"
                + "예: 1번, 3번 또는 아침고요수목원",
        };
    }

    const mergedSelections = mergeSelectedPlaces(selectedPlaces, selections);
    const selectedNames = selections.map(({ name }) => name).join(", ");

    return {
        handled: true,
        selectedPlaces: mergedSelections,
        newSelections: selections.filter(({ id }) => !selectedPlaces.some((place) => String(place.id) === String(id))),
        reply:
            `${selectedNames}을(를) 선택했습니다.\n\n`
            + "관광지를 더 추천받으시겠어요?",
    };
}

function classifyMoreRecommendationFallback(userMessage) {
    const message = normalizeText(userMessage);

    const undoKeywords = [
        "잘못", "실수", "선택취소", "되돌", "이전으로", "다시선택",
    ];

    const negativeKeywords = [
        "아니", "아니요", "ㄴㄴ", "노노", "싫어", "필요없", "괜찮", "됐어", "끝", "완료", "그만",
    ];
    const exactPositiveAnswers = ["네", "예", "응", "어", "ㅇㅇ", "그래", "좋아"];
    const positiveKeywords = ["계속", "추가", "더추천", "더보여", "받을게"];

    if (undoKeywords.some((keyword) => message.includes(keyword))) {
        return "undo";
    }

    if (negativeKeywords.some((keyword) => message.includes(keyword))) {
        return "no";
    }

    if (
        exactPositiveAnswers.includes(message) ||
        positiveKeywords.some((keyword) => message.includes(keyword))
    ) {
        return "yes";
    }

    return "unknown";
}

async function classifyMoreRecommendationAnswer(userMessage) {
    // 명확한 짧은 답변은 LLM 호출 없이 즉시 처리한다. 로컬 LLM이 느리거나
    // 일시적으로 내려가 있어도 "아니", "ㄴㄴ", "그만" 같은 입력은 막히지 않는다.
    const fallbackAnswer = classifyMoreRecommendationFallback(userMessage);
    if (fallbackAnswer !== "unknown") {
        return fallbackAnswer;
    }

    try {
        const result = await callLLMJson(
            moreRecommendationPrompt,
            `사용자 입력:\n${String(userMessage || "")}`,
        );
        if (["yes", "no", "undo", "unknown"].includes(result?.answer)) {
            return result.answer;
        }
    } catch (error) {
        console.warn("추가 추천 의도 LLM 분류 실패, 기본 분류를 사용합니다.");
    }

    return fallbackAnswer;
}

module.exports = {
    mergeSelectedPlaces,
    selectAttractions,
    classifyMoreRecommendationAnswer,
};
const moreRecommendationPrompt = require("../prompts/moreRecommendationPrompt");
const { callLLMJson } = require("./llmService");
