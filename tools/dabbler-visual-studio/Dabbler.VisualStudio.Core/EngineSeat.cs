namespace Dabbler.VisualStudio.Core
{
    /// <summary>
    /// Which pane, if any, types to one engine. Two panes typing at once
    /// would interleave their keys in one prompt, so the first to attach
    /// holds the keyboard until it detaches.
    /// </summary>
    public sealed class EngineSeat
    {
        private readonly object gate = new object();
        private object? holder;

        /// <summary>Takes the keyboard for <paramref name="pane"/>; false where another pane holds it.</summary>
        public bool TryTake(object pane)
        {
            lock (gate)
            {
                if (holder != null && !ReferenceEquals(holder, pane)) return false;
                holder = pane;
                return true;
            }
        }

        /// <summary>Whether what <paramref name="pane"/> types reaches the engine.</summary>
        public bool MayType(object pane)
        {
            lock (gate)
            {
                return ReferenceEquals(holder, pane);
            }
        }

        /// <summary>Leaves the keyboard free, where <paramref name="pane"/> held it.</summary>
        public void Leave(object pane)
        {
            lock (gate)
            {
                if (ReferenceEquals(holder, pane)) holder = null;
            }
        }

        /// <summary>Whether a pane holds the keyboard.</summary>
        public bool Held
        {
            get
            {
                lock (gate)
                {
                    return holder != null;
                }
            }
        }
    }
}
