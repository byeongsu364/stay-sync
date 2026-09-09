const intentPrompt = require("../prompts/intentPrompt");
const { callLLMJson } = require("./llmService");

/**
 * ==========================================================
 * Intent Service
 * ==========================================================
 *
 * 역할:
 * - 사용자 입력을 LLM으로 분류한다.
 *
 * LLM 담당:
 * - normal
 * - confirm
 * - correction
 * - recommend
 * - route
 * - finish
 *
 * Ontology 담당:
 * - correction target 판단
 * ==========================================================
 */

const ALLOWED_INTENTS = [
    "normal",
    "confirm",
    "correction",
    "recommend",
    "route",
    "finish",
];

async function classifyIntent({ userMessage, currentStep, facts }) {
    const normalized = String(userMessage || "").replace(/\s/g, "");
    const correctionKeywords = ["잘못", "수정", "변경", "취소", "이전", "아니고"];
    const structuredInputSteps = new Set([
        "ASK_REGION",
        "ASK_ATTRACTION_REGION",
        "ASK_PERIOD",
        "ASK_START_LOCATION",
        "ASK_ACCOMMODATION",
        "ASK_COMPANION_TYPE",
    ]);

    // 정해진 정보를 수집하는 단계의 일반 입력은 LLM 장애와 지연의 영향을 받지 않는다.
    if (
        structuredInputSteps.has(currentStep)
        && !correctionKeywords.some((keyword) => normalized.includes(keyword))
    ) {
        return { intent: "normal" };
    }

    const userPrompt = `
현재 단계:
${currentStep || ""}

현재 facts:
${JSON.stringify(facts || {}, null, 2)}

사용자 입력:
${userMessage}
`;

    let result;
    try {
        result = await callLLMJson(intentPrompt, userPrompt);
    } catch (error) {
        console.warn(`[Intent] LLM 분류 실패, normal로 처리합니다: ${error.message}`);
        return { intent: "normal" };
    }

    const intent = result?.intent;

    if (!ALLOWED_INTENTS.includes(intent)) {
        return {
            intent: "normal",
        };
    }

    return {
        intent,
    };
}

module.exports = {
    classifyIntent,
};
