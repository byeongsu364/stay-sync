const sessionService = require("./sessionService");
const { classifyIntent } = require("./intentService");
const { handleCorrection } = require("./correctionService");
const { extractTravelIntent } = require("./travelIntentService");
const { collectPostBookingFacts } = require("./postBookingService");
const { handleLocationInput } = require("./locationInputService");
const { handleAccommodationStep } = require("./accommodationService");
const {
    recommendPopularAttractions,
} = require("./attractionRecommendationService");
const {
    selectAttractions,
    classifyMoreRecommendationAnswer,
} = require("./attractionSelectionService");

const { CURRENT_STEP, ROUTE_NUMBER } = require("../data/constants");

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
 * - 동행자 수집
 * - 관광지 추천
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
     * Attraction Selection
     * ======================================================
     */

    if (session.currentStep === CURRENT_STEP.RECOMMENDATION_SHOWN) {
        const selectionResult = selectAttractions({
            userMessage: message,
            recommendations: facts.related_places,
            selectedPlaces: facts.selected_places,
        });

        if (!selectionResult.handled) {
            return {
                reply: selectionResult.reply,
                currentStep: CURRENT_STEP.RECOMMENDATION_SHOWN,
                facts,
            };
        }

        const selectionFacts = {
            ...facts,
            selected_places: selectionResult.selectedPlaces,
        };

        await sessionService.saveConversationState({
            sessionId,
            facts: selectionFacts,
            currentStep: CURRENT_STEP.ASK_MORE_RECOMMENDATION,
            routeNumber: ROUTE_NUMBER.MORE_RECOMMENDATION_CHECK,
            lastQuestionField: null,
        });

        return {
            reply: selectionResult.reply,
            currentStep: CURRENT_STEP.ASK_MORE_RECOMMENDATION,
            facts: selectionFacts,
            selectedPlaces: selectionResult.selectedPlaces,
        };
    }

    /**
     * ======================================================
     * More Recommendation Check
     * ======================================================
     */

    if (session.currentStep === CURRENT_STEP.ASK_MORE_RECOMMENDATION) {
        const answer = classifyMoreRecommendationAnswer(message);

        if (answer === "unknown") {
            return {
                reply: "관광지를 더 추천받으시려면 '네', 선택을 마치려면 '아니요'라고 입력해주세요.",
                currentStep: CURRENT_STEP.ASK_MORE_RECOMMENDATION,
                facts,
            };
        }

        if (answer === "no") {
            await sessionService.saveConversationState({
                sessionId,
                facts,
                currentStep: CURRENT_STEP.READY_FOR_ROUTE_PLANNING,
                routeNumber: ROUTE_NUMBER.ROUTE_PLANNING,
                lastQuestionField: null,
            });

            return {
                reply:
                    "관광지 선택을 마쳤습니다. "
                    + "선택한 관광지를 기준으로 최적 동선을 준비할게요.",
                currentStep: CURRENT_STEP.READY_FOR_ROUTE_PLANNING,
                facts,
                selectedPlaces: facts.selected_places,
            };
        }

        const nextRound = (facts.recommendation_round || 1) + 1;
        const recommendationResult = await recommendPopularAttractions({
            region: facts.region,
            themes: facts.themes,
            tripType: facts.trip_type,
            recommendationRound: nextRound,
            recommendedHistory: facts.recommended_history,
        });
        const recommendationFacts = {
            ...facts,
            related_places: recommendationResult.recommendations,
            recommended_history: recommendationResult.recommendedHistory,
            recommendation_round: nextRound,
        };
        const nextStep = recommendationResult.exhausted
            ? CURRENT_STEP.READY_FOR_ROUTE_PLANNING
            : CURRENT_STEP.RECOMMENDATION_SHOWN;
        const nextRoute = recommendationResult.exhausted
            ? ROUTE_NUMBER.ROUTE_PLANNING
            : ROUTE_NUMBER.RECOMMENDATION;
        const reply = recommendationResult.exhausted
            ? `${recommendationResult.reply}\n\n선택한 관광지를 기준으로 최적 동선을 준비할게요.`
            : recommendationResult.reply;

        await sessionService.saveConversationState({
            sessionId,
            facts: recommendationFacts,
            currentStep: nextStep,
            routeNumber: nextRoute,
            lastQuestionField: null,
        });

        return {
            reply,
            currentStep: nextStep,
            facts: recommendationFacts,
            recommendations: recommendationResult.recommendations,
            hasMore: recommendationResult.hasMore,
            exhausted: recommendationResult.exhausted,
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

        if (
            result.current_step === CURRENT_STEP.READY_FOR_RECOMMENDATION &&
            result.facts.companion_type
        ) {
            const recommendationResult =
                await recommendPopularAttractions({
                    region: result.facts.region,
                    themes: result.facts.themes,
                    tripType: result.facts.trip_type,
                    recommendationRound:
                        result.facts.recommendation_round,
                    recommendedHistory:
                        result.facts.recommended_history,
                });

            const recommendationFacts = {
                ...result.facts,
                related_places:
                    recommendationResult.recommendations,
                recommended_history:
                    recommendationResult.recommendedHistory,
                recommendation_round:
                    recommendationResult.recommendationRound,
            };

            await sessionService.saveConversationState({
                sessionId,
                facts: recommendationFacts,
                currentStep: CURRENT_STEP.RECOMMENDATION_SHOWN,
                routeNumber: ROUTE_NUMBER.RECOMMENDATION,
                lastQuestionField: null,
            });

            return {
                reply: recommendationResult.reply,
                currentStep: CURRENT_STEP.RECOMMENDATION_SHOWN,
                facts: recommendationFacts,
                recommendations:
                    recommendationResult.recommendations,
                hasMore: recommendationResult.hasMore,
                exhausted: recommendationResult.exhausted,
                nextRecommendationRound:
                    recommendationResult.nextRecommendationRound,
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
