const sessionService = require("./sessionService");
const { classifyIntent } = require("./intentService");
const { handleCorrection } = require("./correctionService");
const { extractTravelIntent } = require("./travelIntentService");
const { collectPostBookingFacts } = require("./postBookingService");
const { handleLocationInput } = require("./locationInputService");
const { handleAccommodationStep } = require("./accommodationService");
const {
    buildConfirmationResult,
    isFactsReady,
} = require("./confirmationService");

const { CURRENT_STEP } = require("../data/constants");

/**
 * ==========================================================
 * Chat Service
 * ==========================================================
 *
 * 역할
 * - 사용자 입력 전체 흐름 제어
 * - Intent 분류
 * - Correction 처리
 * - 위치 입력 처리
 * - 여행 기본 정보 수집
 * - 숙소/출발지 분기
 * - 인원/동행자 정보 수집
 * - 최종 추천 전 확인
 * - 세션 저장
 * ==========================================================
 */

async function handleChat({ sessionId, userMessage }) {
    const session = await sessionService.loadSession(sessionId);

    const facts =
        session.facts && Object.keys(session.facts).length > 0
            ? session.facts
            : sessionService.buildFactsFromSession(session);

    const intentResult = await classifyIntent({
        userMessage,
        currentStep: session.currentStep,
        facts,
    });

    /**
     * 1. 수정 처리
     */
    if (intentResult.intent === "correction") {
        const correctionResult = handleCorrection({
            userMessage,
            facts,
        });

        if (correctionResult.handled) {
            await sessionService.saveConversationState({
                sessionId,
                facts: correctionResult.facts,
                currentStep: correctionResult.currentStep,
                routeNumber: correctionResult.routeNumber,
                lastQuestionField: correctionResult.lastQuestionField,
                correctionTarget: correctionResult.correctionTarget,
                rollbackFields: correctionResult.rollbackFields,
            });

            return {
                reply: correctionResult.reply,
                currentStep: correctionResult.currentStep,
                facts: correctionResult.facts,
            };
        }
    }

    /**
     * 2. 숙소/출발지 입력 처리
     */
    const locationResult = await handleLocationInput({
        userMessage,
        facts,
        currentStep: session.currentStep,
    });

    if (locationResult.handled) {
        await sessionService.saveConversationState({
            sessionId,
            facts: locationResult.facts,
            currentStep: locationResult.current_step,
            routeNumber: locationResult.route_number,
            lastQuestionField: locationResult.last_question_field,
        });

        return {
            reply: locationResult.reply,
            currentStep: locationResult.current_step,
            facts: locationResult.facts,
        };
    }

    let result;

    /**
     * 3. 인원/동행자 수집
     */
    if (
        session.currentStep === CURRENT_STEP.ASK_PEOPLE_COUNT ||
        session.currentStep === CURRENT_STEP.ASK_COMPANION_TYPE
    ) {
        result = await collectPostBookingFacts({
            userMessage,
            facts,
        });

        /**
         * 3-1. 모든 facts가 수집되면 최종 확인 단계로 이동
         */
        if (isFactsReady(result.facts)) {
            const confirmationResult = buildConfirmationResult(result.facts);

            await sessionService.saveConversationState({
                sessionId,
                facts: confirmationResult.facts,
                currentStep: confirmationResult.current_step,
                routeNumber: confirmationResult.route_number,
                lastQuestionField: confirmationResult.last_question_field,
            });

            return {
                reply: confirmationResult.reply,
                currentStep: confirmationResult.current_step,
                facts: confirmationResult.facts,
            };
        }
    }

    /**
     * 4. 지역/기간 수집
     */
    else {
        result = await extractTravelIntent({
            userMessage,
            facts,
        });

        /**
         * 4-1. 지역/기간 수집 완료 후
         * 숙박이면 숙소 링크 제공
         * 당일치기면 출발지 질문
         */
        const nextStep = result.current_step || result.currentStep;

        if (nextStep === CURRENT_STEP.READY_FOR_ACCOMMODATION_RECOMMENDATION) {
            const accommodationResult = handleAccommodationStep(result.facts);

            if (accommodationResult.handled) {
                await sessionService.saveConversationState({
                    sessionId,
                    facts: accommodationResult.facts,
                    currentStep: accommodationResult.current_step,
                    routeNumber: accommodationResult.route_number,
                    lastQuestionField: accommodationResult.last_question_field,
                });

                return {
                    reply: accommodationResult.reply,
                    currentStep: accommodationResult.current_step,
                    facts: accommodationResult.facts,
                };
            }
        }
    }

    /**
     * 5. 기본 저장
     */
    await sessionService.saveConversationState({
        sessionId,
        facts: result.facts,
        currentStep: result.current_step || result.currentStep,
        routeNumber: result.route_number || result.routeNumber,
        lastQuestionField: result.last_question_field || result.lastQuestionField,
    });

    return {
        reply: result.reply,
        currentStep: result.current_step || result.currentStep,
        facts: result.facts,
    };
}

module.exports = {
    handleChat,
};