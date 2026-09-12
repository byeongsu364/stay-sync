/**
 * 한국어 조사 처리
 *
 * 받침 유무에 따라 은/는, 을/를, 으로/로 같은 조사를 골라 붙인다.
 */

function hasFinalConsonant(word) {
    const lastChar = String(word || "").trim().slice(-1);
    if (!lastChar) return false;
    const code = lastChar.charCodeAt(0);
    if (code < 0xac00 || code > 0xd7a3) return false;
    return (code - 0xac00) % 28 !== 0;
}

// 조사만 고른다. 따옴표처럼 낱말 뒤에 기호가 붙는 문장에서 쓴다.
function pickJosa(word, withBatchim, withoutBatchim) {
    return hasFinalConsonant(word) ? withBatchim : withoutBatchim;
}

function withJosa(word, withBatchim, withoutBatchim) {
    return `${word}${pickJosa(word, withBatchim, withoutBatchim)}`;
}

module.exports = {
    hasFinalConsonant,
    pickJosa,
    withJosa,
};
