import { useEffect, useRef, useState } from 'react'
import './App.css'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000').replace(/\/$/, '')
const INITIAL_OPTIONS = [
  { label: '숙소를 이미 예약했어요', value: '2' },
  { label: '동선만 추천받고 싶어요', value: '3' },
]

function MessageText({ text }) {
  const parts = String(text || '').split(/(https?:\/\/[^\s]+)/g)

  return (
    <p>
      {parts.map((part, index) => (
        /^https?:\/\//.test(part) ? (
          <a key={`${part}-${index}`} className="message-link" href={part}
            target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        ) : part
      ))}
    </p>
  )
}

function App() {
  const browserLocale = navigator.language || 'ko-KR'
  // 현재 UI는 대화 내역을 복원하지 않으므로 새 화면에는 새 세션을 사용한다.
  // 이전 세션 ID만 재사용하면 첫 선택이 이전 단계의 답변으로 오인될 수 있다.
  const [sessionId] = useState(() => crypto.randomUUID())
  const [messages, setMessages] = useState([
    {
      id: 'greeting',
      sender: 'bot',
      text: '안녕하세요! 어디로 여행을 가시나요?\n\n숙소를 이미 예약하셨거나 동선만 추천받고 싶다면 아래 항목을 선택해주세요.',
      quickReplies: INITIAL_OPTIONS,
    },
  ])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [currentStep, setCurrentStep] = useState('ASK_SERVICE_TYPE')
  const [currentFacts, setCurrentFacts] = useState({})
  const [selectedAttractions, setSelectedAttractions] = useState([])
  const [selectedRecommendations, setSelectedRecommendations] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [detailAttraction, setDetailAttraction] = useState(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (browserLocale.toLowerCase().startsWith('ko')) return
    const controller = new AbortController()
    fetch(`${API_BASE_URL}/api/chat/greeting?locale=${encodeURIComponent(browserLocale)}`, {
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((body) => {
        if (!body.success) return
        setMessages((current) => current.map((message) => (
          message.id === 'greeting'
            ? { ...message, text: body.data.reply, quickReplies: body.data.quickReplies }
            : message
        )))
      })
      .catch(() => {})
    return () => controller.abort()
  }, [browserLocale])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isSending])

  useEffect(() => {
    const isAttractionSearch = currentStep === 'ASK_ROUTE_ATTRACTIONS'
    const isDepartureSearch = currentStep === 'ASK_START_LOCATION'
    const isAccommodationSearch = currentStep === 'ASK_ACCOMMODATION'
    const query = isAttractionSearch
      ? (input.startsWith('/') ? input.slice(1).trim() : '')
      : input.trim()
    if ((!isAttractionSearch && !isDepartureSearch && !isAccommodationSearch) || !query) {
      setSuggestions([])
      return undefined
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const endpoint = isAttractionSearch ? 'attractions' : 'locations'
        const locationParams = isAccommodationSearch
          ? `&type=accommodation&region=${encodeURIComponent(currentFacts.region || '')}`
          : ''
        const response = await fetch(
          `${API_BASE_URL}/api/chat/${endpoint}/autocomplete?q=${encodeURIComponent(query)}${locationParams}`,
          { signal: controller.signal },
        )
        const body = await response.json()
        if (response.ok && body.success) setSuggestions(body.data)
      } catch (error) {
        if (error.name !== 'AbortError') setSuggestions([])
      }
    }, 180)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [currentStep, currentFacts.region, input])

  async function submitMessage(rawMessage, displayText = rawMessage) {
    const routeSelection = currentStep === 'ASK_ROUTE_ATTRACTIONS' && selectedAttractions.length > 0
    const recommendationSelection = currentStep === 'RECOMMENDATION_SHOWN'
      && selectedRecommendations.length > 0
    const selectedItems = routeSelection
      ? selectedAttractions
      : recommendationSelection
        ? selectedRecommendations
        : null
    const message = selectedItems
      ? selectedItems.map(({ name }) => name).join(', ')
      : String(rawMessage).trim()
    const visibleMessage = selectedItems
      ? selectedItems.map(({ name }) => `#${name}`).join(' ')
      : displayText
    if (!message || isSending) return

    setMessages((current) => [...current, {
      id: crypto.randomUUID(), sender: 'user', text: visibleMessage,
    }])
    setInput('')
    setSuggestions([])
    setIsSending(true)

    const requestId = crypto.randomUUID()
    console.info(`[chat-debug:${requestId}] sending`, { currentStep, message })

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
        body: JSON.stringify({ sessionId, message, location: selectedLocation, locale: browserLocale }),
      })
      const body = await response.json()
      console.info(`[chat-debug:${requestId}] response`, { status: response.status, body })
      if (!response.ok || !body.success) {
        throw new Error(body.message || '응답을 불러오지 못했습니다.')
      }
      const result = body.data
      setCurrentStep(result.currentStep)
      setCurrentFacts(result.facts || {})
      if (currentStep === 'ASK_ROUTE_ATTRACTIONS') setSelectedAttractions([])
      if (currentStep === 'RECOMMENDATION_SHOWN') setSelectedRecommendations([])
      setMessages((current) => [...current, {
        id: crypto.randomUUID(), sender: 'bot',
        text: result.recommendations?.length
          ? `${result.situationSummary || '현재 여행 상황을 반영해 관광지를 추천했습니다.'}\n\n추천 관광지를 클릭해서 선택해주세요. 여러 곳을 선택할 수 있습니다.`
          : result.reply,
        kakaoRouteLinks: result.kakaoRouteLinks || null,
        quickReplies: result.quickReplies || null,
        recommendations: result.recommendations || null,
        situationFilterApplied: result.situationFilterApplied || false,
      }])
    } catch (error) {
      console.error(`[chat-debug:${requestId}] failed`, {
        name: error.name,
        message: error.message,
        apiBaseUrl: API_BASE_URL,
        online: navigator.onLine,
      })
      const message = error instanceof TypeError && error.message === 'Failed to fetch'
        ? `응답을 받는 도중 연결이 끊겼습니다. 잠시 후 다시 시도해주세요. 추적 ID: ${requestId}`
        : error.message
      setMessages((current) => [...current, {
        id: crypto.randomUUID(), sender: 'bot',
        text: `오류가 발생했습니다. ${message}`, isError: true,
      }])
    } finally {
      setIsSending(false)
    }
  }

  function sendMessage(event) {
    event.preventDefault()
    submitMessage(input)
  }

  function resetChat() {
    window.location.reload()
  }

  function selectAttraction(attraction) {
    setSelectedAttractions((current) => (
      current.some(({ id }) => id === attraction.id) ? current : [...current, attraction]
    ))
    setInput('/')
    setSuggestions([])
    setSelectedLocation(null)
    inputRef.current?.focus()
  }

  function removeAttraction(id) {
    setSelectedAttractions((current) => current.filter((attraction) => attraction.id !== id))
  }

  function toggleRecommendation(recommendation) {
    setSelectedRecommendations((current) => (
      current.some(({ id }) => id === recommendation.id)
        ? current.filter(({ id }) => id !== recommendation.id)
        : [...current, recommendation]
    ))
  }

  function selectSuggestion(suggestion) {
    if (currentStep === 'ASK_ROUTE_ATTRACTIONS') {
      selectAttraction(suggestion)
      return
    }
    setInput(suggestion.name)
    setSelectedLocation(suggestion)
    setSuggestions([])
    inputRef.current?.focus()
  }

  return (
    <main className="chat-page">
      <section className="chat-shell" aria-label="여행 추천 챗봇">
        <header className="chat-header">
          <div className="brand"><span aria-hidden="true">S</span><div><h1>Stay Sync</h1><p>동행자 맞춤 여행 추천</p></div></div>
          <button type="button" className="reset-button" onClick={resetChat}>새 여행</button>
        </header>

        <div className="message-list" aria-live="polite">
          {messages.map((message, messageIndex) => (
            <article className={`message ${message.sender} ${message.isError ? 'error' : ''}`} key={message.id}>
              <div className="bubble">
                <MessageText text={message.text} />
                {message.quickReplies && (
                  <div className="quick-replies">
                    {message.quickReplies.map((option) => (
                      <button key={option.value} type="button"
                        disabled={isSending || messageIndex !== messages.length - 1}
                        onClick={() => submitMessage(option.value, option.label)}>
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
                {message.kakaoRouteLinks && (
                  <div className="route-links">
                    {message.kakaoRouteLinks.map((link) => (
                      <a key={`${link.day}-${link.part}`} href={link.url} target="_blank" rel="noopener noreferrer">
                        {link.day}일 차 카카오맵 열기{link.part > 1 ? ` (${link.part})` : ''}
                      </a>
                    ))}
                  </div>
                )}
                {message.recommendations && (
                  <div className="recommendation-cards">
                    {message.recommendations.map((recommendation, recommendationIndex) => {
                      const selected = selectedRecommendations.some(({ id }) => id === recommendation.id)
                      const isDistance = recommendation.recommendationType === 'distance'
                      const typeRank = message.recommendations
                        .slice(0, recommendationIndex + 1)
                        .filter((item) => (item.recommendationType === 'distance') === isDistance)
                        .length
                      const rank = recommendation.popularityPosition || typeRank
                      return (
                        <div key={recommendation.id}
                          className={`recommendation-card ${selected ? 'selected' : ''}`}
                          role="button"
                          tabIndex={messageIndex === messages.length - 1 ? 0 : -1}
                          aria-pressed={selected}
                          onClick={() => {
                            if (!isSending && messageIndex === messages.length - 1) toggleRecommendation(recommendation)
                          }}
                          onKeyDown={(event) => {
                            if ((event.key === 'Enter' || event.key === ' ') && !isSending && messageIndex === messages.length - 1) {
                              event.preventDefault()
                              toggleRecommendation(recommendation)
                            }
                          }}>
                          {recommendation.image && <img src={recommendation.image} alt={`${recommendation.name} 대표 사진`} loading="lazy" />}
                          <span className="recommendation-content">
                            <strong>{selected ? '# ' : ''}{recommendation.name}</strong>
                            <small>{isDistance ? '거리순' : '인기순'} {rank}위</small>
                            {message.situationFilterApplied && <small>날씨·대기질 맞춤 실내 추천</small>}
                            {recommendation.description && <span className="recommendation-description">{recommendation.description}</span>}
                            <span>{recommendation.theme} · {recommendation.address}</span>
                            {recommendation.roadDistanceKm != null && <small>숙소에서 {recommendation.roadDistanceKm}km</small>}
                            <button className="detail-button" type="button" onClick={(event) => {
                              event.stopPropagation()
                              setDetailAttraction(recommendation)
                            }}>상세보기</button>
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </article>
          ))}
          {isSending && <article className="message bot"><div className="bubble typing" aria-label="답변 작성 중"><span /><span /><span /></div></article>}
          <div ref={messagesEndRef} />
        </div>

        <form className="chat-input" onSubmit={sendMessage}>
          <label className="sr-only" htmlFor="travel-message">메시지 입력</label>
          <div className="composer">
            {currentStep === 'ASK_ROUTE_ATTRACTIONS' && selectedAttractions.map((attraction) => (
              <span className="attraction-chip" key={attraction.id}>
                {attraction.name}
                <button type="button" onClick={() => removeAttraction(attraction.id)} aria-label={`${attraction.name} 삭제`}>×</button>
              </span>
            ))}
            {currentStep === 'RECOMMENDATION_SHOWN' && selectedRecommendations.map((recommendation) => (
              <span className="attraction-chip" key={recommendation.id}>
                #{recommendation.name}
                <button type="button" onClick={() => toggleRecommendation(recommendation)} aria-label={`${recommendation.name} 삭제`}>×</button>
              </span>
            ))}
            <input ref={inputRef} id="travel-message" value={input} onChange={(event) => {
              setInput(event.target.value)
              setSelectedLocation(null)
            }}
              placeholder={currentStep === 'ASK_ROUTE_ATTRACTIONS'
                ? '/관광지명을 입력하세요'
                : currentStep === 'ASK_START_LOCATION'
                  ? '출발지를 입력하세요'
                  : currentStep === 'ASK_ACCOMMODATION'
                    ? `${currentFacts.region || ''} 숙소를 입력하세요`.trim()
                  : '메세지를 입력해주세요'}
              autoComplete="off" disabled={isSending} />
            {suggestions.length > 0 && (
              <ul className="autocomplete-list">
                {suggestions.map((attraction) => (
                  <li key={attraction.id ?? attraction.kakaoPlaceId}>
                    <button type="button" onClick={() => selectSuggestion(attraction)}>
                      <strong>{attraction.name}</strong>
                      <span>{[attraction.region, attraction.address].filter(Boolean).join(' · ')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button type="submit" disabled={(
            !input.trim()
            && selectedAttractions.length === 0
            && selectedRecommendations.length === 0
          ) || isSending}>전송</button>
        </form>
      </section>
      {detailAttraction && (
        <div className="detail-backdrop" role="presentation" onMouseDown={() => setDetailAttraction(null)}>
          <section className="attraction-detail" role="dialog" aria-modal="true" aria-labelledby="attraction-detail-title"
            onMouseDown={(event) => event.stopPropagation()}>
            <button className="detail-close" type="button" aria-label="상세정보 닫기" onClick={() => setDetailAttraction(null)}>×</button>
            {detailAttraction.image && <img src={detailAttraction.image} alt={`${detailAttraction.name} 대표 사진`} />}
            <div className="detail-body">
              <small>{detailAttraction.recommendationType === 'distance' ? '거리순 추천' : '인기순 추천'}</small>
              <h2 id="attraction-detail-title">{detailAttraction.name}</h2>
              <p>{detailAttraction.description || '등록된 상세 설명이 없습니다.'}</p>
              <dl>
                <div><dt>테마</dt><dd>{detailAttraction.theme || '-'}</dd></div>
                <div><dt>주소</dt><dd>{detailAttraction.address || '-'}</dd></div>
                {detailAttraction.roadDistanceKm != null && <div><dt>숙소 기준 거리</dt><dd>{detailAttraction.roadDistanceKm}km</dd></div>}
              </dl>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

export default App
