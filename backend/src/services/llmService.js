const axios = require("axios");
const env = require("../config/env");
const { parseLLMJson } = require("../utils/jsonUtils");

/**
 * ==========================================================
 * LLM Service
 * ==========================================================
 *
 * TODO (배포 시 변경)
 * 현재:
 * - Local Ollama API 사용
 * - 예: http://localhost:11434/api/chat
 *
 * 추후:
 * - 연구실/운영 서버 LLM API 주소로 변경
 * - Streaming 응답 방식 적용 가능
 * - 인증 토큰이 필요한 경우 headers에 추가
 *
 * 변경 가능성이 높은 부분:
 * - env.OLLAMA_URL
 * - env.OLLAMA_MODEL
 * - axios.post 호출부
 * ==========================================================
 */

/**
 * Ollama Chat API 호출
 *
 * @param {string} systemPrompt - 시스템 프롬프트
 * @param {string} userPrompt - 사용자 프롬프트
 * @returns {Promise<string>} LLM 원본 응답 문자열
 */
async function callLLM(systemPrompt, userPrompt) {
    try {
        const response = await axios.post(`${env.OLLAMA_URL}/api/chat`, {
            model: env.OLLAMA_MODEL,
            stream: false,
            messages: [
                {
                    role: "system",
                    content: systemPrompt,
                },
                {
                    role: "user",
                    content: userPrompt,
                },
            ],
        });

        return response.data?.message?.content || "";
    } catch (error) {
        console.error("LLM call failed:", error.message);
        throw new Error("LLM 호출에 실패했습니다.");
    }
}

/**
 * JSON 응답을 기대하는 LLM 호출
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @returns {Promise<object|null>}
 */
async function callLLMJson(systemPrompt, userPrompt) {
    const output = await callLLM(systemPrompt, userPrompt);
    return parseLLMJson(output);
}

module.exports = {
    callLLM,
    callLLMJson,
};