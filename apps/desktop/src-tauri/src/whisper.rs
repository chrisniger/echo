use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
pub struct TranscriptionSegment {
    pub text: String,
    pub start: f64,
    pub end: f64,
    #[serde(default)]
    pub confidence: f32,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct TranscriptionResult {
    pub text: String,
    pub language: String,
    pub duration: f64,
    #[serde(default)]
    pub segments: Vec<TranscriptionSegment>,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct ModelInfo {
    pub name: String,
    pub file: String,
    pub size_mb: u64,
    pub language: String,
}

pub fn available_models() -> Vec<ModelInfo> {
    vec![
        ModelInfo { name: "Tiny".into(), file: "ggml-tiny.bin".into(), size_mb: 75, language: "multilingual".into() },
        ModelInfo { name: "Base".into(), file: "ggml-base.bin".into(), size_mb: 142, language: "multilingual".into() },
        ModelInfo { name: "Base EN".into(), file: "ggml-base.en.bin".into(), size_mb: 142, language: "english-only".into() },
        ModelInfo { name: "Small".into(), file: "ggml-small.bin".into(), size_mb: 466, language: "multilingual".into() },
        ModelInfo { name: "Medium".into(), file: "ggml-medium.bin".into(), size_mb: 1_500, language: "multilingual".into() },
        ModelInfo { name: "Large V3".into(), file: "ggml-large-v3.bin".into(), size_mb: 3_100, language: "multilingual".into() },
    ]
}
