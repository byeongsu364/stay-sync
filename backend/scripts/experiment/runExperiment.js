/**
 * ==========================================================
 * Stay Sync 구성 요소 비교 실험
 * 온톨로지 × REG × LEG = 8개 구성 × 질의 30개 × 상황 3개 × 반복 5회 = 3,600회
 * ==========================================================
 * 실행: backend 폴더에서  node scripts/experiment/runExperiment.js
 * 옵션: --configs C1,C8   --limit 3 (질의 앞 3개만, 시험용)   --repeats 5   --concurrency 4
 * 결과: scripts/experiment/results/raw.jsonl (중간에 멈춰도 다시 실행하면 이어서 진행)
 *
 * 모든 구성이 같은 후보 풀(시·군별 여행 월 검색량 상위 60곳)과 같은 TourAPI 근거를 쓴다.
 * - 온톨로지 켬: 질의에서 동행자 유형·테마를 매핑해 쓴다(REG가 켜져 있으면 테마 규칙 R5에도 사용).
 * - REG 켬: 실내 규칙(R1~R4)·테마 규칙(R5)·대체 규칙(R7)으로 후보를 코드에서 먼저 거르고, 확정 후보만 LLM에 준다.
 *           REG 끔: 후보 풀 전체를 근거와 함께 주고 LLM이 고른다.
 * - LEG 켬: 시스템 프롬프트에 추천 단계 규칙을 넣는다. 끔: 역할과 출력 형식만 준다.
 * ==========================================================
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const QUERIES = require("./queries");
const { CONDITIONS, TRAVEL_DATE } = require("./conditions");
const { CONFIGS, CONFIG_BY_ID } = require("./configs");
const { RESULT_DIR, ontologyFacts, situationFacts, situationText, appendJsonl, readJsonl } = require("./common");
const { chatText } = require("./openai");
const { parseLLMJson } = require("../../src/utils/jsonUtils");
const { findPopularAttractions } = require("../../src/repositories/attractionRepository");
const { getTourDetail } = require("../../src/services/tourApiService");
const { prisma } = require("../../src/config/db");

const TRAVEL_MONTH = Number(TRAVEL_DATE.slice(5, 7));
const POOL_SIZE = 60;
const TOP_N = 5;
const LLM_TIMEOUT = 90000;

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : fallback;
};
const RUN_CONFIGS = argValue("configs", CONFIGS.map((c) => c.id).join(",")).split(",");
const LIMIT = Number(argValue("limit", QUERIES.length));
const REPEATS = Number(argValue("repeats", 5));
const CONCURRENCY = Number(argValue("concurrency", 4));

// ---------- 프롬프트 ----------
const FORMAT = `반드시 아래 JSON 형식만 출력한다.
{"recommendations":[{"name":"관광지명","reason":"추천 이유 1~2문장"}]}
관광지는 최대 ${TOP_N}곳을 추천한다.`;

const BASE_SYSTEM = `너는 경기 북부 관광지 추천 챗봇이다. 사용자의 요청과 여행 상황을 보고 관광지를 추천한다.\n${FORMAT}`;

// LEG: 추천 단계에 적용하는 시스템 프롬프트 규칙(논문 표 3의 근거 제한·상황 반영·형식 규칙을 추천 단계에 맞게 옮김)
const LEG_RULES = `
규칙:
1. 제공된 관광지 목록에 있는 관광지만 추천하고, 관광지명은 목록에 적힌 그대로 쓴다.
2. 사용자가 요청한 시·군 밖의 관광지는 추천하지 않는다.
3. '확정 후보'가 주어지면 그 후보만 그 순서대로 사용하고, 후보를 빼거나 더하지 않는다.
4. 추천 이유는 제공된 근거(개요, 테마, 실내·실외 구분)와 상황 정보만 사용한다. 근거에 없는 운영시간, 요금, 시설, 체험, 거리 수치를 만들어 내지 않는다.
5. 날씨나 미세먼지 때문에 고려한 점이 있으면 추천 이유에 밝힌다.
6. 정해진 JSON 형식 외의 문장은 출력하지 않는다.`;

const ioLabel = (v) => (v === "실내" ? "실내" : v === "실외" ? "실외" : "미분류");
const evidenceLine = (p, len) => `- ${p.name} | 테마: ${p.theme || "-"} | ${ioLabel(p.indoorOutdoor)} | ${p.address} | 개요: ${String(p.description || "없음").replace(/\s+/g, " ").slice(0, len)}`;

// ---------- 후보 풀(모든 구성 공통 근거) ----------
const POOL_FILE = path.join(RESULT_DIR, "pool.json");
async function loadPools() {
    if (fs.existsSync(POOL_FILE)) return JSON.parse(fs.readFileSync(POOL_FILE, "utf8"));
    const pools = {};
    for (const region of [...new Set(QUERIES.map((q) => q.region))]) {
        const rows = await findPopularAttractions({ region, themes: [], offset: 0, limit: POOL_SIZE, travelMonth: TRAVEL_MONTH });
        pools[region] = [];
        for (const row of rows) {
            let description = null;
            try { description = (await getTourDetail(row.contentId))?.description || null; } catch (e) { /* 한도 초과 등 */ }
            pools[region].push({
                id: row.id, name: row.title, region: row.region,
                address: [row.address1, row.address2].filter(Boolean).join(" "),
                theme: row.middleCategory, indoorOutdoor: row.indoorOutdoor, description,
            });
        }
        console.log(`[pool] ${region} ${pools[region].length}곳`);
    }
    fs.writeFileSync(POOL_FILE, JSON.stringify(pools));
    return pools;
}

/**
 * REG: 서비스와 같은 규칙을 공통 후보 풀에 적용한다.
 * 실내 필요 판정은 서비스의 임계값 함수(situationFacts)를 그대로 쓰고, 풀은 이미 트렌드 점수 순이다.
 */
function applyReg(pool, situation, themes) {
    const themeOk = (p) => themes.length === 0 || themes.includes(p.theme);
    let candidates = pool.filter((p) => (!situation.indoorRequired || p.indoorOutdoor === "실내") && themeOk(p));
    let fallback = false;
    if (candidates.length === 0 && situation.indoorRequired) {
        candidates = pool.filter(themeOk); // R7: 실내 후보가 없으면 실내 조건을 풀어 보충
        fallback = true;
    }
    return { candidates: candidates.slice(0, TOP_N), fallback };
}

async function runConfig(config, query, condition, situation, pools) {
    const pool = pools[query.region];
    const facts = config.o ? ontologyFacts(query) : null;
    const parts = [situationText(query, condition, situation)];
    if (facts) parts.push(`사용자 조건(온톨로지 매핑): 동행자 유형 ${facts.companion || "미상"}, 추천 테마 ${facts.themes.join(", ") || "제한 없음"}`);
    const meta = {};
    if (config.r) {
        const { candidates, fallback } = applyReg(pool, situation, facts ? facts.themes : []);
        meta.regCandidates = candidates.map((c) => c.name);
        meta.regFallback = fallback;
        parts.push(`확정 후보(규칙 엔진 결과, ${candidates.length}곳):\n${candidates.map((p) => evidenceLine(p, 300)).join("\n")}`);
    } else {
        parts.push(`${query.region} 관광지 목록(근거):\n${pool.map((p) => evidenceLine(p, 120)).join("\n")}`);
    }
    parts.push(`사용자 요청: ${query.text}`);
    const system = config.l ? `${BASE_SYSTEM}\n${LEG_RULES}` : BASE_SYSTEM;
    const raw = await chatText(system, parts.join("\n\n"), LLM_TIMEOUT);
    const json = parseLLMJson(raw) || {};
    const recs = Array.isArray(json.recommendations) ? json.recommendations : [];
    return {
        names: recs.map((r) => String(r.name || "").trim()).filter(Boolean).slice(0, TOP_N),
        text: recs.length ? recs.map((r, i) => `${i + 1}. ${r.name}: ${r.reason || ""}`).join("\n") : String(raw || ""),
        meta: { ...meta, parsed: recs.length > 0 },
    };
}

async function main() {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("backend/.env에 OPENAI_API_KEY=... 를 추가해 주세요.");
    }
    const pools = await loadPools();
    const done = new Set(readJsonl("raw.jsonl").filter((r) => !r.error).map((r) => `${r.model}|${r.queryId}|${r.conditionId}|${r.run}`));
    const jobs = [];
    // 반복 회차를 바깥에 두어, 같은 질문이 시간 간격을 두고 다시 들어가게 한다.
    for (let run = 1; run <= REPEATS; run += 1) {
        for (const query of QUERIES.slice(0, LIMIT)) {
            for (const condition of CONDITIONS) {
                for (const id of RUN_CONFIGS) {
                    if (!done.has(`${id}|${query.id}|${condition.id}|${run}`)) jobs.push({ config: CONFIG_BY_ID[id], query, condition, run });
                }
            }
        }
    }
    console.log(`실행할 작업 ${jobs.length}개 (완료 ${done.size}개 건너뜀)`);

    let finished = 0;
    async function worker() {
        while (jobs.length) {
            const { config, query, condition, run } = jobs.shift();
            const situation = situationFacts(condition);
            const started = Date.now();
            try {
                const out = await runConfig(config, query, condition, situation, pools);
                appendJsonl("raw.jsonl", {
                    model: config.id, queryId: query.id, conditionId: condition.id, run, region: query.region,
                    latencyMs: Date.now() - started, names: out.names, text: out.text, meta: out.meta,
                });
            } catch (error) {
                appendJsonl("raw.jsonl", { model: config.id, queryId: query.id, conditionId: condition.id, run, error: error.message });
                console.warn(`[실패] ${config.id} ${query.id} ${condition.id} ${run}회차: ${error.message}`);
            }
            finished += 1;
            if (finished % 50 === 0) console.log(`진행 ${finished}`);
        }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    console.log("완료. 다음: node scripts/experiment/scoreExperiment.js");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
