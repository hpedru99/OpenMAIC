# Guia de estudo — OpenMAIC

> Cópia pessoal para aprendizado. Projeto original: https://github.com/THU-MAIC/OpenMAIC (licença MIT, © 2026 THU-MAIC).

## 1. O que é o projeto

**OpenMAIC** (Open Multi-Agent Interactive Classroom) transforma um tema ou documento numa aula interativa:
slides, quizzes, simulações HTML, projetos (PBL), com "professores" e "colegas" de IA que falam (TTS),
desenham num quadro branco e conversam com você.

Versão analisada: `1.5.0-rc.3` (~4.400 arquivos).

## 2. Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript 5 |
| Estilo | Tailwind CSS 4, componentes shadcn/Base UI |
| IA | Vercel AI SDK (`@ai-sdk/openai`, `anthropic`, `google`, `azure`, `bedrock`…) |
| Banco | PostgreSQL 16 (via Docker: `pnpm db:up`) |
| Monorepo | pnpm workspaces (`packages/*`) |
| Testes | Vitest (unitários), Playwright (e2e), `eval/` (avaliação de prompts) |
| Docs | Fumadocs (Next.js + MDX) em `packages/docs` |

## 3. Mapa do repositório

```
app/            Rotas Next.js (páginas + app/api = backend)
components/     UI React (classroom, whiteboard, slide-renderer, chat, settings…)
lib/            Lógica de negócio — o "cérebro" do projeto
  ai/             chamadas aos modelos
  orchestration/  orquestração multi-agente
  agent/, agent-runtime/  runtime dos agentes
  prompts/        prompts usados na geração
  generation-run-client/  fluxo de geração de cursos
  whiteboard/, quiz/, pbl/, interactive/  tipos de cena
  storage/, persistence/  gravação no Postgres
  export/, video-export/  exportar PPTX / HTML / MP4
  i18n/           traduções
packages/@openmaic/  bibliotecas publicadas no npm
  dsl, generation, renderer, editor, importer, storage, geometry
packages/docs/  site de documentação (MDX) — onde está configuration.mdx
configs/        constantes (temas, fontes, formas, atalhos)
skills/         "skills" para agentes externos (OpenClaw, Codex…)
eval/           avaliações automáticas de qualidade de prompts
tests/, e2e/    testes
render-service/ serviço opcional de renderização de vídeo
```

## 4. Como funciona (fluxo principal)

1. Usuário descreve um tema ou envia um PDF/PPT → `lib/media-parse`, `lib/pdf`, `lib/document`.
2. O servidor gera um **outline** (slot de modelo "outline") → `lib/prompts`, `lib/generation-run-client`.
3. Cada cena é gerada (slides, quiz, interativo, PBL) — pode ser em paralelo.
4. Na sala de aula, a **orquestração** (`lib/orchestration`, `lib/choreography`, `lib/playback`)
   coordena os agentes: quem fala, o que desenha no quadro, quando perguntar.
5. Tudo é salvo no Postgres (`packages/@openmaic/storage`) e pode ser exportado.

## 5. Configuração (resumo de `configuration.mdx`)

- `.env.local` → **segredos** (chaves de API). Copie de `.env.example`.
- `openmaic.yml` → **quais modelos** usar. Copie de `openmaic.example.yml`.
  - `providers`: contas (ex.: `openai`, com `apiKey: ${OPENAI_API_KEY}`).
  - `slots`: cada uso de IA (outline, conteúdo de slide, TTS, busca web…) aponta para `provedor:modelo`.
  - `lock`: slots fixos para todos os usuários.
  - `allowUserKeys`: se usuários podem usar suas próprias chaves.
- Opções extras: `ACCESS_CODE` (senha do site), feature flags (`NEXT_PUBLIC_*`), modelos locais (Ollama, Lemonade), TTS/ASR, parsing de documentos (MinerU etc.).

## 6. Roteiro de estudo sugerido

| Semana | Foco | Onde olhar |
|---|---|---|
| 1 | Rodar localmente e usar o app | README, `packages/docs/content/docs/getting-started.mdx` |
| 2 | Configuração de modelos | `configuration.mdx`, `openmaic.example.yml`, `lib/config` |
| 3 | Rotas e API do Next.js | `app/`, `app/api/`, `middleware.ts` |
| 4 | Geração de cursos e prompts | `lib/prompts`, `lib/generation-run-client`, `packages/@openmaic/generation` |
| 5 | Multi-agente | `lib/orchestration`, `lib/agent-runtime`, `lib/choreography` |
| 6 | UI: sala de aula e quadro | `components/classroom`, `components/whiteboard`, `components/slide-renderer` |
| 7 | Persistência e segurança | `packages/@openmaic/storage`, `lib/persistence`, `SECURITY.md`, `AGENTS.md` |
| 8 | Testes e avaliação | `tests/`, `e2e/`, `eval/` |

Dica: leia `CONTRIBUTING.md` e `AGENTS.md` cedo — explicam as regras de arquitetura (ex.: escopo por dono, neutralidade de provedor).

## 7. Minhas anotações

- [ ] Rodei o projeto localmente
- [ ] Gerei minha primeira aula
- [ ] Entendi o fluxo de um slot no `openmaic.yml`
- …
