/**
 * ==========================================================
 * Stay Sync 비교 실험 채점
 * ==========================================================
 * 실행: backend 폴더에서  node scripts/experiment/scoreExperiment.js
 * 입력: results/raw.jsonl     출력: results/scored.jsonl, summary.md, table6.csv, table7.csv, review.csv
 *
 * 1) 정확도: 추천 관광지가 DB에 있고, 요청한 시·군이며, 실내 규칙(R1~R4)과 테마 규칙(R5)을 모두 만족하는 비율
 * 2) 일관성: 같은 질문을 반복했을 때 추천 목록이 얼마나 같은지(쌍별 자카드 유사도 평균, 완전 일치율)
 * 3) 환각률(보조): 데이터에 없는 관광지 또는 LLM 평가자가 찾은 근거 없는 사실이 있는 응답 비율(1회차만 평가)
 * ==========================================================
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const QUERIES = require("./queries");
const { CONDITIONS } = require("./conditions");
const { RESULT_DIR, ontologyFacts, situationFacts, situationText, appendJsonl, readJsonl } = require("./common");
const { chatJson } = require("./openai");
const { CONFIGS, CONFIG_BY_ID } = require("./configs");
const { searchAttractionsByName } = require("../../src/repositories/attractionRepository");
const { getTourDetail } = require("../../src/services/tourApiService");
const { prisma } = require("../../src/config/db");

const JUDGE_MODEL = process.env.JUDGE_MODEL || process.env.OPENAI_MODEL || "gpt-5.4-mini";
// 비용을 줄이려고 근거 없는 사실 판정은 1회차 응답에만 한다. 전체를 보려면 JUDGE_ALL_RUNS=1
const JUDGE_ALL = process.env.JUDGE_ALL_RUNS === "1";
// LLM 평가자 판정은 신뢰도가 낮아 기본으로 끈다. 참고용으로 보려면 USE_JUDGE=1
const USE_JUDGE = process.env.USE_JUDGE === "1";
const POOLS = JSON.parse(fs.readFileSync(path.join(RESULT_DIR, "pool.json"), "utf8"));
const norm = (v) => String(v || "").normalize("NFC").toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
const MODELS = CONFIGS.map((c) => c.id);
const queryById = Object.fromEntries(QUERIES.map((q) => [q.id, q]));
const conditionById = Object.fromEntries(CONDITIONS.map((c) => [c.id, c]));

const matchCache = new Map();
async function matchAttraction(name, region) {
    const key = `${region}|${name}`;
    if (matchCache.has(key)) return matchCache.get(key);
    let found = await searchAttractionsByName({ name, limit: 8, mentionedInText: true });
    if (!found.length) found = await searchAttractionsByName({ name, limit: 8 });
    // 같은 시·군 우선, 그다음 긴 이름(더 구체적으로 일치)
    found.sort((a, b) => (b.region === region) - (a.region === region) || b.title.length - a.title.length);
    let match = null;
    if (found[0]) {
        const row = await prisma.attraction.findUnique({
            where: { id: found[0].id },
            select: { id: true, contentId: true, title: true, region: true, address1: true, indoorOutdoor: true },
        });
        let description = null;
        try { description = (await getTourDetail(row.contentId))?.description || null; } catch (e) { /* 무시 */ }
        match = { ...row, theme: found[0].theme, description };
    }
    matchCache.set(key, match);
    return match;
}

const JUDGE_SYSTEM = "너는 관광지 추천 응답에서 사실 오류만 골라내는 엄격한 평가자다. 감상이나 추천 이유는 판정하지 않는다. 반드시 JSON만 출력한다.";
const FACT_TYPES = ["운영정보", "요금", "시설·프로그램", "거리·시간 수치", "행사", "위치·주소", "실내외"];
function judgePrompt(query, condition, situation, row, matched) {
    const evidence = matched.map((m) => `- ${m.title} | ${m.region} | 주소: ${m.address1} | 테마: ${m.theme || "-"} | ${m.indoorOutdoor || "미분류"}\n  개요: ${String(m.description || "(개요 없음)").slice(0, 900)}`).join("\n");
    return `[사용자 요청]\n${query.text}\n\n[상황 정보]\n${situationText(query, condition, situation)}\n\n[근거 자료]\n${evidence || "(없음)"}\n\n[평가할 응답]\n${row.text}\n\n`
        + "[지시]\n응답에서 근거 자료로 확인할 수 없는 '구체적 사실 주장'만 찾아라. 구체적 사실 주장은 다음 유형뿐이다.\n"
        + "- 운영정보: 운영 시간, 휴무, 계절 운영 여부\n- 요금: 입장료, 체험 비용\n- 시설·프로그램: 근거에 없는 특정 시설·체험·공연·식당·카페·영화관 등의 존재\n"
        + "- 거리·시간 수치: 이동 시간, 거리, 소요 시간 숫자\n- 행사: 축제, 공연 일정\n- 위치·주소: 근거와 다른 위치·주소\n- 실내외: 근거의 실내·실외 구분과 반대되는 서술\n"
        + "다음은 절대 주장으로 세지 않는다: 분위기·풍경·감성 평가(예: 로맨틱하다, 사진 찍기 좋다, 산책하기 좋다), 대상 적합성(데이트·아이·부모님과 가기 좋다), 사용자 요청이나 상황 정보를 되풀이한 말(1박 2일, 비 예보, 미세먼지 나쁨), 일반 상식 수준의 설명(수목원에 정원이 있다), 근거 자료에 없는 관광지에 대한 서술.\n"
        + "근거 개요에 해당 내용이 있으면 표현이 달라도 근거가 있는 것으로 본다. 애매하면 주장으로 세지 않는다.\n"
        + '출력 형식: {"claims": [{"text": "응답 원문 일부", "type": "운영정보|요금|시설·프로그램|거리·시간 수치|행사|위치·주소|실내외"}]}  없으면 {"claims": []}';
}

async function scoreRow(row) {
    const query = queryById[row.queryId];
    const condition = conditionById[row.conditionId];
    const situation = situationFacts(condition);
    const { themes } = ontologyFacts(query);
    const items = [];
    const provided = (row.meta?.regCandidates || (POOLS[query.region] || []).map((p) => p.name)).map(norm);
    for (const name of row.names) {
        const m = await matchAttraction(name, query.region);
        const n = norm(name);
        const inList = provided.some((p) => p && (p === n || p.includes(n) || n.includes(p)));
        const exists = Boolean(m);
        const regionOk = exists && m.region === query.region;
        const indoorOk = !situation.indoorRequired || (exists && m.indoorOutdoor === "실내");
        const themeOk = themes.length === 0 || (exists && themes.includes(m.theme));
        items.push({
            name, key: m ? `id:${m.id}` : `name:${String(name).replace(/[^0-9a-zA-Z가-힣]/g, "").toLowerCase()}`,
            matched: m?.title || null, region: m?.region || null, theme: m?.theme || null,
            indoorOutdoor: m?.indoorOutdoor || null, exists, regionOk, indoorOk, themeOk,
            correct: exists && regionOk && indoorOk && themeOk, inList,
        });
    }
    const matched = [];
    for (const it of items.filter((i) => i.exists)) matched.push(await matchAttraction(it.name, query.region));
    let judge = { unsupported: null, claims: [], skipped: true };
    if (USE_JUDGE && (JUDGE_ALL || row.run === 1)) {
        try {
            const out = await chatJson(JUDGE_MODEL, JUDGE_SYSTEM, judgePrompt(query, condition, situation, row, matched));
            const claims = (Array.isArray(out.claims) ? out.claims : []).filter((c) => FACT_TYPES.includes(c?.type));
            judge = { unsupported: claims.length > 0, claims: claims.map((c) => `[${c.type}] ${c.text}`) };
        } catch (error) {
            judge = { unsupported: null, claims: [], error: error.message };
        }
    }
    const nonexistent = items.filter((i) => !i.exists).map((i) => i.name);
    return {
        model: row.model, queryId: row.queryId, conditionId: row.conditionId, run: row.run, latencyMs: row.latencyMs,
        indoorRequired: situation.indoorRequired, themes, items, nonexistent,
        judged: !judge.skipped, judgeUnsupported: judge.unsupported, judgeClaims: judge.claims || [], judgeError: judge.error || null,
        outOfList: items.filter((i) => !i.inList).map((i) => i.name),
        hallucinated: nonexistent.length > 0 || items.some((i) => !i.inList) || (USE_JUDGE && judge.unsupported === true),
        meta: row.meta,
    };
}

const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) : "-");
const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

function jaccard(a, b) {
    const A = new Set(a); const B = new Set(b);
    const inter = [...A].filter((x) => B.has(x)).length;
    const union = new Set([...A, ...B]).size;
    return union ? inter / union : 1;
}

/** 같은 모델·질의·상황의 반복 응답끼리 비교한 일관성 */
function consistency(rows) {
    const groups = {};
    for (const r of rows) (groups[`${r.queryId}|${r.conditionId}`] ||= []).push(r.items.map((i) => i.key));
    const perCase = Object.values(groups).filter((g) => g.length >= 2).map((runs) => {
        const sims = [];
        for (let i = 0; i < runs.length; i += 1) for (let j = i + 1; j < runs.length; j += 1) sims.push(jaccard(runs[i], runs[j]));
        const first = [...new Set(runs[0])].sort().join(",");
        return {
            jaccard: sims.reduce((a, x) => a + x, 0) / sims.length,
            identical: runs.every((r) => [...new Set(r)].sort().join(",") === first),
        };
    });
    if (!perCase.length) return { jaccard: "-", identical: "-", cases: 0 };
    return {
        jaccard: (perCase.reduce((a, c) => a + c.jaccard, 0) / perCase.length).toFixed(3),
        identical: pct(perCase.filter((c) => c.identical).length, perCase.length),
        cases: perCase.length,
    };
}

function aggregate(scored) {
    const rows = {};
    for (const model of MODELS) {
        const s = scored.filter((r) => r.model === model);
        if (!s.length) continue;
        const items = s.flatMap((r) => r.items);
        const judged = s.filter((r) => r.judged);
        const byCond = {};
        for (const c of CONDITIONS) {
            const sc = s.filter((r) => r.conditionId === c.id);
            const ci = sc.flatMap((r) => r.items);
            byCond[c.id] = { accuracy: pct(ci.filter((i) => i.correct).length, ci.length), consistency: consistency(sc).jaccard };
        }
        rows[model] = {
            responses: s.length,
            runs: Math.max(...s.map((r) => r.run || 1)),
            avgItems: (items.length / s.length).toFixed(2),
            accuracy: pct(items.filter((i) => i.correct).length, items.length),
            ...Object.fromEntries(Object.entries(consistency(s)).map(([k, v]) => [`cons_${k}`, v])),
            indoorOk: pct(s.filter((r) => r.indoorRequired).flatMap((r) => r.items).filter((i) => i.indoorOk).length,
                s.filter((r) => r.indoorRequired).flatMap((r) => r.items).length),
            themeOk: pct(items.filter((i) => i.themeOk).length, items.length),
            regionOk: pct(items.filter((i) => i.regionOk).length, items.length),
            nonexistent: pct(items.filter((i) => !i.exists).length, items.length),
            hallucination: pct(s.filter((r) => r.hallucinated).length, s.length),
            outOfListItems: pct(items.filter((i) => !i.inList).length, items.length),
            latency: (s.reduce((a, r) => a + r.latencyMs, 0) / s.length / 1000).toFixed(2),
            byCond,
            regFallback: s.filter((r) => r.meta?.regFallback).length,
            parseFailed: s.filter((r) => r.meta && r.meta.parsed === false).length,
            judgeErrors: s.filter((r) => r.judgeError).length,
        };
    }
    return rows;
}

function mainEffects(agg) {
    const num = (v) => (v === "-" ? NaN : Number(v));
    const mean = (xs) => xs.reduce((a, x) => a + x, 0) / xs.length;
    const fmt = (v, d) => (Number.isFinite(v) ? (v >= 0 ? "+" : "") + v.toFixed(d) : "-");
    return [["o", "온톨로지"], ["r", "REG"], ["l", "LEG"]].map(([k, name]) => {
        const on = CONFIGS.filter((c) => c[k] && agg[c.id]).map((c) => agg[c.id]);
        const off = CONFIGS.filter((c) => !c[k] && agg[c.id]).map((c) => agg[c.id]);
        if (!on.length || !off.length) return `| ${name} | - | - | - | - |`;
        const d = (f) => mean(on.map((a) => num(a[f]))) - mean(off.map((a) => num(a[f])));
        return `| ${name} | ${fmt(d("accuracy"), 1)} | ${fmt(d("cons_jaccard"), 3)} | ${fmt(d("hallucination"), 1)} | ${fmt(d("latency"), 2)} |`;
    });
}

function writeOutputs(scored) {
    const agg = aggregate(scored);
    const label = (m) => `${m} ${CONFIG_BY_ID[m].label}`;
    const t6 = ["모델,정확도(%),일관성(자카드),완전 일치율(%),환각률(%),평균 응답 시간(초)"]
        .concat(Object.entries(agg).map(([m, a]) => `${label(m)},${a.accuracy},${a.cons_jaccard},${a.cons_identical},${a.hallucination},${a.latency}`));
    const t7 = ["모델,정확도-맑음,정확도-강수,정확도-미세먼지 나쁨,일관성-맑음,일관성-강수,일관성-미세먼지 나쁨"]
        .concat(Object.entries(agg).map(([m, a]) => `${label(m)},${a.byCond.clear.accuracy},${a.byCond.rain.accuracy},${a.byCond.dust.accuracy},${a.byCond.clear.consistency},${a.byCond.rain.consistency},${a.byCond.dust.consistency}`));
    fs.writeFileSync(path.join(RESULT_DIR, "table6.csv"), `\ufeff${t6.join("\n")}\n`);
    fs.writeFileSync(path.join(RESULT_DIR, "table7.csv"), `\ufeff${t7.join("\n")}\n`);

    const md = [
        `# 실험 결과 요약 (평가자 모델: ${JUDGE_MODEL})`, "",
        "| 모델 | 응답 수 | 반복 | 평균 추천 수 | 정확도(%) | 일관성(자카드) | 완전 일치율(%) | 실내 규칙 | 테마 일치 | 지역 일치 | 데이터에 없는 관광지 | 목록 이탈 관광지 | 환각률(응답) | 응답 시간(초) |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
        ...Object.entries(agg).map(([m, a]) => `| ${label(m)} | ${a.responses} | ${a.runs} | ${a.avgItems} | ${a.accuracy} | ${a.cons_jaccard} | ${a.cons_identical} | ${a.indoorOk} | ${a.themeOk} | ${a.regionOk} | ${a.nonexistent} | ${a.outOfListItems} | ${a.hallucination} | ${a.latency} |`),
        "", "| 모델 | 정확도 맑음 | 정확도 강수 | 정확도 미세먼지 | 일관성 맑음 | 일관성 강수 | 일관성 미세먼지 |", "|---|---|---|---|---|---|---|",
        ...Object.entries(agg).map(([m, a]) => `| ${label(m)} | ${a.byCond.clear.accuracy} | ${a.byCond.rain.accuracy} | ${a.byCond.dust.accuracy} | ${a.byCond.clear.consistency} | ${a.byCond.rain.consistency} | ${a.byCond.dust.consistency} |`),
        "", "## 모듈별 주효과 (해당 모듈이 있는 4개 구성 평균 − 없는 4개 구성 평균)", "",
        "| 모듈 | 정확도(%p) | 일관성(자카드) | 환각률(%p) | 응답 시간(초) |", "|---|---|---|---|---|",
        ...mainEffects(agg),
        "", `REG 대체 규칙(R7) 적용: ${Object.values(agg).reduce((a, x) => a + x.regFallback, 0)}회, JSON 해석 실패: ${Object.values(agg).reduce((a, x) => a + x.parseFailed, 0)}회`,
        `평가자 호출 실패: ${Object.values(agg).reduce((a, x) => a + x.judgeErrors, 0)}회`,
    ];
    fs.writeFileSync(path.join(RESULT_DIR, "summary.md"), `${md.join("\n")}\n`);

    const review = [["모델", "질의", "상황", "회차", "데이터에 없는 관광지", "근거 없는 주장", "추천 관광지(대조 결과)"].map(csvCell).join(",")]
        .concat(scored.map((r) => [
            r.model, r.queryId, r.conditionId, r.run, r.nonexistent.join(" / "), [...(r.outOfList || []).map((n) => `[목록 이탈] ${n}`), ...(r.judgeClaims || [])].join(" / "),
            r.items.map((i) => `${i.name}→${i.matched || "없음"}(${i.region || "-"},${i.indoorOutdoor || "-"},${i.theme || "-"})`).join(" / "),
        ].map(csvCell).join(",")));
    fs.writeFileSync(path.join(RESULT_DIR, "review.csv"), `\ufeff${review.join("\n")}\n`);
    console.log(md.join("\n"));
}

async function main() {
    const raw = readJsonl("raw.jsonl").filter((r) => !r.error);
    const latest = new Map(raw.map((r) => [`${r.model}|${r.queryId}|${r.conditionId}|${r.run}`, r]));
    const scoredRows = readJsonl("scored.jsonl");
    const scoredKeys = new Set(scoredRows.map((r) => `${r.model}|${r.queryId}|${r.conditionId}|${r.run}`));
    const todo = [...latest.entries()].filter(([k]) => !scoredKeys.has(k)).map(([, r]) => r);
    console.log(`채점할 응답 ${todo.length}개 (이미 채점 ${scoredKeys.size}개)`);
    async function worker() {
        while (todo.length) {
            const row = todo.shift();
            const s = await scoreRow(row);
            appendJsonl("scored.jsonl", s);
            scoredRows.push(s);
        }
    }
    await Promise.all(Array.from({ length: 4 }, worker));
    writeOutputs(scoredRows);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
