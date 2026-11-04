using System.Net;
using System.Text;
using System.Text.Json;

namespace aks_generator
{
    internal class Generator
    {
        private int _sectionId = 0;
        private readonly List<(CheckListItem Item, string Section)> _items = [];

        public int HighCount { get; private set; }
        public int MediumCount { get; private set; }
        public int LowCount { get; private set; }

        public string CreateManifest(string itemsPath)
        {
            string legacyPath = Path.GetFullPath(Path.Combine(itemsPath, "..", "legacy-index.json"));
            using var legacyDocument = JsonDocument.Parse(File.ReadAllText(legacyPath));
            return JsonSerializer.Serialize(new
            {
                version = 1,
                legacy = legacyDocument.RootElement,
                items = _items.Select(entry => new
                {
                    guid = entry.Item.Guid,
                    section = entry.Section,
                    priority = entry.Item.Priority.ToLowerInvariant(),
                    kind = entry.Item.Kind,
                    applicability = entry.Item.Applicability,
                    supersedes = entry.Item.Supersedes,
                    related = entry.Item.Related,
                    title = entry.Item.Title
                })
            });
        }

        public string CreateReferenceAppendix()
        {
            var references = _items.Where(entry => entry.Item.Kind == "reference").ToList();
            if (references.Count == 0)
                return string.Empty;

            var html = new StringBuilder();
            html.AppendLine("<section class=\"s-checklist\" id=\"reference-appendix\"><div class=\"s-checklist__inner\">");
            html.AppendLine("<h2>Reference appendix — unscored</h2>");
            html.AppendLine("<p>Tools and naming guidance are references, not production controls. They do not affect completion.</p>");
            html.AppendLine("<ul class=\"c-checklist__list\">");
            foreach (var entry in references)
            {
                html.AppendLine(CreateSectionItem(entry.Item));
            }
            html.AppendLine("</ul></div></section>");
            return html.ToString();
        }

        public string ParseCategory(string category, string path, string fileName)
        {
            // parse a json file and return a list of CheckListItems
            if (string.IsNullOrEmpty(category) || string.IsNullOrEmpty(fileName))
                return string.Empty;

            
            if (File.Exists(Path.Combine(path, fileName)) == false)
            {
                Console.WriteLine($"File {Path.Combine(path, fileName)} does not exist.");
                return string.Empty;
            }

            var jsonContent = File.ReadAllText(Path.Combine(path, fileName));

            var items = JsonSerializer.Deserialize<List<CheckListItem>>(jsonContent);

            if (items == null || items.Count == 0)
                return string.Empty;

            return CreateSection(category, _sectionId++, items);
        }

        private string CreateSection(string title, int id, List<CheckListItem> items)
        {
            string identifier = ConvertToKebabCase(title);

            StringBuilder sb = new StringBuilder();
            sb.AppendLine($"<section class=\"s-checklist js-section s-checklist__{identifier}\" data-section=\"{identifier}\" data-section-id=\"{id}\" id=\"section-{identifier}\">");
            sb.AppendLine("    <div class=\"s-checklist__inner\">");
            sb.AppendLine("        <div class=\"s-checklist__header\">");
            sb.AppendLine("            <div class=\"s-checklist__title\">");
            sb.AppendLine($"                <h2 class=\"s-checklist__header__title\">{Enc(title)}</h2>");
            sb.AppendLine("                <div class=\"c-progress\">");
            sb.AppendLine($"                    <progress class=\"c-progress__bar js-progress\" value=\"0\" max=\"100\" aria-label=\"{Enc(title)} completion\"></progress>");
            sb.AppendLine($"                    <div class=\"c-progress__counter\"><span class=\"c-progress__label\">0 %</span><span class=\"c-progress__text\">&nbsp;{Enc(title)} items are ✓</span></div>");
            sb.AppendLine("                </div>");
            sb.AppendLine("            </div>");
            sb.AppendLine("            <div class=\"c-tools\">");
            sb.AppendLine("                <div class=\"c-button__group\">");
            sb.AppendLine("                    <button type=\"button\" class=\"c-button-icon js-check-all\" title=\"Check all items\" aria-label=\"Check all items\">");
            sb.AppendLine("                        <svg class=\"icon icon-check\" xmlns=\"http://www.w3.org/2000/svg\" width=\"30\" height=\"30\" viewbox=\"-432 234 94 94\" aria-hidden=\"true\" data-icon-name=\"check\">");
            sb.AppendLine("                            <title>Check</title>");
            sb.AppendLine("                            <path d=\"M-349 245v72h-72v-72h72m5-11h-82c-3.3 0-6 2.7-6 6v82c0 3.3 2.7 6 6 6h82c3.3 0 6-2.7 6-6v-82c0-3.3-2.7-6-6-6z\"></path>");
            sb.AppendLine("                            <path class=\"path-check\" d=\"M-349.2 261.1l-7.2-7.2c-.8-.8-2-.8-2.8 0l-37.3 37.3-13.3-13.3c-.8-.8-2-.8-2.8 0l-7.2 7.2c-.4.4-.6.9-.6 1.4s.2 1 .6 1.4l21.9 21.9c.4.4.9.6 1.4.6.5 0 1-.2 1.4-.6l45.9-45.9c.4-.4.6-.9.6-1.4 0-.5-.2-1-.6-1.4z\"></path>");
            sb.AppendLine("                        </svg>");
            sb.AppendLine("                    </button>");
            sb.AppendLine("                    <button type=\"button\" class=\"c-button-icon js-uncheck-all\" title=\"Uncheck all items\" aria-label=\"Uncheck all items\">");
            sb.AppendLine("                        <svg class=\"icon icon-uncheck\" xmlns=\"http://www.w3.org/2000/svg\" width=\"30\" height=\"30\" viewbox=\"-432 234 94 94\" aria-hidden=\"true\" data-icon-name=\"check\">");
            sb.AppendLine("                            <title>Check</title>");
            sb.AppendLine("                            <path d=\"M-349 245v72h-72v-72h72m5-11h-82c-3.3 0-6 2.7-6 6v82c0 3.3 2.7 6 6 6h82c3.3 0 6-2.7 6-6v-82c0-3.3-2.7-6-6-6z\"></path>");
            sb.AppendLine("                            <path class=\"path-check\" d=\"M-349.2 261.1l-7.2-7.2c-.8-.8-2-.8-2.8 0l-37.3 37.3-13.3-13.3c-.8-.8-2-.8-2.8 0l-7.2 7.2c-.4.4-.6.9-.6 1.4s.2 1 .6 1.4l21.9 21.9c.4.4.9.6 1.4.6.5 0 1-.2 1.4-.6l45.9-45.9c.4-.4.6-.9.6 1.4 0-.5-.2-1-.6-1.4z\"></path>");
            sb.AppendLine("                        </svg>");
            sb.AppendLine("                    </button>");
            sb.AppendLine("                </div>");
            sb.AppendLine("                <div class=\"c-button__group\">");
            sb.AppendLine("                    <button type=\"button\" class=\"c-button-icon js-expand-all\" title=\"Show all details\" aria-label=\"Show all details\">");
            sb.AppendLine("                        <svg class=\"icon2 icon-check\" xmlns=\"http://www.w3.org/2000/svg\" width=\"30\" height=\"30\" viewbox=\"0 0 510 510\" aria-hidden=\"true\" data-icon-name=\"expand\">");
            sb.AppendLine("                            <path d=\"M280.5 127.5h-51v102h-102v51h102v102h51v-102h102v-51h-102v-102zM255 0C114.75 0 0 114.75 0 255s114.75 255 255 255 255-114.75 255-255S395.25 0 255 0zm0 459c-112.2 0-204-91.8-204-204S142.8 51 255 51s204 91.8 204 204-91.8 204-204 204z\"></path>");
            sb.AppendLine("                        </svg>");
            sb.AppendLine("                    </button>");
            sb.AppendLine("                    <button type=\"button\" class=\"c-button-icon js-collapse-all\" title=\"Hide all details\" aria-label=\"Hide all details\">");
            sb.AppendLine("                        <svg class=\"icon2 icon-uncheck\" xmlns=\"http://www.w3.org/2000/svg\" width=\"30\" height=\"30\" viewbox=\"0 0 510 510\" aria-hidden=\"true\" data-icon-name=\"collapse\">");
            sb.AppendLine("                            <path d=\"M255 0C114.75 0 0 114.75 0 255s114.75 255 255 255 255-114.75 255-255S395.25 0 255 0zm127.5 280.5h-255v-51h255v51z\"></path>");
            sb.AppendLine("                        </svg>");
            sb.AppendLine("                    </button>");
            sb.AppendLine("                </div>");
            sb.AppendLine("            </div>");
            sb.AppendLine("        </div>");
            sb.AppendLine("<div class=\"s-checklist__body js-checklist-body\" data-body-visibility=\"visible\" aria-hidden=\"false\">");
            sb.AppendLine("<div class=\"c-checklist\">");
            sb.AppendLine("<ul class=\"c-checklist__list\">");
               
            foreach (var item in items)
            {
                _items.Add((item, identifier));
                if (item.Kind != "reference")
                    sb.AppendLine(CreateSectionItem(item));
            }
            
            sb.AppendLine("</ul>");
            sb.AppendLine("</div>");
            sb.AppendLine("</div>");
            sb.AppendLine("</div>");
            sb.AppendLine("</section>");
            return sb.ToString();
        }

        private string CreateSectionItem(CheckListItem item)
        {
            var html = new StringBuilder();
            bool isReference = item.Kind == "reference";

            // Convertir les tags en classes CSS (sans "all")
            var tagClasses = Enc(string.Join(" ", item.Tags.Where(tag => tag != "all")));

            // Convertir la priorité en format CSS
            string priorityClass = item.Priority.ToLowerInvariant();
            string priorityText = item.Priority;

            switch (isReference ? string.Empty : priorityClass)
            {
                case "high": HighCount++; break;
                case "medium": MediumCount++; break;
                case "low": LowCount++; break;
            }

            string itemId = Enc(item.Guid);
            string itemClass = isReference ? "js-reference" : "js-item";
            string priorityAttribute = isReference ? string.Empty : $" data-item-priority=\"{Enc(priorityClass)}\" data-item-check=\"false\" data-item-state=\"open\"";
            html.AppendLine($"<li class=\"c-checklist__item {itemClass} all {tagClasses}\" id=\"item-{itemId}\" data-item-id=\"{itemId}\"{priorityAttribute} data-item-dropdown=\"open\" data-item-visible=\"true\" aria-hidden=\"false\">");
            html.AppendLine("    <div class=\"c-checklist__item__inner\">");
            html.AppendLine("        <div class=\"c-checklist__body\">");

            // Colonne de priorité
            html.AppendLine($"            <div class=\"c-checklist__column c-checklist__priority\" data-icon-name=\"bullet\" data-tippy-content=\"{Enc(isReference ? "Unscored reference" : priorityText + " priority")}\">");
            if (!isReference)
                html.AppendLine(GeneratePriorityIcon(priorityClass));
            html.AppendLine("            </div>");

            // Colonne checkbox
            if (!isReference)
            {
                html.AppendLine("            <div class=\"c-checklist__column c-checklist__checkbox\">");
                html.AppendLine($"                <input class=\"checkbox\" type=\"checkbox\" name=\"check-{itemId}\" id=\"check-{itemId}\">");
                html.AppendLine(GenerateCheckboxIcons());
                html.AppendLine("            </div>");
            }

            // Colonne label
            html.AppendLine("            <div class=\"c-checklist__column c-checklist__label\">");
            string labelElement = isReference ? "div" : $"label for=\"check-{itemId}\"";
            html.AppendLine($"                <{labelElement}><span class=\"label__title\">{Enc(item.Title)} </span><span class=\"label__description\">{Enc(item.Description)}</span></{(isReference ? "div" : "label")}>");
            if (!string.IsNullOrWhiteSpace(item.Applicability))
                html.AppendLine($"                <p class=\"checklist-applicability\"><strong>Applies when:</strong> {Enc(item.Applicability)}</p>");
            if (!isReference)
            {
                html.AppendLine($"                <div class=\"checklist-state\"><span class=\"checklist-priority-label\">{Enc(CapitalizeFirstLetter(priorityClass))} priority</span><span class=\"js-item-status\" aria-live=\"polite\">Open</span> <button type=\"button\" class=\"js-na\" aria-pressed=\"false\">Mark N/A</button></div>");
            }
            else
            {
                html.AppendLine("                <p><strong>Unscored reference</strong></p>");
            }

            // Détails
            html.AppendLine($"                <div class=\"c-checklist__details js-details\" id=\"details-{itemId}\">");

            // Ajouter le détail s'il existe
            if (!string.IsNullOrEmpty(item.Detail))
            {
                html.AppendLine($"                    <p class=\"c-checklist__text\">{Enc(item.Detail)}</p>");
            }

            if (item.Related.Count > 0)
            {
                html.AppendLine("                    <div class=\"checklist-related\"><h4>Related controls</h4><ul>");
                foreach (string relatedId in item.Related)
                {
                    html.AppendLine($"<li><a href=\"#item-{Enc(relatedId)}\" data-related-guid=\"{Enc(relatedId)}\">Related control {Enc(relatedId)}</a></li>");
                }
                html.AppendLine("                    </ul></div>");
            }

            // Documentation
            if (item.Documentation != null && item.Documentation.Count > 0)
            {
                html.AppendLine("                    <div class=\"c-checklist__documentation\">");
                html.AppendLine("                        <h4>Documentation</h4>");
                html.AppendLine("                        <ul class=\"documentation__list\">");

                foreach (var doc in item.Documentation)
                {
                    html.AppendLine($"                            <li><img class=\"c-checklist__favicon\" src=\"img/icons/1x1.png\" data-src=\"https://www.google.com/s2/favicons?domain_url={Enc(doc.Url)}\" ><a href=\"{Enc(doc.Url)}\" target=\"_blank\" rel=\"noopener noreferrer\">{Enc(doc.Title)}</a></li>");
                }

                html.AppendLine("                        </ul>");
                html.AppendLine("                    </div>");
            }

            // Documentation
            if (item.Tool != null && item.Tool.Count > 0)
            {
                html.AppendLine("                    <div class=\"c-checklist__tools\">");
                html.AppendLine("                        <h4>Tools</h4>");
                html.AppendLine("                        <ul class=\"documentation__list\">");

                foreach (var doc in item.Tool)
                {
                    html.AppendLine($"                            <li><img class=\"c-checklist__favicon\" src=\"img/icons/1x1.png\" data-src=\"https://www.google.com/s2/favicons?domain_url={Enc(doc.Url)}\" alt=\"\"><a href=\"{Enc(doc.Url)}\" target=\"_blank\" rel=\"noopener noreferrer\">{Enc(doc.Title)}</a></li>");
                }

                html.AppendLine("                        </ul>");
                html.AppendLine("                    </div>");
            }

            html.AppendLine("                </div>");

            // Tags
            html.AppendLine("                <div class=\"c-tags\">");
            html.AppendLine("                    <ul class=\"c-tags__list\">");

            foreach (var tag in item.Tags.Where(tag => tag != "all"))
            {
                html.AppendLine($"                        <li class=\"c-tags__item\">{Enc(tag.ToUpperInvariant())}</li>");
            }

            html.AppendLine("                    </ul>");
            html.AppendLine("                </div>");
            html.AppendLine("            </div>");

            // Colonne dropdown
            if (!isReference)
            {
                html.AppendLine("            <div class=\"c-checklist__column c-checklist__dropdown\">");
                html.AppendLine($"                <button type=\"button\" class=\"button-icon js-dropdown c-checklist__dropdown__button\" aria-controls=\"details-{itemId}\" aria-expanded=\"true\" aria-label=\"Show or hide details for {Enc(item.Title)}\">");
                html.AppendLine(GenerateArrowIcon());
                html.AppendLine("                </button>");
                html.AppendLine("            </div>");
            }
            html.AppendLine("        </div>");
            html.AppendLine("    </div>");
            html.AppendLine("</li>");

            return html.ToString();
        }

        private static string Enc(string? value) => WebUtility.HtmlEncode(value ?? string.Empty);

        private static string ConvertToKebabCase(string input)
        {
            if (string.IsNullOrEmpty(input))
                return string.Empty;

            return input.ToLowerInvariant().Replace(" ", "-");
        }

        private static string CapitalizeFirstLetter(string input)
        {
            if (string.IsNullOrEmpty(input))
                return string.Empty;

            if (input.Length == 1)
                return input.ToUpperInvariant();

            return char.ToUpperInvariant(input[0]) + input.Substring(1).ToLowerInvariant();
        }

        private static string GeneratePriorityIcon(string priority)
        {
            return $@"                <svg class=""icon icon--small icon-priority--{priority}"" xmlns=""http://www.w3.org/2000/svg"" width=""30"" height=""30"" viewBox=""0 0 94 94"" aria-hidden=""true"" aria-label=""{CapitalizeFirstLetter(priority)} priority"">
                    <path d=""M94 88c0 3.312-2.688 6-6 6H6c-3.314 0-6-2.688-6-6V6c0-3.313 2.686-6 6-6h82c3.312 0 6 2.687 6 6v82z""></path>
                </svg>";
        }

        private static string GenerateCheckboxIcons()
        {
            return @"                <svg class=""icon icon-checkbox"" xmlns=""http://www.w3.org/2000/svg"" width=""30"" height=""30"" viewbox=""-432 234 94 94"" aria-hidden=""true"" data-icon-name=""check"">
                    <title>Check</title>
                    <path d=""M-349 245v72h-72v-72h72m5-11h-82c-3.3 0-6 2.7-6 6v82c0 3.3 2.7 6 6 6h82c3.3 0 6-2.7 6-6v-82c0-3.3-2.7-6-6-6z""></path>
                    <path class=""path-check"" d=""M-349.2 261.1l-7.2-7.2c-.8-.8-2-.8-2.8 0l-37.3 37.3-13.3-13.3c-.8-.8-2-.8-2.8 0l-7.2 7.2c-.4.4-.6.9-.6 1.4s.2 1 .6 1.4l21.9 21.9c.4.4.9.6 1.4.6.5 0 1-.2 1.4-.6l45.9-45.9c.4-.4.6-.9.6-1.4 0-.5-.2-1-.6-1.4z""></path>
                </svg>
                <svg class=""icon icon-checked"" xmlns=""http://www.w3.org/2000/svg"" width=""30"" height=""30"" viewbox=""-432 234 94 94"" aria-hidden=""true"" data-icon-name=""check"">
                    <title>Check</title>
                    <path d=""M-349 245v72h-72v-72h72m5-11h-82c-3.3 0-6 2.7-6 6v82c0 3.3 2.7 6 6 6h82c3.3 0 6-2.7 6-6v-82c0-3.3-2.7-6-6-6z""></path>
                    <path class=""path-check"" d=""M-349.2 261.1l-7.2-7.2c-.8-.8-2-.8-2.8 0l-37.3 37.3-13.3-13.3c-.8-.8-2-.8-2.8 0l-7.2 7.2c-.4.4-.6.9-.6 1.4s.2 1 .6 1.4l21.9 21.9c.4.4.9.6 1.4.6.5 0 1-.2 1.4-.6l45.9-45.9c.4-.4.6-.9.6-1.4 0-.5-.2-1-.6-1.4z""></path>
                </svg>";
        }

        private static string GenerateArrowIcon()
        {
            return @"                    <svg class=""icon icon-arrow"" xmlns=""http://www.w3.org/2000/svg"" width=""30"" height=""30"" viewBox=""0 0 98.148 98.149"" aria-hidden=""true"" data-icon-name=""arrow"">
                        <path d=""M97.562 64.692L50.49 17.618c-.75-.75-2.078-.75-2.828 0L.586 64.693C.21 65.068 0 65.577 0 66.106c0 .53.21 1.04.586 1.414l12.987 12.987c.39.39.902.586 1.414.586.512 0 1.023-.195 1.414-.586l32.675-32.674L81.75 80.506c.75.75 2.078.75 2.828 0L97.562 67.52c.782-.78.782-2.048 0-2.828z""></path>
                    </svg>";
        }
    }
}