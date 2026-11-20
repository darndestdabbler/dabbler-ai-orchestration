using System;
using Dabbler.VisualStudio.Core;
using Xunit;

namespace Dabbler.VisualStudio.Core.Tests
{
    public class StartCheckTests
    {
        [Fact]
        public void Ask_names_unsaved_documents_and_a_running_debugger()
        {
            var question = StartCheck.Ask(new[] { "Program.cs", "App.config" }, debugging: true, building: false);
            Assert.NotNull(question);
            Assert.Contains("Program.cs, App.config", question!.Detail);
            Assert.Contains("debugger is running", question.Detail);
            Assert.DoesNotContain("build is in progress", question.Detail);
            Assert.Equal(new[] { StartCheck.SaveAllAndGoOn, StartCheck.GoOnAnyway, StartCheck.NotNow }, question.Choices);
        }

        [Fact]
        public void Ask_names_a_build_and_offers_no_save_where_nothing_is_unsaved()
        {
            var question = StartCheck.Ask(Array.Empty<string>(), debugging: false, building: true);
            Assert.NotNull(question);
            Assert.Contains("build is in progress", question!.Detail);
            Assert.Equal(new[] { StartCheck.GoOnAnyway, StartCheck.NotNow }, question.Choices);
        }

        [Fact]
        public void Ask_is_null_where_nothing_is_unsaved_running_or_building()
        {
            Assert.Null(StartCheck.Ask(Array.Empty<string>(), debugging: false, building: false));
        }
    }
}
