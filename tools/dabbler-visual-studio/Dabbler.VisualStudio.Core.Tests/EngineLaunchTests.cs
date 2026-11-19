using System;
using Dabbler.VisualStudio.Core;
using Newtonsoft.Json;
using Xunit;

namespace Dabbler.VisualStudio.Core.Tests
{
    public class EngineLaunchTests
    {
        private static WorkExplorerAction Action(string id, params string[] argv)
        {
            var row = JsonConvert.SerializeObject(new { id = "r", kind = "session", label = "7", actions = new[] { new { id, title = id, argv } } });
            return JsonConvert.DeserializeObject<WorkExplorerRow>(row)!.Actions[0];
        }

        [Fact]
        public void Arguments_name_the_purpose_and_the_session()
        {
            var consult = Action(ActionIds.ConsultWithAi, "dabbler", "consult", "--sessions-dir", @"D:\R\docs\sessions", "--session", "7");
            Assert.Equal(
                new[] { "session", "launch", "--for", "consult", "--engine", "claude-code", "--model", "claude-opus-5-5", "--sessions-dir", @"D:\R\docs\sessions", "--session", "7" },
                EngineLaunch.Arguments(consult, "claude-code", "claude-opus-5-5"));

            var mechanic = Action(ActionIds.OpenMechanic, "dabbler", "consult", "--mechanic", "--sessions-dir", @"D:\R\docs\sessions");
            Assert.Equal(
                new[] { "session", "launch", "--for", "mechanic", "--engine", "codex", "--sessions-dir", @"D:\R\docs\sessions" },
                EngineLaunch.Arguments(mechanic, "codex", null));

            // Continue Session runs the start Start Session runs, so its engine is a session's.
            var resume = Action(ActionIds.ContinueSession, "dabbler", "session", "start", "--sessions-dir", @"D:\R\docs\sessions");
            Assert.Equal(
                new[] { "session", "launch", "--for", "session", "--engine", "codex", "--sessions-dir", @"D:\R\docs\sessions" },
                EngineLaunch.Arguments(resume, "codex", null));

            Assert.Throws<ArgumentException>(() => EngineLaunch.Arguments(Action("dabblerSessionSets.cancel", "dabbler"), "codex", null));
        }

        [Fact]
        public void Parse_reads_a_launch_line()
        {
            var launch = EngineLaunch.Parse(
                "{\n  \"program\": \"codex\",\n  \"args\": [],\n  \"cwd\": \"D:\\\\R\",\n  \"env\": { \"DABBLER_ENGINE_PLACE\": \"1\" },\n" +
                "  \"title\": \"Mechanic — Codex — R\",\n  \"typed\": \"Run `dabbler consult --mechanic`.\"\n}\n");

            Assert.Equal("codex", launch.Program);
            Assert.Empty(launch.Args);
            Assert.Equal(@"D:\R", launch.Cwd);
            Assert.Equal("1", launch.Env["DABBLER_ENGINE_PLACE"]);
            Assert.Equal("Mechanic — Codex — R", launch.Title);
            Assert.Equal("Run `dabbler consult --mechanic`.", launch.Typed);
            Assert.Throws<FormatException>(() => EngineLaunch.Parse("{\"args\":[]}"));
        }
    }
}
