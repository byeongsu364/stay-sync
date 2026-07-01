/**
 * LLM 응답 문자열에서 JSON만 안전하게 추출한다.
 */

function parseLLMJson(output) {
    if (!output) return null;

    if (typeof output === "object") {
        return output;
    }

    let text = String(output)
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

    try {
        return JSON.parse(text);
    } catch (error) {
        console.error("JSON parsing failed:", error.message);
        return null;
    }
}

module.exports = {
    parseLLMJson,
};