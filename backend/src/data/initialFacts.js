/**
 * 여행 세션의 기본 facts
 */

const initialFacts = {
    region: null,

    period: null,

    start_date: null,

    end_date: null,

    // 숙박 | 당일치기
    trip_type: null,

    // 숙박인 경우만 사용
    accommodation: {
        name: null,
        mapx: null,
        mapy: null,
    },

    // 동선 계산에서 항상 사용하는 출발지
    start_location: {
        name: null,
        mapx: null,
        mapy: null,
    },

    people_count: null,

    companion_type: null,

    themes: [],

    selected_attractions: [],

    recommended_history: [],

    recommendation_round: 1,
};

module.exports = initialFacts;