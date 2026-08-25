(function () {
  const net = new GameNetwork();

  const state = {
    roomCode: null,
    myCharacterId: null,
    opponentReady: false,
    iAmReady: false,
    eliminated: new Set(), // ids the local player has flipped down on the opponent's board
    pendingGuessId: null,
    myName: 'You',
  };

  // ---------- DOM helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const screens = {
    menu: $('#screen-menu'),
    waiting: $('#screen-waiting'),
    select: $('#screen-select'),
    game: $('#screen-game'),
    end: $('#screen-end'),
  };

  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove('active'));
    screens[name].classList.add('active');
  }

  function setConnStatus(connected) {
    const el = $('#conn-status');
    el.classList.remove('hidden');
    el.classList.toggle('disconnected', !connected);
    el.innerHTML = `<span class="dot"></span>${connected ? 'Connected' : 'Disconnected'}`;
  }

  function randomRoomCode() {
    const words = ['sky', 'fire', 'leaf', 'moon', 'tide', 'wind', 'spark', 'stone', 'ember', 'frost'];
    const w = words[Math.floor(Math.random() * words.length)];
    const n = Math.floor(100 + Math.random() * 900);
    return `${w}-${n}`;
  }

  // ---------- avatar rendering ----------
  function portraitEl(char) {
    const nation = NATIONS[char.nation];
    const wrap = document.createElement('div');
    wrap.className = 'char-portrait';
    wrap.style.background = `linear-gradient(150deg, ${nation.color}, ${shade(nation.color, -18)})`;

    const img = document.createElement('img');
    img.src = portraitSrc(char);
    img.alt = char.name;
    img.loading = 'lazy';
    img.onerror = () => {
      img.remove();
      wrap.textContent = initialsFor(char.name);
    };
    wrap.appendChild(img);
    return wrap;
  }

  function shade(hex, percent) {
    const num = parseInt(hex.slice(1), 16);
    let r = (num >> 16) + percent;
    let g = ((num >> 8) & 0x00ff) + percent;
    let b = (num & 0x0000ff) + percent;
    r = Math.min(255, Math.max(0, r));
    g = Math.min(255, Math.max(0, g));
    b = Math.min(255, Math.max(0, b));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }

  function buildCharCard(char, { onClick } = {}) {
    const card = document.createElement('div');
    card.className = 'char-card';
    card.dataset.id = char.id;
    card.appendChild(portraitEl(char));

    if (onClick) card.addEventListener('click', () => onClick(char, card));
    return card;
  }

  // A fixed shuffle of the roster so every board looks like a scattered
  // pile instead of characters lined up by nation, but stays in the same
  // scattered order for the rest of the session.
  const SHUFFLED_CHARACTERS = shuffle(CHARACTERS);

  function shuffle(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function renderGrid(container, { onClick } = {}) {
    container.innerHTML = '';
    SHUFFLED_CHARACTERS.forEach((char) => {
      const card = buildCharCard(char, { onClick });
      container.appendChild(card);
    });
  }

  // ---------- chat ----------
  function addChatMsg(text, kind) {
    const log = $('#chat-log');
    const div = document.createElement('div');
    div.className = `chat-msg ${kind}`;
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  // ---------- MENU screen ----------
  $('#btn-host').addEventListener('click', () => {
    const code = randomRoomCode();
    state.roomCode = code;
    $('#waiting-title').textContent = 'Waiting for opponent…';
    $('#waiting-host-info').classList.remove('hidden');
    $('#room-code-display').textContent = code;
    showScreen('waiting');
    net.host(code);
  });

  $('#btn-join').addEventListener('click', () => {
    const raw = $('#input-join-code').value.trim().toLowerCase();
    if (!raw) {
      showMenuError('Enter a room code first.');
      return;
    }
    state.roomCode = raw;
    $('#waiting-title').textContent = 'Connecting…';
    $('#waiting-host-info').classList.add('hidden');
    showScreen('waiting');
    net.join(raw);
  });

  function showMenuError(msg) {
    const el = $('#menu-error');
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  $('#btn-copy-code').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(state.roomCode);
      $('#btn-copy-code').textContent = 'Copied!';
      setTimeout(() => ($('#btn-copy-code').textContent = 'Copy Code'), 1500);
    } catch (e) {
      /* clipboard not available; ignore */
    }
  });

  $('#btn-cancel-waiting').addEventListener('click', () => {
    net.destroy();
    location.reload();
  });

  // ---------- network events ----------
  net.on('hosting', () => {
    // room created, waiting for a peer to connect
  });

  net.on('connected', () => {
    setConnStatus(true);
    beginSelectScreen();
  });

  net.on('disconnected', () => {
    setConnStatus(false);
    addChatMsg('Your opponent disconnected.', 'system');
  });

  net.on('error', (err) => {
    console.error(err);
    if (screens.waiting.classList.contains('active')) {
      showScreen('menu');
      showMenuError(
        err && err.type === 'peer-unavailable'
          ? 'That room code was not found. Double-check it and try again.'
          : 'Connection error — please try again.'
      );
    }
  });

  net.on('data', (msg) => handleMessage(msg));

  function handleMessage(msg) {
    switch (msg.type) {
      case 'ready':
        state.opponentReady = true;
        updateSelectStatus();
        maybeStartGame();
        break;
      case 'chat':
        addChatMsg(msg.text, 'them');
        break;
      case 'guess': {
        const char = CHARACTERS.find((c) => c.id === msg.characterId);
        $('#incoming-guess-text').textContent = `Your opponent thinks your character is ${char.name}. Are they right?`;
        $('#modal-incoming-guess').classList.remove('hidden');
        state._incomingGuessId = msg.characterId;
        break;
      }
      case 'guessResult': {
        const char = CHARACTERS.find((c) => c.id === state.pendingGuessId);
        if (msg.correct) {
          endGame({ won: true, myChar: state.myCharacterId, guessedChar: char.id });
        } else {
          addChatMsg(`Guess "${char.name}" was wrong. Keep going!`, 'system');
        }
        state.pendingGuessId = null;
        break;
      }
      case 'rematch':
        addChatMsg('Opponent started a new round.', 'system');
        resetForRematch();
        break;
      default:
        break;
    }
  }

  // ---------- SELECT screen ----------
  function beginSelectScreen() {
    state.myCharacterId = null;
    state.iAmReady = false;
    state.opponentReady = false;
    $('#btn-confirm-select').disabled = true;
    updateSelectStatus();
    renderGrid($('#select-grid'), {
      onClick: (char, card) => {
        document.querySelectorAll('#select-grid .char-card.selected').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        state.myCharacterId = char.id;
        $('#btn-confirm-select').disabled = false;
      },
    });
    showScreen('select');
  }

  function updateSelectStatus() {
    const parts = [];
    parts.push(state.iAmReady ? 'You are ready.' : 'Pick a character to continue.');
    parts.push(state.opponentReady ? 'Opponent is ready.' : 'Waiting on opponent…');
    $('#select-status').textContent = parts.join(' ');
  }

  $('#btn-confirm-select').addEventListener('click', () => {
    if (!state.myCharacterId) return;
    state.iAmReady = true;
    $('#btn-confirm-select').disabled = true;
    document.querySelectorAll('#select-grid .char-card').forEach((c) => (c.style.pointerEvents = 'none'));
    net.send({ type: 'ready' });
    updateSelectStatus();
    maybeStartGame();
  });

  function maybeStartGame() {
    if (state.iAmReady && state.opponentReady) startGame();
  }

  // ---------- GAME screen ----------
  function startGame() {
    state.eliminated = new Set();
    const myChar = CHARACTERS.find((c) => c.id === state.myCharacterId);
    $('#you-are-badge').innerHTML = `Your character: <strong>${myChar.name}</strong>`;
    $('#game-room-pill').textContent = `Room: ${state.roomCode}`;
    $('#chat-log').innerHTML = '';
    addChatMsg('Both players are ready. Start asking yes/no questions to narrow it down!', 'system');

    renderGrid($('#game-grid'), {
      onClick: (char, card) => {
        card.classList.toggle('eliminated');
        if (card.classList.contains('eliminated')) state.eliminated.add(char.id);
        else state.eliminated.delete(char.id);
      },
    });

    showScreen('game');
  }

  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#chat-input');
    const text = input.value.trim();
    if (!text) return;
    addChatMsg(text, 'me');
    net.send({ type: 'chat', text });
    input.value = '';
  });

  // ---------- guessing (outgoing) ----------
  $('#btn-make-guess').addEventListener('click', () => {
    state._modalGuessId = null;
    $('#btn-guess-submit').disabled = true;
    renderGrid($('#guess-grid'), {
      onClick: (char, card) => {
        document.querySelectorAll('#guess-grid .char-card.selected').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        state._modalGuessId = char.id;
        $('#btn-guess-submit').disabled = false;
      },
    });
    $('#modal-guess').classList.remove('hidden');
  });

  $('#btn-guess-cancel').addEventListener('click', () => {
    $('#modal-guess').classList.add('hidden');
  });

  $('#btn-guess-submit').addEventListener('click', () => {
    if (!state._modalGuessId) return;
    state.pendingGuessId = state._modalGuessId;
    net.send({ type: 'guess', characterId: state._modalGuessId });
    const char = CHARACTERS.find((c) => c.id === state._modalGuessId);
    addChatMsg(`You guessed: ${char.name}. Waiting on opponent to confirm…`, 'system');
    $('#modal-guess').classList.add('hidden');
  });

  // ---------- guessing (incoming) ----------
  $('#btn-incoming-yes').addEventListener('click', () => {
    net.send({ type: 'guessResult', correct: true });
    $('#modal-incoming-guess').classList.add('hidden');
    endGame({ won: false, myChar: state.myCharacterId, guessedChar: state._incomingGuessId });
  });

  $('#btn-incoming-no').addEventListener('click', () => {
    net.send({ type: 'guessResult', correct: false });
    $('#modal-incoming-guess').classList.add('hidden');
    addChatMsg('Opponent guessed wrong about your character. Game continues.', 'system');
  });

  // ---------- end screen ----------
  function endGame({ won, myChar, guessedChar }) {
    const myCharObj = CHARACTERS.find((c) => c.id === myChar);
    const guessedObj = guessedChar ? CHARACTERS.find((c) => c.id === guessedChar) : null;

    $('#end-title').textContent = won ? 'You win! 🎉' : 'You lose — better luck next time!';
    const reveal = $('#end-reveal');
    reveal.innerHTML = '';

    const mine = document.createElement('div');
    mine.className = 'reveal-card';
    mine.appendChild(portraitEl(myCharObj));
    const mineLabel = document.createElement('div');
    mineLabel.textContent = `Your character: ${myCharObj.name}`;
    mine.appendChild(mineLabel);
    reveal.appendChild(mine);

    if (guessedObj) {
      const guess = document.createElement('div');
      guess.className = 'reveal-card';
      guess.appendChild(portraitEl(guessedObj));
      const guessLabel = document.createElement('div');
      guessLabel.textContent = won ? `Final guess: ${guessedObj.name}` : `They guessed: ${guessedObj.name}`;
      guess.appendChild(guessLabel);
      reveal.appendChild(guess);
    }

    showScreen('end');
  }

  $('#btn-rematch').addEventListener('click', () => {
    net.send({ type: 'rematch' });
    resetForRematch();
  });

  function resetForRematch() {
    beginSelectScreen();
  }

  $('#btn-back-menu').addEventListener('click', () => {
    net.destroy();
    location.reload();
  });
})();
