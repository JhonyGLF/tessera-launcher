# Auditoria de segurança — Tessera Launcher 1.0.0 (antes JG Client)

Data: 29/10/2026. Escopo: `main.js`, `preload.js`, `launcher/*.js`, `renderer/` (pontos de injeção de HTML,
links, chamadas à API) e dependências usadas em tempo de execução.
Método: leitura do código + provas de conceito executadas num app de teste isolado (pastas próprias,
nada nos dados reais). Só entra como **vulnerabilidade** o que foi reproduzido ou comprovado no código.

## Resumo

| # | Severidade | Situação | Achado |
|---|-----------|----------|--------|
| V1 | Alta | **Corrigido** (Grupo 1) | `.mrpack` sobrescreve `instance.json` e injeta argumentos da JVM (execução de código ao jogar) |
| V2 | Alta | **Corrigido** (Etapa 1) | Electron 33.4.11 sem suporte, com 46 avisos de segurança publicados |
| V3 | Baixa | **Mitigado** (Grupo 2) · atualização do `adm-zip` pendente | `adm-zip` 0.5.16 aloca a memória declarada pelo zip (`.mrpack` malicioso) |
| V4 | Baixa | **Corrigido** (Grupo 2) | `abrirPasta` abre/executa arquivos, não só pastas |

Nenhum achado crítico confirmado.

---

## V1 — Modpack sobrescreve `instance.json` (Alta)

**Onde:** `launcher/modrinth.js` — `validarMrpack()` (linhas ~660–682) e `instalarDeMrpack()`.

**Causa raiz:** a proteção do `instance.json` compara o **texto** do caminho vindo do zip com a regex
`^instance\.json$`. O caminho final, porém, é calculado depois por `caminhoDentro()`, que descarta
segmentos `.`; e o Windows trata `arquivo::$DATA` como o próprio arquivo (fluxo padrão do NTFS).
Nomes diferentes no texto acabam no mesmo arquivo no disco.

**Prova (reproduzida):** `.mrpack` montado byte a byte, sem loader (vanilla), importado por
`modrinth.importarMrpack()`:
- `overrides/./instance.json` → `instance.json` sobrescrito ✅
- `overrides/instance.json::$DATA` → `instance.json` sobrescrito ✅
- `overrides/instance.json.` e `overrides/instance.json ` → **não** (viraram arquivos separados)
- O mesmo vale para a lista `files` do índice (mesma verificação por texto), com download de domínio permitido.

**Impacto:** o `jvmArgs` gravado pelo modpack chega ao comando do Java sem nova validação
(`instancias.js:966` → `jogo.js:367`). Com `-javaagent:<jar das overrides>` ou
`-XX:OnOutOfMemoryError=<comando>`, um modpack **sem mods** (que o usuário espera não executar código)
executa código ao clicar em Jogar, e o argumento fica escondido nas configurações da instância.
Exige que o usuário importe/instale o modpack malicioso e jogue.
(Modpacks com loader já executam código pelos próprios mods; o agravante aqui é o caso vanilla e a
alteração silenciosa dos metadados do launcher.)

**Correção aplicada (Grupo 1):** `validarCaminhoPack()` + `ehProtegido()` em `launcher/modrinth.js`.
Recusa componentes com `:` (fluxos NTFS), caracteres inválidos, ponto/espaço no fim e nomes de
dispositivo do Windows; a proteção do `instance.json` compara o **destino final** resolvido (sem
diferenciar maiúsculas), na validação dos `files`, das `overrides` e de novo no momento da escrita.
Comportamento mantido: `overrides/instance.json` de outros launchers continua sendo ignorado sem
quebrar a importação. **Testes:** `testes/mrpack.teste.js` (`npm run testar`) — 12 variantes nas
overrides, 8 na lista `files`, um modpack legítimo sintético e os índices de modpacks reais do
Modrinth; antes da correção: 12 falhas; depois: todos passam. Instalação completa real do
Fabulously Optimized (49 mods) sem regressão.

## V2 — Electron 33.4.11 sem suporte (Alta, dependência)

**Confirmado:** `npm audit` lista 46 avisos para `electron <=42.11.15` (12 de severidade alta), com
correção só em versões maiores (atual: 45.1.0). A linha 33 não recebe mais correções de segurança,
inclusive do Chromium que renderiza as imagens remotas do Modrinth.

**Não demonstrado no launcher:** os avisos mais próximos da nossa configuração dependem de código
de um atacante rodando numa janela do app (não há XSS: ver "Não confirmados"):
- GHSA-v3j7-r9gq-3gjw — protocolo personalizado com `supportFetchAPI` sem `corsEnabled` (é o caso do `app://`);
- GHSA-h7rp-cf8h-j98x — desvio do isolamento de contexto;
- GHSA-jr5w-w6x2-84p9 — certificados eMudhra (afeta a janela de login, que usa a pilha de rede do Chromium).

**Correção aplicada (autorizada):** Electron **44.9.3** (série suportada; inclui a correção dos
certificados eMudhra, que a 44.7.2 ainda não tinha) e `electron-builder` **26.17.0** (elimina os avisos
crítico/altos das ferramentas de build e o build deixa de precisar de administrador). `npm audit`: 0 avisos
para o Electron e para a cadeia de build. **Validação:** 42 testes de regressão (inclui teste novo do ícone,
por causa da mudança no `toBitmap()` do Electron 43), janela de login da Microsoft carregando
`login.live.com`, fluxo completo (instância Fabric + Sodium + Jogar/Parar pela interface, 14 mods
carregados), capturas de todas as telas sem erro no console, e o `.exe` empacotado subindo isolado.

## V3 — `adm-zip` aloca a memória declarada (Baixa)

**Onde:** `modrinth.js` (`entrada.getData()` das overrides). **Prova:** override declarando ~4 GB →
importação falha com `Array buffer allocation failed` (sem travar no teste). Um valor declarado
abaixo da memória livre ocupa essa memória até a falha. Avisos GHSA-xcpc-8h2w-3j85 / GHSA-7q85-xj36-vmfc.
**Mitigação aplicada (Grupo 2):** `launcher/modrinth.js` confere o tamanho declarado antes de ler:
índice até 32 MB, cada arquivo das overrides até 512 MB (o maior encontrado em modpacks reais: 15,1 MB).
Recusa com mensagem clara e **antes** de criar a instância. **Testes:** `testes/mrpack-tamanho.teste.js`.
**Pendente:** atualizar para `adm-zip` 0.6.1 (versão maior; precisa de autorização) para cobrir os demais
avisos da biblioteca.

## V4 — `abrirPasta` abre arquivos (Baixa)

**Onde:** `instancias.js` — `abrirPasta()` (linhas ~350–364). **Prova:** `abrirPasta(id, 'mods/payload.bat')`
devolveu `{ok:true}` e chamou `shell.openPath` no `.bat` (que o Windows executaria).
**Alcance:** a interface só envia nomes de pastas; explorar exige código malicioso na interface.
**Correção aplicada (Grupo 2):** `abrirPasta()` recusa caracteres de controle (inclusive byte nulo) e só
chama `shell.openPath` se o destino existir e for uma pasta. **Testes:** `testes/abrirpasta.teste.js`
(5 pastas válidas continuam abrindo; 8 entradas maliciosas e 1 subpasta inexistente são recusadas
sem chamar o shell).

---

## Não confirmados (testados, sem efeito)
- **sanitize-html 2.13.0** (avisos GHSA-vccv-cmxp-4j9h, -g8qq-57p8-ggw5, -jxwj-j7wr-gfrw, -x3q4-9hxx-gx8m,
  -cv27-6wvh-8x7j): 8 payloads dos avisos passaram por `limparHtml()` e todos foram neutralizados pela
  lista restrita de tags/atributos. A CSP (`default-src 'self'`) bloquearia scripts mesmo assim.
  Atualizar para 2.18+ é recomendável como prevenção.
- **Bomba de descompressão com tamanho declarado pequeno:** o `adm-zip` 0.5.16 recusa (“Cannot create a
  Buffer larger than …”). A leitura de metadados de mods já limita o tamanho declarado (4 MB).
- **`instance.json.` / `instance.json `** (ponto/espaço final): geraram arquivos separados.

## Observações (endurecimento, não são vulnerabilidades comprovadas)
- Instaladores do Forge/NeoForge são baixados (HTTPS do repositório oficial) e executados sem conferir
  hash; o instalador em cache é reutilizado sem nova verificação.
- `atualizarConteudo` confia no `versaoId` vindo da interface (só importa com interface comprometida).
- `jvmArgs` e `javaPersonalizado` são, por natureza, capazes de executar código; hoje só a própria
  interface (sem XSS conhecido) consegue alterá-los.
- O token do Minecraft vai na linha de comando do Java (igual ao launcher oficial; visível a processos
  do mesmo usuário).
- Sem `setPermissionRequestHandler` nem endurecimento de janelas criadas por terceiros (login do msmc).
- Caminhos vindos de JSONs oficiais (bibliotecas, assets) não são verificados contra `..` (fontes confiáveis).
- Ferramentas de build (`electron-builder` 25, `tar`, etc.) têm avisos altos/críticos que afetam só a
  máquina que gera o `.exe`, não o app distribuído.

## Plano de correção (em etapas)
1. ~~**V1** — validação de caminhos do `.mrpack` pelo destino final + testes.~~ ✅ feito
2. ~~**V4** — `abrirPasta` só abre pastas.~~ ✅ feito
3. ~~**V3** — limite de tamanho declarado nas entradas do `.mrpack`.~~ ✅ feito · `adm-zip` 0.6.1 (precisa de autorização)
4. ~~**V2** — atualizar o Electron.~~ ✅ feito (44.9.3 + electron-builder 26.17.0)
5. Preventivo: `sanitize-html` 2.18+, endurecimentos das observações.
