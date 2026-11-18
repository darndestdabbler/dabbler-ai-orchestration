using System;
using Dabbler.VisualStudio.Core;
using Xunit;

namespace Dabbler.VisualStudio.Core.Tests
{
    public class WorkExplorerDocumentTests
    {
        private const string Document = @"{
  ""schemaVersion"": 1,
  ""repositories"": [{
    ""id"": ""repository:C:/repo"", ""kind"": ""repository"", ""label"": ""repo"", ""description"": null,
    ""tooltip"": null, ""icon"": { ""kind"": ""theme"", ""id"": ""error"", ""color"": ""charts.yellow"" },
    ""collapsible"": ""expanded"", ""contextValue"": "";repository;"", ""click"": null, ""actions"": [],
    ""error"": ""The progress could not be read."",
    ""children"": [{
      ""id"": ""bucket:C:/repo/in-progress"", ""kind"": ""bucket"", ""label"": ""In Progress"", ""description"": ""1"",
      ""tooltip"": ""**In Progress**"", ""icon"": { ""kind"": ""file"", ""slug"": ""in-progress"" },
      ""collapsible"": ""expanded"", ""contextValue"": "";bucket;"", ""click"": null, ""actions"": [],
      ""children"": [{
        ""id"": ""session:C:/repo/7"", ""kind"": ""session"", ""label"": ""7: Rows"", ""description"": ""step 2 of 4"",
        ""tooltip"": ""**Session 7**"", ""icon"": { ""kind"": ""file"", ""slug"": ""done"" },
        ""collapsible"": ""collapsed"", ""contextValue"": "";session;act-cancel;"",
        ""click"": { ""id"": ""open-plan"", ""title"": ""Open Plan"", ""argv"": null,
          ""opens"": { ""file"": ""docs/sessions/session-plan.md"", ""line"": 12, ""fragment"": null },
          ""preview"": null, ""confirm"": null, ""reason"": null },
        ""actions"": [{ ""id"": ""cancel"", ""title"": ""Cancel Session"",
          ""argv"": [""dabbler"", ""session"", ""cancel""], ""opens"": null,
          ""preview"": [""dabbler"", ""session"", ""cancel"", ""--dry-run""],
          ""confirm"": { ""title"": ""Cancel session 7?"", ""detail"": null, ""accept"": ""Cancel It"", ""keep"": ""Keep It"" },
          ""reason"": { ""prompt"": ""Why?"", ""placeholder"": ""a reason"", ""blank"": null, ""dismissed"": ""abort"" } }],
        ""children"": []
      }]
    }]
  }]
}";

        [Fact]
        public void Parse_reads_every_member_of_a_row()
        {
            var document = WorkExplorerDocument.Parse(Document);

            Assert.Equal(1, document.SchemaVersion);
            var repository = Assert.Single(document.Repositories);
            Assert.Equal("repository:C:/repo", repository.Id);
            Assert.Equal("repository", repository.Kind);
            Assert.Null(repository.Description);
            Assert.Null(repository.Tooltip);
            Assert.Equal("theme", repository.Icon!.Kind);
            Assert.Equal("error", repository.Icon.Id);
            Assert.Equal("charts.yellow", repository.Icon.Color);
            Assert.Equal("The progress could not be read.", repository.Error);
            Assert.Null(repository.Click);
            Assert.Empty(repository.Actions);

            var bucket = Assert.Single(repository.Children);
            Assert.Equal("In Progress", bucket.Label);
            Assert.Equal("1", bucket.Description);
            Assert.Equal("**In Progress**", bucket.Tooltip);
            Assert.Equal("expanded", bucket.Collapsible);
            Assert.Equal("file", bucket.Icon!.Kind);
            Assert.Equal("in-progress", bucket.Icon.Slug);
            Assert.Null(bucket.Error);

            var session = Assert.Single(bucket.Children);
            Assert.Equal("session", session.Kind);
            Assert.Equal("7: Rows", session.Label);
            Assert.Equal("collapsed", session.Collapsible);
            Assert.Equal(";session;act-cancel;", session.ContextValue);
            Assert.Equal("done", session.Icon!.Slug);
            Assert.Null(session.Click!.Argv);
            Assert.Equal("docs/sessions/session-plan.md", session.Click.Opens!.File);
            Assert.Equal(12, session.Click.Opens.Line);
            Assert.Null(session.Click.Opens.Fragment);

            var cancel = Assert.Single(session.Actions);
            Assert.Equal("cancel", cancel.Id);
            Assert.Equal("Cancel Session", cancel.Title);
            Assert.Equal(new[] { "dabbler", "session", "cancel" }, cancel.Argv);
            Assert.Null(cancel.Opens);
            Assert.Equal(new[] { "dabbler", "session", "cancel", "--dry-run" }, cancel.Preview);
            Assert.Equal("Cancel session 7?", cancel.Confirm!.Title);
            Assert.Null(cancel.Confirm.Detail);
            Assert.Equal("Cancel It", cancel.Confirm.Accept);
            Assert.Equal("Keep It", cancel.Confirm.Keep);
            Assert.Equal("Why?", cancel.Reason!.Prompt);
            Assert.Equal("a reason", cancel.Reason.Placeholder);
            Assert.Null(cancel.Reason.Blank);
            Assert.Equal("abort", cancel.Reason.Dismissed);
            Assert.Empty(session.Children);

            var refused = Assert.Throws<FormatException>(() => WorkExplorerDocument.Parse(@"{ ""schemaVersion"": 2, ""repositories"": [] }"));
            Assert.Contains("shape 2", refused.Message);
        }
    }
}
