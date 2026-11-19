using System;
using System.Linq;

namespace Dabbler.VisualStudio.Core
{
    /// <summary>What the engine pane does with a key Visual Studio would otherwise be handed.</summary>
    public enum TerminalKey
    {
        /// <summary>Visual Studio has it: the key leaves the pane, or runs Visual Studio's command.</summary>
        LetGo,

        /// <summary>The terminal has it, as Windows Terminal would.</summary>
        Keep,

        /// <summary>Ctrl+C: a copy where text is selected, an interrupt where none is.</summary>
        Copy,

        /// <summary>Ctrl+V: the clipboard's text, or the key itself where it holds none.</summary>
        Paste,
    }

    public enum CopyAction
    {
        Copy,
        Interrupt,
    }

    public enum PasteAction
    {
        PasteText,
        PassToEngine,
    }

    /// <summary>
    /// Which keys the engine pane keeps while the terminal has focus. An
    /// engine is answered with Esc, Shift+Tab, the arrows, Enter and its
    /// Ctrl and Alt letters; Visual Studio keeps what moves between its
    /// windows -- Ctrl+Tab, Ctrl+F4, Ctrl+Alt keys, the F-keys -- and its
    /// search (Ctrl+Q) and save (Ctrl+S, which a terminal would take as
    /// XOFF and freeze the engine's output with).
    /// </summary>
    public static class TerminalKeys
    {
        private static readonly string[] Editing =
        {
            "Escape", "Return", "Enter", "Back", "Left", "Up", "Right", "Down", "Home", "End", "Delete", "Insert",
        };

        /// <summary>
        /// What the pane does with <paramref name="key"/>, named as WPF names
        /// a key (`Escape`, `Return`, `Left`, `C`, `F4`), pressed with the
        /// modifiers given.
        /// </summary>
        public static TerminalKey Of(string key, bool ctrl, bool shift, bool alt)
        {
            if (ctrl && alt) return TerminalKey.LetGo;
            if (IsFunctionKey(key)) return TerminalKey.LetGo;
            if (ctrl && !shift && !alt && key == "C") return TerminalKey.Copy;
            if (ctrl && !shift && !alt && key == "V") return TerminalKey.Paste;
            if (Editing.Contains(key)) return TerminalKey.Keep;
            switch (key)
            {
                case "Tab":
                    return ctrl || alt ? TerminalKey.LetGo : TerminalKey.Keep;
                case "PageUp":
                case "Prior":
                case "PageDown":
                case "Next":
                    return ctrl ? TerminalKey.LetGo : TerminalKey.Keep;
            }
            if (key.Length == 1 && key[0] >= 'A' && key[0] <= 'Z')
            {
                if (!ctrl) return TerminalKey.Keep;
                return shift || key == "Q" || key == "S" ? TerminalKey.LetGo : TerminalKey.Keep;
            }
            return ctrl || alt ? TerminalKey.LetGo : TerminalKey.Keep;
        }

        /// <summary>Ctrl+C: a copy of the selection where there is one, and otherwise an interrupt.</summary>
        public static CopyAction OnCopy(bool hasSelection)
        {
            return hasSelection ? CopyAction.Copy : CopyAction.Interrupt;
        }

        /// <summary>
        /// Ctrl+V: the clipboard's text, pasted as text; a clipboard with no
        /// text (an image) leaves the key to the engine, which reads the
        /// clipboard itself where it can.
        /// </summary>
        public static PasteAction OnPaste(bool hasText)
        {
            return hasText ? PasteAction.PasteText : PasteAction.PassToEngine;
        }

        private static bool IsFunctionKey(string key)
        {
            return key.Length >= 2 && key[0] == 'F' && int.TryParse(key.Substring(1), out var number) && number >= 1 && number <= 24;
        }
    }
}
