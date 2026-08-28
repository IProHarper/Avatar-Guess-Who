(function () {
  const net = new GameNetwork();

  // PeerJS (and WebRTC generally) isn't available everywhere this page can
  // run — e.g. an Artifact preview strips RTCPeerConnection and blocks the
  // external PeerJS script. Multiplayer degrades gracefully to disabled in
  // that case, with Practice mode as the offline fallback.
  const NETWORKING_AVAILABLE = typeof Peer !== 'undefined';

  const state = {
    roomCode: null,
    myCharacterId: null,
    opponentReady: false,
    iAmReady: false,
    eliminated: new Set(), // ids the local player has flipped down on the opponent's board
    oppEliminated: new Set(), // ids the opponent has flipped down (mirrored via 'board' messages)
    pendingGuessId: null,
    myName: 'You',
    opponentCharacterId: null, // filled in once the opponent reveals their character at game end
    endInfo: null,
    practiceMode: false,
    botCharacterId: null, // Practice-mode bot's secret character
    // "Equalizer" rule: when your character is correctly guessed, you get one
    // final guess to try to tie it up. A correct equalizer makes it a draw.
    equalizerActive: false, // this player is picking their equalizer guess
    incomingIsEqualizer: false, // the incoming-guess modal is showing an equalizer guess
    _incomingGuessCorrect: false, // auto-computed: does the opponent's guess match my character?
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
    // Chat is a persistent panel (outside the screens) so it can stay open
    // across the game -> end transition and keep banter going.
    $('#chat-panel').classList.toggle('hidden', name !== 'game' && name !== 'end');
    // Home button on every screen but the menu (you're already home there).
    $('#btn-home').classList.toggle('hidden', name === 'menu');
  }

  // Return to the menu from anywhere. Reloading is the cleanest reset — it
  // tears down the peer connection and clears all game state.
  $('#btn-home').addEventListener('click', () => {
    const midMatch = screens.select.classList.contains('active') || screens.game.classList.contains('active');
    if (midMatch && !confirm('Leave this game and go back to the menu? Your opponent will be disconnected.')) {
      return;
    }
    net.destroy();
    location.reload();
  });

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
  function portraitEl(char, { framed } = {}) {
    const nation = NATIONS[char.nation];
    const wrap = document.createElement('div');
    wrap.className = framed ? 'char-portrait framed' : 'char-portrait';
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

    // Corner magnifier — opens the full-size portrait without triggering the
    // card's own action (select / flip down / pick a guess).
    const zoom = document.createElement('button');
    zoom.type = 'button';
    zoom.className = 'char-zoom-btn';
    zoom.textContent = '🔍';
    zoom.setAttribute('aria-label', `View ${char.name} larger`);
    zoom.addEventListener('click', (e) => {
      e.stopPropagation();
      openPortraitView(char);
    });
    card.appendChild(zoom);

    if (onClick) card.addEventListener('click', () => onClick(char, card));
    return card;
  }

  // ---------- character zoom / lightbox ----------
  // showDetails adds nation + bender info — only used for your own secret
  // character, never for opponent-board cards (that's what questions are for).
  function openPortraitView(char, { showDetails = false } = {}) {
    const holder = $('#portrait-lightbox-img');
    holder.innerHTML = '';
    holder.appendChild(portraitEl(char, { framed: true }));
    let caption = char.name;
    if (showDetails) {
      const nation = NATIONS[char.nation];
      caption += `<span class="caption-sub">${nation.icon} ${nation.label} · ${
        char.bender ? 'Bender' : 'Non-bender'
      }</span>`;
    }
    $('#portrait-lightbox-caption').innerHTML = caption;
    $('#modal-portrait').classList.remove('hidden');
  }

  function closePortraitView() {
    $('#modal-portrait').classList.add('hidden');
  }

  $('#btn-portrait-close').addEventListener('click', closePortraitView);
  // Click anywhere on the dark backdrop (but not the figure) closes it.
  $('#modal-portrait').addEventListener('click', (e) => {
    if (e.target === $('#modal-portrait')) closePortraitView();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#modal-portrait').classList.contains('hidden')) {
      closePortraitView();
    }
  });

  // A shuffle of the roster so every board looks like a scattered pile
  // instead of characters lined up by nation. Reshuffled at the start of
  // each game (see beginSelectScreen) so the layout changes every round.
  let SHUFFLED_CHARACTERS = shuffle(CHARACTERS);

  // setInterval id for the game-screen board re-sync (see startGame).
  let boardHeartbeat = null;

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

  // ---------- live shared board ----------
  // Push this player's flipped-down characters to the opponent so their
  // read-only "Opponent's board" panel stays in sync. Whole set every time —
  // small, and self-healing if a message is missed.
  function sendBoardState() {
    if (state.practiceMode) return;
    sendMessage({ type: 'board', eliminated: [...state.eliminated] });
  }

  function renderOppBoard() {
    const grid = $('#opp-grid');
    const firstBuild = grid.childElementCount === 0;
    if (firstBuild) {
      SHUFFLED_CHARACTERS.forEach((char) => grid.appendChild(buildCharCard(char)));
    }
    grid.querySelectorAll('.char-card').forEach((card) => {
      const nowElim = state.oppEliminated.has(card.dataset.id);
      const wasElim = card.classList.contains('eliminated');
      card.classList.toggle('eliminated', nowElim);
      // Pulse a card the moment the opponent flips it — makes the live sync
      // visible rather than something you have to notice on your own.
      if (!firstBuild && nowElim !== wasElim) {
        card.classList.remove('opp-changed');
        void card.offsetWidth;
        card.classList.add('opp-changed');
        setTimeout(() => card.classList.remove('opp-changed'), 900);
      }
    });
    const n = state.oppEliminated.size;
    const countEl = $('#opp-ruled-count');
    const next = n === 0 ? 'nothing ruled out yet' : `${n} of ${CHARACTERS.length} ruled out`;
    if (!firstBuild && next !== countEl.textContent) {
      countEl.classList.remove('bump');
      void countEl.offsetWidth;
      countEl.classList.add('bump');
      setTimeout(() => countEl.classList.remove('bump'), 600);
    }
    countEl.textContent = next;
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

  // ---------- transient toast ----------
  let toastTimer = null;
  function showToast(text, kind = 'wrong', ms = 3000) {
    const el = $('#toast');
    el.textContent = text;
    el.className = `toast toast-${kind}`;
    // force reflow so the show transition replays even on back-to-back toasts
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  // Guesser-side feedback for a wrong final guess: shake + flash the card on
  // the opponent's board and flip it down (it's definitely not them now).
  function flashWrongGuess(char) {
    showToast(`❌ Not ${char.name} — keep narrowing it down.`, 'wrong');
    const card = document.querySelector(`#game-grid .char-card[data-id="${char.id}"]`);
    if (!card) return;
    card.classList.remove('guess-wrong');
    void card.offsetWidth;
    card.classList.add('guess-wrong');
    setTimeout(() => card.classList.remove('guess-wrong'), 700);
    if (!card.classList.contains('eliminated')) {
      card.classList.add('eliminated');
      state.eliminated.add(char.id);
      sendBoardState();
    }
  }

  // On mobile the chat panel is a collapsible drawer; tapping its header
  // or the toggle arrow expands/collapses it (no-op on desktop, where the
  // ".expanded" class is ignored by CSS).
  $('#chat-panel-toggle').addEventListener('click', () => {
    $('#chat-panel').classList.toggle('expanded');
  });

  // ---------- outgoing messages (real net, or local practice bot) ----------
  function sendMessage(msg) {
    if (state.practiceMode) {
      handlePracticeSend(msg);
    } else {
      net.send(msg);
    }
  }

  function randomIrohQuote() {
    return IROH_QUOTES[Math.floor(Math.random() * IROH_QUOTES.length)];
  }

  // Simulates just enough of an "opponent" to make practice mode work:
  // the bot never actually parses questions (it just quotes Iroh back),
  // but it does hold a real secret character so guesses are checked for real.
  function handlePracticeSend(msg) {
    switch (msg.type) {
      case 'chat':
        setTimeout(() => addChatMsg(randomIrohQuote(), 'them'), 500 + Math.random() * 700);
        break;
      case 'guess': {
        const correct = msg.characterId === state.botCharacterId;
        setTimeout(() => handleMessage({ type: 'guessResult', correct }), 500 + Math.random() * 500);
        if (correct) {
          // The bot takes its one equalizer guess. It doesn't know your
          // character, so it guesses at random — long odds, like a real scramble.
          const pick = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
          setTimeout(
            () => handleMessage({ type: 'equalizerGuess', characterId: pick.id }),
            1400 + Math.random() * 600
          );
        }
        break;
      }
      default:
        break; // 'ready', 'board', 'reveal', 'guessResult', 'equalizerResult', 'rematch' need no bot reaction
    }
  }

  // ---------- MENU screen ----------
  if (!NETWORKING_AVAILABLE) {
    $('#btn-host').disabled = true;
    $('#btn-join').disabled = true;
    $('#input-join-code').disabled = true;
    $('#no-network-note').classList.remove('hidden');
  }

  $('#btn-practice').addEventListener('click', () => {
    state.practiceMode = true;
    state.roomCode = 'Practice';
    beginSelectScreen();
  });

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
    clearInterval(boardHeartbeat);
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
      case 'board':
        state.oppEliminated = new Set(msg.eliminated || []);
        renderOppBoard();
        break;
      case 'guess': {
        const char = CHARACTERS.find((c) => c.id === msg.characterId);
        state.incomingIsEqualizer = false;
        showIncomingGuess(char, { equalizer: false });
        break;
      }
      case 'guessResult': {
        const char = CHARACTERS.find((c) => c.id === state.pendingGuessId);
        if (msg.correct) {
          // A correct guess means the opponent's real character is exactly
          // the one just guessed — tell them my character too, since they
          // won't otherwise learn it before the reveal screen.
          state.opponentCharacterId = char.id;
          sendMessage({ type: 'reveal', characterId: state.myCharacterId });
          // Don't end yet: the opponent gets one final guess to equalize.
          $('#btn-make-guess').disabled = true;
          $('#btn-make-guess').textContent = 'Opponent is taking their equalizer guess…';
          showToast(`🎯 Correct! ${char.name} is their character.`, 'good');
          addChatMsg(
            `Your guess "${char.name}" was correct! Your opponent gets one final guess to try to tie it up…`,
            'system'
          );
        } else {
          addChatMsg(`Guess "${char.name}" was wrong. Keep going!`, 'system');
          flashWrongGuess(char);
        }
        state.pendingGuessId = null;
        break;
      }
      case 'equalizerGuess': {
        if (!msg.characterId) {
          // Opponent skipped their equalizer and conceded.
          sendMessage({ type: 'equalizerResult', correct: false });
          addChatMsg('Your opponent skipped their equalizer guess — you win!', 'system');
          endGame({ outcome: 'win', myChar: state.myCharacterId, guessedChar: state.opponentCharacterId });
          break;
        }
        const char = CHARACTERS.find((c) => c.id === msg.characterId);
        state.incomingIsEqualizer = true;
        showIncomingGuess(char, { equalizer: true });
        break;
      }
      case 'equalizerResult': {
        // Confirmation of this player's own equalizer guess.
        if (msg.correct) {
          addChatMsg("Your equalizer guess was correct — it's a draw!", 'system');
          endGame({ outcome: 'draw', myChar: state.myCharacterId, guessedChar: state.opponentCharacterId });
        } else {
          addChatMsg('Your equalizer guess was wrong — you lose this round.', 'system');
          endGame({ outcome: 'lose', myChar: state.myCharacterId, guessedChar: state.opponentCharacterId });
        }
        state.pendingGuessId = null;
        break;
      }
      case 'reveal':
        state.opponentCharacterId = msg.characterId;
        renderEndReveal();
        break;
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
    state.opponentCharacterId = null;
    state.endInfo = null;
    state.pendingGuessId = null;
    state.equalizerActive = false;
    state.incomingIsEqualizer = false;
    state.eliminated = new Set();
    state.oppEliminated = new Set();
    SHUFFLED_CHARACTERS = shuffle(CHARACTERS);
    $('#btn-confirm-select').disabled = true;
    renderGrid($('#select-grid'), {
      onClick: (char, card) => {
        if (state.iAmReady || rouletteRunning) return; // locked in / mid-roll — zoom button still works
        selectCharCard(char, card);
      },
    });
    showScreen('select');

    if (state.practiceMode) {
      // The bot picks its secret character and is ready immediately.
      state.botCharacterId = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)].id;
      state.opponentReady = true;
    }
    updateSelectStatus();
  }

  function selectCharCard(cardOrChar, maybeCard) {
    // Accepts (char, card) from the grid handler, or just a card element.
    const card = maybeCard || cardOrChar;
    const id = card.dataset.id;
    document.querySelectorAll('#select-grid .char-card.selected').forEach((c) => c.classList.remove('selected'));
    card.classList.add('selected');
    state.myCharacterId = id;
    $('#btn-confirm-select').disabled = false;
  }

  // Slot-machine style random pick: a highlight bounces across the grid,
  // fast at first and easing to a stop on the chosen character.
  let rouletteRunning = false;
  $('#btn-random-select').addEventListener('click', () => {
    if (rouletteRunning || state.iAmReady) return;

    const cards = [...document.querySelectorAll('#select-grid .char-card')];
    if (!cards.length) return;
    const finalIdx = Math.floor(Math.random() * cards.length);

    // Instant pick for anyone who'd rather not watch it spin.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      selectCharCard(cards[finalIdx]);
      return;
    }

    rouletteRunning = true;
    $('#btn-random-select').disabled = true;
    $('#btn-confirm-select').disabled = true;
    state.myCharacterId = null;
    cards.forEach((c) => c.classList.remove('selected'));

    const totalHops = 20 + Math.floor(Math.random() * 6); // ~20–25 hops (~2.6s total)
    let hop = 0;
    let prev = -1;

    const tick = () => {
      if (prev >= 0) cards[prev].classList.remove('rolling');
      const last = hop === totalHops;
      let idx;
      if (last) {
        idx = finalIdx;
      } else {
        do { idx = Math.floor(Math.random() * cards.length); } while (idx === prev && cards.length > 1);
      }
      cards[idx].classList.add('rolling');
      prev = idx;

      if (last) {
        setTimeout(() => {
          cards[finalIdx].classList.remove('rolling');
          cards[finalIdx].classList.add('just-picked');
          setTimeout(() => cards[finalIdx].classList.remove('just-picked'), 450);
          selectCharCard(cards[finalIdx]);
          cards[finalIdx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          rouletteRunning = false;
          $('#btn-random-select').disabled = false;
        }, 420);
        return;
      }

      hop += 1;
      const t = hop / totalHops; // ease-out: ~40ms early, ~300ms near the end
      setTimeout(tick, 40 + Math.pow(t, 2.3) * 260);
    };
    tick();
  });

  function updateSelectStatus() {
    const parts = [];
    parts.push(state.iAmReady ? 'You are ready.' : 'Pick a character to continue.');
    if (state.practiceMode) {
      parts.push('Practice bot has picked their character and is ready.');
    } else {
      parts.push(state.opponentReady ? 'Opponent is ready.' : 'Waiting on opponent…');
    }
    $('#select-status').textContent = parts.join(' ');
  }

  $('#btn-confirm-select').addEventListener('click', () => {
    if (!state.myCharacterId) return;
    state.iAmReady = true;
    $('#btn-confirm-select').disabled = true;
    sendMessage({ type: 'ready' });
    updateSelectStatus();
    maybeStartGame();
  });

  function maybeStartGame() {
    if (state.iAmReady && state.opponentReady) startGame();
  }

  // ---------- GAME screen ----------
  function startGame() {
    state.eliminated = new Set();
    // Note: state.oppEliminated is reset in beginSelectScreen (which always
    // runs first) — not here, so an opponent 'board' message that lands just
    // before this runs isn't wiped.
    const myChar = CHARACTERS.find((c) => c.id === state.myCharacterId);

    const badge = $('#you-are-badge');
    badge.innerHTML = '';
    const frame = document.createElement('div');
    frame.className = 'you-are-portrait';
    frame.appendChild(portraitEl(myChar, { framed: true }));
    badge.appendChild(frame);
    const label = document.createElement('span');
    label.innerHTML = `Your character: <strong>${myChar.name}</strong><span class="zoom-hint"> · 🔍 tap to enlarge</span>`;
    badge.appendChild(label);
    badge.setAttribute('role', 'button');
    badge.setAttribute('tabindex', '0');
    badge.setAttribute('aria-label', `View your character ${myChar.name} larger`);
    badge.onclick = () => openPortraitView(myChar, { showDetails: true });
    badge.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openPortraitView(myChar, { showDetails: true });
      }
    };

    $('#btn-make-guess').disabled = false;
    $('#btn-make-guess').textContent = 'Make Final Guess';
    $('#game-room-pill').textContent = state.practiceMode ? 'Practice Mode' : `Room: ${state.roomCode}`;
    $('#chat-log').innerHTML = '';
    $('#chat-panel').classList.remove('expanded');
    addChatMsg('Both players are ready. Start asking yes/no questions to narrow it down!', 'system');

    renderGrid($('#game-grid'), {
      onClick: (char, card) => {
        card.classList.toggle('eliminated');
        if (card.classList.contains('eliminated')) state.eliminated.add(char.id);
        else state.eliminated.delete(char.id);
        sendBoardState();
      },
    });

    // The live shared board only makes sense against a real opponent.
    $('#opp-board').classList.toggle('hidden', state.practiceMode);
    $('#opp-board').open = true;
    $('#opp-grid').innerHTML = '';
    renderOppBoard();

    // Push our board now, again shortly after (in case the opponent's screen
    // wasn't ready yet), then on a slow heartbeat so a dropped update can't
    // leave the two boards permanently out of sync.
    clearInterval(boardHeartbeat);
    if (!state.practiceMode) {
      sendBoardState();
      setTimeout(sendBoardState, 1200);
      boardHeartbeat = setInterval(sendBoardState, 5000);
    }

    showScreen('game');
  }

  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#chat-input');
    const text = input.value.trim();
    if (!text) return;
    addChatMsg(text, 'me');
    sendMessage({ type: 'chat', text });
    input.value = '';
  });

  // ---------- guessing (outgoing) ----------
  function openGuessPicker() {
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
  }

  $('#btn-make-guess').addEventListener('click', () => {
    state.equalizerActive = false;
    $('#modal-guess').querySelector('h2').textContent = 'Who do you think they picked?';
    $('#btn-guess-submit').textContent = 'Lock In Guess';
    $('#btn-guess-cancel').textContent = 'Cancel';
    openGuessPicker();
  });

  // Opened when the opponent has correctly guessed this player's character:
  // one final guess to try to tie the round.
  function openEqualizerPicker() {
    state.equalizerActive = true;
    $('#modal-guess').querySelector('h2').textContent =
      'They guessed right — take one final guess to tie it up';
    $('#btn-guess-submit').textContent = 'Lock In Equalizer';
    $('#btn-guess-cancel').textContent = 'Skip & Concede';
    addChatMsg('Your character was guessed correctly. You get one final guess to equalize!', 'system');
    openGuessPicker();
  }

  $('#btn-guess-cancel').addEventListener('click', () => {
    $('#modal-guess').classList.add('hidden');
    if (state.equalizerActive) {
      state.equalizerActive = false;
      sendMessage({ type: 'equalizerGuess', characterId: null });
      addChatMsg('You skipped your equalizer guess and conceded the round.', 'system');
    }
  });

  $('#btn-guess-submit').addEventListener('click', () => {
    if (!state._modalGuessId) return;
    const char = CHARACTERS.find((c) => c.id === state._modalGuessId);
    state.pendingGuessId = state._modalGuessId;
    $('#modal-guess').classList.add('hidden');
    if (state.equalizerActive) {
      state.equalizerActive = false;
      sendMessage({ type: 'equalizerGuess', characterId: state._modalGuessId });
      addChatMsg(`Your equalizer guess: ${char.name}. Waiting on opponent to confirm…`, 'system');
      return;
    }
    sendMessage({ type: 'guess', characterId: state._modalGuessId });
    addChatMsg(`You guessed: ${char.name}. Waiting on opponent to confirm…`, 'system');
  });

  // ---------- guessing (incoming) ----------
  // The outcome of a final guess isn't a judgement call — this client holds
  // the real secret character, so we compare it ourselves and just show the
  // result. There's deliberately no "no, that's wrong" button: a correct
  // guess can't be denied.
  function showIncomingGuess(char, { equalizer }) {
    const myChar = CHARACTERS.find((c) => c.id === state.myCharacterId);
    const correct = char.id === state.myCharacterId;
    state._incomingGuessCorrect = correct;

    let title;
    let text;
    let ackLabel;
    if (equalizer && correct) {
      title = 'They equalized! 🤝';
      text = `Your opponent's final guess was ${char.name} — your character. That ties the round.`;
      ackLabel = 'See the draw';
    } else if (equalizer) {
      title = 'Their equalizer missed';
      text = `Your opponent guessed ${char.name}, but your character is ${myChar.name}. You take the round.`;
      ackLabel = 'Continue';
    } else if (correct) {
      title = 'They guessed it! 🎯';
      text = `Your opponent guessed ${char.name} — that's your character. You still get one final guess to try to equalize.`;
      ackLabel = 'Take my equalizer guess';
    } else {
      title = "Opponent's Guess";
      text = `Your opponent guessed ${char.name}, but your character is ${myChar.name}. They'll be told it's wrong.`;
      ackLabel = "Let them know they're wrong";
    }
    // Show the art: the character they guessed, plus (when they're wrong)
    // your real character alongside it for contrast.
    const portraits = $('#incoming-guess-portraits');
    portraits.innerHTML = '';
    portraits.appendChild(
      guessPortrait(char, correct ? 'Their guess — correct' : 'Their guess', correct ? 'is-right' : 'is-wrong')
    );
    if (!correct) {
      portraits.appendChild(guessPortrait(myChar, 'Your character', 'is-right'));
    }

    $('#incoming-guess-title').textContent = title;
    $('#incoming-guess-text').textContent = text;
    $('#btn-incoming-ack').textContent = ackLabel;
    $('#modal-incoming-guess').classList.remove('hidden');
  }

  function guessPortrait(char, label, mod) {
    const wrap = document.createElement('div');
    wrap.className = `guess-portrait ${mod}`;
    wrap.appendChild(portraitEl(char, { framed: true }));
    const l = document.createElement('div');
    l.className = 'guess-portrait-label';
    l.textContent = `${label}: ${char.name}`;
    wrap.appendChild(l);
    return wrap;
  }

  $('#btn-incoming-ack').addEventListener('click', () => {
    $('#modal-incoming-guess').classList.add('hidden');
    const correct = state._incomingGuessCorrect;

    if (state.incomingIsEqualizer) {
      state.incomingIsEqualizer = false;
      sendMessage({ type: 'equalizerResult', correct });
      endGame({
        outcome: correct ? 'draw' : 'win',
        myChar: state.myCharacterId,
        guessedChar: state.opponentCharacterId,
      });
      return;
    }

    sendMessage({ type: 'guessResult', correct });
    if (correct) {
      // Opponent guessed our character. We still get one equalizer guess.
      openEqualizerPicker();
    } else {
      addChatMsg('Opponent guessed wrong about your character. Game continues.', 'system');
    }
  });

  // ---------- end screen ----------
  // outcome is 'win' | 'lose' | 'draw'.
  function endGame({ outcome, myChar, guessedChar }) {
    clearTimeout(toastTimer);
    clearInterval(boardHeartbeat);
    $('#toast').classList.remove('show');
    state.endInfo = { outcome, myChar, guessedChar };
    const titles = {
      win: 'You win! 🎉',
      lose: 'You lose — better luck next time!',
      draw: "It's a draw! 🤝",
    };
    $('#end-title').textContent = titles[outcome] || titles.lose;
    renderEndReveal();
    showScreen('end');
  }

  function buildRevealCard(char, label, framed) {
    const card = document.createElement('div');
    card.className = 'reveal-card';
    card.appendChild(portraitEl(char, { framed }));
    const cardLabel = document.createElement('div');
    cardLabel.textContent = `${label}: ${char.name}`;
    card.appendChild(cardLabel);
    return card;
  }

  // Rebuilds the end-screen reveal from current state. Called both when the
  // end screen first appears and again if an opponent's 'reveal' message
  // arrives after the fact (the loser doesn't learn the winner's character
  // until it's sent over, so the second card fills in a beat later).
  function renderEndReveal() {
    if (!state.endInfo) return;
    const { outcome, myChar, guessedChar } = state.endInfo;
    const myCharObj = CHARACTERS.find((c) => c.id === myChar);

    const reveal = $('#end-reveal');
    reveal.innerHTML = '';
    reveal.appendChild(buildRevealCard(myCharObj, 'Your character', false));

    const oppId = guessedChar || state.opponentCharacterId;
    if (oppId) {
      const oppObj = CHARACTERS.find((c) => c.id === oppId);
      const label =
        outcome === 'win'
          ? "Opponent's character — your guess!"
          : outcome === 'draw'
          ? "Opponent's character — you both guessed right!"
          : "Opponent's character";
      reveal.appendChild(buildRevealCard(oppObj, label, true));
    } else {
      const waiting = document.createElement('div');
      waiting.className = 'reveal-card reveal-waiting';
      waiting.textContent = 'Waiting for opponent to reveal their character…';
      reveal.appendChild(waiting);
    }
  }

  $('#btn-rematch').addEventListener('click', () => {
    sendMessage({ type: 'rematch' });
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
