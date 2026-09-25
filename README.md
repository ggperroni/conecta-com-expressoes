# Conecta com Expressões

Jogo de tabuleiro matemático para navegador, implementado a partir do artigo
*esboço artigo*: um tabuleiro 9 × 9 de valores numéricos — reduzível até 6 × 6 —,
três dados por turno e duas operações para construir uma expressão que aterrisse
numa casa livre. Vence quem primeiro alinhar quatro peças.

Não há build, dependências nem servidor: **abra `index.html` no navegador**.

```
open index.html
```

## O jogo

**Objetivo** — formar uma sequência de quatro peças da mesma cor na horizontal,
na vertical ou em qualquer diagonal.

**Um turno**

1. Role os três dados e obtenha *a*, *b* e *c*. Os três entram na expressão, uma
   vez cada.
2. Escolha duas operações entre `+ − × ÷ ^` (podem repetir) e um dos dois
   agrupamentos: `(a ∘ b) ∘ c` ou `a ∘ (b ∘ c)`.
3. Calcule de cabeça e digite o resultado — em telas de toque, escolha-o numa
   lista com as casas ainda livres, para o teclado virtual não cobrir o
   tabuleiro. Certo, e com a casa livre, a peça é colocada nela.

Se nenhuma expressão possível com os dados sorteados alcança uma casa livre, a
rolagem não vale: o jogador rola de novo, quantas vezes for preciso, sem perder
a vez nem gastar tentativa.

**As três tentativas** — cada turno dá três tentativas sobre a *mesma* rolagem.
Uma tentativa é consumida quando o resultado digitado não é o valor da expressão,
quando a expressão não está definida (divisão por zero, expoente fracionário),
ou quando o cálculo está certo mas não existe casa com aquele valor ou a casa já
está ocupada. Esgotadas as três, o turno passa sem peça. Escolher operações ou
enviar o campo em branco não consome tentativa. O número de tentativas é
configurável em *Ajustes*.

Na Partida, um erro **não** revela o valor correto — a conta é do jogador.

**O cronômetro** — a contagem começa quando os dados param, não quando o turno
abre: pensar antes de rolar é de graça. O tempo vale para as três tentativas
juntas e pausa enquanto qualquer janela está aberta, de modo que consultar as
regras ou as frequências não custa turno. Esgotado, o turno passa sem peça, como
se as tentativas tivessem acabado. A duração é de 30, 60 ou 90 segundos, com
90 por padrão. No Treino o mesmo mostrador vira um cronômetro crescente, que só
informa o tempo gasto.

**Tamanho do tabuleiro** — de 6 × 6 a 9 × 9. Os tamanhos menores são recortes
quadrados **centrados** na figura do artigo: o zero, que fica no centro, aparece
em todos eles, e os valores continuam distintos dentro do recorte, então cada
resultado ainda corresponde a no máximo uma casa. A sequência para vencer
continua sendo de quatro peças, o que torna as partidas menores bem mais rápidas
— e mais difíceis, porque menos valores têm casa. Trocar o tamanho reinicia a
partida: as peças não têm posição equivalente noutro recorte.

## Dois modos

| Modo | Para quê |
| --- | --- |
| **Partida** | Dois jogadores no mesmo computador, alternando turnos, com as três tentativas valendo. |
| **Treino** | Sem adversário e sem limite: o tabuleiro destaca as casas alcançáveis com a rolagem atual, o valor exato da expressão é sempre mostrado, e *Sortear casa-alvo* propõe a análise inversa — quais operações levam a este número? *Ver possibilidades* lista todas as expressões válidas da rolagem. |

## Tema claro e escuro

O botão no alto da tela alterna os dois temas; em *Ajustes* há um terceiro
valor, **Automático**, que segue a preferência do sistema — inclusive se ela
mudar com a página aberta. A escolha fica em `localStorage`, junto dos outros
ajustes.

Quem decide é `js/theme.js`, carregado no `<head>`: o tema precisa estar
resolvido antes da primeira pintura, senão um tema escuro salvo apareceria depois
de um piscar claro. O atributo `data-theme` do elemento raiz traz sempre o tema
já resolvido, claro ou escuro, nunca "automático" — é o que permite à folha de
estilo ter **um único bloco escuro**, que troca a paleta e mais nada: nenhuma
regra é reescrita, porque toda cor da folha sai de uma variável.

O ícone da aba segue o mesmo raciocínio: `favicon.svg` — a face 5 de um dado —
leva dentro uma media query de `prefers-color-scheme`, então o dado clareia e os
pontos escurecem numa barra de abas escura. Quem não aceita ícone em SVG (o
Safari) fica com `favicon.png`, o mesmo desenho a 32 × 32, gerado por
`node test/make-favicon.js`. Um ícone de aba não vale um passo de build: o script
corre à mão quando o desenho muda, e o PNG vai versionado.

## Cabe na janela

A página não rola: o que existe está sempre à vista, em qualquer tamanho de
tela. Três mecanismos, do mais simples ao menos:

- **O tabuleiro é um quadrado do espaço livre.** A coluna da esquerda mede o que
  sobrou com uma *container query* (`container-type: size`) e o tabuleiro adota o
  menor dos dois lados, `min(100cqw, 100cqh)`. Os dígitos acompanham o lado da
  casa, então um 6 × 6 tem números maiores que um 9 × 9 sem nenhum ajuste.
- **O espaçamento encolhe junto com a janela.** Todo espaço vertical é múltiplo
  de `--u`, uma unidade proporcional à altura — sem saltos entre faixas. Os
  controles têm piso: uma caixa menor que os próprios glifos apareceria cortada.
- **O resto é medido, não adivinhado.** A coluna da direita tem altura variável
  (um aviso de três linhas, um nome comprido), e faixa de altura nenhuma prevê
  isso. `game.js` mede a coluna e sobe degraus até ela caber: primeiro aperta o
  ar entre os blocos, depois reduz os tipos, depois dispensa os rótulos das
  operações e, só no último degrau, o registro das jogadas. Tabuleiro, dados,
  expressão e campo de resposta nunca saem. O cálculo refaz-se a cada
  redimensionamento e também quando o conteúdo muda de altura sozinho, via
  `ResizeObserver`.

O **registro das jogadas** é o único conteúdo que cresce sozinho durante a
partida, e por isso é o único que rola por dentro: o cartão fica com a folga que
sobra na coluna — nunca com o tamanho do histórico — e tem piso de cabeçalho mais
uma jogada inteira. Esse piso é declarado, e não deixado em `auto`, porque o
mínimo automático de um item flex é o do seu conteúdo: sem ele, cada jogada
anotada aumentava a altura mínima da coluna, e uma partida longa fazia a escada
subir até apertar toda a interface e esconder justamente este cartão.

O crédito no rodapé é irmão da topbar nessa mesma coluna: o que ele ocupa sai do
espaço livre do tabuleiro, e é por isso que ele não empurra nada para fora da
tela — a área de jogo não repete embaixo a margem que ele já dá.

Abaixo de 900 px de largura não há como manter duas colunas: a interface empilha
e passa a rolar por dentro da área de jogo — nada fica cortado, mas aí é preciso
rolar para ver tudo.

## Ajustes

- **Tamanho do tabuleiro** — 6 × 6, 7 × 7, 8 × 8 ou 9 × 9 (padrão, o do artigo).
- **Tentativas por turno** — 1, 2 ou 3 (padrão 3).
- **Tempo por turno** — 30, 60 ou 90 segundos (padrão 90). Um novo valor
  vale já para o turno em andamento.
- **Permitir usar os dados em qualquer ordem** (padrão ligado). Três dados sobre
  a mesa não têm ordem, então por omissão eles podem ser rearranjados na
  expressão. Desligue para fixar a ordem sorteada, como na enumeração de triplas
  ordenadas do artigo.
- **Destacar casas alcançáveis na Partida** (padrão desligado) — mediação para
  turmas iniciantes.
- **Tema** — automático (padrão, segue o sistema), claro ou escuro.
- Nomes dos jogadores e reinício da partida.

As preferências ficam em `localStorage`.

## Arquivos

```
index.html        estrutura e modais (regras, frequências, ajustes, possibilidades, resultado)
favicon.svg       ícone da aba: a face 5 de um dado, nos dois temas
favicon.png       o mesmo desenho a 32 × 32, para quem não aceita ícone em SVG
css/styles.css    folha única; paletas clara e escura, e os degraus de encaixe
js/theme.js       resolve o tema antes da primeira pintura
js/engine.js      aritmética exata, validade e enumeração das expressões
js/board.js       os 81 valores da Figura 1, os recortes 6–9 e a detecção de sequências
js/game.js        estado, turnos, tentativas, cronômetro, encaixe na janela
test/             verificações em Node e roteiro de interface em Chrome headless
```

`engine.js` e `board.js` não dependem do DOM e carregam tanto no navegador
quanto em Node.

## Matemática

A aritmética é **exata**, com frações de `BigInt`: `12 ÷ 4` é o inteiro 3, e
`5 ÷ 2` é um cálculo correto que simplesmente não corresponde a casa alguma. Não
há ponto flutuante em nenhum lugar do caminho.

Uma expressão é indefinida quando divide por zero, quando o expoente não é
inteiro (`2 ^ (5 ÷ 2)`), ou em `0 ^ k` com `k ≤ 0`. Expoentes grandes são
recusados por magnitude, exceto quando a base é ±1, caso resolvido exatamente
(`1 ^ (6 ^ 6) = 1`).

O espaço completo tem **10 800** configurações: 216 triplas ordenadas × 25 pares
de operações × 2 agrupamentos. Delas, 10 562 são definidas e 10 289 caem abaixo
do corte de magnitude de 10⁶ usado no levantamento; 7 982 dão resultado inteiro.
O painel *Frequências* mostra essa contagem.

### Conferência contra o artigo

O motor reproduz exatamente:

- os **353** resultados positivos distintos, **130** negativos distintos e **79**
  positivos distintos em [1, 100];
- toda a coluna negativa da Tabela 1 (−1: 198, −2: 168, −3: 142, … −10: 25);
- as frequências positivas altas (8: 254, 7: 205, 12: 200);
- a alcançabilidade de todas as 81 casas do tabuleiro.

Uma divergência permanece em aberto: a coluna **positiva** da Tabela 1 do artigo
é sistematicamente mais alta para valores pequenos (1: 712 contra 668 aqui; 2, 3,
5 e 6: +6 cada; 4: +7; 9: +1), e o total de "10 324 expressões válidas" não
coincide com nenhuma das contagens acima. Hipóteses testadas e descartadas:
expoentes fracionários avaliados como raízes reais, o comportamento de
`Fraction.__pow__` em Python e tolerância de ponto flutuante — qualquer uma delas
também mudaria 8: 254, que bate exatamente. O desvio parece vir do script de
enumeração dos autores e não afeta o jogo: o tabuleiro é transcrito literalmente
da Figura 1.

## Testes

```
node test/checks.js                    # motor, tabuleiro, recortes e detecção de vitória
```

Interface, em Chrome headless (dirige a página como um jogador: rola, escolhe
operações, digita resultados, deixa o tempo acabar, troca o tamanho do tabuleiro,
joga uma partida até a vitória e confere que nada fica cortado na janela):

```
node test/make-smoke.js
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --window-size=1440,900 \
  --virtual-time-budget=120000 \
  --dump-dom "file://$PWD/.smoke.html" | grep -A99 smoke-results
```

O tamanho da janela importa: as verificações de encaixe da coluna da direita só
valem com as duas colunas lado a lado, ou seja, acima de 900 px de largura.
Abaixo disso o roteiro corre sem elas.

O orçamento de tempo virtual é generoso porque o roteiro espera o cronômetro:
`Date.now()` avança com o relógio virtual, então as esperas do roteiro valem como
segundos de jogo. Se o shell já correr dentro de um sandbox, acrescente
`--no-sandbox` — o sandbox do Chrome não inicializa aninhado e o processo morre
sem produzir DOM.

Para inspeção visual, `node test/make-shot.js match|small|practice [dark]` gera
`.shot.html` já num estado de jogo e no tema pedido, pronto para `--screenshot`.
O tema entra fixo, e não por alternância, porque o Chrome headless se declara
escuro: alternar deixaria a foto clara justo quando se pediu a escura. Acrescente
`--force-prefers-reduced-motion`: sob `--virtual-time-budget` o relógio das
transições não avança, e sem esse ajuste destaques que animam `box-shadow` saem
congelados no valor inicial.

## Licença

Código sob a [licença MIT](LICENSE): use, copie, modifique e redistribua à
vontade, inclusive em sala de aula, mantendo o aviso de copyright. O tabuleiro
e as regras vêm do artigo citado no início; o crédito pela concepção do jogo é
dos autores.

---

Desenvolvido por [Guilherme Gaspar Perroni](https://www.linkedin.com/in/guilherme-perroni/).
