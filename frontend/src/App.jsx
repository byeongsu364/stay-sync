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
  const [selectedAttractions, setSelectedAttractions] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isSending])

  useEffect(() => {
    const isAttractionSearch = currentStep === 'ASK_ROUTE_ATTRACTIONS'
    const isDepartureSearch = currentStep === 'ASK_START_LOCATION'
    const query = isAttractionSearch
      ? (input.startsWith('/') ? input.slice(1).trim() : '')
      : input.trim()
    if ((!isAttractionSearch && !isDepartureSearch) || !query) {
      setSuggestions([])
      return undefined
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const endpoint = isAttractionSearch ? 'attractions' : 'locations'
        const response = await fetch(
          `${API_BASE_URL}/api/chat/${endpoint}/autocomplete?q=${encodeURIComponent(query)}`,
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
  }, [currentStep, input])

  async function submitMessage(rawMessage, displayText = rawMessage) {
    const routeSelection = currentStep === 'ASK_ROUTE_ATTRACTIONS' && selectedAttractions.length > 0
    const message = routeSelection
      ? selectedAttractions.map(({ name }) => name).join(', ')
      : String(rawMessage).trim()
    const visibleMessage = routeSelection
      ? selectedAttractions.map(({ name }) => name).join(', ')
      : displayText
    if (!message || isSending) return

    setMessages((current) => [...current, {
      id: crypto.randomUUID(), sender: 'user', text: visibleMessage,
    }])
    setInput('')
    setSuggestions([])
    setIsSending(true)

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message }),
      })
      const body = await response.json()
      if (!response.ok || !body.success) {
        throw new Error(body.message || '응답을 불러오지 못했습니다.')
      }
      const result = body.data
      setCurrentStep(result.currentStep)
      if (currentStep === 'ASK_ROUTE_ATTRACTIONS') setSelectedAttractions([])
      setMessages((current) => [...current, {
        id: crypto.randomUUID(), sender: 'bot', text: result.reply,
        kakaoRouteLinks: result.kakaoRouteLinks || null,
        quickReplies: result.quickReplies || null,
      }])
    } catch (error) {
      setMessages((current) => [...current, {
        id: crypto.randomUUID(), sender: 'bot',
        text: `오류가 발생했습니다. ${error.message}`, isError: true,
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
    inputRef.current?.focus()
  }

  function removeAttraction(id) {
    setSelectedAttractions((current) => current.filter((attraction) => attraction.id !== id))
  }

  function selectSuggestion(suggestion) {
    if (currentStep === 'ASK_ROUTE_ATTRACTIONS') {
      selectAttraction(suggestion)
      return
    }
    setInput(suggestion.name)
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
            <input ref={inputRef} id="travel-message" value={input} onChange={(event) => setInput(event.target.value)}
              placeholder={currentStep === 'ASK_ROUTE_ATTRACTIONS'
                ? '/관광지명을 입력하세요'
                : currentStep === 'ASK_START_LOCATION'
                  ? '출발지를 입력하세요'
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
          <button type="submit" disabled={(!input.trim() && selectedAttractions.length === 0) || isSending}>전송</button>
        </form>
      </section>
    </main>
  )
}

export default App
