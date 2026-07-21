# Multitrack com Painéis Sincronizados

App onde você (admin) cadastra canções, envia faixas separadas, atribui cada faixa aos painéis **Músicos** e/ou **Som**, e controla o play/pause/seek em tempo real — os painéis abertos tocam em sincronia apenas as faixas que lhes pertencem.

## Perfis e acesso

- **Admin** (você): `luizrogeriopx@gmail.com`, senha provisória `123456`, obrigatório trocar no primeiro acesso. Cadastra canções, envia faixas, define roteamento, convida participantes, controla playback.
- **Músico** e **Sonoplasta**: contas convidadas pelo admin (email + senha temporária, troca obrigatória no 1º login). Cada convite dá acesso ao painel `/musicos` ou `/som` (um convite pode dar acesso a ambos).
- Login único em `/auth`. Após autenticar, o usuário só vê os painéis a que tem permissão.

## Rotas

```text
/                     → landing simples com CTA de login
/auth                 → login + troca de senha obrigatória
/admin                → dashboard (só admin): canções, faixas, convites
/admin/songs/$id      → editor da canção: upload de faixas + roteamento (músicos/som/ambos) + controles de play
/musicos              → painel Músicos (protegido)
/som                  → painel Som (protegido)
```

`/musicos` e `/som` mostram a canção "ao ar" escolhida pelo admin, com um player que reproduz apenas as faixas atribuídas ao painel. Sync via Realtime (canal por sessão de reprodução): admin emite `play`, `pause`, `seek`, `loadSong` e todos os painéis obedecem.

## Modelo de dados (Lovable Cloud)

- `profiles` (id, email, display_name, must_change_password)
- `app_role` enum (`admin`, `musico`, `som`)
- `user_roles` (user_id, role) — verificação via função `has_role` SECURITY DEFINER
- `songs` (id, title, bpm, notes, created_by, created_at)
- `tracks` (id, song_id, name, storage_path, mime, duration_seconds, route [`musicos`|`som`|`both`], volume, order_index)
- `playback_state` (song_id, is_playing, position_seconds, updated_at) — canal Realtime para sincronia
- Bucket privado `tracks` para os arquivos de áudio

RLS: admin faz tudo; músicos/sonoplastas leem canções + faixas filtradas pelo `route` do seu perfil; ninguém escreve exceto admin.

## Fluxo de upload e roteamento

No editor da canção: arrastar/enviar múltiplos arquivos (mp3, wav, flac, m4a, ogg), cada faixa lista com nome editável, seletor **Músicos / Som / Ambos**, controle de volume e ordem. Faixas ficam no bucket privado, servidas via signed URL de curta duração.

## Playback sincronizado

- Admin abre `/admin/songs/$id`, clica **Colocar no ar** → grava `playback_state` e emite evento `load` no canal Realtime.
- Painéis assinam o canal, buscam signed URLs das faixas permitidas, pré-carregam (`<audio preload="auto">`).
- Admin dispara **Play** → broadcast `{ action: "play", startedAt, position }`. Cada painel calcula offset e dá play alinhado. Pause/seek idem.
- Correção de deriva: a cada intervalo o admin publica `position`; painéis com diferença > 150ms ajustam `currentTime`.

## Convites

Admin cria convite em `/admin` (email + painel). Server function usa admin API para criar usuário com senha temporária aleatória e marca `must_change_password = true`. Admin vê a senha uma única vez pra repassar.

## Detalhes técnicos

- **Cloud**: Supabase (habilitar). Auth email/senha; sem OAuth.
- **Server functions** (`createServerFn` + `requireSupabaseAuth`) para: criar convite, mudar roteamento, publicar playback_state, gerar signed URLs.
- **Realtime** canal `playback:global` para sync.
- **Semear admin**: migração cria o usuário via `auth.admin`/SQL seed com email fixo, senha `123456`, `must_change_password=true`, role `admin`.
- **UI**: shadcn + tokens semânticos; tema escuro estilo estúdio (fundo grafite, primary âmbar/laranja para "REC/AO VIVO"), tipografia sem-serifa condensada.
- **Formatos**: qualquer áudio aceito pelo `<audio>` nativo do navegador (mp3, wav, flac, m4a, ogg, webm).

## Ordem de implementação

1. Habilitar Lovable Cloud.
2. Migração: enums, tabelas, RLS, grants, `has_role`, seed do admin, bucket `tracks` + policies.
3. Design system (tokens escuros + variantes).
4. Auth (`/auth`) com troca de senha obrigatória.
5. Layouts protegidos (`_authenticated`, guard admin, guard músicos/som).
6. Admin: lista de canções, criar canção, editor com upload + roteamento + convites.
7. Painéis `/musicos` e `/som` com player sincronizado via Realtime.
8. Controles de playback do admin (play/pause/seek/colocar no ar).

Quer que eu prossiga com essa implementação?
