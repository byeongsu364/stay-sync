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

module.exports = {
    normalizeLanguage,
    translateUserInput,
    translateChatResult,
};
