const sessionService = require("./sessionService");
const { classifyIntent } = require("./intentService");
const {
    handleCorrection,
    mentionsCorrection,
    mentionsValueBesidesCorrection,
} = require("./correctionService");
const {
    extractTravelIntent,
    parseSimplePeriod,
    mergeTravelFacts,
    applyTripType,
    decideTravelIntentStep,
    captureUndatedTripType,
    buildPeriodQuestion,
} = require("./travelIntentService");
const { collectPostBookingFacts, captureCompanionFacts } = require("./postBookingService");
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
    buildServiceTypePrompt,
    buildServiceTypeOptions,
    selectServiceType,
    handleAttractionRegionInput,
    resolveSupportedDestination,
} = require("./serviceTypeService");
const {
    parseTravelDays,
    resolveRouteOnlyAttractions,
} = require("./routeOnlyService");
const { buildKakaoRouteUrls } = require("./kakaoRouteExportService");
const {
    getWeatherRecommendationContext,
    buildWeatherReply,
} = require("./weatherRecommendationService");
const {
    getAirQuality,
    buildAirQualityReply,
} = require("./airQualityService");
const { createTravelStory } = require("./travelStoryService");

const { CURRENT_STEP, ROUTE_NUMBER, SERVICE_TYPE } = require("../data/constants");
const { pickJosa } = require("../utils/koreanUtils");
const { displayName } = require("../utils/attractionNameUtils");
const { t, regionLabel, themeLabel, companionLabel } = require("./messageService");
const { buildRetryResult } = require("./stepQuestionService");
const REGIONS = require("../data/regionData");
const { detectLanguage } = require("./languageService");
const {
    isRegionAvailableInEnglish,
    buildUnavailableRegionReply,
} = require("./englishCoverageService");

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

async function runChat({
    sessionId,
    userMessage,
    selectedLocation = null,
    requestId = "unknown",
    language = null,
}) {

    const debug = (stage, detail = "") => {
        console.log(`[chat-debug:${requestId}] ${stage}${detail ? ` ${detail}` : ""}`);
    };

    const session =
        await sessionService.loadSession(sessionId);

    /**
     * 항상 DB 컬럼 기준으로 facts 생성
     */
    let facts =
        sessionService.buildFactsFromSession(session);

    const message =
        String(userMessage).trim();

    // 한 번 정해진 언어는 세션에 남고, 사용자가 언어를 바꾸면 그때부터 바뀐다.
    facts = {
        ...facts,
        language: detectLanguage(message, {
            sessionLanguage: session.language,
            locale: language,
        }),
    };

    if ([CURRENT_STEP.ASK_SERVICE_TYPE, CURRENT_STEP.ASK_REGION,
        CURRENT_STEP.ASK_ATTRACTION_REGION, CURRENT_STEP.ASK_PERIOD].includes(session.currentStep)) {
        let capturedFacts = captureCompanionFacts(message, facts);
        capturedFacts = captureUndatedTripType(message, capturedFacts);
        const period = parseSimplePeriod(message);
        if (period) {
            capturedFacts = applyTripType(mergeTravelFacts(capturedFacts, period));
        }
        if (capturedFacts !== facts) {
            facts = capturedFacts;
            // 목적지가 아직 모호해 다시 질문하더라도 확인된 동행자와 기간은 보존한다.
            await sessionService.saveConversationState({
                sessionId, facts, currentStep: session.currentStep,
                routeNumber: session.routeNumber,
                lastQuestionField: session.lastQuestionField,
            });
        }
    }

    function interestPlaceNames(destinationFacts) {
        return (destinationFacts.interest_places || [])
            .map((place) => displayName(place, destinationFacts.language));
    }

    function destinationPeriodQuestion(destinationFacts) {
        const language = destinationFacts.language || "ko";
        const names = interestPlaceNames(destinationFacts);
        const region = regionLabel(destinationFacts.region, language);
        const destination = names.length ? `${names.join(", ")}(${region})` : region;

        const confirmed = (destinationFacts.interest_places || []).some(({ visitConfirmed }) => visitConfirmed);
        const visit = !confirmed
            ? ""
            : names.length > 1
                ? t("travel.visitAddedMany", { count: names.length }, language)
                : t("travel.visitAdded", {}, language);

        // 하고 싶은 활동만 말해 관광지가 없는 경우가 있어, 무엇을 저장했는지 알려준다.
        const themes = (destinationFacts.interest_themes || [])
            .map((value) => themeLabel(value, language));
        const theme = themes.length ? t("travel.themeSaved", { themes }, language) : "";

        const companionType = destinationFacts.companion_type;
        const companion = companionType
            ? t("travel.companionSaved", { companion: companionType }, language)
            : "";

        return t("travel.destinationConfirmed", {
            destination,
            visit,
            theme,
            companion,
            question: buildPeriodQuestion(destinationFacts),
        }, language);
    }

    // 영어로는 영문명이 있는 관광지만 추천하므로, 그런 관광지가 없는 지역은 진행하지 않는다.
    // 날짜와 동행자까지 다 받은 뒤 막히지 않도록 지역을 고르는 자리에서 확인한다.
    async function blockRegionUnavailableInEnglish(destinationFacts) {
        if (destinationFacts.language !== "en") return null;
        if (await isRegionAvailableInEnglish(destinationFacts.region)) return null;

        const unavailable = await buildUnavailableRegionReply(destinationFacts.region);
        return {
            ...unavailable,
            currentStep: session.currentStep,
            facts,
        };
    }

    async function advanceFromDestination(destinationFacts) {
        const blocked = await blockRegionUnavailableInEnglish(destinationFacts);
        if (blocked) return blocked;

        const nextFacts = applyTripType(destinationFacts);
        let step = decideTravelIntentStep(nextFacts);
        if (step.current_step === CURRENT_STEP.READY_FOR_ACCOMMODATION_RECOMMENDATION) {
            step = handleAccommodationStep(nextFacts);
        }
        const questionFields = {
            [CURRENT_STEP.ASK_PERIOD]: "period",
            [CURRENT_STEP.ASK_ACCOMMODATION]: "accommodation",
            [CURRENT_STEP.ASK_START_LOCATION]: "departure_location",
        };
        await sessionService.saveConversationState({
            sessionId,
            facts: nextFacts,
            currentStep: step.current_step,
            routeNumber: step.route_number,
            lastQuestionField: questionFields[step.current_step] || null,
        });
        const names = interestPlaceNames(nextFacts);
        const details = [
            names.length
                ? `${nextFacts.interest_places.some(({ visitConfirmed }) => visitConfirmed)
                    ? "방문 확정 관광지" : "관심 관광지"}: ${names.join(", ")}` : null,
            nextFacts.interest_themes?.length
                ? `관심 테마: ${nextFacts.interest_themes.join(", ")}` : null,
            nextFacts.companion_type ? `동행자: ${nextFacts.companion_type}` : null,
            nextFacts.period ? `여행 일정: ${nextFacts.period}` : null,
        ].filter(Boolean).join(" · ");
        return {
            reply: step.current_step === CURRENT_STEP.ASK_PERIOD
                ? destinationPeriodQuestion(nextFacts)
                : `${details}\n\n${step.reply}`,
            currentStep: step.current_step,
            facts: nextFacts,
        };
    }

    // 정정하는 뉘앙스가 나오면 바로 앞 섹션으로 되돌린다.
    // 아래 단계들은 정정 처리보다 먼저 실행되므로, 입력을 알아듣지 못했을 때 여기서 되돌린다.
    async function rollbackToPreviousSection(currentFacts, currentStep) {
        if (!mentionsCorrection(message)) return null;

        const correctionResult = handleCorrection({
            userMessage: message,
            facts: currentFacts,
            currentStep,
        });
        if (!correctionResult.handled) return null;

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

    function getKakaoRouteLinks(dailyRoutes) {
        return dailyRoutes.flatMap((day) => (
            buildKakaoRouteUrls(day).map((url, index) => ({
                day: day.day,
                part: index + 1,
                url,
            }))
        ));
    }

    async function recommendWithSituationContext(recommendationFacts, recommendationRound) {
        const [weatherContext, airQualityContext] = await Promise.all([
            getWeatherRecommendationContext({
                region: recommendationFacts.region,
                startDate: recommendationFacts.start_date,
                endDate: recommendationFacts.end_date,
            }),
            getAirQuality(recommendationFacts.region),
        ]);
        const language = recommendationFacts.language || "ko";
        const indoorRecommended = weatherContext.indoorRecommended
            || airQualityContext.indoorRecommended;
        const recommendationArgs = {
            region: recommendationFacts.region,
            themes: recommendationFacts.themes,
            tripType: recommendationFacts.trip_type,
            recommendationRound,
            recommendedHistory: [...new Set([
                ...(recommendationFacts.recommended_history || []),
                ...(recommendationFacts.selected_places || []).map(({ id }) => id),
            ])],
            origin: recommendationFacts.start_location,
            // 영어 대화에서는 이름을 영어로 보여줄 수 있는 관광지만 추천한다.
            englishOnly: recommendationFacts.language === "en",
        };
        let result = await recommendAttractions({
            ...recommendationArgs,
            indoorOutdoor: indoorRecommended ? "실내" : null,
        });
        let usedIndoorFallback = false;

        // 실내 데이터가 부족하면 추천을 중단하지 않고 일반 후보로 보충한다.
        if (result.exhausted && indoorRecommended) {
            result = await recommendAttractions(recommendationArgs);
            usedIndoorFallback = true;
        }

        // 동행자를 방금 받은 뒤 바로 추천이 나가므로,
        // 무엇으로 알아들었는지 먼저 알려줘야 잘못 잡혔을 때 고칠 수 있다.
        const companion = recommendationFacts.companion_type
            ? `${t("companion.confirmed", {
                companion: companionLabel(recommendationFacts.companion_type, language),
            }, language)}\n`
            : "";
        const situation = `${companion}`
            + `${buildWeatherReply(weatherContext, language)}\n`
            + `${buildAirQualityReply(airQualityContext, language)}\n`;

        return {
            ...result,
            situationSummary: situation
                + (indoorRecommended && !usedIndoorFallback
                    ? t("situation.indoorOnly", {}, language)
                    : indoorRecommended && usedIndoorFallback
                        ? t("situation.indoorFallback", {}, language)
                        : t("situation.noConstraint", {}, language)),
            reply: `${situation}\n${result.reply}`,
            weatherContext,
            airQualityContext,
            weatherFilter: indoorRecommended && !usedIndoorFallback
                ? "실내"
                : null,
        };
    }

    async function showInitialRecommendations(readyFacts) {
        const recommendationResult = await recommendWithSituationContext(
            readyFacts, readyFacts.recommendation_round,
        );
        const recommendationFacts = {
            ...readyFacts,
            related_places: recommendationResult.recommendations,
            recommended_history: recommendationResult.recommendedHistory,
            recommendation_round: recommendationResult.recommendationRound,
            weather_forecasts: recommendationResult.weatherContext.forecasts,
            weather_filter: recommendationResult.weatherFilter,
            air_quality: recommendationResult.airQualityContext,
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
            recommendations: recommendationResult.recommendations,
            hasMore: recommendationResult.hasMore,
            exhausted: recommendationResult.exhausted,
            situationSummary: recommendationResult.situationSummary,
            situationFilterApplied: Boolean(recommendationResult.weatherFilter),
            nextRecommendationRound: recommendationResult.nextRecommendationRound,
        };
    }

    async function finalizeRoute(routeFacts) {
        debug("FINAL_ROUTE_START", `places=${routeFacts.selected_places?.length || 0}`);
        const routeResult = await planDailyRoutes({
            startDate: routeFacts.start_date,
            endDate: routeFacts.end_date,
            tripType: routeFacts.trip_type,
            origin: routeFacts.start_location,
            selectedPlaces: routeFacts.selected_places,
        });
        debug("FINAL_ROUTE_OPTIMIZED", `days=${routeResult.dailyRoutes.length}`);
        debug("FINAL_STORY_START");
        const story = await createTravelStory({
            facts: routeFacts,
            dailyRoutes: routeResult.dailyRoutes,
        });
        debug("FINAL_STORY_DONE", `length=${story?.length || 0}`);
        const finalFacts = {
            ...routeFacts,
            final_selected_places: routeFacts.selected_places,
            final_route: routeResult.dailyRoutes,
            final_story: story,
        };

        await sessionService.saveConversationState({
            sessionId,
            facts: finalFacts,
            currentStep: CURRENT_STEP.ROUTE_OPTIMIZED,
            routeNumber: ROUTE_NUMBER.END,
            lastQuestionField: null,
        });
        debug("FINAL_SESSION_SAVED");

        return {
            reply:
                `${story ? `${story}\n\n${t("route.exactPath", {}, facts.language)}\n\n` : ""}${routeResult.reply}\n\n`
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
        const story = await createTravelStory({
            facts: routeFacts,
            dailyRoutes: routeResult.dailyRoutes,
        });
        const finalFacts = {
            ...routeFacts,
            travel_days: travelDays,
            final_selected_places: routeFacts.selected_places,
            final_route: routeResult.dailyRoutes,
            final_story: story,
        };

        await sessionService.saveConversationState({
            sessionId,
            facts: finalFacts,
            currentStep: CURRENT_STEP.ROUTE_OPTIMIZED,
            routeNumber: ROUTE_NUMBER.END,
            lastQuestionField: null,
        });

        return {
            reply: `${story ? `${story}\n\n${t("route.exactPath", {}, facts.language)}\n\n` : ""}${routeResult.reply}\n\n${t("route.kakaoLinks", {}, facts.language)}`,
            currentStep: CURRENT_STEP.ROUTE_OPTIMIZED,
            facts: finalFacts,
            finalRoute: routeResult.dailyRoutes,
            kakaoRouteLinks: getKakaoRouteLinks(routeResult.dailyRoutes),
        };
    }

    if (session.currentStep === CURRENT_STEP.ASK_SERVICE_TYPE) {
        if (["안녕", "안녕하세요", "하이", "ㅎㅇ", "hello", "hi"].includes(message.toLowerCase())) {
            return {
                reply: t("greeting.hello", { prompt: buildServiceTypePrompt(facts.language) }, facts.language),
                currentStep: CURRENT_STEP.ASK_SERVICE_TYPE,
                facts,
                quickReplies: buildServiceTypeOptions(facts.language),
            };
        }

        const selection = selectServiceType(message, facts);
        if (!selection.handled) {
            const destinationFacts = await resolveSupportedDestination(message, {
                ...facts,
                service_type: SERVICE_TYPE.ACCOMMODATION,
            });

            if (destinationFacts?.needsDestinationChoice) {
                return { ...destinationFacts, currentStep: session.currentStep, facts };
            }

            if (!destinationFacts) {
                return {
                    reply:
                        t("region.notSupported", { regions: REGIONS.join(", ") }, facts.language),
                    currentStep: CURRENT_STEP.ASK_SERVICE_TYPE,
                    facts,
                    quickReplies: buildServiceTypeOptions(facts.language),
                };
            }

            return await advanceFromDestination(destinationFacts);
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

    if ([CURRENT_STEP.ASK_ATTRACTION_REGION, CURRENT_STEP.ASK_REGION].includes(session.currentStep)) {
        let nextFacts;
        try {
            nextFacts = await handleAttractionRegionInput(message, facts);
        } catch (error) {
            nextFacts = null;
        }

        if (!nextFacts) {
            return {
                reply: t("region.askAgain", {}, facts.language),
                currentStep: session.currentStep,
                facts,
            };
        }

        if (nextFacts.needsDestinationChoice) {
            return { ...nextFacts, currentStep: session.currentStep, facts };
        }

        return await advanceFromDestination(nextFacts);
    }

    if (session.currentStep === CURRENT_STEP.ASK_ROUTE_ATTRACTIONS) {
        const resolved = await resolveRouteOnlyAttractions(message, facts.region);
        if (resolved.places.length === 0 || resolved.unresolved.length > 0) {
            const unresolvedText = resolved.unresolved.length > 0
                ? `\n찾지 못한 장소: ${resolved.unresolved.join(", ")}`
                : "";
            const rolledBack = await rollbackToPreviousSection(facts, session.currentStep);
            if (rolledBack) return rolledBack;

            return {
                reply: t("routeOnly.attractionsNotFound", { unresolved: unresolvedText }, facts.language),
                currentStep: CURRENT_STEP.ASK_ROUTE_ATTRACTIONS,
                facts,
            };
        }

        if (facts.travel_days > resolved.places.length) {
            return {
                reply: t("routeOnly.needMoreAttractions", { days: facts.travel_days }, facts.language),
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
                reply: t("routeOnly.invalidDays", {}, facts.language),
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
            reply: t("routeOnly.daysConfirmed", { days: travelDays }, facts.language),
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
                reply: t("greeting.continue", {}, facts.language),
                currentStep: session.currentStep,
                facts,
            };
        }

        return {
            reply: buildServiceTypePrompt(facts.language),
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
            const rolledBack = await rollbackToPreviousSection(facts, session.currentStep);
            if (rolledBack) return rolledBack;

            return {
                reply: selectionResult.reply,
                currentStep: CURRENT_STEP.RECOMMENDATION_SHOWN,
                facts,
            };
        }

        const selectionFacts = {
            ...facts,
            selected_places: selectionResult.selectedPlaces,
            last_selected_place_ids: selectionResult.newSelections.map(({ id }) => id),
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
        debug("MORE_RECOMMENDATION_INPUT", message);
        const answer = await classifyMoreRecommendationAnswer(message);
        debug("MORE_RECOMMENDATION_CLASSIFIED", answer);

        if (answer === "undo") {
            const recordedIds = facts.last_selected_place_ids || [];
            const currentRecommendationIds = new Set(
                facts.related_places.map(({ id }) => String(id)),
            );
            const lastSelectedIds = new Set(
                (recordedIds.length > 0
                    ? recordedIds
                    : facts.selected_places
                        .filter(({ id, selectionSource }) => selectionSource !== "destination"
                            && currentRecommendationIds.has(String(id)))
                        .map(({ id }) => id)
                ).map(String),
            );
            const selectionFacts = {
                ...facts,
                selected_places: facts.selected_places.filter(
                    ({ id }) => !lastSelectedIds.has(String(id)),
                ),
                last_selected_place_ids: [],
            };

            await sessionService.saveConversationState({
                sessionId,
                facts: selectionFacts,
                currentStep: CURRENT_STEP.RECOMMENDATION_SHOWN,
                routeNumber: ROUTE_NUMBER.RECOMMENDATION,
                lastQuestionField: "selected_places",
            });

            return {
                reply: t("selection.undone", {}, facts.language),
                currentStep: CURRENT_STEP.RECOMMENDATION_SHOWN,
                facts: selectionFacts,
                recommendations: facts.related_places,
            };
        }

        if (answer === "unknown") {
            return {
                reply: t("selection.askMoreUnclear", {}, facts.language),
                currentStep: CURRENT_STEP.ASK_MORE_RECOMMENDATION,
                facts,
            };
        }

        if (answer === "no") {
            return await finalizeRoute(facts);
        }

        const nextRound = (facts.recommendation_round || 1) + 1;
        const recommendationResult = await recommendWithSituationContext(facts, nextRound);
        const recommendationFacts = {
            ...facts,
            related_places: recommendationResult.recommendations,
            recommended_history: recommendationResult.recommendedHistory,
            recommendation_round: nextRound,
            weather_forecasts: recommendationResult.weatherContext.forecasts,
            weather_filter: recommendationResult.weatherFilter,
            air_quality: recommendationResult.airQualityContext,
        };
        const nextStep = recommendationResult.exhausted
            ? CURRENT_STEP.READY_FOR_ROUTE_PLANNING
            : CURRENT_STEP.RECOMMENDATION_SHOWN;
        const nextRoute = recommendationResult.exhausted
            ? ROUTE_NUMBER.ROUTE_PLANNING
            : ROUTE_NUMBER.RECOMMENDATION;
        const reply = recommendationResult.exhausted
            ? t("selection.readyForRoute", { reply: recommendationResult.reply }, facts.language)
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
            situationSummary: recommendationResult.situationSummary,
            situationFilterApplied: Boolean(recommendationResult.weatherFilter),
        };
    }

    /**
     * ======================================================
     * Intent Classification
     * ======================================================
     */

    if (session.currentStep === CURRENT_STEP.READY_FOR_RECOMMENDATION) {
        return await showInitialRecommendations(facts);
    }

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
                currentStep: session.currentStep,
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

            // '아니다 내일부터 이틀간'처럼 정정과 새 값을 한 문장에 말하는 경우가 많다.
            // 되돌아간 단계가 아래 흐름에서 처리되는 단계면 같은 문장을 이어서 해석한다.
            const reinterpretableSteps = [
                CURRENT_STEP.ASK_PERIOD,
                CURRENT_STEP.ASK_ACCOMMODATION,
                CURRENT_STEP.ASK_START_LOCATION,
                CURRENT_STEP.ASK_COMPANION_TYPE,
            ];

            if (
                !reinterpretableSteps.includes(correctionResult.currentStep)
                || !mentionsValueBesidesCorrection(message)
            ) {
                return {
                    reply: correctionResult.reply,
                    currentStep: correctionResult.currentStep,
                    facts: correctionResult.facts,
                };
            }

            facts = correctionResult.facts;
            session.currentStep = correctionResult.currentStep;
            session.routeNumber = correctionResult.routeNumber;
            session.lastQuestionField = correctionResult.lastQuestionField;
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
        selectedLocation,
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

        if (locationResult.current_step === CURRENT_STEP.READY_FOR_RECOMMENDATION) {
            // 추천 API가 실패해도 입력받은 위치는 보존한다. 재시도 시 위치를 다시 묻지 않는다.
            await sessionService.saveConversationState({
                sessionId, facts: locationResult.facts,
                currentStep: CURRENT_STEP.READY_FOR_RECOMMENDATION,
                routeNumber: ROUTE_NUMBER.RECOMMENDATION,
                lastQuestionField: null,
            });
            return await showInitialRecommendations(locationResult.facts);
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
            return await showInitialRecommendations(result.facts);
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

/**
 * 대화 한 턴 처리
 *
 * 중간에 무엇이 잘못되든 오류 문구를 내보내지 않는다.
 * 묻고 있던 질문을 다시 해서 대화를 이어간다.
 */
async function handleChat(request) {
    const { sessionId, requestId = "unknown" } = request;

    try {
        return await runChat(request);
    } catch (error) {
        console.error(`[chat-debug:${requestId}] 처리 실패, 재질문으로 이어갑니다:`, error.stack || error.message);

        // 세션을 못 읽는 상황까지 감안해 단계와 facts를 다시 읽어본다.
        let session = null;
        try {
            session = await sessionService.loadSession(sessionId);
        } catch (sessionError) {
            console.error(`[chat-debug:${requestId}] 세션 조회도 실패:`, sessionError.message);
        }

        const facts = session ? sessionService.buildFactsFromSession(session) : {};
        return buildRetryResult(session?.currentStep || null, facts);
    }
}

module.exports = {
    handleChat,
};
