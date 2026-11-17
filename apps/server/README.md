# server: WebSocket API, database, model calls

Every model call goes through `src/ai/call-model.ts`, which picks the adapter from the model id:

| Model id | Route | Adapter |
| --- | --- | --- |
| `claude-opus-5-5` (bare) | Anthropic API key | `src/ai/providers/anthropic.ts` |
| `openai:…`, `xai:…`, `meta:…` | API key, Responses API | `src/ai/providers/openai-responses.ts` |
| `google:…` | API key, Gemini API | `src/ai/providers/gemini.ts` |
| `claude-code:…` | Claude plan, `claude -p` | `src/ai/providers/cli/claude-code.ts` |
| `codex:…` | ChatGPT plan, `codex exec` | `src/ai/providers/cli/codex.ts` |
| `antigravity:…` | Google AI plan, `agy` print mode | `src/ai/providers/cli/antigravity.ts` |
| `grok:…` | Grok account, `grok agent stdio` (ACP) | `src/ai/providers/cli/grok.ts` |
| `muse:…` | Meta account, `muse serve` (Meta SDK) | `src/ai/providers/cli/muse.ts` |

Subscription tools run in an empty temporary folder, with no tools offered and no API keys in their environment, so they answer from the prompt alone and bill the plan you signed in with. The catalog of models, prices, and connections is in `packages/contracts/src/providers.ts`.
