const { handleChat } = require("../services/chatService");
const { searchAttractionsByName } = require("../repositories/attractionRepository");
const { searchLocations } = require("../services/kakaoLocationService");

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
        const { sessionId, message } = req.body;

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

        const result = await handleChat({
            sessionId,
            userMessage: message,
        });

        return res.json({
            success: true,
            data: result,
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
        const locations = await searchLocations({ query });
        return res.json({ success: true, data: locations.slice(0, 8) });
    } catch (error) {
        console.error("Location Autocomplete Error:", error.message);
        return res.status(500).json({ success: false, message: "장소 검색 중 오류가 발생했습니다." });
    }
}

module.exports = {
    chat,
    autocompleteAttractions,
    autocompleteLocations,
};
