const koMessages = require("../messages/ko");
const enMessages = require("../messages/en");
const { pickJosa } = require("../utils/koreanUtils");

/**
 * ==========================================================
 * Message Service
 * ==========================================================
 *
 * 사용자에게 보여줄 고정 문구를 언어별로 고른다.
 *
 * 예전에는 서비스마다 한국어 문구를 직접 적고
 * 영어 응답은 LLM 번역에 맡겼다.
 * 번역이 실패하면 한국어가 그대로 나갔고 매 턴 호출이 하나 더 붙었다.
 *
 * 여기서 고른 문구는 번역을 거치지 않는다.
 * 관광지 설명처럼 데이터에서 오는 글만 번역 대상으로 남는다.
 * ==========================================================
 */

const CATALOGS = {
    ko: koMessages,
    en: enMessages,
};

const DEFAULT_LANGUAGE = "ko";

function readTemplate(language, key) {
    return CATALOGS[language]?.[key] ?? CATALOGS[DEFAULT_LANGUAGE][key] ?? null;
}

/**
 * 문구 채우기
 *
 * {name}        값을 그대로 넣는다.
 * {name|으로/로} 값의 받침을 보고 조사만 넣는다. 한국어 문구에서만 쓴다.
 *                값은 따옴표 안에 따로 찍는 경우가 많아 조사만 필요하다.
 */
function fill(template, params) {
    return template.replace(/\{(\w+)(?:\|([^}/]*)\/([^}]*))?\}/g, (whole, name, withBatchim, withoutBatchim) => {
        if (!(name in params)) return whole;
        const value = params[name];
        const text = Array.isArray(value) ? value.join(", ") : String(value ?? "");
        if (withBatchim === undefined) return text;
        return pickJosa(text, withBatchim, withoutBatchim);
    });
}

/**
 * 문구 하나를 언어에 맞게 만든다.
 *
 * 키가 없으면 개발 중 실수를 감추지 않도록 키 이름을 그대로 돌려준다.
 */
function t(key, params = {}, language = DEFAULT_LANGUAGE) {
    const template = readTemplate(language, key);
    if (template === null) {
        console.warn(`[Message] 등록되지 않은 문구 키: ${key}`);
        return key;
    }
    return fill(template, params);
}

// 영어 카탈로그에 빠진 키가 있으면 배포 전에 알 수 있도록 한다.
function findMissingKeys(language) {
    const base = Object.keys(CATALOGS[DEFAULT_LANGUAGE]);
    const target = CATALOGS[language] || {};
    return base.filter((key) => !(key in target));
}

// 데이터 값이 한국어인 지역명·테마명을 화면에 쓸 이름으로 바꾼다.
// 카탈로그에 없는 값은 원본을 그대로 쓴다.
function label(prefix, value, language = DEFAULT_LANGUAGE) {
    if (!value) return "";
    const key = `${prefix}.${value}`;
    return readTemplate(language, key) ?? String(value);
}

const regionLabel = (region, language) => label("region", region, language);
const themeLabel = (theme, language) => label("theme", theme, language);
const companionLabel = (companion, language) => label("companion", companion, language);

module.exports = {
    t,
    label,
    regionLabel,
    themeLabel,
    companionLabel,
    fill,
    findMissingKeys,
};
