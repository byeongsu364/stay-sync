const postBookingPrompt = require("../prompts/postBookingPrompt");
const { callLLMJson } = require("./llmService");
const {
    normalizeCompanionType,
    mapCompanionToThemes,
    mergeThemes,
} = require("./ontologyService");

const { CURRENT_STEP, ROUTE_NUMBER } = require("../data/constants");
const companionOntology = require("../ontology/companionOntology");

// 목적지/기간을 말할 때 함께 제공한 명시적인 동행자 정보도 수집한다.
// 장소 이름 속의 '가족', '형' 등을 동행자로 읽지 않도록 관계 표현을 확인한다.
function captureCompanionFacts(userMessage, facts = {}) {
    const text = String(userMessage || "").normalize("NFC");
    if (/말고|아니|않|취소/.test(text)) return facts;
    const compact = text.replace(/\s/g, "");
    const expressions = Object.values(companionOntology).flat().filter((keyword) => {
        if (compact === keyword.replace(/\s/g, "")) return true;
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const ending = keyword.startsWith("혼자") || keyword === "혼행" || keyword === "나홀로"
            ? "(?=$|[^가-힣a-z0-9])"
            : "(?:들)?(?:이랑|랑|하고|와|과|동반|\\s+함께|\\s+여행)";
        return new RegExp(`(?:^|[^가-힣a-z0-9])${escaped}${ending}`, "i").test(text);
    });
    const companionType = normalizeCompanionType(expressions.join(" "));
    if (!companionType) return facts;
    return {
        ...facts,
        companion_type: companionType,
        themes: mergeThemes(facts.interest_themes || [], mapCompanionToThemes(companionType)),
    };
}

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

    let llmResult = null;

    // 명시적인 온톨로지 표현이면 결과가 결정적이므로 LLM 호출이 필요 없다.
    // 온톨로지에서 찾지 못한 자연어만 LLM이 보조하며, 실패해도 질문 단계로 복구한다.
    if (!ontologyCompanion) {
        try {
            llmResult = await callLLMJson(
                postBookingPrompt,
                userPrompt
            );
        } catch (error) {
            console.warn("동행자 LLM 분류 실패, 동행자 입력을 다시 요청합니다.");
        }
    }

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
                        ? mergeThemes(
                            facts.interest_themes || [],
                            mapCompanionToThemes(companionType),
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

        reply: step.reply,

    };
}

module.exports = {

    captureCompanionFacts,

    mergePostBookingFacts,

    decidePostBookingStep,

    buildFinalConfirmReply,

    collectPostBookingFacts,

};
