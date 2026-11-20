using Dabbler.VisualStudio.Core;
using Xunit;

namespace Dabbler.VisualStudio.Core.Tests
{
    public class TerminalKeysTests
    {
        [Theory]
        [InlineData("Escape", false, false, false)]
        [InlineData("Tab", false, true, false)]
        [InlineData("Tab", false, false, false)]
        [InlineData("Left", false, false, false)]
        [InlineData("Up", false, false, false)]
        [InlineData("Right", false, true, false)]
        [InlineData("Down", false, false, false)]
        [InlineData("Return", false, false, false)]
        [InlineData("Return", false, true, false)]
        [InlineData("Return", true, false, false)]
        [InlineData("Return", false, false, true)]
        [InlineData("Back", false, false, false)]
        [InlineData("O", true, false, false)]
        [InlineData("V", false, false, true)]
        public void Of_keeps_the_keys_an_engine_is_answered_with(string key, bool ctrl, bool shift, bool alt)
        {
            Assert.Equal(TerminalKey.Keep, TerminalKeys.Of(key, ctrl, shift, alt));
        }

        [Theory]
        [InlineData("Tab", true, false, false)]
        [InlineData("Tab", true, true, false)]
        [InlineData("F4", true, false, false)]
        [InlineData("F4", false, false, true)]
        [InlineData("F5", false, false, false)]
        [InlineData("L", true, false, true)]
        [InlineData("Q", true, false, false)]
        [InlineData("S", true, false, false)]
        [InlineData("Return", false, true, true)]
        public void Of_lets_go_of_what_moves_between_Visual_Studios_windows(string key, bool ctrl, bool shift, bool alt)
        {
            Assert.Equal(TerminalKey.LetGo, TerminalKeys.Of(key, ctrl, shift, alt));
        }

        [Fact]
        public void Of_names_Ctrl_C_a_copy_and_Ctrl_V_a_paste()
        {
            Assert.Equal(TerminalKey.Copy, TerminalKeys.Of("C", true, false, false));
            Assert.Equal(TerminalKey.Paste, TerminalKeys.Of("V", true, false, false));
        }

        [Fact]
        public void OnCopy_copies_a_selection_and_otherwise_interrupts()
        {
            Assert.Equal(CopyAction.Copy, TerminalKeys.OnCopy(hasSelection: true));
            Assert.Equal(CopyAction.Interrupt, TerminalKeys.OnCopy(hasSelection: false));
        }

        [Fact]
        public void OnPaste_passes_the_key_to_the_engine_when_the_clipboard_holds_no_text()
        {
            Assert.Equal(PasteAction.PasteText, TerminalKeys.OnPaste(hasText: true));
            Assert.Equal(PasteAction.PassToEngine, TerminalKeys.OnPaste(hasText: false));
        }
    }
}
