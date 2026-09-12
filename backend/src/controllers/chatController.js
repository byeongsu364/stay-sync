const { handleChat } = require("../services/chatService");
const { searchAttractionsByName } = require("../repositories/attractionRepository");
const { searchLocations } = require("../services/kakaoLocationService");
const {
    translateUserInput,
    translateChatResult,
    translateDataFields,
} = require("../services/multilingualService");
const { normalizeLanguage, isSupportedLanguage } = require("../services/languageService");
const {
    buildServiceTypePrompt,
    buildServiceTypeOptions,
} = require("../services/serviceTypeService");
const { t } = require("../services/messageService");
const { buildRetryResult } = require("../services/stepQuestionService");

async function greeting(req, res) {
    try {
        // 인사말은 카탈로그에 있으므로 번역을 거치지 않는다.
        const language = normalizeLanguage(req.query.locale) || "ko";
        return res.json({
            success: true,
            data: {
                reply: t("greeting.hello", { prompt: buildServiceTypePrompt(language) }, language),
                quickReplies: buildServiceTypeOptions(language),
                language,
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "인사말을 불러오지 못했습니다." });
    }
}

/**
 * ==========================================================
 * Chat Controller
 * ==========================================================
 *
 * 역할
 * - 프론트엔드 요청 수신
 * - chatService 호출
 * - 응답 반환
 * ==========================================================
 */

async function chat(req, res) {
    const requestId = req.requestId || "unknown";
    try {
        const { sessionId, message, location, locale } = req.body;

        if (!sessionId) {
            return res.status(400).json({
                success: false,
                message: "sessionId가 필요합니다.",
            });
        }

        if (!message || String(message).trim() === "") {
            return res.status(400).json({
                success: false,
                message: "message가 필요합니다.",
            });
        }

        console.log(`[chat-debug:${requestId}] INPUT`, {
            sessionId,
            message: String(message),
            locale,
        });
        // 한국어와 영어는 온톨로지가 직접 알아들으므로 입력을 번역하지 않는다.
        // 번역을 한 번 거치면 'Gapyeong' 같은 고유명사가 틀어질 수 있고 LLM 왕복이 늘어난다.
        const requestedLanguage = normalizeLanguage(locale);
        const needsInputTranslation = Boolean(locale) && !requestedLanguage;

        let userMessage = String(message);
        if (needsInputTranslation) {
            console.log(`[chat-debug:${requestId}] TRANSLATE_INPUT_START`);
            userMessage = (await translateUserInput(message, locale)).message;
            console.log(`[chat-debug:${requestId}] TRANSLATE_INPUT_DONE`);
        }

        console.log(`[chat-debug:${requestId}] HANDLE_CHAT_START`);
        const result = await handleChat({
            sessionId,
            userMessage,
            selectedLocation: location,
            requestId,
            language: requestedLanguage,
        });
        console.log(`[chat-debug:${requestId}] HANDLE_CHAT_DONE step=${result.currentStep}`);

        // 지원하지 않는 언어는 요청한 로케일 그대로 번역해 돌려준다.
        const replyLanguage = needsInputTranslation
            ? locale
            : result.facts?.language || requestedLanguage || "ko";
        console.log(`[chat-debug:${requestId}] REPLY_LANGUAGE ${replyLanguage}`);
        // 한국어와 영어 문구는 카탈로그가 이미 그 언어로 만들었다.
        // 관광지 설명처럼 데이터에서 오는 글만 번역이 필요하다.
        const localizedResult = isSupportedLanguage(replyLanguage)
            ? await translateDataFields(result, replyLanguage)
            : await translateChatResult(result, replyLanguage);

        return res.json({
            success: true,
            data: localizedResult,
        });
    } catch (error) {
        // 오류 화면을 띄우는 대신 다시 물어 대화를 이어간다.
        console.error(`[chat-debug:${requestId}] ERROR`, error.stack || error.message);

        const language = normalizeLanguage(req.body?.locale) || "ko";
        return res.json({
            success: true,
            data: { ...buildRetryResult(null, { language }), language },
        });
    }
}

async function autocompleteAttractions(req, res) {
    try {
        const query = String(req.query.q || "").trim();
        if (query.length < 1) {
            return res.json({ success: true, data: [] });
        }

        const attractions = await searchAttractionsByName({ name: query });
        return res.json({
            success: true,
            data: attractions.map((attraction) => ({
                id: attraction.id,
                name: attraction.title,
                region: attraction.region,
                address: [attraction.address1, attraction.address2].filter(Boolean).join(" "),
                mapx: attraction.mapx,
                mapy: attraction.mapy,
            })),
        });
    } catch (error) {
        console.error("Attraction Autocomplete Error:", error.message);
        return res.status(500).json({ success: false, message: "관광지 검색 중 오류가 발생했습니다." });
    }
}

async function autocompleteLocations(req, res) {
    try {
        const query = String(req.query.q || "").trim();
        if (query.length < 1) return res.json({ success: true, data: [] });
        const region = String(req.query.region || "").trim();
        const accommodationOnly = req.query.type === "accommodation";
        const locations = await searchLocations({
            query: region ? `${region} ${query}` : query,
            categoryGroupCode: accommodationOnly ? "AD5" : null,
        });
        const filteredLocations = accommodationOnly
            ? locations.filter((location) => (
                location.categoryGroupCode === "AD5" &&
                (!region || String(location.address || "").includes(region))
            ))
            : locations;
        return res.json({ success: true, data: filteredLocations.slice(0, 8) });
    } catch (error) {
        console.error("Location Autocomplete Error:", error.message);
        return res.status(500).json({ success: false, message: "장소 검색 중 오류가 발생했습니다." });
    }
}

module.exports = {
    chat,
    greeting,
    autocompleteAttractions,
    autocompleteLocations,
};
