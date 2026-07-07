const { handleChat } = require("../services/chatService");

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

module.exports = {
    chat,
};