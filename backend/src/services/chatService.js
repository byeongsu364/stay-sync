const sessionService = require("./sessionService");
const { classifyIntent } = require("./intentService");
const { handleCorrection } = require("./correctionService");
const { extractTravelIntent } = require("./travelIntentService");
const { collectPostBookingFacts } = require("./postBookingService");
const { handleLocationInput } = require("./locationInputService");
const { handleAccommodationStep } = require("./accommodationService");
const {
    recommendAttractions,
} = require("./attractionRecommendationService");
const {
    selectAttractions,
    classifyMoreRecommendationAnswer,
} = require("./attractionSelectionService");
const {
    planDailyRoutes,
    planRouteOnlyByDays,
} = require("./routePlanningService");
const {
    SERVICE_TYPE_PROMPT,
    SERVICE_TYPE_OPTIONS,
    selectServiceType,
    handleAttractionRegionInput,
} = require("./serviceTypeService");
const {
    parseTravelDays,
    resolveRouteOnlyAttractions,
} = require("./routeOnlyService");
const { buildKakaoRouteUrls } = require("./kakaoRouteExportService");

const { CURRENT_STEP, ROUTE_NUMBER, SERVICE_TYPE } = require("../data/constants");

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

    function getKakaoRouteLinks(dailyRoutes) {
        return dailyRoutes.flatMap((day) => (
            buildKakaoRouteUrls(day).map((url, index) => ({
                day: day.day,
                part: index + 1,
                url,
            }))
        ));
    }

    async function finalizeRoute(routeFacts) {
        const routeResult = await planDailyRoutes({
            startDate: routeFacts.start_date,
            endDate: routeFacts.end_date,
            tripType: routeFacts.trip_type,
            origin: routeFacts.start_location,
            selectedPlaces: routeFacts.selected_places,
        });
        const finalFacts = {
            ...routeFacts,
            final_selected_places: routeFacts.selected_places,
            final_route: routeResult.dailyRoutes,
        };

        await sessionService.saveConversationState({
            sessionId,
            facts: finalFacts,
            currentStep: CURRENT_STEP.ROUTE_OPTIMIZED,
            routeNumber: ROUTE_NUMBER.END,
            lastQuestionField: null,
        });

        return {
            reply:
                `${routeResult.reply}\n\n`
                + "아래 카카오맵 길찾기 링크로 동선을 확인할 수 있습니다.",
            currentStep: CURRENT_STEP.ROUTE_OPTIMIZED,
            facts: finalFacts,
            finalRoute: routeResult.dailyRoutes,
            kakaoRouteLinks: getKakaoRouteLinks(routeResult.dailyRoutes),
        };
    }

    async function finalizeRouteOnly(routeFacts, travelDays) {
        const routeResult = await planRouteOnlyByDays({
            selectedPlaces: routeFacts.selected_places,
            travelDays,
            origin: routeFacts.start_location,
        });
        const finalFacts = {
            ...routeFacts,
            travel_days: travelDays,
            final_selected_places: routeFacts.selected_places,
            final_route: routeResult.dailyRoutes,
        };

        await sessionService.saveConversationState({
            sessionId,
            facts: finalFacts,
            currentStep: CURRENT_STEP.ROUTE_OPTIMIZED,
            routeNumber: ROUTE_NUMBER.END,
            lastQuestionField: null,
        });

        return {
            reply: `${routeResult.reply}\n\n아래 카카오맵 길찾기 링크로 동선을 확인할 수 있습니다.`,
            currentStep: CURRENT_STEP.ROUTE_OPTIMIZED,
            facts: finalFacts,
            finalRoute: routeResult.dailyRoutes,
            kakaoRouteLinks: getKakaoRouteLinks(routeResult.dailyRoutes),
        };
    }

    if (session.currentStep === CURRENT_STEP.ASK_SERVICE_TYPE) {
        if (["안녕", "안녕하세요", "하이", "ㅎㅇ", "hello", "hi"].includes(message.toLowerCase())) {
            return {
                reply: `안녕하세요!\n\n${SERVICE_TYPE_PROMPT}`,
                currentStep: CURRENT_STEP.ASK_SERVICE_TYPE,
                facts,
                quickReplies: SERVICE_TYPE_OPTIONS,
            };
        }

        const selection = selectServiceType(message, facts);
        if (!selection.handled) {
            const regionFacts = {
                ...facts,
                service_type: SERVICE_TYPE.ACCOMMODATION,
                region: message,
            };

            await sessionService.saveConversationState({
                sessionId,
                facts: regionFacts,
                currentStep: CURRENT_STEP.ASK_PERIOD,
                routeNumber: ROUTE_NUMBER.TRAVEL_INFO,
                lastQuestionField: "period",
            });
            return {
                reply: `${message}으로 여행을 가시는군요. 언제부터 언제까지 여행하시나요?`,
                currentStep: CURRENT_STEP.ASK_PERIOD,
                facts: regionFacts,
            };
        }

        await sessionService.saveConversationState({
            sessionId,
            facts: selection.facts,
            currentStep: selection.currentStep,
            routeNumber: ROUTE_NUMBER.TRAVEL_INFO,
            lastQuestionField: selection.lastQuestionField,
        });
        return selection;
    }

    if (session.currentStep === CURRENT_STEP.ASK_ATTRACTION_REGION) {
        let nextFacts;
        try {
            nextFacts = await handleAttractionRegionInput(message, facts);
        } catch (error) {
            nextFacts = null;
        }

        if (!nextFacts) {
            return {
                reply: "지원 지역이나 해당 지역의 관광지를 찾지 못했습니다. 여행 지역 또는 관광지명을 다시 입력해주세요.",
                currentStep: CURRENT_STEP.ASK_ATTRACTION_REGION,
                facts,
            };
        }

        await sessionService.saveConversationState({
            sessionId,
            facts: nextFacts,
            currentStep: CURRENT_STEP.ASK_PERIOD,
            routeNumber: ROUTE_NUMBER.TRAVEL_INFO,
            lastQuestionField: "period",
        });
        return {
            reply: `${nextFacts.region} 여행으로 확인했습니다. 언제부터 언제까지 여행하시나요?`,
            currentStep: CURRENT_STEP.ASK_PERIOD,
            facts: nextFacts,
        };
    }

    if (session.currentStep === CURRENT_STEP.ASK_ROUTE_ATTRACTIONS) {
        const resolved = await resolveRouteOnlyAttractions(message, facts.region);
        if (resolved.places.length === 0 || resolved.unresolved.length > 0) {
            const unresolvedText = resolved.unresolved.length > 0
                ? `\n찾지 못한 장소: ${resolved.unresolved.join(", ")}`
                : "";
            return {
                reply: `관광지를 모두 확인하지 못했습니다.${unresolvedText}\n장소명을 쉼표로 구분해 다시 입력해주세요.`,
                currentStep: CURRENT_STEP.ASK_ROUTE_ATTRACTIONS,
                facts,
            };
        }

        if (facts.travel_days > resolved.places.length) {
            return {
                reply: `${facts.travel_days}일 동선을 만들려면 관광지가 최소 ${facts.travel_days}개 필요합니다. 관광지를 더 추가해 다시 선택해주세요.`,
                currentStep: CURRENT_STEP.ASK_ROUTE_ATTRACTIONS,
                facts,
            };
        }

        const routeFacts = {
            ...facts,
            selected_places: resolved.places,
        };

        const locationStep = facts.travel_days === 1
            ? CURRENT_STEP.ASK_START_LOCATION
            : CURRENT_STEP.ASK_ACCOMMODATION;
        await sessionService.saveConversationState({
            sessionId,
            facts: routeFacts,
            currentStep: locationStep,
            routeNumber: ROUTE_NUMBER.ROUTE_PLANNING,
            lastQuestionField: facts.travel_days === 1
                ? "departure_location"
                : "accommodation",
        });
        return {
            reply: facts.travel_days === 1
                ? `${resolved.places.length}개 관광지를 확인했습니다. 동선의 시작점이 될 출발지를 입력해주세요.`
                : `${resolved.places.length}개 관광지를 확인했습니다. ${facts.travel_days}일 여행의 기준이 될 숙소명이나 주소를 입력해주세요.`,
            currentStep: locationStep,
            facts: routeFacts,
        };
    }

    if (session.currentStep === CURRENT_STEP.ASK_ROUTE_DAYS) {
        const travelDays = parseTravelDays(message);
        if (!travelDays || travelDays > 30) {
            return {
                reply: "여행 일수를 1일부터 30일 사이로 입력해주세요. 예: 2일",
                currentStep: CURRENT_STEP.ASK_ROUTE_DAYS,
                facts,
            };
        }

        const routeFacts = {
            ...facts,
            travel_days: travelDays,
            trip_type: travelDays > 1 ? "숙박" : "당일치기",
        };
        await sessionService.saveConversationState({
            sessionId,
            facts: routeFacts,
            currentStep: CURRENT_STEP.ASK_ROUTE_ATTRACTIONS,
            routeNumber: ROUTE_NUMBER.ROUTE_PLANNING,
            lastQuestionField: "selected_places",
        });
        return {
            reply: `${travelDays}일 일정으로 확인했습니다. 방문할 관광지를 /관광지명으로 검색해 선택해주세요.`,
            currentStep: CURRENT_STEP.ASK_ROUTE_ATTRACTIONS,
            facts: routeFacts,
        };
    }

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
            reply: SERVICE_TYPE_PROMPT,
            currentStep: session.currentStep,
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
            return await finalizeRoute(facts);
        }

        const nextRound = (facts.recommendation_round || 1) + 1;
        const recommendationResult = await recommendAttractions({
            region: facts.region,
            themes: facts.themes,
            tripType: facts.trip_type,
            recommendationRound: nextRound,
            recommendedHistory: facts.recommended_history,
            origin: facts.start_location,
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

        if (recommendationResult.exhausted) {
            return await finalizeRoute(recommendationFacts);
        }

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

        if (
            locationResult.facts.service_type === SERVICE_TYPE.ROUTE_ONLY
            && locationResult.current_step === CURRENT_STEP.READY_FOR_ROUTE_PLANNING
        ) {
            return await finalizeRouteOnly(
                locationResult.facts,
                locationResult.facts.travel_days,
            );
        }

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

    if (session.currentStep === CURRENT_STEP.ASK_COMPANION_TYPE) {

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
                await recommendAttractions({
                    region: result.facts.region,
                    themes: result.facts.themes,
                    tripType: result.facts.trip_type,
                    recommendationRound:
                        result.facts.recommendation_round,
                    recommendedHistory:
                        result.facts.recommended_history,
                    origin: result.facts.start_location,
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
