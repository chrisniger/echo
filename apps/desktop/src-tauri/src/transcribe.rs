use crate::whisper::TranscriptionResult;

pub async fn transcribe_via_gateway(
    audio_data: &[f32],
    sample_rate: u32,
    gateway_url: &str,
    language: Option<&str>,
) -> Result<TranscriptionResult, String> {
    let audio_bytes: Vec<u8> = audio_data
        .iter()
        .flat_map(|s| s.to_le_bytes())
        .collect();

    let client = reqwest::Client::new();
    let mut payload = serde_json::json!({
        "audio": base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            &audio_bytes,
        ),
        "sample_rate": sample_rate,
        "channels": 1,
        "encoding": "f32le",
    });

    if let Some(lang) = language {
        payload["language"] = serde_json::Value::String(lang.to_string());
    }

    let response = client
        .post(format!("{}/api/transcribe", gateway_url))
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Gateway request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Gateway returned {}: {}", status, body));
    }

    response
        .json::<TranscriptionResult>()
        .await
        .map_err(|e| format!("Failed to parse transcription result: {}", e))
}

pub async fn transcribe_locally(
    audio_data: &[f32],
    sample_rate: u32,
    _model_path: &str,
) -> Result<TranscriptionResult, String> {
    let duration = audio_data.len() as f64 / sample_rate as f64;

    // Placeholder — local Whisper inference requires whisper-rs with LLVM/bindgen
    // Install LLVM from https://github.com/llvm/llvm-project/releases to enable
    Ok(TranscriptionResult {
        segments: vec![],
        full_text: String::new(),
        language: "en".into(),
        duration_secs: duration,
    })
}
