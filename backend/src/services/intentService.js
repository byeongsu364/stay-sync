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
    const userPrompt = `
현재 단계:
${currentStep || ""}

현재 facts:
${JSON.stringify(facts || {}, null, 2)}

사용자 입력:
${userMessage}
`;

    const result = await callLLMJson(intentPrompt, userPrompt);

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