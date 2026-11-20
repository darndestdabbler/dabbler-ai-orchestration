using System.Linq;
using Dabbler.VisualStudio.Core;
using Xunit;

namespace Dabbler.VisualStudio.Core.Tests
{
    public class StartAnswerTests
    {
        [Fact]
        public void Buttons_are_the_ways_on_a_refused_start_names()
        {
            var refused = StartAnswer.Parse(
                "{\"registered\":false,\"refusal\":\"the tree has uncommitted changes\",\"starting_point\":true," +
                "\"ways_on\":[{\"way\":\"commit\",\"args\":[\"session\",\"start\",\"--json\",\"--commit-changes\"]}," +
                "{\"way\":\"undo\",\"args\":[\"session\",\"start\",\"--json\",\"--undo-changes\"]}]}\n");

            Assert.False(refused.Registered);
            Assert.Equal("the tree has uncommitted changes", refused.Refusal);
            Assert.Equal(new[] { "Commit them as the starting point", "Undo the Changes" }, refused.Buttons.Select(b => b.Title));
            Assert.Equal(new[] { "session", "start", "--json", "--commit-changes" }, refused.Buttons[0].Args);
            Assert.Equal(new[] { "session", "start", "--json", "--undo-changes" }, refused.Buttons[1].Args);

            var registered = StartAnswer.Parse("{\"registered\":true,\"refusal\":null,\"starting_point\":false,\"ways_on\":[]}");
            Assert.True(registered.Registered);
            Assert.Empty(registered.Buttons);
        }
    }
}
