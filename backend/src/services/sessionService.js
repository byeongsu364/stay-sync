const sessionRepository = require("../repositories/sessionRepository");

const {
    callLLMJson
} = require("./llmService");

const {
    detectTripType
} = require("./tripTypeService");

const travelPrompt =
    require("../prompts/travelIntentPrompt");

/**
 * ==========================================================
 * Session Service
 * ==========================================================
 *
 * 역할
 * ----------------------------------------------------------
 * 여행 세션 관리
 *
 * - 세션 생성
 * - facts 관리
 * - step 관리
 * - LLM 호출
 * - DB 저장
 *
 * TODO (배포 시 변경)
 * ----------------------------------------------------------
 * 현재
 * Local LLM
 *
 * 추후
 * 연구실 LLM 서버 API 호출
 * ==========================================================
 */

/**
 * 세션 조회
 */
async function loadSession(sessionId) {

    return await sessionRepository.getOrCreateSession(sessionId);

}

/**
 * 사용자 입력 처리
 */
async function processUserInput(
    sessionId,
    userMessage
) {

    //----------------------------------
    // Session
    //----------------------------------

    const session =
        await sessionRepository.getOrCreateSession(sessionId);

    //----------------------------------
    // 현재 facts
    //----------------------------------

    const facts =
        session.facts || {};

    //----------------------------------
    // 여행 유형 판별
    //----------------------------------

    facts.trip_type =
        detectTripType(
            facts.start_date,
            facts.end_date
        );

    //----------------------------------
    // Prompt 생성
    //----------------------------------

    const userPrompt = `
현재 Facts

${JSON.stringify(facts, null, 2)}

사용자 입력

${userMessage}
`;

    //----------------------------------
    // LLM
    //----------------------------------

    const result =
        await callLLMJson(
            travelPrompt,
            userPrompt
        );

    //----------------------------------
    // Merge
    //----------------------------------

    const mergedFacts = {

        ...facts,

        ...(result.facts || {})

    };

    //----------------------------------
    // trip_type 재계산
    //----------------------------------

    mergedFacts.trip_type =
        detectTripType(
            mergedFacts.start_date,
            mergedFacts.end_date
        );

    //----------------------------------
    // 저장
    //----------------------------------

    await sessionRepository.saveSession(
        sessionId,
        {

            facts: mergedFacts,

            currentStep:
                result.current_step ||
                session.currentStep,

            lastQuestionField:
                result.last_question_field ||
                session.lastQuestionField,

            routeNumber:
                result.route_number ??
                session.routeNumber

        }
    );

    //----------------------------------
    // 반환
    //----------------------------------

    return {

        facts: mergedFacts,

        currentStep:
            result.current_step,

        reply:
            result.reply,

        routeNumber:
            result.route_number

    };

}

module.exports = {

    loadSession,

    processUserInput

};