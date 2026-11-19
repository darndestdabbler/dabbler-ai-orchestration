using System;
using System.Collections;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using Dabbler.VisualStudio.Core;
using Microsoft.VisualStudio;
using Microsoft.VisualStudio.PlatformUI;
using Microsoft.VisualStudio.Shell;
using Microsoft.VisualStudio.Shell.Interop;
using Microsoft.VisualStudio.Threading;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Task = System.Threading.Tasks.Task;

namespace Dabbler.VisualStudio
{
    /// <summary>
    /// The Dabbler Engine: an engine's own CLI in a tab of the editor area,
    /// drawn by xterm.js in a WebView2 control from the files the package
    /// ships under engine/ and from nowhere else, and run in a pseudo
    /// console inside Visual Studio's process. Closing the tab ends it.
    /// </summary>
    [Guid("6f0b8d3e-2a47-4c19-b5e1-7d93a0c4f258")]
    public sealed class EngineWindow : ToolWindowPane, IVsWindowFrameNotify3
    {
        // The page is served from this host only, mapped to the shipped folder.
        private const string PageHost = "dabbler-engine.local";
        private static readonly string PageUri = $"https://{PageHost}/engine.html";

        private readonly EngineView view;

        // What the terminal has selected, as the page last said.
        private string selection = "";

        // The page's first measurement: the engine starts at the size it will be drawn in.
        private readonly TaskCompletionSource<TerminalSize> measured = new TaskCompletionSource<TerminalSize>(TaskCreationOptions.RunContinuationsAsynchronously);

        // What the engine printed and the page has not been given yet.
        private readonly StringBuilder pending = new StringBuilder();
        private bool draining;

        private JoinableTask? loading;
        private PseudoConsole? engine;
        private TerminalSize? sent;
        private TerminalSize latest;

        // Which engine is current; output or an exit from an earlier one is dropped. Main thread only.
        private int generation;

        public EngineWindow()
            : base(null)
        {
            Caption = "Dabbler Engine";
            view = new EngineView(OnKey);
            Content = new Grid { Children = { view } };
        }

        /// <summary>
        /// A key the browser hands to Visual Studio, as WebView2 hands it every
        /// key that is not a character. True where the pane keeps it, so
        /// Visual Studio never sees it.
        /// </summary>
        private bool OnKey(KeyEventArgs e)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            var key = e.Key == Key.System ? e.SystemKey : e.Key;
            var modifiers = Keyboard.Modifiers;
            var ctrl = (modifiers & ModifierKeys.Control) != 0;
            var shift = (modifiers & ModifierKeys.Shift) != 0;
            var alt = (modifiers & ModifierKeys.Alt) != 0;
            switch (TerminalKeys.Of(key.ToString(), ctrl, shift, alt))
            {
                case TerminalKey.LetGo:
                    return false;
                case TerminalKey.Copy:
                    // Neither the browser nor Visual Studio's Edit.Copy: the pane decides.
                    e.Handled = true;
                    if (TerminalKeys.OnCopy(selection.Length > 0) == CopyAction.Copy)
                    {
                        if (TrySetClipboard(selection)) Post(new { type = "clear-selection" });
                    }
                    else
                    {
                        engine?.Write("\x03");
                    }
                    return true;
                case TerminalKey.Paste:
                    e.Handled = true;
                    var text = ClipboardText();
                    if (TerminalKeys.OnPaste(text.Length > 0) == PasteAction.PasteText) Post(new { type = "paste", data = text });
                    else engine?.Write("\x16");
                    return true;
                default:
                    // Not handled: the browser gives it to the terminal, and Visual Studio is not told.
                    return true;
            }
        }

        private static string ClipboardText()
        {
            try
            {
                return Clipboard.ContainsText() ? Clipboard.GetText() : "";
            }
            catch (COMException)
            {
                // Another program holds the clipboard open.
                return "";
            }
        }

        private static bool TrySetClipboard(string text)
        {
            try
            {
                Clipboard.SetText(text);
                return true;
            }
            catch (COMException)
            {
                return false;
            }
        }

        /// <summary>
        /// The WebView2 control, which raises a key the browser does not want
        /// as WPF's PreviewKeyDown and then KeyDown, where Visual Studio's
        /// commands take it. A key the pane keeps stops before KeyDown.
        /// </summary>
        private sealed class EngineView : WebView2
        {
            private readonly Func<KeyEventArgs, bool> keeps;

            public EngineView(Func<KeyEventArgs, bool> keeps)
            {
                this.keeps = keeps;
            }

            protected override void OnPreviewKeyDown(KeyEventArgs e)
            {
                if (keeps(e)) return;
                base.OnPreviewKeyDown(e);
            }
        }

        private DabblerPackage Dabbler => (DabblerPackage)Package;

        public override void OnToolWindowCreated()
        {
            base.OnToolWindowCreated();
            ThreadHelper.ThrowIfNotOnUIThread();
            ((IVsWindowFrame)Frame).SetProperty((int)__VSFPROPID.VSFPROPID_ViewHelper, this);
            VSColorTheme.ThemeChanged += OnThemeChanged;
            loading = Dabbler.JoinableTaskFactory.RunAsync(LoadAsync);
        }

        private void OnThemeChanged(ThemeChangedEventArgs e)
        {
            // Visual Studio raises a change of theme on its main thread.
            ThreadHelper.ThrowIfNotOnUIThread();
            SendTheme();
        }

        /// <summary>
        /// Visual Studio's tool window colours, and which ANSI palette reads on
        /// them: the dark one under a dark background, the light one otherwise,
        /// as the Dabbler Terminal's tones are chosen, so blue takes the light.
        /// </summary>
        private void SendTheme()
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            var background = VSColorTheme.GetThemedColor(EnvironmentColors.ToolWindowBackgroundColorKey);
            var foreground = VSColorTheme.GetThemedColor(EnvironmentColors.ToolWindowTextColorKey);
            Post(new
            {
                type = "theme",
                background = Hex(background),
                foreground = Hex(foreground),
                palette = background.GetBrightness() < 0.5 ? "dark" : "light",
            });
        }

        private static string Hex(System.Drawing.Color colour)
        {
            return $"#{colour.R:x2}{colour.G:x2}{colour.B:x2}";
        }

        /// <summary>
        /// Starts the configured engine for the open solution's repository,
        /// unless one is running here already. A refusal is said in a message box.
        /// </summary>
        internal async Task OpenAsync()
        {
            await Dabbler.JoinableTaskFactory.SwitchToMainThreadAsync();
            if (engine != null)
            {
                view.Focus();
                return;
            }
            var folder = await Dabbler.SolutionFolderAsync();
            var root = folder == null ? null : WorkExplorerTree.RepositoryRootOf(folder);
            if (root == null)
            {
                Say("Open a solution in a git repository first: the engine is opened in that repository.");
                return;
            }
            if (!await Dabbler.EnsureNodeAsync()) return;
            var router = Dabbler.Router;
            if (router == null) return;
            await TaskScheduler.Default;
            var choice = SessionStarter.ReadConfiguration(router, root, out var unreadable);
            if (choice == null || choice.Missing != null || choice.Engine == null)
            {
                await Dabbler.JoinableTaskFactory.SwitchToMainThreadAsync();
                Say(unreadable ?? choice!.Missing!);
                return;
            }
            EngineLaunch launch;
            try
            {
                launch = EngineLaunch.Parse(router.Run(root, EngineLaunch.Arguments(Consult, choice.Engine, choice.AuthoringModel)));
            }
            catch (Exception error) when (error is RouterFailure || error is FormatException)
            {
                await Dabbler.JoinableTaskFactory.SwitchToMainThreadAsync();
                Say(error.Message);
                return;
            }
            var path = Environment.GetEnvironmentVariable("PATH") ?? "";
            var program = WindowsTerminal.ProgramPath(launch.Program, path, Environment.GetEnvironmentVariable("PATHEXT") ?? ".COM;.EXE;.BAT;.CMD");
            var commandLine = string.Join(" ", new[] { program }.Concat(launch.Args).Select(Router.Quote));
            var environment = Environment.GetEnvironmentVariables().Cast<DictionaryEntry>().ToDictionary(pair => (string)pair.Key, pair => (string)pair.Value!, StringComparer.OrdinalIgnoreCase);
            foreach (var pair in launch.Env) environment[pair.Key] = pair.Value;
            // As the Windows Terminal tab is given it: `dabbler` is the bundle the extension carries.
            environment["PATH"] = Path.GetDirectoryName(router.BundlePath) + ";" + path;

            await (loading ?? throw new InvalidOperationException("The engine pane has not been created."));
#pragma warning disable VSTHRD003 // Completed by the page's message on the main thread, which nothing here blocks.
            var size = await measured.Task;
#pragma warning restore VSTHRD003
            await Dabbler.JoinableTaskFactory.SwitchToMainThreadAsync();
            if (engine != null) return;
            var mine = ++generation;
            Post(new { type = "reset" });
            var typed = launch.Typed;
            try
            {
                engine = new PseudoConsole(
                    commandLine,
                    launch.Cwd,
                    environment,
                    size.Columns,
                    size.Rows,
                    text => OnOutput(mine, text),
                    code => Dabbler.JoinableTaskFactory.RunAsync(() => OnExitAsync(mine, code)).FileAndForget("dabbler/engine/exit"));
            }
            catch (Win32Exception error)
            {
                Say($"{launch.Title} could not be started: {error.Message}");
                return;
            }
            sent = size;
            Caption = launch.Title;
            // The CLI has no argument for its first sentence: it is typed at its prompt and not sent.
            if (typed != null) pendingTyped = typed;
            // The pane may have been resized while the engine was being found.
            Resize(latest);
            // The keyboard goes to the terminal, not to the tab that holds it.
            view.Focus();
        }

        // The sentence to type once the engine has drawn its prompt, or null.
        private string? pendingTyped;

        private static readonly WorkExplorerAction Consult = JsonConvert.DeserializeObject<WorkExplorerAction>(
            JsonConvert.SerializeObject(new { id = ActionIds.ConsultWithAi, title = "Open Engine Here" }))!;

        private async Task LoadAsync()
        {
            await Dabbler.JoinableTaskFactory.SwitchToMainThreadAsync();
            // Dabbler's own data folder: never Visual Studio's, so nothing either keeps reaches the other.
            var data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Dabbler", "WebView2");
            var environment = await CoreWebView2Environment.CreateAsync(null, data);
            await view.EnsureCoreWebView2Async(environment);
            var core = view.CoreWebView2;
            var folder = Path.Combine(Path.GetDirectoryName(typeof(EngineWindow).Assembly.Location)!, "engine");
            core.SetVirtualHostNameToFolderMapping(PageHost, folder, CoreWebView2HostResourceAccessKind.DenyCors);
            core.NavigationStarting += (_, e) => e.Cancel = !string.Equals(e.Uri, PageUri, StringComparison.OrdinalIgnoreCase);
            core.NewWindowRequested += (_, e) => e.Handled = true;
            core.WebMessageReceived += OnMessage;
            core.Settings.AreDevToolsEnabled = false;
            // Ctrl+R, Ctrl+F, F5 and the like are the engine's or Visual Studio's, never a browser's.
            core.Settings.AreBrowserAcceleratorKeysEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsZoomControlEnabled = false;
            core.Navigate(PageUri);
        }

        /// <summary>What the page says: a keystroke for the engine, or the size it now measures.</summary>
        private void OnMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            var message = JObject.Parse(e.WebMessageAsJson);
            switch ((string?)message["type"])
            {
                case "input":
                    engine?.Write((string?)message["data"] ?? "");
                    break;
                case "ready":
                    SendTheme();
                    break;
                case "selection":
                    selection = (string?)message["text"] ?? "";
                    break;
                case "size":
                    var size = TerminalSize.ToSend((int?)message["columns"] ?? 0, (int?)message["rows"] ?? 0, null);
                    if (size is TerminalSize measuredSize)
                    {
                        latest = measuredSize;
                        measured.TrySetResult(measuredSize);
                        Resize(measuredSize);
                    }
                    break;
            }
        }

        private void Resize(TerminalSize size)
        {
            if (engine == null) return;
            var send = TerminalSize.ToSend(size.Columns, size.Rows, sent);
            if (send is TerminalSize changed)
            {
                engine.Resize(changed.Columns, changed.Rows);
                sent = changed;
            }
        }

        /// <summary>Output read off the main thread: gathered, and given to the page in the order it came.</summary>
        private void OnOutput(int mine, string text)
        {
            lock (pending)
            {
                pending.Append(text);
                if (draining) return;
                draining = true;
            }
            Dabbler.JoinableTaskFactory.RunAsync(() => DrainAsync(mine)).FileAndForget("dabbler/engine/output");
        }

        private async Task DrainAsync(int mine)
        {
            await Dabbler.JoinableTaskFactory.SwitchToMainThreadAsync();
            string text;
            lock (pending)
            {
                text = pending.ToString();
                pending.Clear();
                draining = false;
            }
            if (mine != generation || text.Length == 0) return;
            Post(new { type = "output", data = text });
            if (pendingTyped != null)
            {
                engine?.Write(pendingTyped);
                pendingTyped = null;
            }
        }

        private async Task OnExitAsync(int mine, int code)
        {
            await Dabbler.JoinableTaskFactory.SwitchToMainThreadAsync();
            if (mine != generation) return;
            Stop();
            Post(new { type = "exited", code });
        }

        private void Post(object message)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            view.CoreWebView2?.PostWebMessageAsJson(JsonConvert.SerializeObject(message));
        }

        private void Stop()
        {
            generation++;
            engine?.Dispose();
            engine = null;
            sent = null;
            pendingTyped = null;
        }

        private void Say(string text)
        {
            VsShellUtilities.ShowMessageBox(Dabbler, text, "Dabbler", OLEMSGICON.OLEMSGICON_WARNING, OLEMSGBUTTON.OLEMSGBUTTON_OK, OLEMSGDEFBUTTON.OLEMSGDEFBUTTON_FIRST);
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                VSColorTheme.ThemeChanged -= OnThemeChanged;
#pragma warning disable VSTHRD010 // Visual Studio disposes a tool window on its main thread.
                Stop();
#pragma warning restore VSTHRD010
                view.Dispose();
            }
            base.Dispose(disposing);
        }

        /// <summary>Closing the tab ends the engine; hiding it does not.</summary>
        public int OnClose(ref uint pgrfSaveOptions)
        {
            ThreadHelper.ThrowIfNotOnUIThread();
            Stop();
            Caption = "Dabbler Engine";
            return VSConstants.S_OK;
        }

        public int OnShow(int fShow) => VSConstants.S_OK;

        public int OnMove(int x, int y, int w, int h) => VSConstants.S_OK;

        public int OnSize(int x, int y, int w, int h) => VSConstants.S_OK;

        public int OnDockableChange(int fDockable, int x, int y, int w, int h) => VSConstants.S_OK;
    }
}
