using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;
using System.Xml.Linq;
using Dabbler.VisualStudio.Core;
using Microsoft.VisualStudio.Imaging;
using Microsoft.VisualStudio.Imaging.Interop;
using Microsoft.VisualStudio.PlatformUI;
using Microsoft.VisualStudio.Shell;

namespace Dabbler.VisualStudio
{
    /// <summary>
    /// A row's icon as an element: a `file` icon is one of the VS Code
    /// extension's status pictures, shipped under media/light and media/dark;
    /// a `theme` icon is the editor's own glyph, which here is the nearest
    /// Visual Studio image. An icon with no picture here shows none.
    /// </summary>
    internal sealed class StatusPictures : IValueConverter
    {
        private const double Size = 16;

        private static readonly string MediaFolder =
            Path.Combine(Path.GetDirectoryName(typeof(StatusPictures).Assembly.Location)!, "media");

        private static readonly ConcurrentDictionary<string, ImageSource?> Pictures = new ConcurrentDictionary<string, ImageSource?>();

        public object? Convert(object value, Type targetType, object parameter, CultureInfo culture)
        {
            if (!(value is WorkExplorerIcon icon)) return null;
            if (icon.Kind == "file" && icon.Slug != null)
            {
                var picture = Picture(icon.Slug);
                return picture == null ? null : new System.Windows.Controls.Image { Source = picture, Width = Size, Height = Size };
            }
            if (icon.Kind == "theme" && icon.Id != null)
            {
                var moniker = Moniker(icon.Id, icon.Color);
                return moniker == null ? null : new CrispImage { Moniker = moniker.Value, Width = Size, Height = Size };
            }
            return null;
        }

        public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        {
            throw new NotSupportedException();
        }

        private static ImageMoniker? Moniker(string id, string? color)
        {
            switch (id)
            {
                case "info": return KnownMonikers.StatusInformation;
                case "error": return color == "charts.yellow" ? KnownMonikers.StatusWarning : KnownMonikers.StatusError;
                case "eye": return KnownMonikers.Visible;
                default: return null;
            }
        }

        /// <summary>The picture for <paramref name="slug"/> in the theme the tool window is drawn in.</summary>
        private static ImageSource? Picture(string slug)
        {
            var background = VSColorTheme.GetThemedColor(EnvironmentColors.ToolWindowBackgroundColorKey);
            var theme = background.GetBrightness() < 0.5 ? "dark" : "light";
            return Pictures.GetOrAdd(Path.Combine(theme, slug + ".svg"), file => Read(Path.Combine(MediaFolder, file)));
        }

        /// <summary>
        /// The circles and paths of a status picture, as a drawing. These are
        /// the only shapes the pictures hold; a file that cannot be read shows
        /// no icon rather than stopping the tree.
        /// </summary>
        private static ImageSource? Read(string file)
        {
            try
            {
                return Draw(XDocument.Load(file));
            }
            catch (Exception error) when (error is IOException || error is UnauthorizedAccessException || error is System.Xml.XmlException || error is FormatException)
            {
                return null;
            }
        }

        private static ImageSource Draw(XDocument svg)
        {
            var group = new DrawingGroup();
            // The whole 16x16 box, so a picture that does not reach its edges keeps its place.
            group.Children.Add(new GeometryDrawing(Brushes.Transparent, null, new RectangleGeometry(new Rect(0, 0, Size, Size))));
            foreach (var shape in svg.Descendants().Where(e => e.Name.LocalName == "circle" || e.Name.LocalName == "path"))
            {
                var style = Style(shape);
                var geometry = shape.Name.LocalName == "circle"
                    ? new EllipseGeometry(new Point(Number(shape, "cx"), Number(shape, "cy")), Number(shape, "r"), Number(shape, "r"))
                    : Geometry.Parse((Get(style, "fill-rule") == "evenodd" ? "F0 " : "F1 ") + (string?)shape.Attribute("d"));
                group.Children.Add(new GeometryDrawing(Paint(Get(style, "fill") ?? "#000000"), Pen(style), geometry));
            }
            var image = new DrawingImage(group);
            image.Freeze();
            return image;
        }

        /// <summary>The shape's style attribute and its presentation attributes, the style winning.</summary>
        private static Dictionary<string, string> Style(XElement shape)
        {
            var style = new Dictionary<string, string>();
            foreach (var attribute in shape.Attributes()) style[attribute.Name.LocalName] = attribute.Value;
            foreach (var declaration in ((string?)shape.Attribute("style") ?? "").Split(';'))
            {
                var colon = declaration.IndexOf(':');
                if (colon > 0) style[declaration.Substring(0, colon).Trim()] = declaration.Substring(colon + 1).Trim();
            }
            return style;
        }

        private static string? Get(Dictionary<string, string> style, string name)
        {
            return style.TryGetValue(name, out var value) ? value : null;
        }

        private static double Number(XElement shape, string name)
        {
            return double.Parse((string?)shape.Attribute(name) ?? "0", CultureInfo.InvariantCulture);
        }

        private static Brush? Paint(string colour)
        {
            if (colour == "none") return null;
            var brush = new SolidColorBrush((Color)ColorConverter.ConvertFromString(colour));
            brush.Freeze();
            return brush;
        }

        private static Pen? Pen(Dictionary<string, string> style)
        {
            var stroke = Paint(Get(style, "stroke") ?? "none");
            if (stroke == null) return null;
            var width = Get(style, "stroke-width");
            var round = Get(style, "stroke-linecap") == "round";
            var pen = new Pen(stroke, width == null ? 1 : double.Parse(width, CultureInfo.InvariantCulture))
            {
                StartLineCap = round ? PenLineCap.Round : PenLineCap.Flat,
                EndLineCap = round ? PenLineCap.Round : PenLineCap.Flat,
                LineJoin = Get(style, "stroke-linejoin") == "round" ? PenLineJoin.Round : PenLineJoin.Miter,
            };
            pen.Freeze();
            return pen;
        }
    }
}
