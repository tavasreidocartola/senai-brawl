(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const characters = [
    {id:"tavares",name:"Tavares",role:"Destruidor",skill:"Ricochete",hp:7300,color:"#35d5ff",desc:"Disparos ricocheteiam nas paredes."},
    {id:"galhardo",name:"Galhardo",role:"Suporte",skill:"Cura em área",hp:6600,color:"#a8f05a",desc:"Super recupera vida da equipe."},
    {id:"giovanne",name:"Giovanne",role:"Tanque",skill:"Investida",hp:9800,color:"#ff8746",desc:"Resistente e forte de perto."},
    {id:"honda",name:"Honda",role:"Atirador",skill:"Tiro preciso",hp:5200,color:"#ffcf4a",desc:"Muito dano a longa distância."},
    {id:"berbas",name:"Berbas",role:"Destruidor",skill:"Rajada tripla",hp:6100,color:"#c99bff",desc:"Dispara uma sequência de projéteis."},
    {id:"le",name:"Lê",role:"Atirador",skill:"Foguetão",hp:5600,color:"#ff7ba5",desc:"Ataque de grande alcance."},
    {id:"tsen",name:"Tsen",role:"Controle",skill:"Explosão",hp:6400,color:"#5ce1c5",desc:"Pressiona grupos de inimigos."},
    {id:"isaac",name:"Isaac",role:"Suporte",skill:"Cura em área",hp:6700,color:"#d8edff",desc:"Ajuda aliados a permanecer na luta."},
    {id:"joao",name:"João",role:"Controle",skill:"Controle de área",hp:7200,color:"#e6b44a",desc:"Disparo de médio alcance."},
    {id:"freitas",name:"Freitas",role:"Lançador",skill:"Área explosiva",hp:5900,color:"#f58b54",desc:"Projéteis explodem na área."},
    {id:"thiago",name:"Thiago",role:"Tanque",skill:"Investida",hp:9500,color:"#86a8ff",desc:"Tanque que parte para cima."}
  ];
  const modes = {gemas:"PIQUE-GEMA",fute:"FUTE-BRAWL",combate:"COMBATE"};
  let selectedCharacter = "tavares", selectedMode = "gemas", socket = null, roomCode = "", playerId = "", isHost = false, myTeam = 0, latestPlayers = [], gameState = null, gameRunning = false, keys = new Set(), mouse = {x:500,y:310}, attackHeld = false, superHeld = false, hyperPressed = false, lastInput = 0, toastTimer = null, previousScreen = "home";
  const canvas = $("arena"), ctx = canvas.getContext("2d");
  const SERVER_KEY = "senaiBrawlServer";
  function getServerUrl() {
    let value = localStorage.getItem(SERVER_KEY);
    if (value) return value;
    const isLocal = ["localhost","127.0.0.1"].includes(location.hostname);
    if (isLocal) return "ws://localhost:3001";
    return (location.protocol === "https:" ? "wss://" : "ws://") + location.host;
  }
  function toast(message) {
    const el = $("toast"); el.textContent = message; el.classList.remove("hidden");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add("hidden"), 3200);
  }
  function setConnection(online, label) {
    const el = $("connection"); el.classList.toggle("online", online);
    el.lastChild.textContent = " " + label;
  }
  function renderCharacters() {
    $("characterGrid").innerHTML = characters.map(c => `<button class="character-card ${c.id===selectedCharacter?"selected":""}" data-character="${c.id}" title="${c.desc}"><span class="character-face" style="background:${c.color}">${c.name.charAt(0)}</span><b>${c.name}</b><small>${c.role}</small></button>`).join("");
    document.querySelectorAll("[data-character]").forEach(button => button.addEventListener("click", () => {
      selectedCharacter = button.dataset.character; renderCharacters(); updateSelectedCharacter();
    }));
    updateSelectedCharacter();
  }
  function updateSelectedCharacter() {
    const c = characters.find(x => x.id === selectedCharacter) || characters[0];
    $("selectedCharacter").querySelector(".avatar").textContent = c.name.charAt(0);
    $("selectedCharacter").querySelector(".avatar").style.background = c.color;
    $("selectedCharacter").querySelector(".selected-character");
    $("selectedCharacter").querySelector("b").textContent = c.name;
    $("selectedCharacter").querySelector("small").textContent = c.role + " · " + c.skill;
  }
  function openSocket(onReady) {
    const url = getServerUrl();
    if (!url) { $("serverDialog").showModal(); toast("Primeiro configure o endereço do servidor."); return; }
    if (socket && socket.readyState === WebSocket.OPEN) { onReady(); return; }
    if (socket) { try { socket.close(); } catch {} }
    setConnection(false, "Conectando…");
    try { socket = new WebSocket(url); } catch { toast("URL de servidor inválida."); return; }
    socket.addEventListener("open", () => { setConnection(true, "Conectado"); onReady(); });
    socket.addEventListener("message", event => {
      let data; try { data = JSON.parse(event.data); } catch { return; }
      handleMessage(data);
    });
    socket.addEventListener("close", () => { setConnection(false, "Desconectado"); if (roomCode) toast("Conexão encerrada. Confere se o servidor está no ar."); });
    socket.addEventListener("error", () => { setConnection(false, "Falha na conexão"); toast("Não consegui conectar. Confere a URL do servidor."); });
  }
  function send(data) {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data));
    else toast("Sem conexão com o servidor.");
  }
  function createRoom() {
    openSocket(() => send({type:"create",name:$("playerName").value.trim()||"Jogador",characterId:selectedCharacter,mode:selectedMode,bots:$("botsToggle").checked}));
  }
  function joinRoom() {
    const code = $("roomCode").value.trim().toUpperCase();
    if (code.length !== 5) return toast("O código da sala tem 5 caracteres.");
    openSocket(() => send({type:"join",code,name:$("playerName").value.trim()||"Jogador",characterId:selectedCharacter}));
  }
  function handleMessage(data) {
    if (data.mode && modes[data.mode]) selectedMode = data.mode;
    if (data.type === "error") return toast(data.message || "Ocorreu um erro.");
    if (data.type === "created" || data.type === "joined") {
      roomCode = data.room; playerId = data.playerId; isHost = data.type === "created";
      $("roomCodeDisplay").textContent = roomCode;
      $("roomEmpty").classList.add("hidden"); $("roomActive").classList.remove("hidden");
      $("startBtn").classList.toggle("hidden", !isHost);
      toast(data.type === "created" ? "Sala criada! Manda o código pra turma." : "Entrou na sala!");
    }
    if (data.type === "lobby" || data.type === "created" || data.type === "joined") {
      if (data.players) latestPlayers = data.players;
      if (data.hostId) isHost = data.hostId === playerId;
      $("startBtn").classList.toggle("hidden", !isHost);
      renderPlayers(data.players || latestPlayers);
    }
    if (data.type === "match-start") {
      gameState = {...data, players:data.players||[], entities:[], score:data.score||[0,0], timeLeft:180};
      $("homeScreen").classList.add("hidden"); $("gameScreen").classList.remove("hidden"); $("resultsOverlay").classList.add("hidden");
      $("matchMode").textContent = modes[data.mode] || modes[selectedMode]; $("hudName").textContent = $("playerName").value || "Jogador";
      $("hudAvatar").textContent = (characters.find(c=>c.id===selectedCharacter)||characters[0]).name.charAt(0);
      $("arenaHint").textContent = "WASD mover · Mouse mirar · Clique esq. atacar · Dir. Super · E Hipercarga";
      gameRunning = true; requestAnimationFrame(renderLoop);
    }
    if (data.type === "state") { gameState = data; updateHud(); }
    if (data.type === "results") {
      gameRunning = false; $("resultsOverlay").classList.remove("hidden");
      $("winnerTitle").textContent = data.winner === "Empate" ? "EMPATE!" : data.winner === ( $("playerName").value || "Jogador") ? "VITÓRIA!" : "FIM DE JOGO";
      $("resultText").textContent = "Resultado: " + data.winner + " · " + (data.score ? data.score[0] + " : " + data.score[1] : "boa partida!");
    }
  }
  function renderPlayers(players) {
    if (!players || !players.length) return;
    $("playersList").innerHTML = players.map(p => `<div class="player-row"><i class="player-dot" style="background:${p.bot?"#a27aff":"#8cf36c"}"></i><b>${escapeHtml(p.name)}${p.id===playerId?" (você)":""}</b><small>${p.bot?"BOT":(p.ready?"PRONTO":"NA SALA")}</small></div>`).join("");
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function sendInput() {
    const now = performance.now(); if (now - lastInput < 45) return; lastInput = now;
    send({type:"input",input:{up:keys.has("w")||keys.has("arrowup"),down:keys.has("s")||keys.has("arrowdown"),left:keys.has("a")||keys.has("arrowleft"),right:keys.has("d")||keys.has("arrowright"),attack:attackHeld,super:superHeld,hyper:hyperPressed,aimX:mouse.x,aimY:mouse.y}});
    hyperPressed = false;
  }
  function updateHud() {
    if (!gameState || !gameState.players) return;
    const me = gameState.players.find(p => p.id === playerId);
    if (me) {
      myTeam = me.team;
      const pct = Math.max(0,me.hp/me.maxHp*100);
      $("healthBar").style.width = pct + "%"; $("healthBar").style.background = pct < 28 ? "var(--red)" : "var(--green)";
      $("healthText").textContent = Math.max(0,Math.ceil(me.hp)) + " / " + me.maxHp + " HP";
      $("superBar").style.width = me.super + "%"; $("superPercent").textContent = Math.floor(me.super) + "%";
      $("hyperBar").style.width = me.hyper + "%"; $("hyperPercent").textContent = me.hyperActiveUntil>Date.now() ? "ATIVA" : Math.floor(me.hyper) + "%";
      $("hyperBtn").classList.toggle("ready",me.hyper>=100); $("hyperBtn").classList.toggle("active",me.hyperActiveUntil>Date.now());
      $("hudAvatar").style.background = (characters.find(c=>c.id===me.characterId)||characters[0]).color;
    }
    $("matchTime").textContent = Math.floor((gameState.timeLeft||0)/60).toString().padStart(2,"0")+":"+((gameState.timeLeft||0)%60).toString().padStart(2,"0");
    if (selectedMode !== "combate" && gameState.score) $("scoreboard").innerHTML = `<span class="blue-score">AZUL ${gameState.score[0]||0}</span><span class="score-divider">:</span><span class="red-score">${gameState.score[1]||0} VERMELHO</span>`;
    else $("scoreboard").innerHTML = `<span class="blue-score">SOBREVIVENTES ${gameState.players.filter(p=>p.alive).length}</span>`;
  }
  function renderLoop() {
    if (!gameRunning) return;
    sendInput(); drawArena(); requestAnimationFrame(renderLoop);
  }
  function drawArena() {
    const s = gameState || {};
    ctx.clearRect(0,0,1000,620);
    ctx.fillStyle = "#19372f"; ctx.fillRect(0,0,1000,620);
    ctx.fillStyle = "#204638"; ctx.fillRect(15,15,970,590);
    ctx.strokeStyle = "#2e5c48"; ctx.lineWidth = 1;
    for(let x=25;x<1000;x+=40){ctx.beginPath();ctx.moveTo(x,15);ctx.lineTo(x,605);ctx.stroke();}
    for(let y=25;y<620;y+=40){ctx.beginPath();ctx.moveTo(15,y);ctx.lineTo(985,y);ctx.stroke();}
    ctx.strokeStyle="#8cbaa044";ctx.lineWidth=3;ctx.strokeRect(20,20,960,580);
    const blocks = [{x:210,y:130,w:90,h:70},{x:210,y:410,w:90,h:70},{x:700,y:130,w:90,h:70},{x:700,y:410,w:90,h:70},{x:440,y:100,w:120,h:45},{x:440,y:475,w:120,h:45}];
    for(const b of blocks){ctx.fillStyle="#385b50";ctx.fillRect(b.x,b.y,b.w,b.h);ctx.fillStyle="#4b7666";ctx.fillRect(b.x+5,b.y+5,b.w-10,8);ctx.strokeStyle="#173a31";ctx.strokeRect(b.x,b.y,b.w,b.h);}
    if (selectedMode==="fute" || s.mode==="fute") {
      ctx.strokeStyle="#f1f8e533";ctx.lineWidth=4;ctx.strokeRect(20,215,85,190);ctx.strokeRect(895,215,85,190);
      ctx.fillStyle="#ffffff14";ctx.fillRect(20,215,85,190);ctx.fillRect(895,215,85,190);
      ctx.beginPath();ctx.arc(500,310,85,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(500,20);ctx.lineTo(500,600);ctx.stroke();
    }
    for(const g of (s.gems||[])){ctx.save();ctx.translate(g.x,g.y);ctx.rotate(Math.PI/4);ctx.fillStyle="#c9a1ff";ctx.shadowColor="#b98cff";ctx.shadowBlur=15;ctx.fillRect(-8,-8,16,16);ctx.restore();}
    if(s.ball){ctx.beginPath();ctx.arc(s.ball.x,s.ball.y,12,0,Math.PI*2);ctx.fillStyle="#f6f2d7";ctx.fill();ctx.strokeStyle="#5d6a73";ctx.lineWidth=3;ctx.stroke();}
    for(const e of (s.entities||[])){ctx.beginPath();ctx.arc(e.x,e.y,e.radius||7,0,Math.PI*2);ctx.fillStyle=e.kind==="super"?"#ffca6a":e.kind==="splash"?"#ff8e5c":"#a9f5ff";ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=8;ctx.fill();ctx.shadowBlur=0;}
    const players = s.players||[];
    for(const p of players){
      if(!p.alive) continue;
      const c = characters.find(ch=>ch.id===p.characterId)||characters[0];
      const isMe = p.id===playerId, teamColor = p.team===1?"#ff637d":"#5aa8ff";
      if(p.hyperActiveUntil>Date.now()){ctx.beginPath();ctx.arc(p.x,p.y,26,0,Math.PI*2);ctx.strokeStyle="#c77bff";ctx.lineWidth=3;ctx.stroke();}
      ctx.beginPath();ctx.arc(p.x,p.y,19,0,Math.PI*2);ctx.fillStyle=c.color;ctx.fill();ctx.lineWidth=isMe?4:2;ctx.strokeStyle=isMe?"#ffffff":teamColor;ctx.stroke();
      ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.fillStyle="#10172a";ctx.fill();
      ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+Math.cos(p.facing||0)*26,p.y+Math.sin(p.facing||0)*26);ctx.strokeStyle="#ffffffcc";ctx.lineWidth=3;ctx.stroke();
      ctx.fillStyle="#0a1321";ctx.fillRect(p.x-22,p.y-31,44,5);ctx.fillStyle=p.hp/p.maxHp<.3?"#ff5e76":"#8cf36c";ctx.fillRect(p.x-22,p.y-31,44*Math.max(0,p.hp/p.maxHp),5);
      ctx.font="bold 11px Inter";ctx.textAlign="center";ctx.lineWidth=3;ctx.strokeStyle="#0a1321";ctx.strokeText(p.name,p.x,p.y-38);ctx.fillStyle=isMe?"#ffffff":"#e6edff";ctx.fillText(p.name,p.x,p.y-38);
      if(p.gems>0){ctx.fillStyle="#d8b5ff";ctx.font="bold 11px Inter";ctx.fillText("◆ "+p.gems,p.x,p.y+34);}
      if(!p.bot && p.id!==playerId) {ctx.fillStyle="#ffffff77";ctx.beginPath();ctx.arc(p.x,p.y+25,3,0,Math.PI*2);ctx.fill();}
    }
    if(!players.length){ctx.fillStyle="#ffffff";ctx.font="bold 20px Inter";ctx.textAlign="center";ctx.fillText("Carregando partida...",500,300);}
  }
  function showHome() { gameRunning=false; $("gameScreen").classList.add("hidden"); $("homeScreen").classList.remove("hidden"); $("resultsOverlay").classList.add("hidden"); }
  $("createBtn").addEventListener("click",createRoom);
  $("joinToggle").addEventListener("click",()=>$("joinForm").classList.toggle("hidden"));
  $("joinBtn").addEventListener("click",joinRoom);
  $("roomCode").addEventListener("input",e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,5));
  $("readyBtn").addEventListener("click",()=>send({type:"ready"}));
  $("startBtn").addEventListener("click",()=>send({type:"start"}));
  $("copyCodeBtn").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(roomCode);toast("Código copiado!");}catch{toast("Código da sala: "+roomCode);}});
  $("backToLobby").addEventListener("click",()=>{send({type:"leave"});roomCode="";playerId="";isHost=false;latestPlayers=[];$("roomActive").classList.add("hidden");$("roomEmpty").classList.remove("hidden");showHome();toast("Você saiu da sala.");});
  $("resultsMenuBtn").addEventListener("click",showHome);
  $("rematchBtn").addEventListener("click",()=>send({type:"rematch"}));
  $("hyperBtn").addEventListener("click",()=>{hyperPressed=true;sendInput();});
  document.querySelectorAll("[data-mode]").forEach(b=>b.addEventListener("click",()=>{selectedMode=b.dataset.mode;document.querySelectorAll("[data-mode]").forEach(x=>x.classList.toggle("selected",x===b));}));
  $("serverBtn").addEventListener("click",()=>{$("serverUrl").value=getServerUrl();$("serverDialog").showModal();});
  $("saveServerBtn").addEventListener("click",e=>{e.preventDefault();let url=$("serverUrl").value.trim().replace(/\/$/,"");if(!/^wss?:\/\//i.test(url))return toast("A URL precisa começar com ws:// ou wss://");localStorage.setItem(SERVER_KEY,url);$("serverDialog").close();if(socket)socket.close();toast("Endereço salvo neste navegador.");});
  $("serverDialog").querySelector(".dialog-close").addEventListener("click",()=>$("serverDialog").close());
  window.addEventListener("keydown",e=>{const k=e.key.toLowerCase();if(["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"," "].includes(k)&&!["INPUT","TEXTAREA"].includes(document.activeElement.tagName))e.preventDefault();keys.add(k);if(k==="escape"&& !$("serverDialog").open){if(!$("gameScreen").classList.contains("hidden"))showHome();}if(k==="e"&&!e.repeat){hyperPressed=true;sendInput();}});
  window.addEventListener("keyup",e=>keys.delete(e.key.toLowerCase()));
  window.addEventListener("blur",()=>{keys.clear();attackHeld=false;superHeld=false;});
  canvas.addEventListener("contextmenu",e=>e.preventDefault());
  function updateAim(e){const rect=canvas.getBoundingClientRect();mouse.x=(e.clientX-rect.left)/rect.width*1000;mouse.y=(e.clientY-rect.top)/rect.height*620;}
  canvas.addEventListener("pointermove",updateAim);
  canvas.addEventListener("pointerdown",e=>{updateAim(e);if(e.button===0)attackHeld=true;if(e.button===2)superHeld=true;sendInput();});
  window.addEventListener("pointerup",e=>{if(e.button===0)attackHeld=false;if(e.button===2)superHeld=false;});
  renderCharacters();
  setConnection(false,"Desconectado");
})();