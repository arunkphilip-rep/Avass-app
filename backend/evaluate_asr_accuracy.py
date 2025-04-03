#!/usr/bin/env python
"""
Script for evaluating the accuracy of speech-to-text transcriptions
by comparing them with reference texts.

Evaluates:
- Word count accuracy
- Character count accuracy
- Word Error Rate (WER)
- Spelling errors
- Sentence structure correctness
"""

import os
import sys
import json
import argparse
import re
from pathlib import Path
import numpy as np
from collections import Counter
import difflib
from faster_whisper import WhisperModel
import torch

# Try to import spellchecker and language-check libraries
try:
    from spellchecker import SpellChecker
    SPELLCHECK_AVAILABLE = True
except ImportError:
    SPELLCHECK_AVAILABLE = False
    print("Warning: spellchecker library not found. Install with 'pip install pyspellchecker'")

try:
    import language_tool_python
    GRAMMAR_CHECK_AVAILABLE = True
except ImportError:
    GRAMMAR_CHECK_AVAILABLE = False
    print("Warning: language_tool_python not found. Install with 'pip install language-tool-python'")

def get_reference_transcription_pairs(transcription_dir, reference_dir=None):
    """
    Find pairs of transcription files and reference text files.
    If reference_dir is not provided, will look for reference files with the same name but a .ref.txt extension.
    """
    pairs = []
    transcription_dir = Path(transcription_dir)
    reference_dir = Path(reference_dir) if reference_dir else transcription_dir
    
    # Get all transcription files
    transcription_files = list(transcription_dir.glob("*.json"))
    
    for trans_file in transcription_files:
        # Try to find a matching reference file
        base_name = trans_file.stem
        ref_file = reference_dir / f"{base_name}.ref.txt"
        
        # If direct match doesn't exist, try to find a reference file with a similar name
        if not ref_file.exists() and reference_dir:
            potential_refs = list(reference_dir.glob("*.ref.txt"))
            # Try to find the most similar filename
            if potential_refs:
                closest_match = difflib.get_close_matches(base_name, 
                                                         [ref.stem.replace(".ref", "") for ref in potential_refs], 
                                                         n=1)
                if closest_match:
                    ref_file = reference_dir / f"{closest_match[0]}.ref.txt"
        
        if ref_file.exists():
            pairs.append((trans_file, ref_file))
    
    return pairs

def load_transcription(file_path):
    """
    Load a transcription from a JSON file.
    Handles various JSON formats that might be present in the workspace.
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        # Handle different JSON structures
        if isinstance(data, dict):
            # Try common keys that might contain transcription text
            for key in ['transcription', 'text', 'transcript', 'result']:
                if key in data and isinstance(data[key], str) and data[key].strip():
                    return data[key].strip()
            
            # If nested, check for common patterns
            if 'results' in data and isinstance(data['results'], list) and data['results']:
                if 'alternatives' in data['results'][0] and data['results'][0]['alternatives']:
                    if 'transcript' in data['results'][0]['alternatives'][0]:
                        return data['results'][0]['alternatives'][0]['transcript'].strip()
            
            # Return the first string value we find that seems substantial
            for key, value in data.items():
                if isinstance(value, str) and len(value.split()) > 3:
                    return value.strip()
        
        # If the whole JSON is just a string
        elif isinstance(data, str):
            return data.strip()
            
        # If nothing worked, dump the JSON contents as a string and try to extract text
        text_dump = str(data)
        matches = re.findall(r'"(text|transcription|transcript)"\s*:\s*"([^"]+)"', text_dump)
        if matches:
            return matches[0][1].strip()
            
        print(f"Warning: Could not find transcription in expected format: {file_path}")
        print(f"File contents: {data}")
        return ""
    except Exception as e:
        print(f"Error loading transcription from {file_path}: {e}")
        return ""

def load_reference(file_path):
    """Load a reference text file."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read().strip()
    except Exception as e:
        print(f"Error loading reference from {file_path}: {e}")
        return ""

def normalize_text(text):
    """Normalize text for comparison by removing extra whitespace and converting to lowercase."""
    # Remove extra whitespace
    text = re.sub(r'\s+', ' ', text)
    # Convert to lowercase
    text = text.lower().strip()
    # Remove punctuation for word-based metrics
    text = re.sub(r'[^\w\s]', '', text)
    return text

def count_words(text):
    """Count the number of words in the text."""
    return len(normalize_text(text).split())

def count_characters(text):
    """Count the number of characters in the text (excluding whitespace)."""
    return len(re.sub(r'\s', '', text))

def count_sentences(text):
    """Count the number of sentences in the text."""
    # Simple sentence detection based on punctuation
    return len(re.split(r'[.!?]+', text.strip())) - 1 if text.strip() else 0

def calculate_word_error_rate(reference, transcription):
    """
    Calculate Word Error Rate (WER) between reference and transcription.
    WER = (S + D + I) / N
    Where:
    - S: number of substitutions
    - D: number of deletions
    - I: number of insertions
    - N: number of words in reference
    """
    reference_words = normalize_text(reference).split()
    transcription_words = normalize_text(transcription).split()
    
    # Calculate Levenshtein distance
    d = np.zeros((len(reference_words) + 1, len(transcription_words) + 1), dtype=np.int32)
    
    # Initialize first row and column
    for i in range(len(reference_words) + 1):
        d[i, 0] = i
    for j in range(len(transcription_words) + 1):
        d[0, j] = j
    
    # Fill the matrix
    for i in range(1, len(reference_words) + 1):
        for j in range(1, len(transcription_words) + 1):
            if reference_words[i-1] == transcription_words[j-1]:
                d[i, j] = d[i-1, j-1]
            else:
                substitution = d[i-1, j-1] + 1
                insertion = d[i, j-1] + 1
                deletion = d[i-1, j] + 1
                d[i, j] = min(substitution, insertion, deletion)
    
    # The last cell contains the Levenshtein distance
    distance = d[len(reference_words), len(transcription_words)]
    
    # Calculate WER
    if len(reference_words) > 0:
        wer = float(distance) / float(len(reference_words))
    else:
        wer = float('inf')  # Avoid division by zero
    
    return wer

def check_spelling(text):
    """Check spelling errors in the text."""
    if not SPELLCHECK_AVAILABLE:
        return None, 0
    
    try:
        spell = SpellChecker()
        words = re.findall(r'\b\w+\b', text.lower())
        misspelled = spell.unknown(words)
        return misspelled, len(misspelled)
    except Exception as e:
        print(f"Error checking spelling: {e}")
        return None, 0

def check_grammar(text):
    """Check grammar errors in the text."""
    if not GRAMMAR_CHECK_AVAILABLE:
        return None, 0
    
    try:
        tool = language_tool_python.LanguageTool('en-US')
        matches = tool.check(text)
        tool.close()
        return matches, len(matches)
    except Exception as e:
        print(f"Error checking grammar: {e}")
        return None, 0

def calculate_metrics(reference, transcription):
    """Calculate all metrics between reference and transcription."""
    # Normalize texts for consistent comparison
    clean_reference = normalize_text(reference)
    clean_transcription = normalize_text(transcription)
    
    # Basic metrics
    ref_word_count = count_words(reference)
    trans_word_count = count_words(transcription)
    
    ref_char_count = count_characters(reference)
    trans_char_count = count_characters(transcription)
    
    ref_sentence_count = count_sentences(reference)
    trans_sentence_count = count_sentences(transcription)
    
    # Word error rate
    wer = calculate_word_error_rate(reference, transcription)
    
    # Word count accuracy
    if ref_word_count > 0:
        word_count_accuracy = 1.0 - abs(ref_word_count - trans_word_count) / ref_word_count
    else:
        word_count_accuracy = 0.0
    
    # Character count accuracy
    if ref_char_count > 0:
        char_count_accuracy = 1.0 - abs(ref_char_count - trans_char_count) / ref_char_count
    else:
        char_count_accuracy = 0.0
    
    # Sentence count accuracy
    if ref_sentence_count > 0:
        sentence_count_accuracy = 1.0 - abs(ref_sentence_count - trans_sentence_count) / ref_sentence_count
    else:
        sentence_count_accuracy = 0.0
        
    # Calculate advanced metrics if libraries are available
    spelling_errors_ref = None
    spelling_errors_trans = None
    spelling_error_count_ref = 0
    spelling_error_count_trans = 0
    
    if SPELLCHECK_AVAILABLE:
        spelling_errors_ref, spelling_error_count_ref = check_spelling(reference)
        spelling_errors_trans, spelling_error_count_trans = check_spelling(transcription)
    
    grammar_errors_ref = None
    grammar_errors_trans = None
    grammar_error_count_ref = 0
    grammar_error_count_trans = 0
    
    if GRAMMAR_CHECK_AVAILABLE:
        grammar_errors_ref, grammar_error_count_ref = check_grammar(reference)
        grammar_errors_trans, grammar_error_count_trans = check_grammar(transcription)
    
    # Calculate word-level accuracy (percentage of correctly transcribed words)
    ref_words = clean_reference.split()
    trans_words = clean_transcription.split()
    
    # Count matching words (simple approach)
    ref_word_counts = Counter(ref_words)
    trans_word_counts = Counter(trans_words)
    
    # Count matched words
    matched_words = sum((ref_word_counts & trans_word_counts).values())
    
    if len(ref_words) > 0:
        word_accuracy = matched_words / len(ref_words)
    else:
        word_accuracy = 0.0
    
    # Calculate sentence BLEU-like score (simple n-gram overlap for sentences)
    sentence_accuracy = 0.0
    if ref_sentence_count > 0 and trans_sentence_count > 0:
        ref_sentences = re.split(r'[.!?]+', reference.strip())
        trans_sentences = re.split(r'[.!?]+', transcription.strip())
        
        for i, ref_sent in enumerate(ref_sentences):
            if i < len(trans_sentences):
                common_words = set(normalize_text(ref_sent).split()) & set(normalize_text(trans_sentences[i]).split())
                ref_words_set = set(normalize_text(ref_sent).split())
                if ref_words_set:
                    sentence_accuracy += len(common_words) / len(ref_words_set)
        
        sentence_accuracy /= ref_sentence_count
    
    # Return all metrics as a dictionary
    return {
        'reference_length': len(reference),
        'transcription_length': len(transcription),
        'reference_word_count': ref_word_count,
        'transcription_word_count': trans_word_count,
        'reference_char_count': ref_char_count,
        'transcription_char_count': trans_char_count,
        'reference_sentence_count': ref_sentence_count,
        'transcription_sentence_count': trans_sentence_count,
        'word_error_rate': wer,
        'word_count_accuracy': word_count_accuracy,
        'char_count_accuracy': char_count_accuracy,
        'sentence_count_accuracy': sentence_count_accuracy,
        'word_accuracy': word_accuracy,
        'sentence_accuracy': sentence_accuracy,
        'spelling_error_count_reference': spelling_error_count_ref,
        'spelling_error_count_transcription': spelling_error_count_trans,
        'grammar_error_count_reference': grammar_error_count_ref,
        'grammar_error_count_transcription': grammar_error_count_trans
    }

def print_metrics(metrics, file_name):
    """Print metrics in a readable format."""
    print("\n" + "=" * 80)
    print(f"EVALUATION RESULTS FOR: {file_name}")
    print("=" * 80)
    
    print(f"Reference text length: {metrics['reference_length']} characters")
    print(f"Transcription text length: {metrics['transcription_length']} characters")
    
    print("\nCOUNT METRICS:")
    print(f"Words: {metrics['transcription_word_count']}/{metrics['reference_word_count']} "
          f"({metrics['word_count_accuracy']*100:.2f}% accuracy)")
    print(f"Characters: {metrics['transcription_char_count']}/{metrics['reference_char_count']} "
          f"({metrics['char_count_accuracy']*100:.2f}% accuracy)")
    print(f"Sentences: {metrics['transcription_sentence_count']}/{metrics['reference_sentence_count']} "
          f"({metrics['sentence_count_accuracy']*100:.2f}% accuracy)")
    
    print("\nACCURACY METRICS:")
    print(f"Word Error Rate (WER): {metrics['word_error_rate']:.4f} (lower is better)")
    print(f"Word Accuracy: {metrics['word_accuracy']*100:.2f}%")
    print(f"Sentence Structure Accuracy: {metrics['sentence_accuracy']*100:.2f}%")
    
    # Print spelling errors if available
    if SPELLCHECK_AVAILABLE:
        print(f"\nSPELLING ERRORS:")
        print(f"Reference: {metrics['spelling_error_count_reference']} potential errors")
        print(f"Transcription: {metrics['spelling_error_count_transcription']} potential errors")
    
    # Print grammar errors if available
    if GRAMMAR_CHECK_AVAILABLE:
        print(f"\nGRAMMAR ERRORS:")
        print(f"Reference: {metrics['grammar_error_count_reference']} potential errors")
        print(f"Transcription: {metrics['grammar_error_count_transcription']} potential errors")
    
    print("-" * 80)
    
    # Calculate overall accuracy score (weighted average)
    weights = {
        'word_accuracy': 0.4,
        'char_count_accuracy': 0.2,
        'sentence_accuracy': 0.3,
        'word_count_accuracy': 0.1
    }
    
    overall_score = sum(metrics[metric] * weight for metric, weight in weights.items())
    print(f"OVERALL ACCURACY SCORE: {overall_score*100:.2f}%")
    
    print("=" * 80)

def evaluate_audio_file(audio_file, reference_text, model=None):
    """
    Transcribe an audio file and compare with reference text.
    If model is not provided, it will load the default model.
    """
    if not os.path.exists(audio_file):
        print(f"Audio file not found: {audio_file}")
        return None
    
    # Load model if not provided
    if model is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        compute_type = "float16" if device == "cuda" else "float32"
        model = WhisperModel("large-v3", device=device, compute_type=compute_type)
    
    # Transcribe the audio
    print(f"Transcribing: {audio_file}")
    segments, info = model.transcribe(audio_file)
    transcription = " ".join([segment.text for segment in segments])
    
    # Compare with reference text
    metrics = calculate_metrics(reference_text, transcription)
    print_metrics(metrics, os.path.basename(audio_file))
    
    return {
        'audio_file': audio_file,
        'transcription': transcription,
        'reference': reference_text,
        'metrics': metrics
    }

def evaluate_directory(audio_dir, reference_file=None, reference_dir=None):
    """
    Evaluate all audio files in a directory against reference texts.
    """
    if not os.path.isdir(audio_dir):
        print(f"Audio directory not found: {audio_dir}")
        return []
    
    # Find audio files
    audio_files = []
    for ext in ['.wav', '.mp3', '.m4a', '.ogg', '.flac']:
        audio_files.extend(list(Path(audio_dir).glob(f"*{ext}")))
    
    if not audio_files:
        print(f"No audio files found in directory: {audio_dir}")
        return []
    
    results = []
    
    # Load single reference text if provided
    single_reference = None
    if reference_file and os.path.exists(reference_file):
        single_reference = load_reference(reference_file)
    
    # Load the model once for all files
    device = "cuda" if torch.cuda.is_available() else "cpu"
    compute_type = "float16" if device == "cuda" else "float32"
    model = WhisperModel("large-v3", device=device, compute_type=compute_type)
    
    for audio_file in audio_files:
        # Try to find a matching reference file if no single reference is provided
        reference_text = single_reference
        if reference_text is None and reference_dir:
            ref_file = Path(reference_dir) / f"{audio_file.stem}.ref.txt"
            if ref_file.exists():
                reference_text = load_reference(ref_file)
        
        if reference_text:
            result = evaluate_audio_file(str(audio_file), reference_text, model)
            if result:
                results.append(result)
    
    return results

def calculate_aggregate_metrics(results):
    """
    Calculate aggregate metrics across all evaluation results.
    """
    if not results:
        return None
    
    aggregate = {
        'file_count': len(results),
        'wer_avg': np.mean([r['metrics']['word_error_rate'] for r in results]),
        'wer_std': np.std([r['metrics']['word_error_rate'] for r in results]),
        'word_accuracy_avg': np.mean([r['metrics']['word_accuracy'] for r in results]),
        'char_accuracy_avg': np.mean([r['metrics']['char_count_accuracy'] for r in results]),
        'sentence_accuracy_avg': np.mean([r['metrics']['sentence_accuracy'] for r in results]),
        'overall_accuracy': np.mean([
            r['metrics']['word_accuracy'] * 0.4 +
            r['metrics']['char_count_accuracy'] * 0.2 +
            r['metrics']['sentence_accuracy'] * 0.3 +
            r['metrics']['word_count_accuracy'] * 0.1
            for r in results
        ])
    }
    
    return aggregate

def print_aggregate_metrics(aggregate):
    """
    Print aggregate metrics across all files.
    """
    print("\n" + "=" * 80)
    print(f"AGGREGATE METRICS ACROSS {aggregate['file_count']} FILES")
    print("=" * 80)
    
    print(f"Average Word Error Rate (WER): {aggregate['wer_avg']:.4f} (±{aggregate['wer_std']:.4f})")
    print(f"Average Word Accuracy: {aggregate['word_accuracy_avg']*100:.2f}%")
    print(f"Average Character Count Accuracy: {aggregate['char_accuracy_avg']*100:.2f}%")
    print(f"Average Sentence Structure Accuracy: {aggregate['sentence_accuracy_avg']*100:.2f}%")
    
    print("\nOVERALL ACCURACY: {:.2f}%".format(aggregate['overall_accuracy']*100))
    print("=" * 80)

def main():
    parser = argparse.ArgumentParser(description='Evaluate speech-to-text transcription accuracy')
    parser.add_argument('--transcription-file', type=str, help='Path to a transcription JSON file')
    parser.add_argument('--reference-file', type=str, help='Path to a reference text file')
    parser.add_argument('--transcription-dir', type=str, help='Directory containing transcription JSON files')
    parser.add_argument('--reference-dir', type=str, help='Directory containing reference text files')
    parser.add_argument('--audio-file', type=str, help='Path to an audio file to transcribe and evaluate')
    parser.add_argument('--audio-dir', type=str, help='Directory containing audio files to transcribe and evaluate')
    parser.add_argument('--install-deps', action='store_true', help='Install dependencies for spelling and grammar checking')
    
    args = parser.parse_args()
    
    # Install dependencies if requested
    if args.install_deps:
        print("Installing spell checking and grammar checking dependencies...")
        import subprocess
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'pyspellchecker', 'language-tool-python'])
        print("Dependencies installed. Please restart the script.")
        return
    
    # Mode 1: Evaluate a single transcription file against a reference
    if args.transcription_file and args.reference_file:
        transcription = load_transcription(args.transcription_file)
        reference = load_reference(args.reference_file)
        
        metrics = calculate_metrics(reference, transcription)
        print_metrics(metrics, os.path.basename(args.transcription_file))
    
    # Mode 2: Evaluate transcription files in a directory against references
    elif args.transcription_dir:
        reference_dir = args.reference_dir or args.transcription_dir
        pairs = get_reference_transcription_pairs(args.transcription_dir, reference_dir)
        
        if not pairs:
            print("No matching transcription and reference pairs found.")
            return
        
        results = []
        for trans_file, ref_file in pairs:
            transcription = load_transcription(trans_file)
            reference = load_reference(ref_file)
            
            metrics = calculate_metrics(reference, transcription)
            print_metrics(metrics, os.path.basename(trans_file))
            
            results.append({
                'transcription_file': str(trans_file),
                'reference_file': str(ref_file),
                'transcription': transcription,
                'reference': reference,
                'metrics': metrics
            })
        
        # Print aggregate metrics
        aggregate = calculate_aggregate_metrics(results)
        if aggregate:
            print_aggregate_metrics(aggregate)
    
    # Mode 3: Evaluate a single audio file against a reference
    elif args.audio_file and args.reference_file:
        reference = load_reference(args.reference_file)
        result = evaluate_audio_file(args.audio_file, reference)
        if not result:
            return
    
    # Mode 4: Evaluate audio files in a directory
    elif args.audio_dir:
        results = evaluate_directory(args.audio_dir, args.reference_file, args.reference_dir)
        
        if not results:
            print("No audio files were successfully evaluated.")
            return
        
        # Print aggregate metrics
        aggregate = calculate_aggregate_metrics(results)
        if aggregate:
            print_aggregate_metrics(aggregate)
    
    else:
        parser.print_help()

if __name__ == "__main__":
    main()