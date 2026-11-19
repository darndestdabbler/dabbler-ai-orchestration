using Dabbler.VisualStudio.Core;
using Xunit;

namespace Dabbler.VisualStudio.Core.Tests
{
    public class EngineSeatTests
    {
        [Fact]
        public void A_second_pane_cannot_take_or_type_until_the_first_detaches()
        {
            var seat = new EngineSeat();
            var first = new object();
            var second = new object();

            Assert.True(seat.TryTake(first));
            Assert.False(seat.TryTake(second));
            Assert.False(seat.MayType(second));
            Assert.True(seat.MayType(first));

            seat.Leave(first);
            Assert.True(seat.TryTake(second));
            Assert.True(seat.MayType(second));
            Assert.False(seat.MayType(first));
        }
    }
}
