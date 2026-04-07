# MVP Backend (Express + SSE)

## 1. Prepare

1. Copy environment template:

   PowerShell:
   Copy-Item .env.example .env

2. Fill .env with your model provider API key (recommended: Zhipu).

## 2. Run

From project root:

PowerShell:
npm run dev:server

Or run once:

PowerShell:
npm run start:server

## 3. Endpoints

- GET /api/health
- GET /api/chat/stream?sessionId=...&prompt=...&model=glm-4-flash

## 4. SSE Payload Contract

- chunk:
  data: {"delta":"..."}

- done:
  event: done
  data: {"done":true}

- error:
  data: {"error":{"message":"..."}}

## 5. Notes

- This is an MVP implementation without DB/auth/upload.
- Designed to match frontend parser in src/services/chatStream.ts.
- Provider envs are generic (`LLM_*`) and also keep compatibility with `ZHIPU_*` / `QWEN_*`.
