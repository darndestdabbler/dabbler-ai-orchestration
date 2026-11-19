using System.ComponentModel;
using Dabbler.VisualStudio.Core;
using Microsoft.VisualStudio.Shell;

namespace Dabbler.VisualStudio
{
    /// <summary>
    /// Tools > Options > Dabbler > Engine. Kept in Visual Studio's own
    /// settings: where an engine opens is this interface's preference, and
    /// nothing the router reads.
    /// </summary>
    public sealed class EngineOptionsPage : DialogPage
    {
        [Category("Engine")]
        [DisplayName("Open engines in")]
        [Description("Where Start Session, Continue Session, a consult and a Mechanic open the engine: a tab of Visual Studio, or a tab of Windows Terminal.")]
        [DefaultValue(EnginePlace.VisualStudio)]
        [TypeConverter(typeof(PlaceConverter))]
        public EnginePlace OpensIn { get; set; } = EnginePlace.VisualStudio;

        /// <summary>The two places as a person reads them.</summary>
        private sealed class PlaceConverter : EnumConverter
        {
            public PlaceConverter()
                : base(typeof(EnginePlace))
            {
            }

            public override object ConvertTo(ITypeDescriptorContext context, System.Globalization.CultureInfo culture, object value, System.Type destinationType)
            {
                if (destinationType == typeof(string) && value is EnginePlace place)
                {
                    return place == EnginePlace.VisualStudio ? "Visual Studio" : "Windows Terminal";
                }
                return base.ConvertTo(context, culture, value, destinationType);
            }

            public override object ConvertFrom(ITypeDescriptorContext context, System.Globalization.CultureInfo culture, object value)
            {
                if (value is string text)
                {
                    if (text == "Visual Studio") return EnginePlace.VisualStudio;
                    if (text == "Windows Terminal") return EnginePlace.WindowsTerminal;
                }
                return base.ConvertFrom(context, culture, value);
            }
        }
    }
}
