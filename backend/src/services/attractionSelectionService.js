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
            selectedById.set(place.id, place);
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
        newSelections: selections,
        reply:
            `${selectedNames}을(를) 선택했습니다.\n\n`
            + "관광지를 더 추천받으시겠어요? (네/아니요)",
    };
}

function classifyMoreRecommendationAnswer(userMessage) {
    const message = normalizeText(userMessage);

    const negativeKeywords = [
        "아니", "아니요", "괜찮", "됐어", "끝", "완료", "그만",
    ];
    const positiveKeywords = [
        "네", "예", "응", "좋아", "추가", "더추천", "더", "받을게",
    ];

    if (negativeKeywords.some((keyword) => message.includes(keyword))) {
        return "no";
    }

    if (positiveKeywords.some((keyword) => message.includes(keyword))) {
        return "yes";
    }

    return "unknown";
}

module.exports = {
    mergeSelectedPlaces,
    selectAttractions,
    classifyMoreRecommendationAnswer,
};
