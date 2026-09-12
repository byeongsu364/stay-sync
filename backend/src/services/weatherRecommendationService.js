const {
    findForecasts,
} = require("../repositories/weatherForecastRepository");
const {
    collectShortForecast,
    collectMidForecast,
} = require("./weatherCollectService");
const { t, label } = require("./messageService");

const RAIN_PROBABILITY_THRESHOLD = 60;
const HEAT_THRESHOLD = 33;
const COLD_THRESHOLD = -12;

function toDateText(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
}

function assessForecast(forecast) {
    const reasons = [];
    if (Number(forecast.rainProb) >= RAIN_PROBABILITY_THRESHOLD) reasons.push("비");
    if (Number(forecast.maxTemp) >= HEAT_THRESHOLD) reasons.push("폭염");
    if (Number(forecast.minTemp) <= COLD_THRESHOLD) reasons.push("한파");

    return {
        date: toDateText(forecast.date),
        minTemp: forecast.minTemp,
        maxTemp: forecast.maxTemp,
        rainProb: forecast.rainProb,
        source: forecast.source,
        situation: reasons.length > 0 ? "실내권장" : "일반",
        reasons,
    };
}

function isForecastRangeAvailable(startDate, endDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(startDate);
    const end = new Date(endDate);
    const max = new Date(today);
    max.setDate(max.getDate() + 10);
    return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())
        && end >= today && start <= max;
}

async function getWeatherRecommendationContext({ region, startDate, endDate }) {
    if (!region || !startDate || !endDate) {
        return { forecasts: [], indoorRecommended: false, available: false };
    }

    let forecasts = await findForecasts(region, startDate, endDate);
    if (forecasts.length === 0 && isForecastRangeAvailable(startDate, endDate)) {
        try {
            const results = await Promise.allSettled([
                collectShortForecast(region),
                collectMidForecast(region),
            ]);
            for (const result of results) {
                if (result.status === "rejected") {
                    console.warn(`[Weather] 예보 일부 수집 실패: ${result.reason?.message}`);
                }
            }
            forecasts = await findForecasts(region, startDate, endDate);
        } catch (error) {
            console.warn(`[Weather] ${region} 단기예보 수집 실패: ${error.message}`);
        }
    }

    const assessed = forecasts.map(assessForecast);
    return {
        forecasts: assessed,
        available: assessed.length > 0,
        indoorRecommended: assessed.some(({ situation }) => situation === "실내권장"),
    };
}

function buildWeatherReply(context, language = "ko") {
    if (!context?.available) return t("weather.unavailable", {}, language);
    const lines = context.forecasts.map((forecast) => {
        const reason = forecast.reasons.length > 0
            ? t("weather.reasonIndoor", {
                reasons: forecast.reasons.map((value) => label("weather.reason", value, language)),
            }, language)
            : t("weather.reasonNormal", {}, language);

        return t("weather.forecastLine", {
            date: forecast.date,
            rainProb: forecast.rainProb ?? "-",
            minTemp: forecast.minTemp ?? "-",
            maxTemp: forecast.maxTemp ?? "-",
            reason,
        }, language);
    });
    return `${t("weather.header", {}, language)}\n${lines.join("\n")}`;
}

module.exports = {
    RAIN_PROBABILITY_THRESHOLD,
    HEAT_THRESHOLD,
    COLD_THRESHOLD,
    assessForecast,
    getWeatherRecommendationContext,
    buildWeatherReply,
};
