using System;
using System.Linq;
using Dabbler.VisualStudio.Core;
using Newtonsoft.Json;
using Xunit;

namespace Dabbler.VisualStudio.Core.Tests
{
    public class ConfigurationTreeTests
    {
        private static object Action(string id)
        {
            return new { id, title = id, argv = new[] { "dabbler", "discovery", "refresh" }, pick = (object?)null, confirm = (object?)null, unavailable = (string?)null };
        }

        private static object Row(string id, string label, string? description, object[] actions, params object[] children)
        {
            return new
            {
                id,
                kind = "configRole",
                label,
                description,
                tooltip = (string?)null,
                icon = (object?)null,
                collapsible = children.Length > 0 ? "collapsed" : "none",
                contextValue = (string?)null,
                value = (string?)null,
                decidedLayer = (string?)null,
                click = actions.FirstOrDefault(),
                actions,
                children,
            };
        }

        private static ConfigurationDocument Document()
        {
            var root = new
            {
                id = "configuration",
                kind = "configuration",
                label = "Configuration",
                description = "claude-code · api",
                tooltip = "What a session is run with.\n\nai-model-catalog: 7h old",
                actions = new[] { Action("dabblerSolution.refreshRecord") },
                children = new[]
                {
                    Row("config:authoring", "Authoring AI", "claude-code · claude-opus-5-5", Array.Empty<object>(),
                        Row("config:vehicle:authoring", "Vehicle", "claude-code · machine default", Array.Empty<object>())),
                    Row("config:keys", "API Keys", "3 of 3 available", Array.Empty<object>(),
                        Row("config:credential:anthropic", "Anthropic key", "DABBLER_ANTHROPIC_API_KEY is set", new[] { Action("dabblerSolution.storeCredential") })),
                },
            };
            return ConfigurationDocument.Parse(JsonConvert.SerializeObject(new { schemaVersion = 1, machineOnly = false, configuration = root }));
        }

        [Fact]
        public void Show_heads_the_tree_with_the_root_and_lists_its_children_open()
        {
            var tree = new ConfigurationTree();
            tree.Show(Document());

            Assert.Equal("claude-code · api\n\nWhat a session is run with.\n\nai-model-catalog: 7h old", tree.Header);
            Assert.Equal(new[] { "Authoring AI", "API Keys" }, tree.Roots.Select(node => node.Label));
            Assert.All(tree.Roots, node => Assert.True(node.IsExpanded));
            var vehicle = Assert.Single(tree.Roots[0].Children);
            Assert.Equal("claude-code · machine default", vehicle.Description);
            Assert.False(vehicle.IsExpanded);

            // Store a Key is not built here yet: no menu item, and no click.
            var key = Assert.Single(tree.Roots[1].Children);
            Assert.Empty(key.Actions);
            Assert.Null(key.Click);
        }

        [Fact]
        public void Show_keeps_what_was_open_and_selected_by_id()
        {
            var tree = new ConfigurationTree();
            tree.Show(Document());
            tree.Roots[0].IsExpanded = false;
            tree.Roots[1].Children[0].IsSelected = true;

            tree.Show(Document());

            Assert.False(tree.Roots[0].IsExpanded);
            Assert.True(tree.Roots[1].IsExpanded);
            Assert.True(tree.Roots[1].Children[0].IsSelected);
        }
    }
}
