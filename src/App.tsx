/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Rocket, 
  Star, 
  CheckCircle2, 
  XCircle, 
  Plus, 
  RotateCcw, 
  Trophy,
  Loader2,
  Eye,
  EyeOff,
  Sparkles,
  ChevronRight,
  Volume2,
  Calendar,
  BookOpen,
  History
} from 'lucide-react';
import { GoogleGenAI, Modality } from "@google/genai";
import { Word } from './types';
import { INITIAL_WORDS } from './constants';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export default function App() {
  const [words, setWords] = useState<Word[]>(() => {
    const saved = localStorage.getItem('word-adventure-data');
    return saved ? JSON.parse(saved) : INITIAL_WORDS;
  });
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showDetail, setShowDetail] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newWord, setNewWord] = useState({ english: '', chinese: '' });
  const [loadingAI, setLoadingAI] = useState(false);
  const [playingAudio, setPlayingAudio] = useState(false);
  const [mode, setMode] = useState<'learn' | 'review'>('learn');

  // Filter words based on mode
  const activeWords = useMemo(() => {
    const now = Date.now();
    if (mode === 'review') {
      // Review mode: words that are not mastered, have a reviewLevel > 0, and nextReviewAt <= now
      return words.filter(w => !w.isMastered && w.reviewLevel > 0 && (w.nextReviewAt || 0) <= now);
    }
    // Learn mode: words that are not mastered and (reviewLevel === 0 OR nextReviewAt is in the future)
    // Actually, let's keep it simple: Learn mode shows all non-mastered words that are NOT due for review
    return words.filter(w => !w.isMastered && (w.reviewLevel === 0 || (w.nextReviewAt || 0) > now));
  }, [words, mode]);

  const currentWord = activeWords[currentIndex];
  const masteredCount = words.filter(w => w.isMastered).length;
  const reviewDueCount = words.filter(w => !w.isMastered && w.reviewLevel > 0 && (w.nextReviewAt || 0) <= Date.now()).length;
  const remainingCount = activeWords.length;

  useEffect(() => {
    localStorage.setItem('word-adventure-data', JSON.stringify(words));
  }, [words]);

  // Fetch AI explanation and image if missing
  useEffect(() => {
    if (currentWord && (!currentWord.explanation || !currentWord.imageUrl)) {
      enrichWord(currentWord);
    }
  }, [currentWord]);

  async function enrichWord(word: Word) {
    if (loadingAI) return;
    setLoadingAI(true);
    try {
      // 1. Get Explanation and Sentence
      const textResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `你是一个儿童英语老师。请为单词 "${word.english}" (中文: ${word.chinese}) 提供一个简单的英文解释（适合小学生）和一个例句。
        请以JSON格式返回，格式如下：
        {
          "explanation": "简单易懂的英文解释",
          "sentence": "包含该单词的有趣例句"
        }`,
        config: { responseMimeType: "application/json" }
      });

      const data = JSON.parse(textResponse.text || '{}');

      // 2. Generate Image
      const imageResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: `A cute, colorful, cartoon-style illustration for children representing the word "${word.english}". Boy-friendly, vibrant colors, high quality.` }]
        },
        config: {
          imageConfig: { aspectRatio: "1:1" }
        }
      });

      let imageUrl = '';
      for (const part of imageResponse.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      setWords(prev => prev.map(w => 
        w.id === word.id 
          ? { ...w, explanation: data.explanation, sentence: data.sentence, imageUrl } 
          : w
      ));
    } catch (error) {
      console.error("AI Enrichment failed:", error);
    } finally {
      setLoadingAI(false);
    }
  }

  const handleKnow = () => {
    const now = Date.now();
    const updatedWords = words.map(w => {
      if (w.id === currentWord.id) {
        const nextLevel = w.reviewLevel + 1;
        let nextReviewAt: number | undefined;
        let isMastered = false;

        // Spaced Repetition Intervals
        // Level 1: 3h, Level 2: 1d, Level 3: 3d, Level 4: 7d, Level 5: Mastered
        switch (nextLevel) {
          case 1: nextReviewAt = now + 3 * 60 * 60 * 1000; break;
          case 2: nextReviewAt = now + 24 * 60 * 60 * 1000; break;
          case 3: nextReviewAt = now + 3 * 24 * 60 * 60 * 1000; break;
          case 4: nextReviewAt = now + 7 * 24 * 60 * 60 * 1000; break;
          default: isMastered = true; break;
        }

        return { ...w, reviewLevel: nextLevel, nextReviewAt, isMastered };
      }
      return w;
    });
    setWords(updatedWords);
    setShowDetail(false);
    if (currentIndex >= activeWords.length - 1) {
      setCurrentIndex(0);
    }
  };

  const handleForget = () => {
    const now = Date.now();
    const updatedWords = words.map(w => {
      if (w.id === currentWord.id) {
        // If forgotten, reset level to 1 and set review for 3 hours later
        return { 
          ...w, 
          reviewLevel: 1, 
          nextReviewAt: now + 3 * 60 * 60 * 1000,
          isMastered: false 
        };
      }
      return w;
    });
    setWords(updatedWords);
    setCurrentIndex((prev) => (activeWords.length > 1 ? (prev + 1) % activeWords.length : 0));
    setShowDetail(false);
  };

  const playPronunciation = async (text: string) => {
    if (playingAudio) return;
    setPlayingAudio(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Pronounce the word: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Puck' }, // Puck is a good clear voice
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // The audio returned by Gemini TTS is typically raw PCM 16-bit mono 24kHz
        // We need to wrap it or play it via AudioContext
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const audioBuffer = audioContext.createBuffer(1, len / 2, 24000);
        const channelData = audioBuffer.getChannelData(0);
        
        const view = new DataView(bytes.buffer);
        for (let i = 0; i < len / 2; i++) {
          // Read as 16-bit signed integer (little endian)
          const sample = view.getInt16(i * 2, true);
          // Normalize to [-1, 1]
          channelData[i] = sample / 32768;
        }

        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.onended = () => setPlayingAudio(false);
        source.start();
      } else {
        setPlayingAudio(false);
      }
    } catch (error) {
      console.error("TTS failed:", error);
      setPlayingAudio(false);
      
      // Fallback to browser SpeechSynthesis if Gemini TTS fails
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.onend = () => setPlayingAudio(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  const handleAddWord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWord.english || !newWord.chinese) return;

    const word: Word = {
      id: Date.now().toString(),
      english: newWord.english,
      chinese: newWord.chinese,
      isMastered: false,
      reviewLevel: 0
    };

    setWords(prev => [...prev, word]);
    setNewWord({ english: '', chinese: '' });
    setIsAdding(false);
  };

  const resetProgress = () => {
    setWords(words.map(w => ({ ...w, isMastered: false, reviewLevel: 0, nextReviewAt: undefined })));
    setCurrentIndex(0);
  };

  if (remainingCount === 0 && words.length > 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <motion.div 
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="bg-space-blue p-10 rounded-3xl border-4 border-space-accent card-shadow"
        >
          <Trophy className="w-24 h-24 text-space-gold mx-auto mb-6" />
          <h1 className="text-4xl font-display text-space-accent mb-4">恭喜，通关！</h1>
          <p className="text-xl mb-8">你已经掌握了所有的单词，太棒了，小探险家！</p>
          <button 
            onClick={resetProgress}
            className="bg-space-accent hover:bg-sky-400 text-space-dark font-bold py-3 px-8 rounded-full flex items-center gap-2 mx-auto transition-all"
          >
            <RotateCcw size={20} />
            再来一次
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col p-4">
      {/* Header */}
      <header className="flex flex-col gap-4 mb-8 pt-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="bg-space-accent p-2 rounded-lg">
              <Rocket className="text-space-dark" size={24} />
            </div>
            <div>
              <h1 className="font-display text-xl text-space-accent leading-none">单词大冒险</h1>
              <p className="text-xs text-gray-400">探索星际词汇</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="bg-space-blue px-4 py-2 rounded-full border border-space-accent/30 flex items-center gap-2">
              <Star className="text-space-gold fill-space-gold" size={16} />
              <span className="text-sm font-bold">掌握: {masteredCount}</span>
            </div>
          </div>
        </div>

        {/* Mode Selector */}
        <div className="bg-space-blue/50 p-1 rounded-2xl flex border border-white/5">
          <button 
            onClick={() => { setMode('learn'); setCurrentIndex(0); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold transition-all ${mode === 'learn' ? 'bg-space-accent text-space-dark shadow-lg' : 'text-gray-400 hover:text-white'}`}
          >
            <BookOpen size={16} />
            新词学习 ({remainingCount})
          </button>
          <button 
            onClick={() => { setMode('review'); setCurrentIndex(0); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold transition-all ${mode === 'review' ? 'bg-space-gold text-space-dark shadow-lg' : 'text-gray-400 hover:text-white'}`}
          >
            <History size={16} />
            复习模式 ({reviewDueCount})
          </button>
        </div>
      </header>

      {/* Main Card Area */}
      <main className="flex-1 flex flex-col items-center justify-center relative">
        <AnimatePresence mode="wait">
          {currentWord ? (
            <motion.div
              key={currentWord.id}
              initial={{ x: 300, opacity: 0, rotate: 5 }}
              animate={{ x: 0, opacity: 1, rotate: 0 }}
              exit={{ x: -300, opacity: 0, rotate: -5 }}
              transition={{ type: 'spring', damping: 20, stiffness: 100 }}
              className="w-full aspect-[3/4] bg-space-blue rounded-[2rem] border-4 border-space-accent/50 p-8 flex flex-col items-center justify-between card-shadow relative overflow-hidden"
            >
              {/* Decorative Stars */}
              <div className="absolute top-4 left-4 opacity-20"><Sparkles size={20} /></div>
              <div className="absolute bottom-4 right-4 opacity-20"><Sparkles size={20} /></div>

              {/* Word Image */}
              <div className="w-full aspect-square rounded-2xl bg-space-dark/50 flex items-center justify-center overflow-hidden border border-space-accent/20">
                {loadingAI ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="animate-spin text-space-accent" size={40} />
                    <p className="text-xs text-space-accent/60">AI 正在绘制插图...</p>
                  </div>
                ) : currentWord.imageUrl ? (
                  <img 
                    src={currentWord.imageUrl} 
                    alt={currentWord.english} 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <Rocket className="w-20 h-20 text-space-accent/20" />
                )}
              </div>

              {/* English Word */}
              <div className="text-center mt-4 flex flex-col items-center">
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-5xl font-bold tracking-tight text-white">
                    {currentWord.english}
                  </h2>
                  <button 
                    onClick={() => playPronunciation(currentWord.english)}
                    disabled={playingAudio}
                    className={`p-2 rounded-full bg-space-accent/10 hover:bg-space-accent/20 text-space-accent transition-all ${playingAudio ? 'animate-pulse' : ''}`}
                    title="播放发音"
                  >
                    <Volume2 size={24} />
                  </button>
                </div>
                <div className="h-1 w-12 bg-space-accent rounded-full" />
              </div>

              {/* Chinese & Detail */}
              <div className="w-full mt-4 min-h-[120px] flex flex-col items-center justify-center">
                {!showDetail ? (
                  <button 
                    onClick={() => setShowDetail(true)}
                    className="group flex flex-col items-center gap-2 text-space-accent/60 hover:text-space-accent transition-colors"
                  >
                    <Eye size={24} />
                    <span className="text-sm font-medium">点击查看释义</span>
                  </button>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center w-full"
                  >
                    <p className="text-2xl font-bold text-space-gold mb-2">{currentWord.chinese}</p>
                    {currentWord.explanation && (
                      <p className="text-sm text-gray-300 italic mb-1 px-4 leading-tight">
                        "{currentWord.explanation}"
                      </p>
                    )}
                    {currentWord.sentence && (
                      <p className="text-xs text-space-accent/80 px-4 leading-tight">
                        {currentWord.sentence}
                      </p>
                    )}
                  </motion.div>
                )}
              </div>
            </motion.div>
          ) : (
             <div className="text-center p-8 bg-space-blue/30 rounded-3xl border-2 border-dashed border-white/10">
                {mode === 'review' ? (
                  <>
                    <Calendar className="w-16 h-16 text-space-gold/40 mx-auto mb-4" />
                    <h3 className="text-xl font-display text-space-gold mb-2">暂时没有需要复习的单词</h3>
                    <p className="text-sm text-gray-400">太棒了！你已经完成了目前所有的复习任务。等过一段时间再来看看吧。</p>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-16 h-16 text-space-accent/40 mx-auto mb-4" />
                    <h3 className="text-xl font-display text-space-accent mb-2">新词已全部学完</h3>
                    <p className="text-sm text-gray-400">所有的单词都已经进入了复习计划。你可以去“复习模式”巩固一下。</p>
                  </>
                )}
             </div>
          )}
        </AnimatePresence>
      </main>

      {/* Action Buttons */}
      <footer className="mt-8 grid grid-cols-2 gap-4 pb-8">
        <button 
          onClick={handleForget}
          className="bg-white/5 hover:bg-white/10 border-2 border-white/10 py-4 rounded-2xl flex flex-col items-center gap-1 transition-all active:scale-95"
        >
          <XCircle className="text-rose-400" size={28} />
          <span className="text-sm font-bold">不认识 / 忘记</span>
        </button>
        <button 
          onClick={handleKnow}
          className="bg-space-accent hover:bg-sky-400 py-4 rounded-2xl flex flex-col items-center gap-1 transition-all active:scale-95 shadow-lg shadow-space-accent/20"
        >
          <CheckCircle2 className="text-space-dark" size={28} />
          <span className="text-sm font-bold text-space-dark">认识 / 简单</span>
        </button>
      </footer>

      {/* Add Word Button */}
      <button 
        onClick={() => setIsAdding(true)}
        className="fixed bottom-6 right-6 bg-space-gold hover:bg-amber-400 text-space-dark p-4 rounded-full shadow-xl transition-transform hover:scale-110 active:scale-90 z-20"
      >
        <Plus size={24} />
      </button>

      {/* Add Word Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdding(false)}
              className="absolute inset-0 bg-space-dark/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-sm bg-space-blue border-2 border-space-accent p-8 rounded-3xl shadow-2xl"
            >
              <h3 className="text-2xl font-display text-space-accent mb-6">添加新单词</h3>
              <form onSubmit={handleAddWord} className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1 ml-1">英文单词</label>
                  <input 
                    autoFocus
                    type="text" 
                    value={newWord.english}
                    onChange={e => setNewWord({...newWord, english: e.target.value})}
                    className="w-full bg-space-dark border border-white/10 rounded-xl px-4 py-3 focus:border-space-accent outline-none transition-colors"
                    placeholder="例如: Galaxy"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1 ml-1">中文释义</label>
                  <input 
                    type="text" 
                    value={newWord.chinese}
                    onChange={e => setNewWord({...newWord, chinese: e.target.value})}
                    className="w-full bg-space-dark border border-white/10 rounded-xl px-4 py-3 focus:border-space-accent outline-none transition-colors"
                    placeholder="例如: 星系"
                  />
                </div>
                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="flex-1 py-3 rounded-xl border border-white/10 hover:bg-white/5 transition-colors"
                  >
                    取消
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-3 rounded-xl bg-space-accent text-space-dark font-bold hover:bg-sky-400 transition-colors"
                  >
                    添加
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
