const axios = require("axios");
const env = require("../config/env");
const { parseLLMJson } = require("../utils/jsonUtils");

/**
 * ==========================================================
 * LLM Service
 * ==========================================================
 *
 * TODO (배포 시 변경)
 * ----------------------------------------------------------
 * 현재
 * - Local Ollama 또는 연구실 Ollama Server 사용
 * - Host, Port만 변경하여 동일한 코드 사용
 *
 * 추후
 * - 연구실 LLM 서버 확장
 * - Streaming 응답 지원
 * - 인증(Token) 추가
 * - Load Balancer 적용 가능
 *
 * 변경 가능성이 높은 부분
 * - env.llm.host
 * - env.llm.port
 * - env.llm.model
 * ==========================================================
 */

const OLLAMA_URL = `http://${env.llm.host}:${env.llm.port}/api/chat`;

/**
 * Ollama Chat API 호출
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @returns {Promise<string>}
 */
async function callLLM(systemPrompt, userPrompt) {
    try {
        const response = await axios.post(OLLAMA_URL, {
            model: env.llm.model,
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
        console.error("LLM Call Failed");

        if (error.response) {
            console.error(error.response.data);
        } else {
            console.error(error.message);
        }

        throw new Error("LLM 호출에 실패했습니다.");
    }
}

/**
 * JSON 응답을 기대하는 호출
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