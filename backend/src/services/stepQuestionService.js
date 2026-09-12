const { CURRENT_STEP } = require("../data/constants");
const { t } = require("./messageService");
const { buildPeriodQuestion } = require("./travelIntentService");
const {
    buildServiceTypePrompt,
    buildServiceTypeOptions,
} = require("./serviceTypeService");

/**
 * ==========================================================
 * Step Question Service
 * ==========================================================
 *
 * 지금 단계에서 사용자에게 하고 있던 질문을 다시 만든다.
 *
 * 답변을 만들지 못했을 때 오류 문구를 보여주면 대화가 거기서 끊긴다.
 * 그 대신 묻고 있던 것을 다시 물어 대화를 이어간다.
 * ==========================================================
 */

function buildStepQuestion(currentStep, facts = {}) {
    const language = facts.language || "ko";

    const questions = {
        [CURRENT_STEP.ASK_SERVICE_TYPE]: () => buildServiceTypePrompt(language),
        [CURRENT_STEP.ASK_REGION]: () => t("region.askForAccommodation", {}, language),
        [CURRENT_STEP.ASK_ATTRACTION_REGION]: () => t("region.askForAttraction", {}, language),
        [CURRENT_STEP.ASK_PERIOD]: () => buildPeriodQuestion(facts),
        [CURRENT_STEP.ASK_ACCOMMODATION]: () => t("accommodation.ask", {}, language),
        [CURRENT_STEP.ASK_START_LOCATION]: () => t("departure.ask", {}, language),
        [CURRENT_STEP.ASK_COMPANION_TYPE]: () => t("companion.ask", {}, language),
        [CURRENT_STEP.ASK_ROUTE_DAYS]: () => t("routeOnly.askDays", {}, language),
        [CURRENT_STEP.ASK_ROUTE_ATTRACTIONS]: () => t("routeOnly.askAttractions", {}, language),
        [CURRENT_STEP.RECOMMENDATION_SHOWN]: () => t("selection.askAgain", {}, language),
        [CURRENT_STEP.ASK_MORE_RECOMMENDATION]: () => t("selection.askMoreUnclear", {}, language),
    };

    return questions[currentStep]?.() || null;
}

/**
 * 답변을 만들지 못했을 때 돌려줄 응답
 *
 * 묻고 있던 질문을 알면 그 질문을 다시 하고,
 * 모르면 한 번만 다시 말해달라고 한다.
 */
function buildRetryResult(currentStep, facts = {}) {
    const language = facts.language || "ko";
    const question = buildStepQuestion(currentStep, facts);

    if (!question) {
        return {
            reply: t("error.retryGeneric", {}, language),
            currentStep: currentStep || CURRENT_STEP.ASK_SERVICE_TYPE,
            facts,
        };
    }

    return {
        reply: `${t("error.retry", {}, language)}\n\n${question}`,
        currentStep,
        facts,
        ...(currentStep === CURRENT_STEP.ASK_SERVICE_TYPE
            ? { quickReplies: buildServiceTypeOptions(language) }
            : {}),
    };
}

module.exports = {
    buildStepQuestion,
    buildRetryResult,
};
