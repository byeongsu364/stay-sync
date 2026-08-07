const postBookingPrompt = require("../prompts/postBookingPrompt");
const { callLLMJson } = require("./llmService");
const {
    normalizeCompanionType,
    mapCompanionToThemes,
} = require("./ontologyService");

const { CURRENT_STEP, ROUTE_NUMBER } = require("../data/constants");

/**
 * ==========================================================
 * Post Booking Service
 * ==========================================================
 *
 * 역할
 * ----------------------------------------------------------
 * 숙소(또는 출발지) 입력 이후
 * 동행자 유형만 수집한다.
 *
 * 동행자 유형
 * ↓
 * Ontology
 * ↓
 * Theme Mapping
 * ==========================================================
 */

/**
 * facts 병합
 */
function mergePostBookingFacts(oldFacts = {}, newFacts = {}) {

    return {
        ...oldFacts,

        companion_type:
            newFacts.companion_type ??
            oldFacts.companion_type ??
            null,

        themes:
            newFacts.themes?.length
                ? newFacts.themes
                : oldFacts.themes || [],
    };
}

/**
 * 다음 단계 결정
 */
function decidePostBookingStep(facts) {

    /**
     * 아직 동행자가 없으면 질문
     */
    if (!facts.companion_type) {

        return {

            route_number:
                ROUTE_NUMBER.POST_BOOKING,

            current_step:
                CURRENT_STEP.ASK_COMPANION_TYPE,

            last_question_field:
                "companion_type",

            reply:
                "누구와 함께 여행하시나요?\n(혼자, 연인, 친구, 가족, 부모님, 아이동반)",
        };
    }

    /**
     * 모두 수집 완료
     */
    return {

        route_number:
            ROUTE_NUMBER.RECOMMENDATION,

        current_step:
            CURRENT_STEP.READY_FOR_RECOMMENDATION,

        last_question_field:
            null,

        reply:
            buildFinalConfirmReply(facts),
    };
}

/**
 * 추천 전 최종 확인
 */
function buildFinalConfirmReply(facts) {

    const locationText =
        facts.trip_type === "당일치기"
            ? `출발지는 ${facts.start_location?.name}`
            : `숙소는 ${facts.accommodation?.name}`;

    return (
        `${facts.companion_type}과 함께 ` +
        `${facts.region} ${facts.period} 여행을 계획하고 계시는군요.\n\n` +
        `${locationText}로 확인했습니다.\n\n` +
        `동행자 유형을 기반으로 맞춤 관광지를 추천해드릴게요.`
    );
}

/**
 * 동행자 수집
 */
async function collectPostBookingFacts({

    userMessage,
    facts,

}) {

    const text = String(userMessage || "");

    /**
     * 온톨로지 우선
     */
    const ontologyCompanion =
        normalizeCompanionType(text);

    /**
     * LLM 보조
     */
    const userPrompt = `
현재 facts

${JSON.stringify(facts, null, 2)}

사용자 입력

${text}
`;

    const llmResult =
        await callLLMJson(
            postBookingPrompt,
            userPrompt
        );

    const llmFacts =
        llmResult?.facts || {};

    const companionType =
        ontologyCompanion ||
        normalizeCompanionType(
            llmFacts.companion_type
        ) ||
        facts.companion_type ||
        null;

    const mergedFacts =
        mergePostBookingFacts(
            facts,
            {

                companion_type:
                    companionType,

                themes:
                    companionType
                        ? mapCompanionToThemes(
                            companionType
                        )
                        : facts.themes,

            }
        );

    const step =
        decidePostBookingStep(
            mergedFacts
        );

    return {

        facts:
            mergedFacts,

        route_number:
            step.route_number,

        current_step:
            step.current_step,

        last_question_field:
            step.last_question_field,

        reply:
            llmResult?.reply ||
            step.reply,

    };
}

module.exports = {

    mergePostBookingFacts,

    decidePostBookingStep,

    buildFinalConfirmReply,

    collectPostBookingFacts,

};