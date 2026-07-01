/**
 * 기상청 지역 코드
 */

const MID_FORECAST_REGION = {
    고양: "11B20302",
    파주: "11B20305",
    의정부: "11B20301",
    양주: "11B20304",
    동두천: "11B20401",
    포천: "11B20403",
    남양주: "11B20502",
    구리: "11B20501",
    가평: "11B20404",
    연천: "11B20402"
};

const SHORT_FORECAST_GRID = {
    고양: { nx: 57, ny: 128 },
    파주: { nx: 56, ny: 131 },
    의정부: { nx: 61, ny: 130 },
    양주: { nx: 61, ny: 131 },
    동두천: { nx: 61, ny: 134 },
    포천: { nx: 64, ny: 134 },
    남양주: { nx: 64, ny: 128 },
    구리: { nx: 62, ny: 127 },
    가평: { nx: 69, ny: 133 },
    연천: { nx: 61, ny: 138 }
};

module.exports = {
    MID_FORECAST_REGION,
    SHORT_FORECAST_GRID
};