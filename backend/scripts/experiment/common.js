/**
 * 실험 공통 함수: 온톨로지 조건 도출, REG 상황 판정, 상황 문장, 결과 파일 입출력
 */
const fs = require("fs");
const path = require("path");
const {
    normalizeCompanionType,
    mapCompanionToThemes,
    detectInterestThemes,
    mergeThemes,
} = require("../../src/services/ontologyService");
const { assessForecast } = require("../../src/services/weatherRecommendationService");
const { classifyPm10, classifyPm25, getWorstGrade } = require("../../src/services/airQualityService");

const RESULT_DIR = path.join(__dirname, "results");
fs.mkdirSync(RESULT_DIR, { recursive: true });

/** 질의 → 온톨로지 조건(동행자 유형, 테마) */
function ontologyFacts(query) {
    const companion = normalizeCompanionType(query.text);
    const themes = mergeThemes(detectInterestThemes(query.text), mapCompanionToThemes(companion));
    return { companion, themes };
}

/** 상황 조건 → REG 판정(실내 필요 여부와 이유). 서비스의 실제 임계값 함수를 그대로 쓴다. */
function situationFacts(condition) {
    const weather = assessForecast(condition.forecast);
    const pm10Grade = classifyPm10(condition.air.pm10);
    const pm25Grade = classifyPm25(condition.air.pm25);
    const airGrade = getWorstGrade(pm10Grade, pm25Grade);
    const airIndoor = airGrade === "나쁨" || airGrade === "매우나쁨";
    const reasons = [...weather.reasons, ...(airIndoor ? ["미세먼지"] : [])];
    return {
        weather,
        air: { ...condition.air, pm10Grade, pm25Grade, grade: airGrade },
        indoorRequired: weather.situation === "실내권장" || airIndoor,
        reasons,
    };
}

/** 모든 모델에 같은 문장으로 넣는 상황 정보 */
function situationText(query, condition, situation) {
    const f = condition.forecast;
    return [
        `여행 날짜: ${f.date}`,
        `출발지: ${query.originPoint.name}`,
        `날씨 예보: 강수확률 ${f.rainProb}%, 최저 ${f.minTemp}℃ / 최고 ${f.maxTemp}℃`,
        `미세먼지: PM10 ${condition.air.pm10}㎍/㎥(${situation.air.pm10Grade}), PM2.5 ${condition.air.pm25}㎍/㎥(${situation.air.pm25Grade})`,
    ].join("\n");
}

function appendJsonl(file, row) {
    fs.appendFileSync(path.join(RESULT_DIR, file), `${JSON.stringify(row)}\n`);
}

function readJsonl(file) {
    const full = path.join(RESULT_DIR, file);
    if (!fs.existsSync(full)) return [];
    return fs.readFileSync(full, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

module.exports = { RESULT_DIR, ontologyFacts, situationFacts, situationText, appendJsonl, readJsonl };
