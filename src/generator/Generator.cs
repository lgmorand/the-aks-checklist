using System.Text;
using System.Text.Json;

namespace aks_generator
{
    internal class Generator
    {
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

            return CreateSection(category, 0, items);
        }

        private string CreateSection(string title, int id, List<CheckListItem> items)
        {
            string identifier = ConvertToKebabCase(title);

            StringBuilder sb = new StringBuilder();
            sb.AppendLine($"<section class=\"s-checklist js-section s-checklist__{identifier}\" data-section=\"{identifier}\" data-section-id=\"{id}\" id=\"section-{identifier}\">");
            sb.AppendLine("    <div class=\"s-checklist__inner\">");
            sb.AppendLine("        <div class=\"s-checklist__header\">");
            sb.AppendLine("            <div class=\"s-checklist__title\">");
            sb.AppendLine($"                <h2 class=\"s-checklist__header__title\">{title}</h2>");
            sb.AppendLine("                <div class=\"c-progress\">");
            sb.AppendLine("                    <progress class=\"c-progress__bar js-progress\" value=\"0\" max=\"100\"></progress>");
            sb.AppendLine($"                    <div class=\"c-progress__counter\"><span class=\"c-progress__label\">0 %</span><span class=\"c-progress__text\">&nbsp;{title} items are ✓</span></div>");
            sb.AppendLine("                </div>");
            sb.AppendLine("            </div>");
            sb.AppendLine("            <div class=\"c-tools\">");
            sb.AppendLine("                <div class=\"c-button__group\">");
            sb.AppendLine("                    <button class=\"c-button-icon js-check-all\" title=\"Check all items\" data-tippy-content=\"Check all items\" data-tippy-arrow=\"true\">");
            sb.AppendLine("                        <svg class=\"icon icon-check\" xmlns=\"http://www.w3.org/2000/svg\" width=\"30\" height=\"30\" viewbox=\"-432 234 94 94\" aria-hidden=\"true\" data-icon-name=\"check\">");
            sb.AppendLine("                            <title>Check</title>");
            sb.AppendLine("                            <path d=\"M-349 245v72h-72v-72h72m5-11h-82c-3.3 0-6 2.7-6 6v82c0 3.3 2.7 6 6 6h82c3.3 0 6-2.7 6-6v-82c0-3.3-2.7-6-6-6z\"></path>");
            sb.AppendLine("                            <path class=\"path-check\" d=\"M-349.2 261.1l-7.2-7.2c-.8-.8-2-.8-2.8 0l-37.3 37.3-13.3-13.3c-.8-.8-2-.8-2.8 0l-7.2 7.2c-.4.4-.6.9-.6 1.4s.2 1 .6 1.4l21.9 21.9c.4.4.9.6 1.4.6.5 0 1-.2 1.4-.6l45.9-45.9c.4-.4.6-.9.6-1.4 0-.5-.2-1-.6-1.4z\"></path>");
            sb.AppendLine("                        </svg>");
            sb.AppendLine("                    </button>");
            sb.AppendLine("                    <button class=\"c-button-icon js-uncheck-all\" title=\"Uncheck all items\" data-tippy-content=\"Uncheck all items\" data-tippy-arrow=\"true\">");
            sb.AppendLine("                        <svg class=\"icon icon-uncheck\" xmlns=\"http://www.w3.org/2000/svg\" width=\"30\" height=\"30\" viewbox=\"-432 234 94 94\" aria-hidden=\"true\" data-icon-name=\"check\">");
            sb.AppendLine("                            <title>Check</title>");
            sb.AppendLine("                            <path d=\"M-349 245v72h-72v-72h72m5-11h-82c-3.3 0-6 2.7-6 6v82c0 3.3 2.7 6 6 6h82c3.3 0 6-2.7 6-6v-82c0-3.3-2.7-6-6-6z\"></path>");
            sb.AppendLine("                            <path class=\"path-check\" d=\"M-349.2 261.1l-7.2-7.2c-.8-.8-2-.8-2.8 0l-37.3 37.3-13.3-13.3c-.8-.8-2-.8-2.8 0l-7.2 7.2c-.4.4-.6.9-.6 1.4s.2 1 .6 1.4l21.9 21.9c.4.4.9.6 1.4.6.5 0 1-.2 1.4-.6l45.9-45.9c.4-.4.6-.9.6 1.4 0-.5-.2-1-.6-1.4z\"></path>");
            sb.AppendLine("                        </svg>");
            sb.AppendLine("                    </button>");
            sb.AppendLine("                </div>");
            sb.AppendLine("                <div class=\"c-button__group\">");
            sb.AppendLine("                    <button class=\"c-button-icon js-expand-all\" title=\"Use buttons to show/hide details\" data-tippy-content=\"Use buttons to show/hide details\" data-tippy-arrow=\"true\">");
            sb.AppendLine("                        <svg class=\"icon2 icon-check\" xmlns=\"http://www.w3.org/2000/svg\" width=\"30\" height=\"30\" viewbox=\"0 0 510 510\" aria-hidden=\"true\" data-icon-name=\"expand\">");
            sb.AppendLine("                            <path d=\"M280.5 127.5h-51v102h-102v51h102v102h51v-102h102v-51h-102v-102zM255 0C114.75 0 0 114.75 0 255s114.75 255 255 255 255-114.75 255-255S395.25 0 255 0zm0 459c-112.2 0-204-91.8-204-204S142.8 51 255 51s204 91.8 204 204-91.8 204-204 204z\"></path>");
            sb.AppendLine("                        </svg>");
            sb.AppendLine("                    </button>");
            sb.AppendLine("                    <button class=\"c-button-icon js-collapse-all\" title=\"Use buttons to show/hide details\" data-tippy-content=\"Use buttons to show/hide details\" data-tippy-arrow=\"true\">");
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
               
            int i = 0;
            foreach (var item in items)
            {
                sb.AppendLine(CreateSectionItem(item, i, identifier));
                i++;
            }
            
            sb.AppendLine("</ul>");
            sb.AppendLine("</div>");
            sb.AppendLine("</div>");
            sb.AppendLine("</section>");
            return sb.ToString();
        }

        private string CreateSectionItem(CheckListItem item, int index, string identifier)
        {
            var html = new StringBuilder();

            // Convertir les tags en classes CSS (sans "all")
            var tagClasses = string.Join(" ", item.Tags.Where(tag => tag != "all"));

            // Convertir la priorité en format CSS
            string priorityClass = item.Priority.ToLowerInvariant();
            string priorityText = item.Priority;

            // Convertir le nom de section en format kebab-case
            string sectionSlug = identifier;

            html.AppendLine($"<li class=\"c-checklist__item js-item all {tagClasses}\" data-item-priority=\"{priorityClass}\" data-item-id=\"{index}\" data-item-check=\"false\" data-item-dropdown=\"open\" data-item-visible=\"true\" aria-hidden=\"false\">");
            html.AppendLine("    <div class=\"c-checklist__item__inner\">");
            html.AppendLine("        <div class=\"c-checklist__body\">");

            // Colonne de priorité
            html.AppendLine($"            <div class=\"c-checklist__column c-checklist__priority\" data-icon-name=\"bullet\" data-tippy-content=\"{priorityText} priority\">");
            html.AppendLine(GeneratePriorityIcon(priorityClass));
            html.AppendLine("            </div>");

            // Colonne checkbox
            html.AppendLine("            <div class=\"c-checklist__column c-checklist__checkbox\">");
            html.AppendLine($"                <input class=\"checkbox\" type=\"checkbox\" name=\"c-checklist__item-{sectionSlug}-{index}\" id=\"c-checklist__item-{sectionSlug}-{index}\">");
            html.AppendLine(GenerateCheckboxIcons());
            html.AppendLine("            </div>");

            // Colonne label
            html.AppendLine("            <div class=\"c-checklist__column c-checklist__label\">");
            html.AppendLine($"                <label for=\"c-checklist__item-{sectionSlug}-{index}\"><span class=\"label__title\">{item.Title} </span><span class=\"label__description\">{item.Description}</span></label>");

            // Détails
            html.AppendLine("                <div class=\"c-checklist__details js-details\">");

            // Ajouter le détail s'il existe
            if (!string.IsNullOrEmpty(item.Detail))
            {
                html.AppendLine($"                    <p class=\"c-checklist__text\">{item.Detail}</p>");
            }

            // Documentation
            if (item.Documentation != null && item.Documentation.Count > 0)
            {
                html.AppendLine("                    <div class=\"c-checklist__documentation\">");
                html.AppendLine("                        <h4>Documentation</h4>");
                html.AppendLine("                        <ul class=\"documentation__list\">");

                foreach (var doc in item.Documentation)
                {
                    html.AppendLine($"                            <li><img class=\"c-checklist__favicon\" src=\"/img/icons/1x1.png\" data-src=\"https://www.google.com/s2/favicons?domain_url={doc.Url}\" ><a href=\"{doc.Url}\" target=\"_blank\" rel=\"noopener noreferrer\">{doc.Title}</a></li>");
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
                    html.AppendLine($"                            <li><img class=\"c-checklist__favicon\" src=\"/img/icons/1x1.png\" data-src=\"https://www.google.com/s2/favicons?domain_url={doc.Url}\" alt=\"\"><a href=\"{doc.Url}\" target=\"_blank\" rel=\"noopener noreferrer\">{doc.Title}</a></li>");
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
                html.AppendLine($"                        <li class=\"c-tags__item\">{tag.ToUpperInvariant()}</li>");
            }

            html.AppendLine("                    </ul>");
            html.AppendLine("                </div>");
            html.AppendLine("            </div>");

            // Colonne dropdown
            html.AppendLine("            <div class=\"c-checklist__column c-checklist__dropdown\">");
            html.AppendLine("                <button class=\"button-icon js-dropdown c-checklist__dropdown__button\" aria-label=\"Use buttons to show/hide details\">");
            html.AppendLine(GenerateArrowIcon());
            html.AppendLine("                </button>");
            html.AppendLine("            </div>");
            html.AppendLine("        </div>");
            html.AppendLine("    </div>");
            html.AppendLine("</li>");

            return html.ToString();
        }

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