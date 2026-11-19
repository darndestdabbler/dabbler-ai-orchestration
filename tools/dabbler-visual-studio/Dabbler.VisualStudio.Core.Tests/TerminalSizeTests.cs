using Dabbler.VisualStudio.Core;
using Xunit;

namespace Dabbler.VisualStudio.Core.Tests
{
    public class TerminalSizeTests
    {
        [Fact]
        public void ToSend_never_sends_a_zero_or_negative_size()
        {
            Assert.Null(TerminalSize.ToSend(0, 30, null));
            Assert.Null(TerminalSize.ToSend(120, 0, null));
            Assert.Null(TerminalSize.ToSend(-1, -1, new TerminalSize(80, 24)));
        }

        [Fact]
        public void ToSend_sends_a_new_size_once()
        {
            var first = TerminalSize.ToSend(120, 30, null);
            Assert.Equal(new TerminalSize(120, 30), first);
            Assert.Null(TerminalSize.ToSend(120, 30, first));
            Assert.Equal(new TerminalSize(100, 30), TerminalSize.ToSend(100, 30, first));
        }
    }
}
