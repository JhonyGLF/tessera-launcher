# Tessera Launcher — Arquitetura (contrato entre módulos)

Launcher de Minecraft: Java Edition para Windows. Electron 33, sem etapa de build.
Todo texto visível ao usuário é em **português do Brasil**. Código, nomes de funções e
comentários também em português (siga o estilo dos arquivos existentes: comentários curtos,
nomes como `instalar`, `listar`, `progresso`).

## Pastas

```
main.js            processo principal: janela, protocolo app://, IPC (JÁ ESCRITO — é o contrato)
preload.js         window.jg = API da interface (JÁ ESCRITO — é o contrato)
launcher/          backend (Node, processo principal)
  tarefas.js       tarefas com progresso (JÁ ESCRITO)
  download.js      baixar(url, destino, {size, sha1}), baixarJson, emLote(itens, fn, aoAvancar, limite) (JÁ EXISTE)
  java.js          prepararJava(raiz, componente, progresso) → caminho do javaw.exe (JÁ EXISTE)
  jogo.js          motor: instalar versão (com inheritsFrom) e iniciar processo
  versoes.js       versões do Minecraft + loaders (Fabric, Quilt, Forge, NeoForge)
  config.js        configurações globais
  contas.js        contas Microsoft + offline
  instancias.js    instâncias (perfis): CRUD, conteúdo, mundos, jogar, logs
  modrinth.js      busca/instalação de mods, modpacks (.mrpack), resource packs, shaders; atualizações
  noticias.js      notas de atualização do Minecraft (feed oficial)
renderer/          interface (Preact + htm, módulos ES servidos por app://jg/renderer/...)
  vendor/preact-htm.js   import { html, render, useState, useEffect, ... } from './vendor/preact-htm.js'
assets/            ícone, logo, texturas, ícones de instância, fontes
```

Dados do usuário:
- `%APPDATA%\.tessera\` (constante `RAIZ` de launcher/caminhos.js, reexportada por jogo.js; a variável de ambiente
  `JG_RAIZ` troca essa pasta — **use sempre uma pasta própria em testes**)
  - `versions/`, `libraries/`, `assets/`, `runtime/` — compartilhados por todas as instâncias
  - `instances/<id>/` — cada instância; a própria pasta é o diretório do jogo (`--gameDir`).
    Contém `instance.json` (metadados), `icon.png` opcional, `mods/`, `resourcepacks/`,
    `shaderpacks/`, `saves/`, `config/`, `logs/`.
  - `cache/` — caches (ex.: `modrinth-hashes.json`)
- `%APPDATA%\Tessera Launcher\` (app.getPath('userData')) — `config.json`, `contas.json`

## Regras gerais
- Nada no backend lança erro para a interface: handlers de IPC devolvem `{ ok:false, mensagem }`
  em falhas que o usuário deve ver (mensagem curta em PT-BR). Funções de leitura simples podem
  devolver os dados direto.
- Operações longas usam `tarefas.executar(titulo, async (t) => {...})` e chamam
  `t.atualizar({ etapa, feitos, total })`. A interface mostra isso no painel de tarefas.
- Downloads sempre via `download.js` (verificação SHA-1/tamanho, novas tentativas, paralelismo).
- Requisições à API do Modrinth com header `User-Agent: Tessera-Launcher/<versão do app>` (sem e-mail).
- **Segurança**: caminhos vindos de fora (mrpack, nomes de arquivo da interface) devem ser validados:
  sem `..`, sem caminho absoluto, ficar dentro da pasta destino (proteção contra "zip slip").
  Arquivos do .mrpack só podem ser baixados de: cdn.modrinth.com, github.com,
  raw.githubusercontent.com, gitlab.com (regra da especificação do Modrinth).
  HTML vindo do Modrinth/feed de notícias é convertido de markdown com `marked` e limpo com
  `sanitize-html` **no backend** antes de ir para a interface.
- Ids de instância: slug do nome (minúsculas, a-z0-9 e hífen), único (sufixo -2, -3...).

## Formatos

### Instancia (o que `instancias.listar()` devolve, um por instância)
```js
{
  id: 'meu-fabric',                 // nome da pasta
  nome: 'Meu Fabric',
  mc: '1.21.11',                    // versão do Minecraft
  loader: { tipo: 'vanilla'|'fabric'|'quilt'|'forge'|'neoforge', versao: null|'0.16.9' },
  icone: 'grama',                   // preset (ver ICONES abaixo) ou 'personalizado'
  iconeUrl: 'app://jg/assets/icones/grama.png' | 'data:image/png;base64,...',
  criadaEm: 1712345678901,          // ms
  ultimoJogo: null | ms,
  tempoJogadoMs: 0,
  ramMB: null | 4096,               // null = usar o padrão global
  jvmArgs: '',                      // argumentos extras
  resolucao: null | { largura: 1280, altura: 720 },
  origem: null | { tipo: 'modrinth', projetoId, versaoId, nome, iconeUrl },  // modpacks
  rodando: false,
  quantidades: { mods: 12, resourcepacks: 1, shaderpacks: 0, mundos: 3 }
}
```

### ICONES (presets de ícone de instância)
Arquivos `assets/icones/<nome>.png` (pixel art 16x16 ampliada para 64x64, sem suavização):
`grama, pedra, terra, madeira, folhas, areia, neve, obsidiana, diamante, esmeralda, ouro, ferro,
redstone, ametista, lava, agua, livro, espada, picareta, maca`. URL na interface:
`app://jg/assets/icones/<nome>.png`. Ícone personalizado fica em `instances/<id>/icon.png` e vai
para a interface como data URL.

### Conteúdo instalado (`instancias.listarConteudo(id, tipo)`), tipo = 'mods'|'resourcepacks'|'shaderpacks'
```js
[{ arquivo: 'sodium-0.6.0.jar',    // nome real no disco (sem o sufixo .disabled)
   ativo: true,                    // false se o arquivo termina em .disabled
   tamanho: 123456,
   nome: 'Sodium',                 // do Modrinth (por hash) ou do metadado do jar; senão o nome do arquivo
   versao: '0.6.0' | null,
   autor: 'jellysquid3' | null,
   descricao: '...' | null,
   iconeUrl: 'https://cdn.modrinth.com/...' | null,
   projetoId: 'AANobbMI' | null,   // projeto do Modrinth, se identificado
   versaoId: '...' | null }]
```

### Mundo (`instancias.listarMundos(id)`)
`[{ pasta, nome, ultimoAcesso: ms|null, iconeUrl: data-url|null, tamanho: bytes|null }]`

### Conta (`contas.listar()`)
```js
{ contas: [{ id, tipo: 'msa'|'offline', nome, uuid }], ativa: id|null,
  podeOffline: bool }   // true só se existe conta Microsoft (que tenha o jogo) adicionada
```
Política de contas offline (igual ao Prism Launcher): só é possível criar conta offline depois de
adicionar uma conta Microsoft que tenha o Minecraft: Java Edition. Nome offline: 3–16 caracteres
`[A-Za-z0-9_]`. UUID offline = UUID v3 de `"OfflinePlayer:" + nome` (igual ao Java:
`UUID.nameUUIDFromBytes`). Contas Microsoft: refresh token criptografado com `safeStorage`.
`contas.sessao(id?)` → `{ tipo, nome, uuid, token, xuid }` (para offline: token `'0'`, xuid `''`),
renovando o token Microsoft se venceu. Lança Error com mensagem PT-BR se não houver conta.

### Config (`config.publica()`)
```js
{ ramMB: 4096, ramMaxMB: 16384, javaPersonalizado: null|'C:\\...\\javaw.exe',
  minimizarAoJogar: true, mostrarSnapshots: false,
  tema: 'sculk'|'grama'|'ametista'|'nether'|'gelo',
  instanciaSelecionada: null|id, ordemInstancias: 'recentes'|'nome' }
```
`config.salvar(mudancas)` aceita só essas chaves (exceto ramMaxMB), valida tipos e devolve `publica()`.

### Versões (`versoes.listarMc()`)
`{ ok:true, ultima: { release, snapshot }, versoes: [{ id, tipo: 'release'|'snapshot'|'old_beta'|'old_alpha', data }] }`
ou `{ ok:false, mensagem }`.
`versoes.listarLoaders(tipo, mc)` → `{ ok:true, versoes: [{ id, estavel: bool }] }` (mais nova primeiro)
ou `{ ok:false, mensagem }` (ex.: "O Forge não tem versão para o 26.3").
`versoes.garantirLoader({ tipo, mc, versao }, progresso)` (usado por instancias.jogar) → id da
versão instalada em `versions/<id>/<id>.json` (perfil que herda do vanilla via `inheritsFrom`).
Para 'vanilla' devolve o próprio `mc`. Forge/NeoForge: roda o instalador oficial com o Java do jogo
(`--installClient`/`--install-client` apontando para RAIZ; criar `launcher_profiles.json` vazio antes).

### Motor (`jogo.js`)
- `instalar(versaoId, progresso)` → `inst` (resolve `inheritsFrom` mesclando libraries/arguments;
  baixa cliente do vanilla pai, bibliotecas — inclusive libs maven sem `downloads` (Fabric) —,
  nativas, assets, log config, Java). Aceita `javaPersonalizado` via `opcoes`.
- `iniciar(inst, sessao, { ramMB, gameDir, jvmArgs, resolucao, javaPersonalizado })` → ChildProcess.
  O processo é `detached` + `unref()` e grava stdout/stderr direto num arquivo
  (`<gameDir>/logs/tessera-launch.log`, via file descriptor) — assim o jogo continua aberto se o
  launcher fechar. O evento 'exit' do ChildProcess ainda funciona enquanto o launcher está aberto.
  instancias.js acompanha esse arquivo (polling ~500 ms) para emitir as linhas novas ('log').

### instancias.js eventos (`instancias.eventos`, EventEmitter)
- `'instancias'` → lista completa (sempre que algo muda: criar, editar, tempo de jogo...)
- `'jogo'` → `{ id, estado: 'abrindo'|'rodando'|'fechado', codigo?, cedo? }`
  (`cedo` = fechou com erro em menos de 15 s → mostrar erro "veja o log")
- `'log'` → `{ id, linhas: ['...'] }` (linhas novas do jogo em execução, agrupadas)
`instancias.jogar(id)` → `{ ok:true }` ou `{ ok:false, mensagem }`; usa `tarefas.executar`
para a parte de preparo (loader + downloads) e emite 'jogo'. `lerLog(id)` → últimas ~2000 linhas.

### modrinth.js
- `buscar({ consulta, tipo: 'mod'|'modpack'|'resourcepack'|'shader', versaoMc, loader, categorias:[], ordenar: 'relevance'|'downloads'|'follows'|'newest'|'updated', pagina, limite })`
  → `{ ok, total, hits: [{ id, slug, titulo, descricao, autor, iconeUrl, downloads, seguidores, categorias, versoesMc, tipo, atualizado, imagemUrl }] }`
- `projeto(idOuSlug)` → `{ ok, projeto: { id, slug, titulo, descricao, corpoHtml, iconeUrl, autor, downloads, seguidores, categorias, loaders, versoesMc, tipo, licenca, links: {fonte, wiki, discord, issues, site}, galeria: [{url, titulo}], atualizado, publicado, clienteLado, servidorLado } }`
- `versoesProjeto(id, { loader, versaoMc })` → `{ ok, versoes: [{ id, nome, numero, tipo: 'release'|'beta'|'alpha', loaders, versoesMc, data, downloads, arquivo: { nome, tamanho } }] }`
- `categorias(tipo)` → `{ ok, categorias: [{ nome, cabecalho }] }`
- `instalarProjeto({ projetoId, versaoId?, instanciaId })` → resolve a melhor versão compatível com
  a instância (mc + loader; resource packs/shaders ignoram loader), instala dependências obrigatórias
  (recursivo, sem duplicar o que já existe), salva em mods/ resourcepacks/ shaderpacks/. Tarefa.
- `instalarModpack({ projetoId, versaoId?, nome? })` → cria instância nova a partir do .mrpack. Tarefa.
- `importarMrpack(caminho)` → idem a partir de arquivo local.
- `verificarAtualizacoes(instanciaId)` → `{ ok, atualizacoes: [{ tipo, arquivo, nome, versaoAtual, versaoNova, versaoId }] }`
  (usa `POST /v2/version_files/update` por hash).
- `atualizarConteudo(instanciaId, itens)` → substitui os arquivos. Tarefa.
- `hashes(caminhos)` → `Map sha1 → { projetoId, versaoId, nome, versao, autor, descricao, iconeUrl }`
  (cache em RAIZ/cache) — usado por instancias.listarConteudo.

- `planoOtimizacao(instanciaId)` → `{ ok, loader, mc, itens: [{ projetoId, nome, papel, estado: 'instalar'|'instalado'|'indisponivel'|'conflito', motivo, versaoId }] }`
  (lista curada `OTIMIZACOES` em modrinth.js; nada é instalado).
- `otimizarInstancia(instanciaId, projetoIds)` → instala os escolhidos (só ids da lista curada), com dependências,
  numa tarefa "Otimizando <nome>". `{ ok, instalados, falhas, mensagem }`.

### noticias.js
`listar()` → `{ ok, noticias: [{ id, titulo, versao, tipo, data, imagemUrl, resumo, corpoHtml }] }`
do feed `https://launchercontent.mojang.com/v2/javaPatchNotes.json` (imagens são relativas a
`https://launchercontent.mojang.com`). Cache em memória por 30 min; offline → último cache em disco.

## Interface
- Janela 1200x740 sem moldura, cantos em degrau (pixel), arrastável pela barra superior.
- `renderer/index.html` carrega `app://jg/renderer/app.js` como módulo.
- CSP: `default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; font-src 'self'`
  ('self' = app://jg). Imagens remotas (ícones do Modrinth, notícias) são permitidas.
- Identidade: logo em pedra 3D (`assets/logo.png`), fundo de ardósia com sculk
  (`assets/tile-deepslate.png`), botões no estilo Bedrock (verde = ação principal), fonte
  Pixelify para títulos/botões, VT323 para números/detalhes, fonte do sistema (Segoe UI) para
  textos longos (descrições). Temas trocam só a cor de destaque.
- Para testar a interface sem o backend: `renderer/mock-api.js` define um `window.jg` falso
  com dados de exemplo (carregado só quando `window.jg` não existe).
