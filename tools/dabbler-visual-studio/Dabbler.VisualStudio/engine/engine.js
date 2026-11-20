// The Dabbler Engine page: one xterm.js terminal filling the pane, joined
// to the engine through the extension, which owns the pseudo console.
(function () {
  'use strict';

  const host = window.chrome.webview;
  const post = (message) => host.postMessage(message);
  const element = document.getElementById('terminal');
  // The ANSI colours that read on Visual Studio's dark and light backgrounds.
  const palettes = {
    dark: {
      black: '#000000', red: '#cd3131', green: '#0dbc79', yellow: '#e5e510',
      blue: '#2472c8', magenta: '#bc3fbc', cyan: '#11a8cd', white: '#e5e5e5',
      brightBlack: '#666666', brightRed: '#f14c4c', brightGreen: '#23d18b', brightYellow: '#f5f543',
      brightBlue: '#3b8eea', brightMagenta: '#d670d6', brightCyan: '#29b8db', brightWhite: '#ffffff',
    },
    light: {
      black: '#000000', red: '#cd3131', green: '#107c10', yellow: '#949800',
      blue: '#0451a5', magenta: '#bc05bc', cyan: '#0598bc', white: '#555555',
      brightBlack: '#666666', brightRed: '#cd3131', brightGreen: '#14ce14', brightYellow: '#b5ba00',
      brightBlue: '#0451a5', brightMagenta: '#bc05bc', brightCyan: '#0598bc', brightWhite: '#a5a5a5',
    },
  };

  // The terminal's own font and size: never the editor's.
  const terminal = new Terminal({
    cursorBlink: true,
    scrollback: 10000,
    fontFamily: "'Cascadia Mono', Consolas, monospace",
    fontSize: 14,
  });
  const fit = new FitAddon.FitAddon();
  terminal.loadAddon(fit);
  terminal.open(element);

  // The size the pane can hold, sent on every change; a hidden pane measures
  // nothing and sends nothing, and the extension never passes on a zero.
  function measure() {
    const size = fit.proposeDimensions();
    if (!size || !(size.cols > 0) || !(size.rows > 0)) return;
    if (size.cols !== terminal.cols || size.rows !== terminal.rows) terminal.resize(size.cols, size.rows);
    post({ type: 'size', columns: size.cols, rows: size.rows });
  }

  // Shift+Enter is a new line in the prompt, as in Windows Terminal. A
  // terminal sends it as a plain Enter, which the engine cannot tell from
  // one, so it goes as Alt+Enter, the new line both engines read.
  terminal.attachCustomKeyEventHandler((event) => {
    if (event.key !== 'Enter' || !event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return true;
    event.preventDefault();
    if (event.type === 'keydown') post({ type: 'input', data: '\x1b\r' });
    return false;
  });

  terminal.onData((data) => post({ type: 'input', data }));
  // Ctrl+C is decided in the extension, which copies this where it is not empty.
  terminal.onSelectionChange(() => post({ type: 'selection', text: terminal.getSelection() }));

  host.addEventListener('message', (event) => {
    const message = event.data;
    switch (message.type) {
      case 'output':
        terminal.write(message.data);
        break;
      case 'reset':
        terminal.reset();
        break;
      case 'paste':
        // Bracketed where the engine asked for bracketed paste.
        terminal.paste(message.data);
        break;
      case 'clear-selection':
        terminal.clearSelection();
        break;
      case 'theme':
        document.body.style.background = message.background;
        terminal.options.theme = Object.assign({}, palettes[message.palette], {
          background: message.background,
          foreground: message.foreground,
          cursor: message.foreground,
          cursorAccent: message.background,
          selectionBackground: message.foreground + '40',
        });
        break;
      case 'exited':
        terminal.write(`\r\n\x1b[2m[The engine has exited with code ${message.code}. Its row in the Dabbler Work Explorer starts it again.]\x1b[0m\r\n`);
        break;
    }
  });

  new ResizeObserver(measure).observe(element);
  post({ type: 'ready' });
  measure();
  terminal.focus();
})();
