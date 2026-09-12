const { test } = require("node:test");
const assert = require("node:assert/strict");

// 무엇이 잘못되든 오류 문구 대신 하던 질문을 다시 해야 한다.
const sessionService = require("../src/services/sessionService");
const { buildStepQuestion, buildRetryResult } = require("../src/services/stepQuestionService");
const { handleChat } = require("../src/services/chatService");

test("every step that asks something can rebuild its question", () => {
    const steps = [
        "ASK_SERVICE_TYPE", "ASK_REGION", "ASK_ATTRACTION_REGION", "ASK_PERIOD",
        "ASK_ACCOMMODATION", "ASK_START_LOCATION", "ASK_COMPANION_TYPE",
        "ASK_ROUTE_DAYS", "ASK_ROUTE_ATTRACTIONS", "RECOMMENDATION_SHOWN",
        "ASK_MORE_RECOMMENDATION",
    ];
    for (const step of steps) {
        for (const language of ["ko", "en"]) {
            const question = buildStepQuestion(step, { language });
            assert.ok(question, `${step} (${language})`);
            // 영어 대화에 한국어가 섞이면 안 된다.
            if (language === "en") assert.ok(!/[가-힣]/.test(question), `${step}: ${question}`);
        }
    }
});

test("a step that asks nothing falls back to a plain retry", () => {
    const result = buildRetryResult("ROUTE_OPTIMIZED", { language: "ko" });
    assert.match(result.reply, /다시 말씀해주시겠어요/);
    // 단계를 아예 모를 때도 응답은 만들어져야 한다.
    const unknown = buildRetryResult(null, { language: "en" });
    assert.match(unknown.reply, /Could you say that again/);
    assert.equal(unknown.currentStep, "ASK_SERVICE_TYPE");
});

test("the service type retry keeps its quick replies", () => {
    const result = buildRetryResult("ASK_SERVICE_TYPE", { language: "en" });
    assert.deepEqual(result.quickReplies.map(({ value }) => value), ["2", "3"]);
});

test("a failure mid-turn re-asks the current question instead of throwing", async () => {
    const cases = [
        ["ASK_ATTRACTION_REGION", "ko", "가평", /여행하고 싶은 지역이나 관심 있는 관광지/],
        ["ASK_ATTRACTION_REGION", "en", "Gapyeong", /Tell me a region you want to visit/],
        ["ASK_PERIOD", "ko", "내일 하루", /언제부터 언제까지 여행하시나요/],
        ["ASK_COMPANION_TYPE", "en", "my parents", /Who are you travelling with/],
    ];

    for (const [currentStep, language, message, expected] of cases) {
        const session = { currentStep, language, facts: {}, region: null, tripType: null };
        sessionService.loadSession = async () => session;
        sessionService.saveConversationState = async () => {
            throw new Error("저장이 실패하는 상황");
        };

        const result = await handleChat({ sessionId: "test", userMessage: message, requestId: "test" });
        assert.match(result.reply, expected, `${currentStep} (${language})`);
        // 같은 단계에 머물러 사용자가 바로 다시 답할 수 있어야 한다.
        assert.equal(result.currentStep, currentStep);
    }
});

test("a failure while loading the session still answers", async () => {
    sessionService.loadSession = async () => {
        throw new Error("세션을 읽지 못하는 상황");
    };
    const result = await handleChat({ sessionId: "test", userMessage: "안녕", requestId: "test" });
    assert.match(result.reply, /다시 말씀해주시겠어요/);
    assert.equal(result.currentStep, "ASK_SERVICE_TYPE");
});
