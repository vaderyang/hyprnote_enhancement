/**
 * Multilingual word counting utility that properly handles languages
 * with and without word boundaries (spaces).
 * 
 * This solves the issue where CJK languages (Chinese, Japanese, Korean)
 * and other non-space-separated languages are severely undercounted
 * when using simple whitespace splitting.
 */

/**
 * Detects if text contains primarily CJK (Chinese, Japanese, Korean) characters
 */
function isCJKText(text: string): boolean {
  // Unicode ranges for CJK characters
  const cjkRegex = /[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\ufb00-\ufb4f\u1100-\u11ff\uac00-\ud7af]/;
  const cjkMatches = text.match(cjkRegex);
  if (!cjkMatches) return false;
  
  // Consider it CJK if more than 30% of characters are CJK
  const cjkCharCount = text.match(/[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\ufb00-\ufb4f\u1100-\u11ff\uac00-\ud7af]/g)?.length || 0;
  const totalChars = text.replace(/\s/g, '').length;
  return totalChars > 0 && (cjkCharCount / totalChars) > 0.3;
}

/**
 * Estimates word count for CJK languages using character-based heuristics
 * Since CJK languages don't use spaces, we use different strategies:
 * - Chinese: ~1.5 characters per "word" (empirically derived)
 * - Japanese: Mix of hiragana/katakana/kanji, ~2 characters per word
 * - Korean: ~2 characters per word
 */
function estimateCJKWordCount(text: string): number {
  const cleanText = text.replace(/\s/g, '');
  
  // Count different character types
  const chineseChars = (cleanText.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
  const japaneseChars = (cleanText.match(/[\u3040-\u309f\u30a0-\u30ff]/g) || []).length; 
  const koreanChars = (cleanText.match(/[\u1100-\u11ff\uac00-\ud7af]/g) || []).length;
  
  // Use language-specific ratios
  let estimatedWords = 0;
  estimatedWords += Math.ceil(chineseChars / 1.5); // Chinese: ~1.5 chars per word
  estimatedWords += Math.ceil(japaneseChars / 2);  // Japanese: ~2 chars per word  
  estimatedWords += Math.ceil(koreanChars / 2);    // Korean: ~2 chars per word
  
  // Add any remaining space-separated words
  const spaceWords = text.split(/\s+/).filter(word => 
    word.trim().length > 0 && !/[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\u1100-\u11ff\uac00-\ud7af]/.test(word)
  ).length;
  
  return estimatedWords + spaceWords;
}

/**
 * Counts words in multilingual text, handling both space-separated
 * and non-space-separated languages appropriately.
 * 
 * @param text - The text to count words in
 * @returns Estimated word count
 */
export function countWords(text: string): number {
  if (!text || typeof text !== 'string') {
    return 0;
  }
  
  const trimmedText = text.trim();
  if (trimmedText.length === 0) {
    return 0;
  }
  
  // Check if this is primarily CJK text
  if (isCJKText(trimmedText)) {
    return estimateCJKWordCount(trimmedText);
  }
  
  // For non-CJK languages, use traditional space-based splitting
  // but with improved handling of punctuation and multiple spaces
  const words = trimmedText
    .split(/\s+/)
    .filter(word => word.trim().length > 0)
    .filter(word => !/^[^\w\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\u1100-\u11ff\uac00-\ud7af]+$/.test(word));
  
  return words.length;
}

/**
 * Counts words from an array of Word2-like objects, using proper multilingual counting
 * for the combined text content.
 * 
 * This is specifically designed to replace the current words.length counting
 * that doesn't account for multilingual text properly.
 */
export function countWordsFromWordArray(words: Array<{ text: string }>): number {
  if (!words || words.length === 0) {
    return 0;
  }
  
  // Combine all word texts and count properly
  const combinedText = words.map(w => w.text).join(' ');
  return countWords(combinedText);
}

/**
 * Segments text into word-like units for multilingual support.
 * This is intended to replace the simple split_whitespace() approach.
 * 
 * @param text - Text to segment
 * @returns Array of word-like segments
 */
export function segmentText(text: string): string[] {
  if (!text || typeof text !== 'string') {
    return [];
  }
  
  const trimmedText = text.trim();
  if (trimmedText.length === 0) {
    return [];
  }
  
  if (isCJKText(trimmedText)) {
    // For CJK text, we'll create artificial "words" by splitting into
    // reasonable chunks (2-3 characters) mixed with any actual spaces
    const segments: string[] = [];
    let currentSegment = '';
    
    for (let i = 0; i < trimmedText.length; i++) {
      const char = trimmedText[i];
      
      if (/\s/.test(char)) {
        // Space: finish current segment and skip spaces
        if (currentSegment.trim()) {
          segments.push(currentSegment.trim());
          currentSegment = '';
        }
      } else if (/[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\u1100-\u11ff\uac00-\ud7af]/.test(char)) {
        // CJK character: add to current segment
        currentSegment += char;
        
        // Create segments of 2-3 CJK characters
        if (currentSegment.length >= 2) {
          segments.push(currentSegment);
          currentSegment = '';
        }
      } else {
        // Non-CJK character: add to segment
        currentSegment += char;
      }
    }
    
    // Add final segment if any
    if (currentSegment.trim()) {
      segments.push(currentSegment.trim());
    }
    
    return segments.filter(s => s.length > 0);
  }
  
  // For non-CJK text, use improved space-based splitting
  return trimmedText
    .split(/\s+/)
    .filter(word => word.trim().length > 0);
}