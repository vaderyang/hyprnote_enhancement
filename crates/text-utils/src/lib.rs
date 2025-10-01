//! Multilingual text utilities for proper handling of CJK and other languages.
//!
//! This module provides utilities for text segmentation that properly handles
//! languages with and without word boundaries (spaces), solving the issue where
//! CJK languages (Chinese, Japanese, Korean) are severely undercounted when using
//! simple whitespace splitting.

use unicode_segmentation::UnicodeSegmentation;

/// Detects if text contains primarily CJK (Chinese, Japanese, Korean) characters.
///
/// # Arguments
/// * `text` - The text to analyze
///
/// # Returns
/// `true` if more than 30% of non-whitespace characters are CJK
pub fn is_cjk_text(text: &str) -> bool {
    let cjk_char_count = text
        .chars()
        .filter(|c| is_cjk_char(*c))
        .count();

    let total_chars: usize = text.chars().filter(|c| !c.is_whitespace()).count();

    total_chars > 0 && (cjk_char_count as f64 / total_chars as f64) > 0.3
}

/// Checks if a character is a CJK character.
fn is_cjk_char(c: char) -> bool {
    matches!(c,
        '\u{4e00}'..='\u{9fff}' |  // CJK Unified Ideographs
        '\u{3400}'..='\u{4dbf}' |  // CJK Extension A
        '\u{3040}'..='\u{309f}' |  // Hiragana
        '\u{30a0}'..='\u{30ff}' |  // Katakana
        '\u{fb00}'..='\u{fb4f}' |  // Alphabetic Presentation Forms
        '\u{1100}'..='\u{11ff}' |  // Hangul Jamo
        '\u{ac00}'..='\u{d7af}'    // Hangul Syllables
    )
}

/// Segments text into word-like units for multilingual support.
///
/// For CJK text, creates artificial "words" by splitting into reasonable chunks.
/// For non-CJK text, uses whitespace-based splitting.
///
/// # Arguments
/// * `text` - The text to segment
///
/// # Returns
/// Vector of word-like segments
pub fn segment_text(text: &str) -> Vec<String> {
    if text.trim().is_empty() {
        return Vec::new();
    }

    if is_cjk_text(text) {
        segment_cjk_text(text)
    } else {
        segment_non_cjk_text(text)
    }
}

/// Segments CJK text into word-like units.
fn segment_cjk_text(text: &str) -> Vec<String> {
    let mut segments = Vec::new();
    let mut current_segment = String::new();

    for grapheme in text.graphemes(true) {
        let ch = grapheme.chars().next().unwrap_or(' ');

        if ch.is_whitespace() {
            // Finish current segment at whitespace
            if !current_segment.trim().is_empty() {
                segments.push(current_segment.trim().to_string());
                current_segment.clear();
            }
        } else if is_cjk_char(ch) {
            // For CJK characters, add to segment
            current_segment.push_str(grapheme);

            // Create segments of 2-3 CJK characters
            let cjk_count = current_segment.chars().filter(|c| is_cjk_char(*c)).count();
            if cjk_count >= 2 {
                segments.push(current_segment.clone());
                current_segment.clear();
            }
        } else {
            // Non-CJK character in CJK text
            current_segment.push_str(grapheme);
        }
    }

    // Add final segment if any
    if !current_segment.trim().is_empty() {
        segments.push(current_segment.trim().to_string());
    }

    segments.into_iter().filter(|s| !s.is_empty()).collect()
}

/// Segments non-CJK text using whitespace.
fn segment_non_cjk_text(text: &str) -> Vec<String> {
    text.split_whitespace()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_cjk_text() {
        // Chinese text
        assert!(is_cjk_text("这是一个测试"));

        // Japanese text
        assert!(is_cjk_text("これはテストです"));

        // Korean text
        assert!(is_cjk_text("이것은 테스트입니다"));

        // English text
        assert!(!is_cjk_text("This is a test"));

        // Mixed text with majority English
        assert!(!is_cjk_text("This is 一个 test"));
    }

    #[test]
    fn test_segment_cjk_text() {
        let text = "这是一个测试";
        let segments = segment_text(text);
        assert!(!segments.is_empty());
        assert!(segments.len() >= 2);
    }

    #[test]
    fn test_segment_non_cjk_text() {
        let text = "This is a test";
        let segments = segment_text(text);
        assert_eq!(segments, vec!["This", "is", "a", "test"]);
    }

    #[test]
    fn test_empty_text() {
        assert!(segment_text("").is_empty());
        assert!(segment_text("   ").is_empty());
    }
}
