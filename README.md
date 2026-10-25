# SENAI BRAWL

Protótipo jogável de arena 2D online, criado para a turma. O projeto usa personagens originais inspirados nas fichas da gincana, sem login, loja, troféus ou progressão.

## O que já entra nesta primeira versão
- Lobby sem conta, com criação e entrada em sala por código.
- Modos Pique-Gema, Fute-Brawl e Combate.
- Os 11 personagens ficam liberados desde o início.
- Controles: WASD, mouse, clique esquerdo (ataque), clique direito (Super), E (ativar Hipercarga) e Esc (menu).
- Servidor WebSocket autoritativo, bots e preenchimento de vagas.
- HUD com vida, Super, Hipercarga e pontuação.

Esta é uma primeira versão de gameplay. Os valores de equilíbrio e algumas habilidades ainda são provisórios; a prioridade é validar o loop de jogo e a conexão online antes de aprofundar todas as habilidades específicas.

## Rodar localmente
Requer Node.js 20 ou superior.

```bash
cd server
npm install
npm start
```

Abra `client/index.html` em um servidor estático local (por exemplo, a extensão Live Server do VS Code). No primeiro acesso, informe no botão **Servidor** o endereço WebSocket local: `ws://localhost:3001`.

## Publicar no Render
1. Importe este repositório no Render usando **New + Blueprint**. O arquivo `render.yaml` configura um site estático e um serviço Node.
2. Aguarde os dois serviços terminarem o deploy. Copie a URL HTTPS do serviço `senai-brawl-server`.
3. No site, clique em **Servidor** e informe a URL WebSocket correspondente: troque `https://` por `wss://` (ex.: `wss://senai-brawl-server.onrender.com`). Salve. Ela fica guardada no navegador.
4. Crie uma sala e mande o código para os amigos. Todos precisam abrir o site e usar o mesmo endereço de servidor.

O plano gratuito do host pode suspender o servidor após inatividade, então a primeira conexão depois de um tempo pode demorar.

## Estrutura
- `client/`: interface, renderização Canvas e controles.
- `server/`: salas, simulação e bots.
- `render.yaml`: configuração de deploy do Render.

## Personagens da primeira versão
Tavares, Galhardo, Giovanne, Honda, Berbas, Lê, Tsen, Isaac, João, Freitas e Thiago. Habilidades estão representadas por arquétipos de classe e continuarão recebendo ajustes para refletir melhor as fichas completas.
