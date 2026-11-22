/**
 * 상황 조건 3가지. 실제 API 대신 값을 고정해 모든 모델이 같은 조건에서 답하게 한다.
 * 실내 필요 여부는 REG(weatherRecommendationService, airQualityService)의 실제 임계값으로 판정한다.
 */
const TRAVEL_DATE = "2026-12-05";

module.exports = {
    TRAVEL_DATE,
    CONDITIONS: [
        {
            id: "clear",
            label: "맑음",
            forecast: { date: TRAVEL_DATE, minTemp: -2, maxTemp: 8, rainProb: 10, source: "experiment" },
            air: { pm10: 25, pm25: 12 },
        },
        {
            id: "rain",
            label: "강수",
            forecast: { date: TRAVEL_DATE, minTemp: 3, maxTemp: 9, rainProb: 80, source: "experiment" },
            air: { pm10: 35, pm25: 18 },
        },
        {
            id: "dust",
            label: "미세먼지 나쁨",
            forecast: { date: TRAVEL_DATE, minTemp: -1, maxTemp: 8, rainProb: 10, source: "experiment" },
            air: { pm10: 120, pm25: 60 },
        },
    ],
};
