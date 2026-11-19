using Dabbler.VisualStudio.Core;
using Xunit;

namespace Dabbler.VisualStudio.Core.Tests
{
    public class DabblerLayoutTests
    {
        private static readonly string[] VisualStudios = { "Design", "Debug", "NoToolWin" };

        [Fact]
        public void Use_applies_and_records_over_the_active_configuration_where_nothing_is_recorded()
        {
            var use = DabblerLayout.Use(VisualStudios, "Design");

            Assert.Equal(LayoutMove.Apply, use.Move);
            Assert.Equal("Design", use.Over);
            Assert.DoesNotContain(use.Record, VisualStudios);
        }

        [Fact]
        public void Use_goes_back_to_what_the_first_use_recorded_and_then_applies_again()
        {
            var first = DabblerLayout.Use(VisualStudios, "Design");
            // The layout ran under Design, so Design is active at the second use too.
            var second = DabblerLayout.Use(new[] { "Design", "Debug", first.Record, "NoToolWin" }, "Design");

            Assert.Equal(LayoutMove.GoBack, second.Move);
            Assert.Equal(first.Record, second.Record);
            Assert.Equal("Design", second.Over);
            Assert.Equal(LayoutMove.Apply, DabblerLayout.Use(VisualStudios, "Design").Move);
        }

        [Fact]
        public void Use_goes_back_into_the_configuration_recorded_over_whatever_is_active_now()
        {
            var first = DabblerLayout.Use(VisualStudios, "Design");
            // A debugger started since: Visual Studio made Debug active.
            var second = DabblerLayout.Use(new[] { "Design", "Debug", "NoToolWin", first.Record }, "Debug");

            Assert.Equal("Design", second.Over);
        }

        [Fact]
        public void AtStart_applies_the_layout_only_where_the_option_says_and_never_takes_it_back()
        {
            var applied = new[] { "Design", "Debug", "NoToolWin", DabblerLayout.Use(VisualStudios, "Design").Record };

            Assert.True(DabblerLayout.AtStart(true, VisualStudios));
            Assert.False(DabblerLayout.AtStart(false, VisualStudios));
            Assert.False(DabblerLayout.AtStart(true, applied));
        }
    }
}
