using System;
using System.IO;
using Dabbler.VisualStudio.Core;
using Xunit;

namespace Dabbler.VisualStudio.Core.Tests
{
    public sealed class TerminalNoticesTests : IDisposable
    {
        private const string Root = @"C:\work\shop";

        private const string Paused =
            "{\"kind\":\"notice\",\"notice\":\"paused\",\"session\":\"358\",\"stop\":\"blocked\",\"reason\":\"The step is blocked.\",\"who\":\"You\"," +
            "\"message\":\"Dabbler: session 358 is paused (blocked) — The step is blocked. You act(s) next.\"}";

        private const string Executing =
            "{\"kind\":\"line\",\"at\":null,\"clock\":\"10:01:35\",\"event\":\"phase\",\"fields\":{\"session\":\"358\",\"now\":\"work\"},\"voice\":\"358 ─ framework\",\"spans\":[]}";

        private const string Complete =
            "{\"kind\":\"line\",\"at\":null,\"clock\":\"11:02:00\",\"event\":\"phase\",\"fields\":{\"session\":\"358\",\"now\":\"complete\"},\"voice\":\"358 ─ framework\",\"spans\":[]}";

        private const string Closed =
            "{\"kind\":\"line\",\"at\":null,\"clock\":\"11:02:00\",\"event\":\"session-closed\",\"fields\":{\"session\":\"358\"},\"voice\":\"358 ─ framework\",\"spans\":[]}";

        private readonly string raisedFile = Path.Combine(Path.GetTempPath(), $"dabbler-notices-{Guid.NewGuid():N}", "raised.txt");

        public void Dispose()
        {
            var folder = Path.GetDirectoryName(raisedFile)!;
            if (Directory.Exists(folder)) Directory.Delete(folder, recursive: true);
        }

        [Fact]
        public void Read_raises_a_notice_once_and_not_again_after_a_restart()
        {
            var notices = new TerminalNotices(Root, raisedFile);

            var notice = notices.Read(Paused);
            Assert.NotNull(notice);
            Assert.Equal((TerminalNotice.Paused, "358"), (notice!.Kind, notice.Session));
            Assert.Equal("Dabbler: session 358 is paused (blocked) — The step is blocked. You act(s) next.", notice.Message);

            Assert.Null(notices.Read(Paused));
            Assert.Null(new TerminalNotices(Root, raisedFile).Read(Paused));
        }

        [Fact]
        public void Read_raises_a_close_only_for_a_session_it_saw_open()
        {
            var history = new TerminalNotices(Root, raisedFile);
            Assert.Null(history.Read(Complete));
            Assert.Null(history.Read(Closed));

            var watched = new TerminalNotices(@"C:\work\other", raisedFile);
            Assert.Null(watched.Read(Executing));
            Assert.True(watched.SessionOpen);
            Assert.Null(watched.Read(Complete));
            var closed = watched.Read(Closed);
            Assert.NotNull(closed);
            Assert.Equal((TerminalNotice.SessionClosed, "358", "Dabbler: session 358 is closed."), (closed!.Kind, closed.Session, closed.Message));
            Assert.False(watched.SessionOpen);
        }

        [Fact]
        public void Read_takes_a_pause_as_its_session_seen_open()
        {
            var notices = new TerminalNotices(Root, raisedFile);
            Assert.NotNull(notices.Read(Paused));
            Assert.True(notices.SessionOpen);

            var closed = notices.Read(Closed);
            Assert.NotNull(closed);
            Assert.Equal(TerminalNotice.SessionClosed, closed!.Kind);
        }

        private const string Overdue =
            "{\"kind\":\"notice\",\"notice\":\"instruction-overdue\",\"step\":\"window\",\"seq\":\"2\",\"outstandingSeconds\":600," +
            "\"message\":\"Dabbler: step window (instruction 2) has been owed an answer for 10 min.\"}";

        [Fact]
        public void Read_raises_an_overdue_instruction_once_in_the_session_last_named()
        {
            var notices = new TerminalNotices(Root, raisedFile);
            Assert.Null(notices.Read(Executing));

            var notice = notices.Read(Overdue);
            Assert.NotNull(notice);
            Assert.Equal(
                (TerminalNotice.InstructionOverdue, "358", "Dabbler: step window (instruction 2) has been owed an answer for 10 min."),
                (notice!.Kind, notice.Session, notice.Message));

            Assert.Null(notices.Read(Overdue));
            var restarted = new TerminalNotices(Root, raisedFile);
            Assert.Null(restarted.Read(Executing));
            Assert.Null(restarted.Read(Overdue));
        }
    }
}
