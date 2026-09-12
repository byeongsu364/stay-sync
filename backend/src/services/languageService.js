const SUPPORTED_LANGUAGES = ["ko", "en"];
const DEFAULT_LANGUAGE = "ko";

/**
 * ==========================================================
 * Language Service
 * ==========================================================
 *
 * 역할
 * - 사용자 입력의 언어를 문자 종류로 판별한다.
 * - 판별할 근거가 없으면 세션에 저장된 언어를 이어 쓴다.
 *
 * 문자 종류로 판별하므로 LLM 호출이 필요 없고,
 * 모델 장애나 지연의 영향을 받지 않는다.
 * ==========================================================
 */

function normalizeLanguage(locale) {
    const language = String(locale || "").trim().toLowerCase().split(/[-_]/)[0];
    return SUPPORTED_LANGUAGES.includes(language) ? language : null;
}

function countScripts(text) {
    const value = String(text || "");
    return {
        hangul: (value.match(/[가-힣ㄱ-ㅎㅏ-ㅣ]/g) || []).length,
        latin: (value.match(/[A-Za-z]/g) || []).length,
    };
}

/**
 * 입력 언어 판별
 *
 * - 한글이 하나라도 있으면 한국어로 본다.
 *   '가평 glamping'처럼 섞여 들어와도 지역명을 그대로 쓸 수 있어야 한다.
 * - 한글이 없고 알파벳만 있으면 영어로 본다.
 * - '2일', '10/15'처럼 글자가 없으면 판별하지 않고 이어지는 언어를 쓴다.
 */
function detectLanguage(text, { sessionLanguage = null, locale = null } = {}) {
    const { hangul, latin } = countScripts(text);

    if (hangul > 0) return "ko";
    if (latin > 0) return "en";

    return normalizeLanguage(sessionLanguage)
        || normalizeLanguage(locale)
        || DEFAULT_LANGUAGE;
}

function isSupportedLanguage(language) {
    return SUPPORTED_LANGUAGES.includes(String(language));
}

module.exports = {
    SUPPORTED_LANGUAGES,
    DEFAULT_LANGUAGE,
    normalizeLanguage,
    detectLanguage,
    isSupportedLanguage,
};
