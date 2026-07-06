const correctionOntology = require("../ontology/correctionOntology");
const companionOntology = require("../ontology/companionOntology");
const themeOntology = require("../ontology/themeOntology");
const weatherOntology = require("../ontology/weatherOntology");
const dustOntology = require("../ontology/dustOntology");

/**
 * ==========================================================
 * Ontology Service
 * ==========================================================
 *
 * 역할:
 * - 자연어 표현을 시스템에서 사용하는 표준 값으로 매핑
 * - LLM의 자유로운 추론을 줄이고, 정해진 온톨로지 기준으로 facts를 정규화
 *
 * 핵심:
 * - LLM은 intent만 판단
 * - correction target, companion type, theme 등은 ontology 기반으로 결정
 * ==========================================================
 */

function includesKeyword(text, keywords = []) {
    const normalizedText = String(text || "").replace(/\s/g, "");

    return keywords.some((keyword) => {
        const normalizedKeyword = String(keyword).replace(/\s/g, "");
        return normalizedText.includes(normalizedKeyword);
    });
}

/**
 * 수정 대상 fact 탐지
 *
 * 예:
 * "다산호텔 아닌데?" → accommodation
 * "하루 더 가는데?" → period
 * "친구 아니고 가족이야" → companion_type
 */
function detectCorrectionTarget(text) {
    for (const [target, keywords] of Object.entries(correctionOntology)) {
        if (includesKeyword(text, keywords)) {
            return target;
        }
    }

    return null;
}

/**
 * 동행자 유형 정규화
 *
 * 예:
 * "여자친구랑" → 연인
 * "부모님이랑" → 부모님
 */
function normalizeCompanionType(text) {
    for (const [companionType, keywords] of Object.entries(companionOntology)) {
        if (includesKeyword(text, keywords)) {
            return companionType;
        }
    }

    return null;
}

/**
 * 동행자 유형 → 테마 매핑
 *
 * 예:
 * 연인 → 데이트, 야경, 카페, 자연
 */
function mapCompanionToThemes(companionType) {
    return themeOntology[companionType] || [];
}

/**
 * 날씨 상태 → 추천 환경 테마 매핑
 *
 * 예:
 * 비 → 실내, 박물관, 카페, 쇼핑몰
 */
function mapWeatherToThemes(weatherCondition) {
    return weatherOntology[weatherCondition] || [];
}

/**
 * 미세먼지 상태 → 추천 환경 테마 매핑
 *
 * 예:
 * 나쁨 → 실내, 카페, 박물관, 쇼핑몰
 */
function mapDustToThemes(dustCondition) {
    return dustOntology[dustCondition] || [];
}

/**
 * 중복 제거 후 테마 병합
 */
function mergeThemes(...themeGroups) {
    const merged = themeGroups.flat().filter(Boolean);
    return [...new Set(merged)];
}

module.exports = {
    includesKeyword,
    detectCorrectionTarget,
    normalizeCompanionType,
    mapCompanionToThemes,
    mapWeatherToThemes,
    mapDustToThemes,
    mergeThemes,
};