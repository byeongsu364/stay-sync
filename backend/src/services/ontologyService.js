const correctionOntology = require("../ontology/correctionOntology");
const companionOntology = require("../ontology/companionOntology");
const themeOntology = require("../ontology/themeOntology");
const interestOntology = require("../ontology/interestOntology");
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

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 온톨로지 키워드 대조
 *
 * 한국어는 조사가 붙어 나오므로 공백을 지운 문장에 substring으로 본다.
 * 영어는 낱말 경계를 확인한다. 'son'이 'person'에, 'ski'가 'skip'에 걸리면 안 된다.
 * 영어 키워드는 복수형 -s, -es까지 같은 말로 본다.
 */
function includesKeyword(text, keywords = []) {
    const value = String(text || "").normalize("NFC");
    const compact = value.replace(/\s/g, "");

    return keywords.some((keyword) => {
        const normalizedKeyword = String(keyword).normalize("NFC");
        if (!normalizedKeyword) return false;

        if (!/[a-z]/i.test(normalizedKeyword)) {
            return compact.includes(normalizedKeyword.replace(/\s/g, ""));
        }

        const pattern = escapeRegExp(normalizedKeyword.toLowerCase()).replace(/\s+/g, "\\s+");
        return new RegExp(`(?<![a-z0-9])${pattern}(?:es|s)?(?![a-z0-9])`, "i").test(value);
    });
}

// '내일부터 이틀간'처럼 필드 이름 없이 값만 말하는 정정도 많다.
// 온톨로지 키워드로 못 잡는 날짜·기간 표현을 여기서 알아본다.
const KOREAN_PERIOD_VALUE = new RegExp([
    "\\d+월\\d*일?",
    "\\d+일",
    "\\d+박",
    "\\d+주",
    "\\d+박\\d+일",
    "오늘|내일|모레|글피|주말|평일",
    "하루|이틀|사흘|나흘|닷새|엿새|이레|여드레|아흐레|열흘",
].join("|"));

// 영어는 낱말 사이 공백이 뜻을 가지므로 공백을 지우지 않은 원문에서 찾는다.
const ENGLISH_PERIOD_VALUE = new RegExp([
    "\\b(?:today|tonight|tomorrow|weekend|weekday)\\b",
    "\\bday\\s+after\\s+tomorrow\\b",
    "\\b\\d+\\s*(?:days?|nights?|weeks?)\\b",
    "\\b(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten)\\s+(?:days?|nights?|weeks?)\\b",
    "\\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\s*\\d{1,2}\\b",
    "\\b\\d{1,2}\\s*/\\s*\\d{1,2}\\b",
].join("|"), "i");

function mentionsPeriodValue(text) {
    const value = String(text || "");
    return KOREAN_PERIOD_VALUE.test(value.replace(/\s/g, ""))
        || ENGLISH_PERIOD_VALUE.test(value);
}

/**
 * 수정 대상 fact 탐지
 *
 * 예:
 * "다산호텔 아닌데?" → accommodation
 * "하루 더 가는데?" → period
 * "친구 아니고 가족이야" → companion_type
 * "아니다 내일부터 이틀간" → period
 */
function detectCorrectionTarget(text) {
    for (const [target, keywords] of Object.entries(correctionOntology)) {
        if (includesKeyword(text, keywords)) {
            return target;
        }
    }

    if (mentionsPeriodValue(text)) return "period";
    if (normalizeCompanionType(text)) return "companion_type";

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
    // 한 문장에 여러 관계가 등장하면 여행 제약이 더 구체적인 유형을 우선한다.
    // 예: "와이프랑 애들이랑"은 가족보다 아이동반을 우선한다.
    const companionPriority = [
        "아이동반",
        "부모님",
        "가족",
        "연인",
        "친구",
        "단체",
        "혼자",
    ];

    for (const companionType of companionPriority) {
        const keywords = companionOntology[companionType] || [];
        if (includesKeyword(text, keywords)) {
            return companionType;
        }
    }

    return null;
}

/**
 * 하고 싶은 활동 표현 → 관광 테마
 *
 * 예:
 * "가평 빠지를 가고싶어" → ["레저스포츠"]
 * "계곡이랑 박물관" → ["자연관광", "문화관광"]
 */
function detectInterestThemes(text) {
    return Object.entries(interestOntology)
        .filter(([, keywords]) => includesKeyword(text, keywords))
        .map(([theme]) => theme);
}

/**
 * 동행자 유형 → 테마 매핑
 *
 * 예:
 * 연인 → 문화관광, 레저스포츠, 쇼핑
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
    mentionsPeriodValue,
    detectCorrectionTarget,
    detectInterestThemes,
    normalizeCompanionType,
    mapCompanionToThemes,
    mapWeatherToThemes,
    mapDustToThemes,
    mergeThemes,
};
