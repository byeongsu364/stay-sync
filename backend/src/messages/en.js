/**
 * English messages
 *
 * Keys mirror ko.js. A key missing here falls back to the Korean text,
 * so run messageService.findMissingKeys("en") after adding keys.
 *
 * Josa directives such as {themes|으로/로} only matter in Korean;
 * here the same placeholder is written as a plain {themes}.
 */

module.exports = {
    // Service type
    "serviceType.prompt": [
        "Where would you like to travel?",
        "",
        "If you have already booked a place to stay, or only want a route, pick one below.",
    ].join("\n"),
    "serviceType.option.booked": "I already booked my stay",
    "serviceType.option.routeOnly": "I only want a route",
    "serviceType.invalid": "Please choose 1, 2 or 3.\n\n{prompt}",

    // Region and attractions
    "region.askForAccommodation": "Which region would you like a place to stay in?",
    "region.askForAttraction": "Tell me a region you want to visit, or an attraction you have in mind.",
    "region.askAgain": "I could not find that region or an attraction there. Please tell me a region or an attraction name again.",
    "region.notSupported": [
        "I could not find a supported destination in that sentence. Please include one of the regions below, or an attraction we cover. For example: I want to go to Jaraseom.",
        "",
        "{regions}",
    ].join("\n"),
    "destination.chooseOne": "Please settle on one destination. Pick from the list below, or tell me the attraction name again.",

    // Greeting
    "greeting.hello": "Hello!\n\n{prompt}",
    "greeting.continue": "Hello! Shall we carry on?",

    // Travel period
    "period.askRange": "What dates are you travelling?",
    "period.askOneDay": "Which day is your day trip? For example: tomorrow, September 12",
    "period.example": "For example: tomorrow for a day, September 12 to 14",
    "travel.askRegion": "Hello! Where are you travelling to?",
    "travel.regionConfirmed": "{region} it is. {question}",
    "travel.destinationConfirmed": "{destination} it is.{visit}{theme}{companion} {question}",
    "travel.visitAdded": " I added it to your visit list.",
    "travel.visitAddedMany": " I added all {count} of them to your visit list.",
    "travel.themeSaved": " I saved '{themes}' as what you are interested in.",
    "travel.companionSaved": " I saved '{companion}' as who you are travelling with.",
    "travel.oneDayTrip": "A day trip to {region}, then. Where will you start from? I need it to plan the route.",

    // Stay and departure
    "accommodation.ask": "Please tell me the name or address of the place you booked.",
    "accommodation.recommend": "Let me suggest places to stay in {region} for {period}.",
    "accommodation.confirmed": "Got your place to stay. Let me work out the best route for each day.",
    "departure.confirmed": "Got your starting point. Let me work out the best route.",

    // Companion
    "companion.ask": "Who are you travelling with?\n(alone, partner, friends, family, parents, with kids)",

    // Corrections
    "correction.region": "Sure. Which region would you like instead?",
    "correction.period": "{regionKept}What dates are you travelling?",
    "correction.regionKept": "I will keep {region} as the region. ",
    "correction.accommodation": "Sure. Please tell me the name or address of your stay again.",
    "correction.departure": "Sure. Where will you start your day trip from?",
    "correction.companion": "Sure. Who are you travelling with?",
    "correction.travelDays": "Sure. How many days is your trip?\nFor example: 1 day, 2 days, 3 days",
    "correction.unknown": "Sure. Please tell me again what you would like to change.",

    // Route only
    "routeOnly.askDays": "How many days is your trip?\nFor example: 1 day, 2 days, 3 days",
    "routeOnly.invalidDays": "Please give a number of days between 1 and 30. For example: 2 days",
    "routeOnly.daysConfirmed": "{days} days it is. Search attractions with /name and pick the ones you want to visit.",
    "routeOnly.attractionsNotFound": "I could not confirm every attraction.{unresolved}\nPlease list the place names separated by commas.",
    "routeOnly.unresolvedList": "\nNot found: {places}",
    "routeOnly.needMoreAttractions": "A {days}-day route needs at least {days} attractions. Please add more and choose again.",

    // Recommendations and selection
    "recommendation.header": "Here are attractions ranked {startRank}-{endRank} by how often they are searched.",
    "recommendation.item": "{index}. {name}\n   - Theme: {theme}\n   - Address: {address}",
    "recommendation.hasMore": "Pick the ones you like. You can ask for more after choosing.",
    "recommendation.last": "These are the last attractions matching your conditions. Pick the ones you like.",
    "recommendation.exhausted": "There are no more attractions matching this region and theme.",
    "selection.undone": "I removed what you picked last. Please choose again from the list.",
    "selection.askMoreUnclear": "Would you like more recommendations, or shall we finish choosing?",
    "selection.readyForRoute": "{reply}\n\nLet me prepare the best route for what you picked.",

    // Route result
    "route.exactPath": "Your route",
    "route.kakaoLinks": "You can open the route with the KakaoMap links below.",

    // Weather and air quality
    "weather.unavailable": "Those dates are outside the forecast range, so I did not filter by weather.",
    "weather.header": "I took the forecast for your dates into account.",
    "airQuality.unavailable": "No air quality information was available.",
    "situation.indoorOnly": "Given the conditions, I put indoor attractions first.",
    "situation.indoorFallback": "There were not enough indoor attractions, so I included outdoor ones as well.",
    "situation.noConstraint": "Nothing much stands in the way of being outdoors, so I went by theme and popularity.",

    // Regions we cannot serve in English
    "english.regionUnavailable": [
        "We do not have English tourism information for {region}, so I cannot guide you there in English.",
        "",
        "The regions available in English are {regions}.",
        "Please pick another region, or write in Korean and I can carry on helping you.",
    ].join("\n"),

    // Region and theme labels (the data itself is Korean)
    "region.고양": "Goyang",
    "region.파주": "Paju",
    "region.의정부": "Uijeongbu",
    "region.양주": "Yangju",
    "region.동두천": "Dongducheon",
    "region.포천": "Pocheon",
    "region.남양주": "Namyangju",
    "region.구리": "Guri",
    "region.가평": "Gapyeong",
    "region.연천": "Yeoncheon",
    "theme.자연관광": "Nature",
    "theme.문화관광": "Culture",
    "theme.역사관광": "History",
    "theme.레저스포츠": "Leisure & sports",
    "theme.체험관광": "Hands-on experiences",
    "theme.쇼핑": "Shopping",
    "theme.기타관광": "Other",

    // Weather and air quality detail
    "weather.forecastLine": "{date}: {rainProb}% chance of rain · {minTemp}-{maxTemp}℃{reason}",
    "weather.reasonIndoor": " · indoor suggested ({reasons})",
    "weather.reasonNormal": " · no constraint",
    "weather.reason.비": "rain",
    "weather.reason.폭염": "extreme heat",
    "weather.reason.한파": "extreme cold",
    "airQuality.line": "Air quality now: {grade} · PM10 {pm10}㎍/㎥ · PM2.5 {pm25}㎍/㎥",
    "airQuality.grade.좋음": "Good",
    "airQuality.grade.보통": "Moderate",
    "airQuality.grade.나쁨": "Unhealthy",
    "airQuality.grade.매우나쁨": "Very unhealthy",
    "airQuality.grade.정보없음": "Unknown",

    // When we could not produce an answer
    "error.retry": "Sorry, I could not put together an answer just now. Let me ask again.",
    "error.retryGeneric": "Sorry, I could not put together an answer just now. Could you say that again?",
    "departure.ask": "Where will you start from? I need it to plan the route.",
    "routeOnly.askAttractions": "Search attractions with /name and pick the ones you want to visit.",
    "selection.askAgain": "Please pick the attractions you like from the list.",

    // Companion confirmation
    "companion.confirmed": "Travelling with: {companion}.",
    "companion.혼자": "on your own",
    "companion.연인": "your partner",
    "companion.친구": "friends",
    "companion.가족": "family",
    "companion.아이동반": "kids",
    "companion.부모님": "your parents",
    "companion.단체": "a group",
};
