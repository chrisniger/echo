use crate::whisper::TranscriptionResult;

fn encode_wav(audio_data: &[f32], sample_rate: u32) -> Vec<u8> {
    let num_channels = 1u16;
    let bits_per_sample = 16u16;
    let bytes_per_sample = (bits_per_sample / 8) as u32;
    let byte_rate = sample_rate * num_channels as u32 * bytes_per_sample;
    let block_align = num_channels * (bits_per_sample / 8);

    let mut pcm: Vec<i16> = Vec::with_capacity(audio_data.len());
    for sample in audio_data {
        let clamped = sample.clamp(-1.0, 1.0);
        pcm.push((clamped * i16::MAX as f32) as i16);
    }

    let data_size = (pcm.len() * 2) as u32;
    let mut wav = Vec::with_capacity(44 + data_size as usize);

    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + data_size).to_le_bytes());
    wav.extend_from_slice(b"WAVE");
    wav.extend_from_slice(b"fmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&num_channels.to_le_bytes());
    wav.extend_from_slice(&sample_rate.to_le_bytes());
    wav.extend_from_slice(&byte_rate.to_le_bytes());
    wav.extend_from_slice(&block_align.to_le_bytes());
    wav.extend_from_slice(&bits_per_sample.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_size.to_le_bytes());

    for sample in pcm {
        wav.extend_from_slice(&sample.to_le_bytes());
    }

    wav
}

pub async fn transcribe_via_gateway(
    audio_data: &[f32],
    sample_rate: u32,
    gateway_url: &str,
    language: Option<&str>,
) -> Result<TranscriptionResult, String> {
    let audio_bytes = encode_wav(audio_data, sample_rate);

    let client = reqwest::Client::new();
    let mut payload = serde_json::json!({
        "audio": base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            &audio_bytes,
        ),
        "sample_rate": sample_rate,
        "channels": 1,
        "encoding": "wav",
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
        let preview = if body.len() > 500 { &body[..500] } else { &body };
        return Err(format!("Gateway HTTP {}: {}", status, preview));
    }

    // Try to parse, but if the gateway returned an error envelope, surface it
    let raw_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    match serde_json::from_str::<TranscriptionResult>(&raw_text) {
        Ok(result) => Ok(result),
        Err(parse_err) => {
            // Try to extract a useful message from the JSON error envelope
            if let Ok(envelope) = serde_json::from_str::<serde_json::Value>(&raw_text) {
                if let Some(msg) = envelope.get("error").and_then(|v| v.as_str()) {
                    return Err(format!("Gateway reported error: {}", msg));
                }
            }
            Err(format!(
                "Failed to parse transcription result: {} (body: {})",
                parse_err,
                &raw_text[..raw_text.len().min(300)]
            ))
        }
    }
}
