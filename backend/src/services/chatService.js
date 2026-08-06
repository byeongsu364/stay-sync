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
 * - Greeting 처리
 * - Intent 분류
 * - Correction 처리
 * - 위치 입력 처리
 * - 여행 기본 정보 수집
 * - 숙소/출발지 분기
 * - 인원/동행자 수집
 * - 최종 확인
 * - 세션 저장
 * ==========================================================
 */

async function handleChat({ sessionId, userMessage }) {

    const session =
        await sessionService.loadSession(sessionId);

    /**
     * 항상 DB 컬럼 기준으로 facts 생성
     */
    const facts =
        sessionService.buildFactsFromSession(session);

    const message =
        String(userMessage).trim();

    /**
     * ======================================================
     * Greeting
     * ======================================================
     */

    const greetings = [
        "안녕",
        "안녕하세요",
        "하이",
        "ㅎㅇ",
        "hello",
        "hi",
    ];

    if (greetings.includes(message.toLowerCase())) {

        if (session.currentStep !== CURRENT_STEP.ASK_REGION) {
            return {
                reply: "안녕하세요! 계속 진행해볼까요?",
                currentStep: session.currentStep,
                facts,
            };
        }

        return {
            reply: "안녕하세요! 어디로 여행을 가시나요?",
            currentStep: CURRENT_STEP.ASK_REGION,
            facts,
        };
    }

    /**
     * ======================================================
     * Intent Classification
     * ======================================================
     */

    const intentResult = await classifyIntent({
        userMessage: message,
        currentStep: session.currentStep,
        facts,
    });

    /**
     * ======================================================
     * Correction
     * ======================================================
     */

    if (intentResult.intent === "correction") {

        const correctionResult =
            handleCorrection({
                userMessage: message,
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
     * ======================================================
     * Location Input
     * ======================================================
     */

    const locationResult =
        await handleLocationInput({
            userMessage: message,
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
     * ======================================================
     * Post Booking
     * ======================================================
     */

    if (
        session.currentStep === CURRENT_STEP.ASK_PEOPLE_COUNT ||
        session.currentStep === CURRENT_STEP.ASK_COMPANION_TYPE
    ) {

        result =
            await collectPostBookingFacts({
                userMessage: message,
                facts,
            });

        /**
         * 모든 정보 수집 완료
         */

        if (isFactsReady(result.facts)) {

            const confirmationResult =
                buildConfirmationResult(result.facts);

            await sessionService.saveConversationState({

                sessionId,

                facts: confirmationResult.facts,

                currentStep:
                    confirmationResult.current_step,

                routeNumber:
                    confirmationResult.route_number,

                lastQuestionField:
                    confirmationResult.last_question_field,
            });

            return {

                reply:
                    confirmationResult.reply,

                currentStep:
                    confirmationResult.current_step,

                facts:
                    confirmationResult.facts,
            };
        }

    }

    /**
     * ======================================================
     * Travel Intent
     * ======================================================
     */

    else {

        result =
            await extractTravelIntent({
                userMessage: message,
                facts,
            });

        const nextStep =
            result.current_step || result.currentStep;

        /**
         * 숙소 추천 단계
         */

        if (
            nextStep ===
            CURRENT_STEP.READY_FOR_ACCOMMODATION_RECOMMENDATION
        ) {

            const accommodationResult =
                handleAccommodationStep(result.facts);

            if (accommodationResult.handled) {

                await sessionService.saveConversationState({

                    sessionId,

                    facts:
                        accommodationResult.facts,

                    currentStep:
                        accommodationResult.current_step,

                    routeNumber:
                        accommodationResult.route_number,

                    lastQuestionField:
                        accommodationResult.last_question_field,
                });

                return {

                    reply:
                        accommodationResult.reply,

                    currentStep:
                        accommodationResult.current_step,

                    facts:
                        accommodationResult.facts,
                };
            }
        }
    }

    /**
     * ======================================================
     * Save Session
     * ======================================================
     */

    await sessionService.saveConversationState({

        sessionId,

        facts:
            result.facts,

        currentStep:
            result.current_step ||
            result.currentStep,

        routeNumber:
            result.route_number ||
            result.routeNumber,

        lastQuestionField:
            result.last_question_field ||
            result.lastQuestionField,
    });

    return {

        reply:
            result.reply,

        currentStep:
            result.current_step ||
            result.currentStep,

        facts:
            result.facts,
    };
}

module.exports = {
    handleChat,
};