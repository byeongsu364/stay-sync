/**
 * 비교 구성: 온톨로지(O) × REG(R) × LEG(L) = 8개. TourAPI 근거는 모든 구성에 똑같이 제공한다.
 */
const CONFIGS = [
    { id: "C1", o: false, r: false, l: false },
    { id: "C2", o: false, r: false, l: true },
    { id: "C3", o: false, r: true, l: false },
    { id: "C4", o: false, r: true, l: true },
    { id: "C5", o: true, r: false, l: false },
    { id: "C6", o: true, r: false, l: true },
    { id: "C7", o: true, r: true, l: false },
    { id: "C8", o: true, r: true, l: true },
].map((c) => ({
    ...c,
    label: ["LLM", c.o && "온톨로지", c.r && "REG", c.l && "LEG"].filter(Boolean).join("+") + (c.o && c.r && c.l ? "(제안)" : ""),
}));

module.exports = { CONFIGS, CONFIG_BY_ID: Object.fromEntries(CONFIGS.map((c) => [c.id, c])) };
