/**
 * 관광지 이름 매칭 유틸
 *
 * DB 제목에는 '구리 동구릉 [유네스코 세계유산]'처럼
 * 지역명 접두어와 괄호 부연 설명이 함께 들어 있다.
 * 사용자는 '동구릉' 또는 '구리 동구릉'처럼 짧게 입력하므로
 * 제목 하나당 매칭 가능한 별칭을 만들어 비교한다.
 */

const MIN_ALIAS_LENGTH = 2;

function normalizeName(value) {
    return String(value || "")
        .normalize("NFC")
        .toLowerCase()
        .replace(/[^0-9a-z가-힣]/g, "");
}

// 괄호 부연 설명을 떼어낸 핵심 이름만 남긴다.
function stripSupplement(title) {
    return String(title || "").normalize("NFC").replace(/[[({（［].*$/, "");
}

/**
 * 제목 하나에서 매칭에 쓸 별칭 목록을 만든다.
 * 예) '구리 동구릉 [유네스코 세계유산]' + '구리'
 *     → ['구리동구릉유네스코세계유산', '구리동구릉', '동구릉']
 *
 * 영문명이 있으면 함께 넣어 'Gana Art Park' 같은 입력도 알아본다.
 */
function buildTitleAliases(title, region, titleEn = null) {
    const aliases = new Set();
    const add = (value) => {
        if (value && value.length >= MIN_ALIAS_LENGTH) aliases.add(value);
    };

    const fullName = normalizeName(title);
    const coreName = normalizeName(stripSupplement(title));
    add(fullName);
    add(coreName);

    const regionName = normalizeName(region);
    if (regionName && coreName.startsWith(regionName)) {
        add(coreName.slice(regionName.length));
    } else if (regionName && coreName) {
        add(`${regionName}${coreName}`);
    }

    if (titleEn) {
        add(normalizeName(titleEn));
        add(normalizeName(stripSupplement(titleEn)));
    }

    return [...aliases];
}

/**
 * 화면에 보여줄 이름을 고른다.
 *
 * 영문명이 있는 관광지는 79건뿐이라, 없으면 한글명을 그대로 쓴다.
 * 없는 이름을 억지로 음역하면 검색도 안 되고 읽기도 어렵다.
 */
function displayName(place, language = "ko") {
    if (language !== "en") return place?.name || place?.title || "";
    return place?.nameEn || place?.titleEn || place?.name || place?.title || "";
}

module.exports = {
    normalizeName,
    stripSupplement,
    buildTitleAliases,
    displayName,
};
