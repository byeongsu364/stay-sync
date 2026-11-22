# Stay Sync 구성 요소 비교 실험 키트

논문 4장(표 6·7)을 채우기 위한 실험 스크립트예요.
온톨로지, REG, LEG를 넣고 빼는 8개 구성을 비교해요. TourAPI 근거는 모든 구성에 똑같이 줘요.

| 구성 | 온톨로지 | REG | LEG |
|---|---|---|---|
| C1 | × | × | × |
| C2 | × | × | ○ |
| C3 | × | ○ | × |
| C4 | × | ○ | ○ |
| C5 | ○ | × | × |
| C6 | ○ | × | ○ |
| C7 | ○ | ○ | × |
| C8 (제안) | ○ | ○ | ○ |

질의 30개 × 상황 3개(맑음·강수·미세먼지 나쁨) = 90개 사례를 구성마다 5번씩 반복해요(총 3,600회).
같은 질문에 같은 답이 나오는지(일관성), 조건에 맞는 답인지(정확도)를 계산하고, 환각률과 응답 시간도 같이 봐요.

## 1. 넣기

이 `experiment` 폴더를 `backend/scripts/` 아래에 그대로 넣어요(예전 키트로 만든 `results` 폴더가 있으면 지워요).

```
backend/scripts/experiment/
  queries.js         평가 질의 30개
  conditions.js      상황 조건 3개(값 고정)
  configs.js         비교 구성 8개
  common.js          온톨로지·REG 판정(서비스 코드 그대로 사용)
  openai.js          채점용 OpenAI 호출
  runExperiment.js   8개 구성 실행
  scoreExperiment.js 채점·표 생성
```

## 2. 준비

`backend/.env`에 아래 값이 있어야 해요.

```
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.4-mini
OPENAI_REASONING_EFFORT=none
DATABASE_URL=...            (관광지 데이터가 들어 있는 PostgreSQL)
TOUR_API_SERVICE_KEY=...
```

PostgreSQL을 켜 두세요. 이번 실험은 동선을 만들지 않아서 OSRM은 없어도 돼요.

## 3. 실행 (backend 폴더에서)

```bash
# 시험 실행: 질의 1개 × 상황 3개 × 구성 8개 × 2회 = 48회
node scripts/experiment/runExperiment.js --limit 1 --repeats 2
node scripts/experiment/scoreExperiment.js

# 문제없으면 results 폴더를 지우고 전체 실행
rm -rf scripts/experiment/results
node scripts/experiment/runExperiment.js
node scripts/experiment/scoreExperiment.js
```

- 전체 실행은 2~3시간 정도 걸려요. 중간에 멈추면 같은 명령을 다시 실행하면 이어서 해요.
- `--concurrency 6`처럼 동시 실행 수를 늘리면 빨라지지만 OpenAI 속도 제한에 걸릴 수 있어요.
- 처음 실행할 때 지역별 상위 60곳(총 600곳)의 TourAPI 개요를 받아 DB에 캐시해요. 하루 호출 한도에 걸리면 다음 날 이어서 실행하면 돼요.

## 4. 보내줄 파일

`scripts/experiment/results/` 폴더를 통째로 압축해서 보내 주세요.
- `summary.md`: 구성별 결과, 상황별 결과, 모듈별 주효과
- `table6.csv`, `table7.csv`: 논문 표 6·7에 들어갈 수치
- `review.csv`: 데이터에 없는 관광지와 근거 없는 주장 목록(엑셀로 열림). 일부(예: 20%)를 직접 확인하면 논문에 "연구자가 검토했다"고 쓸 수 있어요.
- `raw.jsonl`, `scored.jsonl`: 원본 응답과 채점 상세

## 구성별 차이

- 모든 구성: 같은 LLM, 같은 질의·상황 정보, 같은 근거(시·군별 여행 월 검색량 상위 60곳의 테마·실내외·주소·TourAPI 개요). 답은 관광지 최대 5곳 + 이유, 같은 JSON 형식.
- 온톨로지 켬: 질의에서 매핑한 동행자 유형과 추천 테마를 함께 줘요. REG도 켜져 있으면 테마 규칙(R5)에 써요.
- REG 켬: 실내 규칙(R1~R4)·테마 규칙(R5, 온톨로지가 있을 때)·대체 규칙(R7)으로 코드에서 먼저 거른 '확정 후보'만 줘요. 끄면 60곳 목록에서 LLM이 직접 골라요.
- LEG 켬: 시스템 프롬프트에 추천 단계 규칙(목록 밖 추천 금지, 시·군 제한, 확정 후보 유지, 근거 없는 사실 금지, 상황 반영, 형식)을 넣어요. 끄면 역할과 출력 형식만 줘요.

## 채점 기준

- 정확도: 추천 관광지 중 ① DB에 있고 ② 요청한 시·군이며 ③ 실내 규칙(강수·미세먼지 조건에서 실내인가)과 ④ 테마 규칙(질의의 온톨로지 테마와 맞는가)을 모두 만족한 비율. 테마 기준은 모든 구성에 똑같이 적용해요.
- 일관성: 같은 구성·질의·상황을 5번 물었을 때 추천 목록끼리의 자카드 유사도 평균(1이면 매번 같은 목록). 5번 모두 똑같은 사례 비율은 '완전 일치율'.
- 환각률: DB에 없는 관광지가 있거나, 근거로 확인할 수 없는 구체적 사실(운영시간, 요금, 시설, 거리 수치 등)이 있는 응답 비율. 1회차 응답만 LLM 평가자가 판정(전체를 보려면 .env에 JUDGE_ALL_RUNS=1).
- 모듈별 주효과: 해당 모듈이 있는 4개 구성 평균에서 없는 4개 구성 평균을 뺀 값.
