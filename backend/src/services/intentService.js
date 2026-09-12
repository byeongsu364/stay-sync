const intentPrompt = require("../prompts/intentPrompt");
const { callLLMJson } = require("./llmService");
const { mentionsCorrection } = require("./correctionService");

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
    const structuredInputSteps = new Set([
        "ASK_REGION",
        "ASK_ATTRACTION_REGION",
        "ASK_PERIOD",
        "ASK_START_LOCATION",
        "ASK_ACCOMMODATION",
        "ASK_COMPANION_TYPE",
    ]);

    // 정해진 정보를 수집하는 단계에서는 LLM 장애와 지연의 영향을 받지 않는다.
    // '아니다'처럼 앞선 답을 무르는 표현은 정정으로 확정하고, 나머지는 일반 입력으로 둔다.
    if (structuredInputSteps.has(currentStep)) {
        return {
            intent: mentionsCorrection(userMessage) ? "correction" : "normal",
        };
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
