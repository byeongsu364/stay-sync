const { callLLMJson } = require("./llmService");
const {
    inputTranslationPrompt,
    outputTranslationPrompt,
} = require("../prompts/multilingualPrompt");

function normalizeLanguage(locale) {
    const raw = String(locale || "ko").trim().toLowerCase();
    return raw.split(/[-_]/)[0] || "ko";
}

async function translateUserInput(message, locale) {
    const language = normalizeLanguage(locale);
    const original = String(message || "");
    if (language === "ko" || !original.trim()) {
        return { message: original, language };
    }

    try {
        const result = await callLLMJson(
            inputTranslationPrompt,
            `입력 언어: ${language}\n사용자 입력: ${original}`,
        );
        return {
            message: String(result?.translatedText || original),
            language,
        };
    } catch (error) {
        console.warn("다국어 입력 번역 실패, 원문으로 처리합니다.");
        return { message: original, language };
    }
}

async function translateChatResult(result, locale) {
    const language = normalizeLanguage(locale);
    if (language === "ko" || !result) return { ...result, language };

    const translatable = {
        reply: result.reply || "",
        quickReplies: result.quickReplies || null,
        recommendations: result.recommendations?.map((item) => ({
            id: item.id,
            name: item.name,
            address: item.address,
            description: item.description,
            theme: item.theme,
        })) || null,
    };

    try {
        const translated = await callLLMJson(
            outputTranslationPrompt,
            `번역 대상 언어: ${language}\nJSON:\n${JSON.stringify(translatable)}`,
        );
        const translatedRecommendations = new Map(
            (translated?.recommendations || []).map((item) => [String(item.id), item]),
        );

        return {
            ...result,
            reply: translated?.reply || result.reply,
            quickReplies: Array.isArray(translated?.quickReplies)
                ? result.quickReplies?.map((item, index) => ({
                    ...item,
                    label: translated.quickReplies[index]?.label || item.label,
                }))
                : result.quickReplies,
            recommendations: result.recommendations?.map((item) => {
                const translatedItem = translatedRecommendations.get(String(item.id));
                return {
                    ...item,
                    description: translatedItem?.description || item.description,
                    theme: translatedItem?.theme || item.theme,
                };
            }),
            language,
        };
    } catch (error) {
        console.warn("다국어 응답 번역 실패, 한국어 응답을 사용합니다.");
        return { ...result, language };
    }
}

/**
 * 데이터에서 온 글만 번역한다.
 *
 * 대화 문구는 messages 카탈로그가 이미 해당 언어로 만들었다.
 * 남는 것은 관광지 설명처럼 한국어 원본밖에 없는 값이다.
 * 번역이 실패해도 원문을 그대로 두고 대화는 이어간다.
 */
async function translateDataFields(result, locale) {
    const language = normalizeLanguage(locale);
    const descriptions = (result?.recommendations || [])
        .filter(({ description }) => description);

    if (language === "ko" || descriptions.length === 0) {
        return { ...result, language };
    }

    try {
        const translated = await callLLMJson(
            outputTranslationPrompt,
            `번역 대상 언어: ${language}\nJSON:\n${JSON.stringify({
                recommendations: descriptions.map(({ id, description }) => ({ id, description })),
            })}`,
        );
        const byId = new Map(
            (translated?.recommendations || []).map((item) => [String(item.id), item]),
        );

        return {
            ...result,
            recommendations: result.recommendations.map((item) => ({
                ...item,
                description: byId.get(String(item.id))?.description || item.description,
            })),
            language,
        };
    } catch (error) {
        console.warn("관광지 설명 번역 실패, 원문을 사용합니다.");
        return { ...result, language };
    }
}

module.exports = {
    normalizeLanguage,
    translateUserInput,
    translateChatResult,
    translateDataFields,
};
