using System.Text.Json.Serialization;

namespace aks_generator
{
    public class CheckListItem
    {
        [JsonPropertyName("title")]
        public required string Title { get; set; }

        [JsonPropertyName("priority")]
        public required string Priority { get; set; }

        [JsonPropertyName("guid")]
        public required string Guid { get; set; }

        [JsonPropertyName("severity")]
        public string? Severity { get; set; }

        [JsonPropertyName("description")]
        public required string Description { get; set; }

        [JsonPropertyName("detail")]
        public string? Detail { get; set; }

        [JsonPropertyName("documentation")]
        public List<Documentation> Documentation { get; set; } = new List<Documentation>();

        [JsonPropertyName("tools")]
        public List<Tool> Tool { get; set; } = new List<Tool>();

        [JsonPropertyName("tags")]
        public List<string> Tags { get; set; } = new List<string>();

        [JsonPropertyName("optionalFields")]
        public OptionalFields? OptionalFields { get; set; }
    }

    public class Documentation
    {
        [JsonPropertyName("title")]
        public required string Title { get; set; }

        [JsonPropertyName("url")]
        public required string Url { get; set; }
    }

    public class Tool
    {
        [JsonPropertyName("title")]
        public required string Title { get; set; }

        [JsonPropertyName("url")]
        public required string Url { get; set; }
    }

    public class OptionalFields
    {
        [JsonPropertyName("score")]
        public Score? Score { get; set; }
    }

    public class Score
    {
        [JsonPropertyName("simple")]
        public int? Simple { get; set; }

        [JsonPropertyName("security")]
        public int? Security { get; set; }

        [JsonPropertyName("graph")]
        public string? Graph { get; set; }
    }
}