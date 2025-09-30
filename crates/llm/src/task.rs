use futures_util::StreamExt;

use hypr_gbnf::Grammar;
use hypr_llm_interface::ModelManager;
use hypr_template::{render, Template};

pub async fn generate_title(
    provider: &ModelManager,
    ctx: serde_json::Map<String, serde_json::Value>,
) -> Result<String, crate::Error> {
    let model = provider.get_model().await?;

    // Only use grammar for English titles, as the grammar only supports ASCII characters
    let summary_language = ctx
        .get("config")
        .and_then(|c| c.get("general"))
        .and_then(|g| g.get("summary_language"))
        .and_then(|l| l.as_str())
        .unwrap_or("en");

    let grammar = if summary_language == "en" {
        Some(Grammar::Title.build())
    } else {
        None
    };

    // Render the prompts
    let system_prompt = render(Template::CreateTitleSystem, &ctx).unwrap();
    let user_prompt = render(Template::CreateTitleUser, &ctx).unwrap();

    // Log the complete prompts being sent to LLM
    let separator = "=".repeat(80);
    println!("\n{}", separator);
    println!("🎯 TITLE GENERATION - Sending to LLM");
    println!("{}", separator);
    println!("📋 Language: {}", summary_language);
    println!("📏 Grammar constraint: {}", if grammar.is_some() { "enabled" } else { "disabled" });
    println!("🔢 Max tokens: 30");
    println!("\n{}", separator);
    println!("💬 SYSTEM PROMPT:");
    println!("{}", separator);
    println!("{}", system_prompt);
    println!("\n{}", separator);
    println!("💬 USER PROMPT:");
    println!("{}", separator);
    println!("{}", user_prompt);
    println!("{}\n", separator);

    let stream = model.generate_stream(hypr_llama::LlamaRequest {
        messages: vec![
            hypr_llama::LlamaMessage {
                role: "system".into(),
                content: system_prompt,
            },
            hypr_llama::LlamaMessage {
                role: "user".into(),
                content: user_prompt,
            },
        ],
        max_tokens: Some(30),
        grammar,
        ..Default::default()
    })?;

    let items = stream
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .filter_map(|r| match r {
            hypr_llama::Response::TextDelta(content) => Some(content.clone()),
            _ => None,
        })
        .collect::<Vec<_>>();
    let text = items.join("");

    // Log the generated title
    let separator = "=".repeat(80);
    println!("{}", separator);
    println!("✅ TITLE GENERATED:");
    println!("{}", separator);
    println!("{}", text);
    println!("{}\n", separator);

    Ok(text)
}

pub async fn generate_tags(
    provider: &ModelManager,
    ctx: serde_json::Map<String, serde_json::Value>,
) -> Result<Vec<String>, crate::Error> {
    let model = provider.get_model().await?;

    let stream = model.generate_stream(hypr_llama::LlamaRequest {
        messages: vec![
            hypr_llama::LlamaMessage {
                role: "system".into(),
                content: render(Template::SuggestTagsSystem, &ctx).unwrap(),
            },
            hypr_llama::LlamaMessage {
                role: "user".into(),
                content: render(Template::SuggestTagsUser, &ctx).unwrap(),
            },
        ],
        max_tokens: Some(30),
        grammar: Some(Grammar::Tags.build()),
        ..Default::default()
    })?;

    let items = stream
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .filter_map(|r| match r {
            hypr_llama::Response::TextDelta(content) => Some(content.clone()),
            _ => None,
        })
        .collect::<Vec<_>>();
    let text = items.join("");
    let tags = serde_json::from_str::<Vec<String>>(&text).unwrap_or_default();
    Ok(tags)
}

pub async fn postprocess_transcript(
    provider: &ModelManager,
    ctx: serde_json::Map<String, serde_json::Value>,
) -> Result<String, crate::Error> {
    let model = provider.get_model().await?;

    let stream = model.generate_stream(hypr_llama::LlamaRequest {
        messages: vec![
            hypr_llama::LlamaMessage {
                role: "system".into(),
                content: render(Template::PostprocessTranscriptSystem, &ctx).unwrap(),
            },
            hypr_llama::LlamaMessage {
                role: "user".into(),
                content: render(Template::PostprocessTranscriptUser, &ctx).unwrap(),
            },
        ],
        max_tokens: Some(100),
        ..Default::default()
    })?;

    let items = stream
        .collect::<Vec<_>>()
        .await
        .into_iter()
        .filter_map(|r| match r {
            hypr_llama::Response::TextDelta(content) => Some(content.clone()),
            _ => None,
        })
        .collect::<Vec<_>>();
    let text = items.join("");
    Ok(text)
}
