# Tessera Launcher

Launcher de Minecraft: Java Edition para Windows, com instâncias, mod loaders e a biblioteca do Modrinth.
Feito com Electron; a interface usa Preact + htm (sem etapa de build).

> Não oficial. Não aprovado pela Mojang ou Microsoft.

## Recursos
- **Instâncias**: cada uma é um Minecraft separado (versão, mods, mundos, configurações). Criar, duplicar,
  excluir, trocar ícone (20 ícones pixel ou imagem própria), trocar versão/loader, RAM própria,
  argumentos da JVM e resolução.
- **Mod loaders**: Vanilla, Fabric, Quilt, Forge e NeoForge (instalados automaticamente ao jogar).
- **Todas as versões oficiais**, das antigas (1.7.10, 1.8.9...) às novas (26.x), e snapshots se quiser.
- **Java automático**: baixa do catálogo oficial da Mojang o Java certo para cada versão (8, 17, 21, 25),
  ou usa um Java escolhido por você.
- **Explorar (Modrinth)**: mods, modpacks, resource packs e shaders com busca, filtros (versão, loader,
  categorias), ordenação, página de cada projeto (descrição, galeria, versões) e instalação com um clique,
  incluindo as dependências obrigatórias.
- **Modpacks**: instalar do Modrinth ou importar um arquivo `.mrpack` vira uma instância nova pronta.
- **Conteúdo da instância**: ativar/desativar, remover, adicionar arquivos, **verificar e aplicar atualizações**.
- **Otimizar instância**: um clique instala os mods de desempenho certos para a versão e o loader
  (Sodium ou Embeddium, Lithium, FerriteCore, Entity Culling, ImmediatelyFast, ModernFix, More Culling,
  Dynamic FPS), pulando o que não existe para a versão ou conflita com o OptiFine.
- **Joga sem internet**: com o jogo e o Java já baixados, abre normalmente offline.
- **Mundos** e **log ao vivo** do jogo (com filtro, copiar e pasta de logs).
- **Contas**: várias contas Microsoft e offline, troca rápida e alteração de skin com prévia 3D.
- **Idioma**: interface em Português (Brasil) ou Inglês, configurável no launcher.
- **Visual**: 5 temas de cor (Sculk, Grama, Ametista, Nether, Gelo), notícias oficiais do Minecraft na tela inicial.

### Contas offline
Seguem a mesma regra do Prism Launcher: só podem ser criadas depois de adicionar uma conta Microsoft que
tenha o Minecraft: Java Edition. Servem para jogar sem internet, em LAN e em servidores no modo offline.

## Baixar
Na página de [lançamentos](https://github.com/JhonyGLF/tessera-launcher/releases/latest):
- **`Tessera-Launcher-Setup-<versão>.exe`** — instalador. **Recomendado**: se atualiza sozinho.
- **`Tessera-Launcher-<versão>-portatil.exe`** — roda sem instalar; avisa quando há versão nova, mas
  a atualização é manual.

O `.exe` ainda não tem assinatura digital, então o Windows pode mostrar "O Windows protegeu o
computador". Clique em **Mais informações → Executar assim mesmo**. O código está todo aqui para
quem quiser conferir.

## Atualizações
O launcher procura versões novas nos lançamentos deste repositório ao abrir e a cada 6 horas.
O arquivo baixado só é aceito se o hash (sha512) bater com o publicado. Quando a versão nova está
pronta, aparece **"Atualização pronta — Reiniciar"** na barra lateral (e em Configurações › Sobre).

## Rodar pelo código
Precisa do [Node.js](https://nodejs.org) instalado. No terminal, na pasta do projeto:

```
npm install
npm start
```

## Testes de regressão
`npm run testar` (ou `npm run testar -- mrpack` para um arquivo só). Rodam dentro do Electron com
pastas temporárias, sem tocar nos seus dados. Ficam em `testes/*.teste.js`.

## Gerar o .exe
`npm run build` (não precisa de administrador).

Saída na pasta `dist`: um `.exe` portátil e um instalador.


## Publicar uma versão nova
1. Suba o número em `package.json` → `"version"` (ex.: `1.0.0` → `1.1.0`).
2. Rode `npm run testar` (tudo precisa passar) e gere os arquivos com `npm run build`.
3. Faça o commit e publique (precisa do [GitHub CLI](https://cli.github.com) logado):
   ```
   git push
   gh release create v1.1.0 --title "Tessera Launcher 1.1.0" --notes "O que mudou..." ^
     dist/Tessera-Launcher-Setup-1.1.0.exe dist/Tessera-Launcher-Setup-1.1.0.exe.blockmap ^
     dist/latest.yml dist/Tessera-Launcher-1.1.0-portatil.exe
   ```
   O `latest.yml` e o `.blockmap` são obrigatórios: é por eles que os launchers instalados encontram e
   conferem a versão nova.

## Onde ficam os arquivos
- `%APPDATA%\.tessera\` — jogo: `versions/`, `libraries/`, `assets/`, `runtime/` (Java) compartilhados,
  e `instances/<id>/` (cada instância é uma pasta de jogo completa: mods, saves, config, logs...).
- `%APPDATA%\Tessera Launcher\` — configurações do launcher e contas (tokens criptografados pelo Windows).

O launcher se chamava **JG Client**. Na primeira abertura como Tessera, as pastas antigas
(`%APPDATA%\.jgclient` e `%APPDATA%\JG Client`) são renomeadas automaticamente — contas, instâncias e
downloads continuam lá. Se algum arquivo estiver em uso, o launcher usa a pasta antiga e tenta de novo depois.

## Estrutura do código
- `main.js`: processo principal (janela, protocolo `app://`, chamadas da interface)
- `preload.js`: a API que a interface pode usar (`window.jg`)
- `launcher/`: backend
  - `jogo.js` instala e inicia versões (inclusive perfis de loader com `inheritsFrom`)
  - `versoes.js` versões do Minecraft e dos loaders (Fabric, Quilt, Forge, NeoForge)
  - `instancias.js` instâncias, conteúdo, mundos, jogar e logs
  - `modrinth.js` busca, instalação, modpacks `.mrpack` e atualizações
  - `contas.js` contas Microsoft (msmc) e offline · `config.js` configurações
  - `java.js` Java da Mojang · `download.js` downloads com verificação · `tarefas.js` progresso
  - `noticias.js` notas de atualização do Minecraft
- `renderer/`: interface (`app.js`, `rotas.js`, `estado.js`, `componentes/`, `paginas/`, `estilos/`)
  - `mock-api.js` simula o backend para testar a interface sem ele
- `assets/`: logo, ícones de instância, ícones de loader, banner, texturas e fontes pixel
  (Pixelify Sans e VT323, licença SIL OFL)
- `make_assets.py`: gera os assets em pixel art (opcional, precisa de Pillow e numpy)
- `ARQUITETURA.md`: contrato entre os módulos (formatos de dados)

## Licença
[GPL-3.0](LICENSE). Você pode usar, estudar, modificar e redistribuir o Tessera; versões modificadas
distribuídas precisam manter o código aberto sob a mesma licença. As fontes Pixelify Sans e VT323 são
da SIL Open Font License 1.1. Minecraft é marca registrada da Mojang AB; este projeto não é oficial.
