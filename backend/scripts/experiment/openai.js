/**
 * 채점(LLM 평가자)과 RAG 임베딩에 쓰는 OpenAI 직접 호출.
 * 추천 생성은 시스템과 같은 조건이 되도록 src/services/llmService.js를 쓴다.
 */
const axios = require("axios");

const KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const EFFORT = process.env.OPENAI_REASONING_EFFORT || "none";

/** 추천 생성용 호출. 저장소 버전과 상관없이 같은 OpenAI 모델을 쓰도록 키트 안에서 직접 호출한다. */
async function chatText(systemPrompt, userPrompt, timeout = 90000) {
    const isReasoning = /^(gpt-5|o\d)/.test(MODEL);
    const response = await axios.post("https://api.openai.com/v1/chat/completions", {
        model: MODEL,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
        ],
        ...(isReasoning ? { reasoning_effort: EFFORT } : {}),
    }, { headers: { Authorization: `Bearer ${KEY}` }, timeout });
    return response.data?.choices?.[0]?.message?.content || "";
}

async function chatJson(model, systemPrompt, userPrompt) {
    const isReasoning = /^(gpt-5|o\d)/.test(model);
    const response = await axios.post("https://api.openai.com/v1/chat/completions", {
        model,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        ...(isReasoning ? { reasoning_effort: EFFORT } : { temperature: 0 }),
    }, { headers: { Authorization: `Bearer ${KEY}` }, timeout: 90000 });
    return JSON.parse(response.data.choices[0].message.content || "{}");
}

async function embed(texts, model = process.env.EMBEDDING_MODEL || "text-embedding-3-small") {
    const out = [];
    for (let i = 0; i < texts.length; i += 100) {
        const response = await axios.post("https://api.openai.com/v1/embeddings", {
            model,
            input: texts.slice(i, i + 100),
        }, { headers: { Authorization: `Bearer ${KEY}` }, timeout: 90000 });
        out.push(...response.data.data.map((d) => d.embedding));
    }
    return out;
}

function cosine(a, b) {
    let dot = 0; let na = 0; let nb = 0;
    for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

module.exports = { chatText, chatJson, embed, cosine, MODEL };
