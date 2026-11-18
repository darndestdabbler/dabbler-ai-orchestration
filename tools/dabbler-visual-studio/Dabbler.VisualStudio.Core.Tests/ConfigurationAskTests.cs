using System.Linq;
using Dabbler.VisualStudio.Core;
using Newtonsoft.Json;
using Xunit;

namespace Dabbler.VisualStudio.Core.Tests
{
    public class ConfigurationAskTests
    {
        private static object Choice(string label, string? unreachable)
        {
            return new
            {
                label,
                description = $"{label} (anthropic)",
                detail = label == "claude-opus-5-5" ? "what you chose" : null,
                value = label,
                unreachable,
                argv = new[] { "dabbler", "configure", "--repo-root", "R", "--authoring-model", label },
                mineArgv = new[] { "dabbler", "configure", "--repo-root", "R", "--authoring-model", label, "--mine" },
            };
        }

        private static ConfigurationPick Pick(object[] choices, object[] withheld, object? typed)
        {
            var action = new { id = "dabblerSolution.setAuthoringModel", title = "Set the Authoring Model", argv = (string[]?)null, pick = new { title = "Which model authors the next session?", placeholder = "a model", choices, withheld, typed }, confirm = (object?)null, unavailable = (string?)null };
            var row = new { id = "config:role:authoring", kind = "configRole", label = "Authoring Model", actions = new[] { action }, children = new object[0] };
            return ConfigurationDocument.Parse(JsonConvert.SerializeObject(new { schemaVersion = 1, machineOnly = false, configuration = row })).Configuration.Actions[0].Pick!;
        }

        [Fact]
        public void Items_lists_the_choices_with_the_unreachable_marked_and_choosing_one_yields_its_command()
        {
            var pick = Pick(
                new[] { Choice("claude-opus-5-5", null), Choice("claude-sonnet-5-5", "the Claude CLI is not on PATH") },
                new object[] { new { label = "claude-opus-4", reason = "the record says it is no longer served" } },
                null);

            var items = ConfigurationAsk.Items(pick);

            Assert.Equal(new[] { "claude-opus-5-5", "claude-sonnet-5-5", "claude-opus-4" }, items.Select(item => item.Label));
            Assert.Null(items[0].Reason);
            Assert.Equal("what you chose", items[0].Detail);
            Assert.Equal("the Claude CLI is not on PATH", items[1].Reason);
            Assert.True(items[1].Choosable);
            Assert.Equal("the record says it is no longer served", items[2].Reason);
            Assert.False(items[2].Choosable);
            Assert.Equal(new[] { "configure", "--repo-root", "R", "--authoring-model", "claude-sonnet-5-5" }, items[1].Arguments);
        }

        [Fact]
        public void Arguments_runs_keep_as_machine_default_only_once_confirmed()
        {
            var keep = new
            {
                id = "dabblerSolution.setAsMyDefault",
                title = "Keep as Machine Default",
                argv = new[] { "dabbler", "configure", "--repo-root", "R", "--engine", "claude-code", "--mine" },
                pick = (object?)null,
                confirm = new { title = "Keep 'claude-code' as this machine's default for the engine?", detail = (string?)null, accept = "Keep as Machine Default", keep = "Cancel" },
                unavailable = (string?)null,
            };
            var row = new { id = "config:vehicle:authoring", kind = "configVehicle", label = "Vehicle", actions = new[] { keep }, children = new object[0] };
            var action = ConfigurationDocument.Parse(JsonConvert.SerializeObject(new { schemaVersion = 1, machineOnly = false, configuration = row })).Configuration.Actions[0];

            Assert.Null(ConfigurationAsk.Arguments(action, _ => false));
            WorkExplorerConfirmation? asked = null;
            var args = ConfigurationAsk.Arguments(action, confirmation =>
            {
                asked = confirmation;
                return true;
            });
            Assert.Equal("Keep as Machine Default", asked!.Accept);
            Assert.Equal(new[] { "configure", "--repo-root", "R", "--engine", "claude-code", "--mine" }, args);
        }

        [Fact]
        public void Typed_appends_the_trimmed_id_and_runs_nothing_for_a_blank_one()
        {
            var pick = Pick(new object[0], new object[0], new
            {
                prompt = "Type the model id",
                argv = new[] { "dabbler", "configure", "--authoring-model" },
                mineArgv = new[] { "dabbler", "configure", "--authoring-model", "--mine" },
            });

            Assert.Equal(new[] { "configure", "--authoring-model", "claude-opus-5-5" }, ConfigurationAsk.Typed(pick, "  claude-opus-5-5 "));
            Assert.Null(ConfigurationAsk.Typed(pick, "  "));
            Assert.Null(ConfigurationAsk.Typed(pick, null));
        }
    }
}
