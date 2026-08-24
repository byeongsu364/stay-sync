const { handleChat } = require("../services/chatService");
const { searchAttractionsByName } = require("../repositories/attractionRepository");
const { searchLocations } = require("../services/kakaoLocationService");
const {
    translateUserInput,
    translateChatResult,
} = require("../services/multilingualService");
const {
    SERVICE_TYPE_PROMPT,
    SERVICE_TYPE_OPTIONS,
} = require("../services/serviceTypeService");

async function greeting(req, res) {
    try {
        const result = await translateChatResult({
            reply: `안녕하세요!\n\n${SERVICE_TYPE_PROMPT}`,
            quickReplies: SERVICE_TYPE_OPTIONS,
        }, req.query.locale);
        return res.json({ success: true, data: result });
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

        const translatedInput = await translateUserInput(message, locale);
        const result = await handleChat({
            sessionId,
            userMessage: translatedInput.message,
            selectedLocation: location,
        });
        const localizedResult = await translateChatResult(result, translatedInput.language);

        return res.json({
            success: true,
            data: localizedResult,
        });
    } catch (error) {
        console.error("Chat Controller Error:", error.message);

        return res.status(500).json({
            success: false,
            message: "채팅 처리 중 오류가 발생했습니다.",
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
