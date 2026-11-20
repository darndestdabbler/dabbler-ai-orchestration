using Dabbler.VisualStudio.Core;
using Xunit;

namespace Dabbler.VisualStudio.Core.Tests
{
    public class NodeCheckTests
    {
        [Fact]
        public void Judge_passes_a_version_at_or_above_the_floor()
        {
            Assert.Null(NodeCheck.Judge("v22.18.0\r\n"));
            Assert.Null(NodeCheck.Judge("v25.8.1"));
        }

        [Fact]
        public void Judge_refuses_an_older_version_naming_the_one_to_install()
        {
            var sentence = NodeCheck.Judge("v22.17.1");
            Assert.NotNull(sentence);
            Assert.Contains("Node.js 22.18 or later", sentence);
            Assert.Contains("22.17.1", sentence);
            Assert.Contains("restart Visual Studio", sentence);
        }

        [Fact]
        public void Judge_refuses_a_missing_node()
        {
            var sentence = NodeCheck.Judge(null);
            Assert.NotNull(sentence);
            Assert.Contains("not found", sentence);
            Assert.Contains("Node.js 22.18 or later", sentence);
        }

        [Fact]
        public void Ask_passes_the_node_this_suite_runs_beside()
        {
            // The suite runs where the router's own suites run, on a Node at the floor or above.
            Assert.Null(NodeCheck.Ask());
        }
    }
}
