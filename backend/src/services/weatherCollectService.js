const axios = require("axios");
const env = require("../config/env");
const { saveForecast } = require("../repositories/weatherForecastRepository");
const { SHORT_FORECAST_GRID } = require("../data/weatherRegionData");

/**
 * ==========================================================
 * Weather Collect Service
 * ==========================================================
 *
 * 역할
 * - 기상청 단기예보 1~3일 수집
 * - 기상청 중기예보 4~10일 수집
 * - weatherForecast 테이블에 저장
 * ==========================================================
 */

const MID_REGION_MAP = {
    고양: "11B20302",
    파주: "11B20305",
    의정부: "11B20301",
    양주: "11B20304",
    동두천: "11B20401",
    포천: "11B20403",
    남양주: "11B20502",
    구리: "11B20501",
    가평: "11B20404",
    연천: "11B20402",
};
const MID_LAND_REGION_ID = "11B00000";

function normalizeServiceKey(serviceKey) {
    const key = String(serviceKey || "").trim();
    if (!key.includes("%")) return key;
    try {
        return decodeURIComponent(key);
    } catch (error) {
        return key;
    }
}

function formatDate(date) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
    return formatter.format(date);
}

function getShortBaseTime() {
    // 발표 직후 API 반영 지연을 피하기 위해 20분 전을 기준으로 사용한다.
    const now = new Date(Date.now() - 20 * 60 * 1000);
    const dateFormatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        hourCycle: "h23",
    });
    let parts = dateFormatter.formatToParts(now);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const hh = Number(values.hour);

    const times = [23, 20, 17, 14, 11, 8, 5, 2];

    let baseHour = 23;

    for (const t of times) {
        if (hh >= t) {
            baseHour = t;
            break;
        }
    }

    if (hh < 2) {
        parts = dateFormatter.formatToParts(new Date(now.getTime() - 24 * 60 * 60 * 1000));
    }
    const baseDateValues = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

    return {
        base_date: `${baseDateValues.year}${baseDateValues.month}${baseDateValues.day}`,
        base_time: `${String(baseHour).padStart(2, "0")}00`,
    };
}

function getMidTmFc() {
    const now = new Date(Date.now() - 30 * 60 * 1000);
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        hourCycle: "h23",
    });
    let parts = formatter.formatToParts(now);
    let values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    let time = "0600";
    if (Number(values.hour) >= 18) {
        time = "1800";
    } else if (Number(values.hour) < 6) {
        parts = formatter.formatToParts(new Date(now.getTime() - 24 * 60 * 60 * 1000));
        values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
        time = "1800";
    }
    return `${values.year}${values.month}${values.day}${time}`;
}

async function collectShortForecast(targetRegion = null) {
    const { base_date, base_time } = getShortBaseTime();
    const entries = Object.entries(SHORT_FORECAST_GRID)
        .filter(([region]) => !targetRegion || region === targetRegion);

    for (const [region, grid] of entries) {
        const response = await axios.get(
            "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst",
            {
                params: {
                    serviceKey: normalizeServiceKey(env.weather.serviceKey),
                    pageNo: 1,
                    numOfRows: 1000,
                    dataType: "JSON",
                    base_date,
                    base_time,
                    nx: grid.nx,
                    ny: grid.ny,
                },
            }
        );

        const items = response.data?.response?.body?.items?.item || [];
        const daily = {};

        for (const item of items) {
            const date = item.fcstDate;

            if (!daily[date]) {
                daily[date] = {
                    minTemp: null,
                    maxTemp: null,
                    tmpMin: null,
                    tmpMax: null,
                    rainProb: 0,
                };
            }

            const value = Number(item.fcstValue);

            if (item.category === "TMN") {
                daily[date].minTemp = value;
            }

            if (item.category === "TMX") {
                daily[date].maxTemp = value;
            }

            if (item.category === "TMP") {
                daily[date].tmpMin =
                    daily[date].tmpMin === null
                        ? value
                        : Math.min(daily[date].tmpMin, value);

                daily[date].tmpMax =
                    daily[date].tmpMax === null
                        ? value
                        : Math.max(daily[date].tmpMax, value);
            }

            if (item.category === "POP") {
                daily[date].rainProb = Math.max(daily[date].rainProb, value);
            }
        }

        const rows = Object.entries(daily).slice(0, 5);

        for (const [date, d] of rows) {
            const minTemp = d.minTemp ?? d.tmpMin;
            const maxTemp = d.maxTemp ?? d.tmpMax;

            if (minTemp === null || maxTemp === null) continue;

            await saveForecast({
                date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
                region,
                minTemp,
                maxTemp,
                avgTemp: (minTemp + maxTemp) / 2,
                rainProb: d.rainProb,
                source: "short",
            });
        }
    }
}

async function collectMidForecast(targetRegion = null) {
    const tmFc = getMidTmFc();
    const rainResponse = await axios.get(
        "https://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst",
        {
            params: {
                serviceKey: normalizeServiceKey(env.weather.serviceKey),
                pageNo: 1,
                numOfRows: 10,
                dataType: "JSON",
                regId: MID_LAND_REGION_ID,
                tmFc,
            },
        }
    );
    const rain = rainResponse.data?.response?.body?.items?.item?.[0];
    const entries = Object.entries(MID_REGION_MAP)
        .filter(([region]) => !targetRegion || region === targetRegion);

    for (const [region, regId] of entries) {
        const tempResponse = await axios.get(
            "https://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa",
            {
                params: {
                    serviceKey: normalizeServiceKey(env.weather.serviceKey),
                    pageNo: 1,
                    numOfRows: 10,
                    dataType: "JSON",
                    regId,
                    tmFc,
                },
            }
        );

        const temp = tempResponse.data?.response?.body?.items?.item?.[0];

        if (!temp || !rain) continue;

        for (let day = 4; day <= 10; day++) {
            const date = new Date();
            date.setHours(0, 0, 0, 0);
            date.setDate(date.getDate() + day);

            const minTemp = Number(temp[`taMin${day}`]);
            const maxTemp = Number(temp[`taMax${day}`]);

            const rainProb =
                day <= 7
                    ? Math.max(
                        Number(rain[`rnSt${day}Am`] ?? 0),
                        Number(rain[`rnSt${day}Pm`] ?? 0)
                    )
                    : Number(rain[`rnSt${day}`] ?? 0);

            await saveForecast({
                date: formatDate(date),
                region,
                minTemp,
                maxTemp,
                avgTemp: (minTemp + maxTemp) / 2,
                rainProb,
                source: "mid",
            });
        }
    }
}

async function collectAllWeatherForecasts() {
    await collectShortForecast();
    await collectMidForecast();
}

module.exports = {
    collectShortForecast,
    collectMidForecast,
    collectAllWeatherForecasts,
};
