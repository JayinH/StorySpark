/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  Sparkles, 
  Wand2, 
  FileText, 
  Download, 
  ChevronRight, 
  AlertCircle, 
  Loader2,
  BookOpen,
  PenTool,
  RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { jsPDF } from 'jspdf';

// --- Types ---

type AppMode = 'generate' | 'improve';

interface GenerateInputs {
  character: string;
  setting: string;
  conflict: string;
  genre: string;
  tone: string;
  readingLevel: string;
  tense: string;
  plotPoints: string;
  targetWordCount: string;
}

interface ImproveInputs {
  storyIdea: string;
  improvements: string;
}

interface AIResponse {
  type: 'success' | 'refusal';
  content: string;
}

// --- Constants ---

const READING_LEVELS = ['Beginner (Ages 6-8)', 'Intermediate (Ages 9-12)', 'Young Adult (Ages 13+)', 'Adult'];
const TENSES = ['Past Tense', 'Present Tense'];

const SYSTEM_INSTRUCTION = `You are StorySpark, a creative writing assistant for students and beginner writers. Your tone is simple, clear, creative, and beginner-friendly.
Your goal is to help users generate stories or improve story ideas.

RULES:
1. **Generate Story Mode**: Create a complete fictional story with a clear beginning, middle, and end based on structured inputs. Stay close to inputs, maintain the central conflict throughout, and handle word count (between 75 and 2000 words). Do not add unnecessary new story elements unless needed for coherence.
2. **Improve Idea Mode**: Revise or strengthen an existing story or concept based on requested improvements (e.g., stronger conflict, better pacing, more vivid setting). Stay faithful to the core concept. This should feel like revision and enhancement, not brand-new generation.
   - **CRITICAL**: Return exactly ONE improved version of the story or concept.
   - **DO NOT** return a list of editing notes, headings, or brainstorming categories.
   - The output should read like a polished revised piece of writing, unless the user explicitly asks for a feedback format.
3. **Refusals**:
   - Unrelated to creative writing -> Respond: "I can only help with story generation or story improvement."
   - Unclear/nonsensical -> Respond: "Could you please provide a clearer story-related prompt? I want to make sure I understand your vision."
   - Inappropriate content -> Respond: "I cannot fulfill this request as it contains inappropriate content."
   - Conflicting inputs -> If the requested constraints (genre, tone, plot outcomes, ending mood, etc.) conflict in a way that would make the story unreliable or tonally incoherent, do not generate the story. Clearly explain that the request contains conflicting constraints and ask the user to revise it. Treat direct contradictions in genre, tone, plot outcomes, or ending mood as reasons to stop and ask for clarification rather than forcing them into one story. Respond with a clear explanation of the conflict.
   - (Generate Story only) Too many plot points for word count -> Respond: "This request is a bit too dense for the chosen length. Could you please increase the word count or reduce the number of plot points?"

OUTPUT FORMAT:
Return a JSON object with:
- "type": "success" or "refusal"
- "content": The story/improvement (in Markdown) or the refusal message.`;

// --- Components ---

export default function App() {
  const [mode, setMode] = useState<AppMode>('generate');
  const [isGenerating, setIsGenerating] = useState(false);
  const [output, setOutput] = useState<AIResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Generate Inputs
  const [genInputs, setGenInputs] = useState<GenerateInputs>({
    character: '',
    setting: '',
    conflict: '',
    genre: '',
    tone: '',
    readingLevel: 'Intermediate (Ages 9-12)',
    tense: 'Past Tense',
    plotPoints: '',
    targetWordCount: ''
  });

  // Improve Inputs
  const [impInputs, setImpInputs] = useState<ImproveInputs>({
    storyIdea: '',
    improvements: ''
  });

  const outputRef = useRef<HTMLDivElement>(null);

  const handleGenerate = async () => {
    setError(null);
    setOutput(null);

    // Validation
    if (mode === 'generate') {
      const count = parseInt(genInputs.targetWordCount);
      if (genInputs.targetWordCount && (isNaN(count) || count < 75 || count > 2000)) {
        setError("Please enter a word count between 75 and 2000.");
        return;
      }
    }

    setIsGenerating(true);

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
    const model = "gemini-3-flash-preview";

    let prompt = "";
    if (mode === 'generate') {
      prompt = `MODE: Generate Story
Inputs:
- Character: ${genInputs.character}
- Setting: ${genInputs.setting}
- Conflict: ${genInputs.conflict}
- Genre: ${genInputs.genre}
- Tone: ${genInputs.tone}
- Reading Level: ${genInputs.readingLevel}
- Tense: ${genInputs.tense}
- Plot Points: ${genInputs.plotPoints}
- Target Word Count: ${genInputs.targetWordCount || '150-1000 words'}`;
    } else {
      prompt = `MODE: Improve Idea
Inputs:
- Current Story/Idea: ${impInputs.storyIdea}
- Desired Improvements: ${impInputs.improvements}

INSTRUCTION: Provide one polished, revised version of the story or concept incorporating the improvements. Do not include notes, headings, or feedback categories.`;
    }

    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING, enum: ['success', 'refusal'] },
              content: { type: Type.STRING }
            },
            required: ['type', 'content']
          }
        }
      });

      const result = JSON.parse(response.text || '{}') as AIResponse;
      setOutput(result);
      
      // Scroll to output
      setTimeout(() => {
        outputRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const exportToPDF = () => {
    if (!output || output.type !== 'success') return;

    const doc = new jsPDF();
    const margin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - (margin * 2);
    
    // Simple PDF formatting (removing markdown symbols for basic export)
    const cleanText = output.content
      .replace(/#{1,6}\s/g, '') // Remove headers
      .replace(/\*\*/g, '')     // Remove bold
      .replace(/\*/g, '')       // Remove italic
      .replace(/\[(.*?)\]\(.*?\)/g, '$1'); // Remove links

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("StorySpark Creation", margin, 25);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    
    const splitText = doc.splitTextToSize(cleanText, contentWidth);
    
    let y = 40;
    const lineHeight = 7;
    
    for (let i = 0; i < splitText.length; i++) {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(splitText[i], margin, y);
      y += lineHeight;
    }
    
    doc.save(`StorySpark_${mode}_${new Date().getTime()}.pdf`);
  };

  const reset = () => {
    setOutput(null);
    setError(null);
    if (mode === 'generate') {
      setGenInputs({
        character: '',
        setting: '',
        conflict: '',
        genre: '',
        tone: '',
        readingLevel: 'Intermediate (Ages 9-12)',
        tense: 'Past Tense',
        plotPoints: '',
        targetWordCount: ''
      });
    } else {
      setImpInputs({
        storyIdea: '',
        improvements: ''
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-[#2D2D2D] font-sans selection:bg-[#F27D26]/20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#FDFCFB]/80 backdrop-blur-md border-b border-[#E4E3E0] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-[#F27D26] rounded-xl flex items-center justify-center text-white shadow-lg shadow-[#F27D26]/20">
              <Sparkles size={24} />
            </div>
            <h1 className="text-2xl font-serif italic font-bold tracking-tight text-[#141414]">StorySpark</h1>
          </div>
          <p className="text-xs uppercase tracking-widest font-semibold text-[#8E9299] hidden sm:block">Creative Writing Assistant</p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        {/* Mode Switcher */}
        <div className="flex justify-center mb-12">
          <div className="bg-[#E4E3E0]/50 p-1.5 rounded-2xl flex gap-1">
            <button
              onClick={() => setMode('generate')}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl transition-all duration-300 ${
                mode === 'generate' 
                  ? 'bg-white text-[#141414] shadow-sm font-semibold' 
                  : 'text-[#8E9299] hover:text-[#141414]'
              }`}
            >
              <Wand2 size={18} />
              <span>Generate Story</span>
            </button>
            <button
              onClick={() => setMode('improve')}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl transition-all duration-300 ${
                mode === 'improve' 
                  ? 'bg-white text-[#141414] shadow-sm font-semibold' 
                  : 'text-[#8E9299] hover:text-[#141414]'
              }`}
            >
              <PenTool size={18} />
              <span>Improve Idea</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Input Panel */}
          <div className="lg:col-span-5 space-y-8">
            <div className="bg-white border border-[#E4E3E0] rounded-3xl p-8 shadow-sm">
              <div className="mb-8">
                <h2 className="text-xl font-serif italic font-bold text-[#141414] mb-2">
                  {mode === 'generate' ? 'Build Your Story' : 'Refine Your Concept'}
                </h2>
                <p className="text-sm text-[#8E9299]">
                  {mode === 'generate' 
                    ? 'Fill in the details below to spark a brand-new adventure.' 
                    : 'Share your draft or idea and tell us how to make it better.'}
                </p>
              </div>

              <AnimatePresence mode="wait">
                {mode === 'generate' ? (
                  <motion.div
                    key="generate-form"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-5"
                  >
                    <div className="space-y-2">
                      <label className="text-[11px] uppercase tracking-wider font-bold text-[#8E9299]">Character</label>
                      <input
                        type="text"
                        placeholder="e.g. A lonely farm girl"
                        className="w-full px-4 py-3 bg-[#FDFCFB] border border-[#E4E3E0] rounded-xl focus:outline-none focus:border-[#F27D26] transition-colors"
                        value={genInputs.character}
                        onChange={(e) => setGenInputs({ ...genInputs, character: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] uppercase tracking-wider font-bold text-[#8E9299]">Setting</label>
                      <input
                        type="text"
                        placeholder="e.g. A drought-stricken village"
                        className="w-full px-4 py-3 bg-[#FDFCFB] border border-[#E4E3E0] rounded-xl focus:outline-none focus:border-[#F27D26] transition-colors"
                        value={genInputs.setting}
                        onChange={(e) => setGenInputs({ ...genInputs, setting: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] uppercase tracking-wider font-bold text-[#8E9299]">Conflict</label>
                      <input
                        type="text"
                        placeholder="e.g. Finding a forbidden spring"
                        className="w-full px-4 py-3 bg-[#FDFCFB] border border-[#E4E3E0] rounded-xl focus:outline-none focus:border-[#F27D26] transition-colors"
                        value={genInputs.conflict}
                        onChange={(e) => setGenInputs({ ...genInputs, conflict: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[11px] uppercase tracking-wider font-bold text-[#8E9299]">Genre</label>
                        <input
                          type="text"
                          placeholder="e.g. Fantasy"
                          className="w-full px-4 py-3 bg-[#FDFCFB] border border-[#E4E3E0] rounded-xl focus:outline-none focus:border-[#F27D26] transition-colors"
                          value={genInputs.genre}
                          onChange={(e) => setGenInputs({ ...genInputs, genre: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] uppercase tracking-wider font-bold text-[#8E9299]">Tone</label>
                        <input
                          type="text"
                          placeholder="e.g. Whimsical"
                          className="w-full px-4 py-3 bg-[#FDFCFB] border border-[#E4E3E0] rounded-xl focus:outline-none focus:border-[#F27D26] transition-colors"
                          value={genInputs.tone}
                          onChange={(e) => setGenInputs({ ...genInputs, tone: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[11px] uppercase tracking-wider font-bold text-[#8E9299]">Reading Level</label>
                        <select
                          className="w-full px-4 py-3 bg-[#FDFCFB] border border-[#E4E3E0] rounded-xl focus:outline-none focus:border-[#F27D26] transition-colors appearance-none"
                          value={genInputs.readingLevel}
                          onChange={(e) => setGenInputs({ ...genInputs, readingLevel: e.target.value })}
                        >
                          {READING_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[11px] uppercase tracking-wider font-bold text-[#8E9299]">Tense</label>
                        <select
                          className="w-full px-4 py-3 bg-[#FDFCFB] border border-[#E4E3E0] rounded-xl focus:outline-none focus:border-[#F27D26] transition-colors appearance-none"
                          value={genInputs.tense}
                          onChange={(e) => setGenInputs({ ...genInputs, tense: e.target.value })}
                        >
                          {TENSES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] uppercase tracking-wider font-bold text-[#8E9299]">Plot Points</label>
                      <textarea
                        placeholder="List key events (one per line)..."
                        rows={3}
                        className="w-full px-4 py-3 bg-[#FDFCFB] border border-[#E4E3E0] rounded-xl focus:outline-none focus:border-[#F27D26] transition-colors resize-none"
                        value={genInputs.plotPoints}
                        onChange={(e) => setGenInputs({ ...genInputs, plotPoints: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] uppercase tracking-wider font-bold text-[#8E9299]">Target Word Count (75 - 2000)</label>
                      <input
                        type="text"
                        placeholder="e.g. 500"
                        className="w-full px-4 py-3 bg-[#FDFCFB] border border-[#E4E3E0] rounded-xl focus:outline-none focus:border-[#F27D26] transition-colors"
                        value={genInputs.targetWordCount}
                        onChange={(e) => setGenInputs({ ...genInputs, targetWordCount: e.target.value })}
                      />
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="improve-form"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-6"
                  >
                    <div className="space-y-2">
                      <label className="text-[11px] uppercase tracking-wider font-bold text-[#8E9299]">Current Story or Idea</label>
                      <textarea
                        placeholder="Paste your story draft or rough idea here..."
                        rows={8}
                        className="w-full px-4 py-3 bg-[#FDFCFB] border border-[#E4E3E0] rounded-xl focus:outline-none focus:border-[#F27D26] transition-colors resize-none"
                        value={impInputs.storyIdea}
                        onChange={(e) => setImpInputs({ ...impInputs, storyIdea: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] uppercase tracking-wider font-bold text-[#8E9299]">Desired Improvements</label>
                      <textarea
                        placeholder="e.g. Stronger conflict, clearer stakes, more vivid setting..."
                        rows={4}
                        className="w-full px-4 py-3 bg-[#FDFCFB] border border-[#E4E3E0] rounded-xl focus:outline-none focus:border-[#F27D26] transition-colors resize-none"
                        value={impInputs.improvements}
                        onChange={(e) => setImpInputs({ ...impInputs, improvements: e.target.value })}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="mt-10 flex gap-3">
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="flex-1 bg-[#141414] text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-[#2D2D2D] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-black/10"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="animate-spin" size={20} />
                      <span>Sparking...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={20} />
                      <span>{mode === 'generate' ? 'Generate Story' : 'Improve Idea'}</span>
                    </>
                  )}
                </button>
                <button
                  onClick={reset}
                  className="p-4 border border-[#E4E3E0] rounded-2xl text-[#8E9299] hover:text-[#141414] hover:bg-[#FDFCFB] transition-all"
                  title="Reset Form"
                >
                  <RotateCcw size={20} />
                </button>
              </div>
            </div>
          </div>

          {/* Output Panel */}
          <div className="lg:col-span-7" ref={outputRef}>
            <div className="sticky top-28 space-y-6">
              <div className="bg-white border border-[#E4E3E0] rounded-3xl min-h-[600px] flex flex-col shadow-sm overflow-hidden">
                {/* Output Header */}
                <div className="px-8 py-4 border-b border-[#E4E3E0] flex items-center justify-between bg-[#FDFCFB]">
                  <div className="flex items-center gap-2">
                    <BookOpen size={18} className="text-[#F27D26]" />
                    <span className="text-[11px] uppercase tracking-widest font-bold text-[#8E9299]">Your Creation</span>
                  </div>
                  <button
                    onClick={exportToPDF}
                    disabled={output?.type !== 'success'}
                    className="flex items-center gap-2 text-xs font-bold text-[#F27D26] hover:text-[#D96A1D] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Download size={14} />
                    <span>Export PDF</span>
                  </button>
                </div>

                {/* Output Content */}
                <div className="flex-1 p-8 md:p-12 overflow-y-auto max-h-[700px]">
                  <AnimatePresence mode="wait">
                    {!output && !isGenerating && !error && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="h-full flex flex-col items-center justify-center text-center space-y-4"
                      >
                        <div className="w-16 h-16 bg-[#FDFCFB] border border-dashed border-[#E4E3E0] rounded-full flex items-center justify-center text-[#E4E3E0]">
                          <FileText size={32} />
                        </div>
                        <div>
                          <p className="text-[#141414] font-serif italic text-lg">Your story will appear here</p>
                          <p className="text-sm text-[#8E9299] max-w-xs mx-auto mt-2">
                            Fill out the form and click the button to start your creative journey.
                          </p>
                        </div>
                      </motion.div>
                    )}

                    {isGenerating && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="h-full flex flex-col items-center justify-center text-center space-y-6"
                      >
                        <div className="relative">
                          <div className="w-20 h-20 border-4 border-[#F27D26]/10 border-t-[#F27D26] rounded-full animate-spin"></div>
                          <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[#F27D26]" size={32} />
                        </div>
                        <div className="space-y-2">
                          <p className="text-[#141414] font-serif italic text-lg animate-pulse">Weaving your tale...</p>
                          <p className="text-xs text-[#8E9299] uppercase tracking-widest font-bold">Gemini is thinking</p>
                        </div>
                      </motion.div>
                    )}

                    {error && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="h-full flex flex-col items-center justify-center text-center space-y-4 p-8 bg-red-50 rounded-2xl"
                      >
                        <AlertCircle className="text-red-500" size={40} />
                        <p className="text-red-800 font-semibold">{error}</p>
                        <button 
                          onClick={handleGenerate}
                          className="text-sm font-bold text-red-600 underline underline-offset-4"
                        >
                          Try again
                        </button>
                      </motion.div>
                    )}

                    {output && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={`prose prose-stone max-w-none ${output.type === 'refusal' ? 'flex flex-col items-center justify-center h-full text-center' : ''}`}
                      >
                        {output.type === 'refusal' ? (
                          <div className="bg-[#FDFCFB] p-8 rounded-3xl border border-dashed border-[#E4E3E0] space-y-4">
                            <AlertCircle className="mx-auto text-[#F27D26]" size={32} />
                            <p className="text-[#141414] font-medium leading-relaxed italic">
                              {output.content}
                            </p>
                          </div>
                        ) : (
                          <div className="markdown-body">
                            <ReactMarkdown>{output.content}</ReactMarkdown>
                            <div className="mt-12 pt-8 border-t border-[#E4E3E0] flex justify-center">
                              <button
                                onClick={exportToPDF}
                                className="flex items-center gap-3 bg-[#FDFCFB] border border-[#E4E3E0] px-8 py-4 rounded-2xl font-bold text-[#141414] hover:bg-white hover:border-[#F27D26] hover:text-[#F27D26] transition-all shadow-sm group"
                              >
                                <Download size={20} className="group-hover:translate-y-0.5 transition-transform" />
                                <span>Download as PDF</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Tips Section */}
              <div className="bg-[#141414] text-white p-6 rounded-3xl flex items-start gap-4 shadow-xl shadow-black/10">
                <div className="bg-white/10 p-2 rounded-lg">
                  <Wand2 size={20} className="text-[#F27D26]" />
                </div>
                <div>
                  <h4 className="text-sm font-bold mb-1">Writer's Tip</h4>
                  <p className="text-xs text-white/60 leading-relaxed">
                    {mode === 'generate' 
                      ? "The more specific your character and conflict, the more unique your story will be. Try adding a small quirk to your protagonist!" 
                      : "When asking for improvements, focus on one or two areas at a time for the most impactful revisions."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="max-w-5xl mx-auto px-6 py-12 border-t border-[#E4E3E0] mt-12 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2 opacity-50">
          <Sparkles size={16} />
          <span className="text-sm font-serif italic font-bold">StorySpark</span>
        </div>
        <p className="text-xs text-[#8E9299]">© 2026 StorySpark. Built for the next generation of storytellers.</p>
        <div className="flex gap-6">
          <a href="#" className="text-xs font-bold text-[#8E9299] hover:text-[#141414] transition-colors uppercase tracking-widest">Privacy</a>
          <a href="#" className="text-xs font-bold text-[#8E9299] hover:text-[#141414] transition-colors uppercase tracking-widest">Terms</a>
        </div>
      </footer>

      {/* Custom Scrollbar Styles */}
      <style>{`
        .markdown-body h1 { font-family: 'Georgia', serif; font-style: italic; font-size: 2.25rem; margin-bottom: 1.5rem; color: #141414; }
        .markdown-body h2 { font-family: 'Georgia', serif; font-style: italic; font-size: 1.5rem; margin-top: 2rem; margin-bottom: 1rem; color: #141414; }
        .markdown-body p { line-height: 1.8; margin-bottom: 1.25rem; color: #4A4A4A; font-size: 1.05rem; }
        .markdown-body strong { color: #141414; }
        
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #E4E3E0; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: #8E9299; }
      `}</style>
    </div>
  );
}
