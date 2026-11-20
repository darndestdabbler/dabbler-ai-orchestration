using System;
using Dabbler.VisualStudio.Core;
using Xunit;

namespace Dabbler.VisualStudio.Core.Tests
{
    public class EngineOpeningTests
    {
        private static EngineRecord Record(int? session = 370, string folder = @"C:\Repos\Shop") =>
            new EngineRecord { Folder = folder, Title = "Claude Code", ProcessId = 42, Pipe = "dabbler-engine-" + session, Session = session, StartedAt = DateTimeOffset.Now };

        [Fact]
        public void AfterFailure_falls_back_to_Windows_Terminal_unless_the_engine_is_running()
        {
            Assert.Equal(EngineRoute.WindowsTerminal, EngineOpening.AfterFailure(null));
            Assert.Equal(EngineRoute.Attach, EngineOpening.AfterFailure(Record()));
        }

        [Fact]
        public void Closes_the_finished_sessions_tab_and_no_other()
        {
            Assert.True(EngineOpening.Closes(@"C:\Repos\Shop", 370, @"c:\repos\shop\", "370"));
            Assert.False(EngineOpening.Closes(@"C:\Repos\Shop", null, @"C:\Repos\Shop", "370"));
            Assert.False(EngineOpening.Closes(@"C:\Repos\Shop", 369, @"C:\Repos\Shop", "370"));
            Assert.False(EngineOpening.Closes(@"C:\Repos\Other", 370, @"C:\Repos\Shop", "370"));
            Assert.False(EngineOpening.Closes(null, null, @"C:\Repos\Shop", "370"));
        }

        [Fact]
        public void RunningFor_is_that_sessions_engine_and_never_another()
        {
            var consult = Record(null);
            var other = Record(369);
            var elsewhere = Record(370, @"C:\Repos\Other");
            var mine = Record(370);
            var records = new[] { consult, other, elsewhere, mine };

            Assert.Same(mine, EngineOpening.RunningFor(records, @"c:\repos\shop", 370));
            Assert.Null(EngineOpening.RunningFor(records, @"C:\Repos\Shop", 371));
            Assert.Null(EngineOpening.RunningFor(records, @"C:\Repos\Shop", null));
        }

        [Fact]
        public void Route_opens_where_the_option_says_and_attaches_to_a_running_engine()
        {
            Assert.Equal(EngineRoute.Pane, EngineOpening.Route(EnginePlace.VisualStudio, null));
            Assert.Equal(EngineRoute.WindowsTerminal, EngineOpening.Route(EnginePlace.WindowsTerminal, null));
            Assert.Equal(EngineRoute.Attach, EngineOpening.Route(EnginePlace.VisualStudio, Record()));
            Assert.Equal(EngineRoute.Attach, EngineOpening.Route(EnginePlace.WindowsTerminal, Record()));
        }
    }
}
