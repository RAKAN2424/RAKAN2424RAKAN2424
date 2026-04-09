import React, { useState, useEffect, useRef } from 'react';
import { 
  Mic, MicOff, Copy, Trash2, Music, Sparkles, 
  RefreshCw, Check, AlertCircle, PlaySquare, Info, 
  Feather, Volume2, Search, BookOpen,
  Download, Save, FolderOpen, X, Headphones,
  Upload, FileAudio, Settings
} from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import { useVirtualizer } from '@tanstack/react-virtual';

const appId = typeof (window as any).__app_id !== 'undefined' ? (window as any).__app_id : 'egyptian-studio-pro';

const App = () => {
  const [inputText, setInputText] = useState('');
  const [outputResult, setOutputResult] = useState('');
  const [outputType, setOutputType] = useState(''); 
  
  const [searchWord, setSearchWord] = useState('');
  const [wordSuggestions, setWordSuggestions] = useState<any>(null); 
  const [isSearchingWord, setIsSearchingWord] = useState(false);

  const [rhymeSearchWord, setRhymeSearchWord] = useState('');
  const [rhymeResults, setRhymeResults] = useState<string[] | null>(null);
  const [isSearchingRhyme, setIsSearchingRhyme] = useState(false);

  const [lineToReplace, setLineToReplace] = useState('');
  const [replacementLine, setReplacementLine] = useState('');
  const [isReplacingLine, setIsReplacingLine] = useState(false);

  const [isListening, setIsListening] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState(false);
  const [genre, setGenre] = useState('rap_egy'); 
  
  const recognitionRef = useRef<any>(null);

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [spellCheckSuggestions, setSpellCheckSuggestions] = useState<string[] | null>(null);
  const [customPronunciationRules, setCustomPronunciationRules] = useState('');
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'ar-EG'; 

      recognitionRef.current.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
        }
        if (finalTranscript) {
          setInputText(prev => prev + (prev ? ' ' : '') + finalTranscript);
        }
      };
      recognitionRef.current.onerror = (e: any) => {
        console.error("Mic error:", e.error);
        setIsListening(false);
      };
      recognitionRef.current.onend = () => setIsListening(false);
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setError(null);
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (e) {
        setError("عفواً، الميكروفون غير مدعوم أو يحتاج لإذن في هذا المتصفح.");
      }
    }
  };

  const speakText = (textToSpeak: string) => {
    if (!window.speechSynthesis) {
      setError("متصفحك لا يدعم خاصية النطق الصوتي.");
      return;
    }
    window.speechSynthesis.cancel();
    
    let cleanText = textToSpeak.replace(/\[.*?\]/g, '').trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'ar-EG'; 
    
    const voices = window.speechSynthesis.getVoices();
    const arabicVoice = voices.find(v => v.lang.includes('ar-EG')) || voices.find(v => v.lang.includes('ar'));
    if (arabicVoice) {
      utterance.voice = arabicVoice;
    }

    utterance.rate = 0.85; 
    
    window.speechSynthesis.speak(utterance);
  };

  const speakSelectedText = () => {
    const selectedText = window.getSelection()?.toString();
    if (selectedText && selectedText.trim() !== '') {
      speakText(selectedText);
    } else {
      setError("يرجى تحديد جزء من النص أولاً لنطقه.");
      setTimeout(() => setError(null), 3000);
    }
  };

  const callAI = async (promptText: string, systemInstruction: string, useSearch = false, expectJson = false, audioData?: { data: string, mimeType: string }) => {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    let retries = 0;
    const maxRetries = 5;

    const config: any = {
      systemInstruction: systemInstruction,
    };

    if (useSearch) {
      config.tools = [{ googleSearch: {} }];
    }
    
    if (expectJson) {
      config.responseMimeType = "application/json";
    }

    const contents: any = audioData 
      ? [
          { inlineData: { data: audioData.data, mimeType: audioData.mimeType } },
          promptText
        ]
      : promptText;

    while (retries < maxRetries) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: contents,
          config: config
        });

        if (response.text) return response.text.trim();
      } catch (e) {
        retries++;
        if (retries < maxRetries) await new Promise(r => setTimeout(r, Math.pow(2, retries) * 1000));
      }
    }
    throw new Error("فشل الاتصال بالخادم.");
  };

  const handleGenerateSong = async () => {
    if (!inputText.trim()) return;
    setIsLoading(true); setError(null); setOutputResult(''); setOutputType('song');
    setSpellCheckSuggestions(null);

    const rulesAddon = customPronunciationRules.trim() ? `\n[Custom Pronunciation Rules: ${customPronunciationRules}]` : '';

    const metaTags = `
[Style: Egyptian Urban, Street Flow, Non-Classical]
[Vocal Delivery: Pure Egyptian Slang, Casual Rhythm]
[Pronunciation: Ignore Fusha rules strictly. Read diacritics as beat markers for Egyptian street accent]
${rulesAddon}
    `.trim();

    const genreInstructions: Record<string, string> = {
      rap_egy: "راب/تراب مصري. كلمات قوية، قوافي حادة سريعة.",
      pop_egy: "بوب مصري شبابي. قوافي ناعمة، مشاعر واضحة جذابة.",
      shaabi: "مهرجانات شعبي. طاقة متفجرة، كلمات شعبية للشارع.",
      khaliji: "خليجي. إيقاع خليجي أصيل، كلمات فخمة ومعبرة.",
      romantic: "رومانسي هادئ. مشاعر عميقة، كلمات رقيقة ومؤثرة."
    };

    const sysPrompt = `أنت كاتب أغاني محترف للذكاء الاصطناعي.
    1. الأسلوب: ${genreInstructions[genre]}
    2. استخدم العامية المصرية حصراً مع التشكيل الإيقاعي الدقيق (سكون، شدة، إلخ).
    3. **قواعد نطق إجبارية:**
       - ضع علامة السكون (ْ) على الحرف الأخير من كل كلمة بلا استثناء.
       - اترك حرف الجيم (ج) كما هو دون تغيير.
       - استبدل حرف القاف (ق) بحرف الهمزة (ء) أو الألف (أ) ليعكس النطق القاهري (مثل: "قول" تصبح "أول" أو "ءول").
    4. المستخدم سيعطيك كلمات خام أو أفكار. مهمتك أن تحولها وتؤلف منها أغنية متكاملة واحترافية جداً.
    5. **قانون صارم (لا تخالفه أبداً):** يجب أن تخرج الأغنية *حصرياً* بهذا الترتيب والتقسيم المسبق. لا تضف أي فواصل أخرى، استبدل القوسين (اكتب الكلمات هنا) بكلمات الأغنية الاحترافية:

${metaTags}

[Intro]
(اكتب الكلمات هنا)

[Verse 1]
(اكتب الكلمات هنا)

[Chorus]
(اكتب الكلمات هنا - اجعله يعلق في الذهن)

[Verse 2]
(اكتب الكلمات هنا)

[Chorus]
(اكتب الكلمات هنا)

[Outro]
(اكتب الكلمات هنا)
    
    أخرج النص فقط بدون أي تعليقات خارجية أو مقدمات.`;

    try {
      const result = await callAI(`قم بترتيب وتأليف الأغنية باحترافية بناءً على: "${inputText}"`, sysPrompt);
      setOutputResult(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTashkeelOnly = async () => {
    if (!inputText.trim()) return;
    setIsLoading(true); setError(null); setOutputResult(''); setOutputType('tashkeel');
    setSpellCheckSuggestions(null);

    const rulesAddon = customPronunciationRules.trim() ? `\nقواعد نطق مخصصة من المستخدم يجب الالتزام بها:\n${customPronunciationRules}` : '';

    const sysPrompt = `أنت خبير لغوي متخصص في الفونوتيكا (علم الأصوات) للهجة المصرية. 
    مهمتك: وضع التشكيل (الحركات) الكامل على النص ليعكس النطق العامي المصري الحقيقي بدقة احترافية. 
    **قواعد إجبارية:**
    1. ضع علامة السكون (ْ) على الحرف الأخير من كل كلمة بلا استثناء.
    2. اترك حرف الجيم (ج) كما هو مكتوباً.
    3. استبدل حرف القاف (ق) بحرف الهمزة (ء) أو الألف (أ) (مثال: "قمر" تصبح "أمر" أو "ءمر").
    4. إدغام الحروف والوصل بين الكلمات كما ينطقها المصريون في الشارع.
    ${rulesAddon}
    لا تغير الكلمات (باستثناء القاف)، فقط شكلها لتنطق مصرية 100%. أخرج النص المشكل فقط.`;

    try {
      const result = await callAI(`شكّل هذا النص بالعامية المصرية بدقة صوتية: "${inputText}"`, sysPrompt);
      setOutputResult(result);
      speakText(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSpellCheckAndSpeak = async () => {
    if (!inputText.trim()) return;
    setIsLoading(true); setError(null); setOutputResult(''); setOutputType('spellcheck');
    setSpellCheckSuggestions(null);

    const rulesAddon = customPronunciationRules.trim() ? `\nقواعد نطق مخصصة من المستخدم يجب الالتزام بها:\n${customPronunciationRules}` : '';

    const sysPrompt = `أنت المصحح اللغوي الأول والخبير الصوتي للعامية المصرية.
    قم بتصحيح الأخطاء الإملائية في النص المدخل مع الحفاظ الكامل على روح العامية (لا تحولها للفصحى). 
    ضع تشكيلاً كاملاً ودقيقاً يوجه القارئ (أو محرك النطق) لنطق النص بلهجة مصرية أصلية وصحيحة (phonetic diacritics).
    **قواعد إجبارية للتشكيل والكتابة:**
    1. ضع علامة السكون (ْ) على الحرف الأخير من كل كلمة بلا استثناء.
    2. اترك حرف الجيم (ج) كما هو.
    3. استبدل حرف القاف (ق) بحرف الهمزة (ء) أو الألف (أ) (مثال: "قمر" تصبح "أمر").
    كما يرجى تقديم اقتراحات لإعادة صياغة الجمل أو تحسين التدفق العام وهيكلة النص.
    ${rulesAddon}
    أخرج النتيجة بصيغة JSON فقط كالتالي:
    {
      "correctedText": "النص المصحح والمشكل بالكامل",
      "suggestions": ["اقتراح 1", "اقتراح 2"]
    }`;

    try {
      const result = await callAI(`صحح هذا النص إملائياً وشكله للعامية، وقدم اقتراحات للتحسين: "${inputText}"`, sysPrompt, false, true);
      const parsedData = JSON.parse(result);
      setOutputResult(parsedData.correctedText);
      setSpellCheckSuggestions(parsedData.suggestions);
      speakText(parsedData.correctedText); 
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const highlightDiacritics = (word: string) => {
    if (!word) return null;
    const diacriticsRegex = /([\u064B-\u0652\u0670])/g;
    const parts = word.split(diacriticsRegex);
    return (
      <>
        {parts.map((part, i) => {
          if (part.match(diacriticsRegex)) {
            return <span key={i} className="text-emerald-400">{part}</span>;
          }
          return <span key={i}>{part}</span>;
        })}
      </>
    );
  };

  const handleWordSearch = async () => {
    if (!searchWord.trim()) return;
    setIsSearchingWord(true); setWordSuggestions(null);

    const sysPrompt = `أنت خبير لغوي في العامية المصرية واللغة العربية الفصحى.
    المستخدم سيعطيك كلمة.
    مهمتك: أعطني كل احتمالات التشكيل (الحركات) المختلفة لهذه الكلمة.
    **ركز أولاً وبشكل أساسي على معانيها ونطقها في العامية المصرية أو الدارجة**، ثم اذكر معانيها ونطقها في الفصحى إذا كان لها استخدام مختلف.
    أخرج النتيجة بصيغة JSON فقط مصفوفة كالتالي:
    [
      {"word": "الكلمة_بالتشكيل", "meaning": "معنى هذا التشكيل (مصري أو فصحى) ومتى يستخدم باختصار"}
    ]`;

    try {
      const result = await callAI(`هات كل احتمالات التشكيل للكلمة دي: "${searchWord}"`, sysPrompt, false, true);
      const parsedData = JSON.parse(result);
      setWordSuggestions(parsedData);
    } catch (err: any) {
      setWordSuggestions([{ word: "خطأ", meaning: "حدث خطأ أثناء جلب التشكيلات، حاول مجدداً." }]);
    } finally {
      setIsSearchingWord(false);
    }
  };

  const handleRhymeSearch = async () => {
    if (!rhymeSearchWord.trim()) return;
    setIsSearchingRhyme(true); setRhymeResults(null);

    const sysPrompt = `أنت شاعر وخبير في العامية المصرية.
    المستخدم سيعطيك كلمة.
    مهمتك: أعطني قائمة بكلمات لها نفس القافية (النهاية الصوتية) ونفس الوزن (الإيقاع العروضي/الموسيقي) في العامية المصرية.
    أخرج النتيجة بصيغة JSON فقط مصفوفة كالتالي:
    ["كلمة1", "كلمة2", "كلمة3"]`;

    try {
      const result = await callAI(`هات كلمات على نفس قافية ووزن: "${rhymeSearchWord}"`, sysPrompt, false, true);
      const parsedData = JSON.parse(result);
      setRhymeResults(parsedData);
    } catch (err: any) {
      setRhymeResults(["خطأ في جلب القوافي"]);
    } finally {
      setIsSearchingRhyme(false);
    }
  };

  const handleLineReplacement = async () => {
    if (!lineToReplace.trim()) return;
    setIsReplacingLine(true); setReplacementLine('');

    const sysPrompt = `أنت شاعر غنائي محترف بالعامية المصرية.
    المستخدم سيعطيك شطر (سطر) من أغنية.
    مهمتك: استبدال هذا الشطر بشطر آخر يحمل نفس المعنى تقريباً ولكن بقافية مختلفة ووزن مختلف، ليكون مناسباً لأغنية.
    أخرج الشطر الجديد فقط بدون أي إضافات.`;

    try {
      const result = await callAI(`استبدل هذا الشطر بقافية ووزن مختلفين: "${lineToReplace}"`, sysPrompt);
      setReplacementLine(result);
    } catch (err: any) {
      setReplacementLine("خطأ في استبدال الشطر");
    } finally {
      setIsReplacingLine(false);
    }
  };

  const handleGenerateMusicPrompt = async () => {
    if (!inputText.trim()) return;
    setIsLoading(true); setError(null); setOutputResult(''); setOutputType('music_prompt');
    setSpellCheckSuggestions(null);

    const sysPrompt = `أنت خبير في هندسة البرومبتات (Prompt Engineering) لأدوات توليد الموسيقى بالذكاء الاصطناعي مثل Suno AI و Udio.
    مهمتك: تحويل فكرة المستخدم أو نوع الموسيقى الذي يختاره إلى برومبت احترافي جداً باللغة الإنجليزية (لأن هذه الأدوات تفهم الإنجليزية بشكل أفضل في وصف الأنماط).
    
    إذا طلب المستخدم "شعبي" أو "مهرجانات"، استخدم كلمات مفتاحية مثل:
    - Egyptian Mahraganat, Street Electro, Auto-tuned vocals, Heavy Darbuka beats, Synthesizer leads, High energy, Cairo street vibe, 140-150 BPM.
    - Egyptian Shaabi, Traditional instruments (Accordion, Kawala), Wedding vibe, Rhythmic, Soulful street singing.
    
    يجب أن يتضمن البرومبت:
    1. [Style]: وصف دقيق للنمط الموسيقي.
    2. [Instruments]: الآلات المستخدمة.
    3. [Mood/Atmosphere]: الحالة المزاجية.
    4. [BPM/Tempo]: السرعة.
    
    أخرج النتيجة كبرومبت جاهز للنسخ واللصق في Suno/Udio. أضف شرحاً بسيطاً بالعربية لما يفعله هذا البرومبت.`;

    try {
      const result = await callAI(`اكتب برومبت موسيقي احترافي لـ Suno بناءً على: "${inputText}" ونوع "${genre}"`, sysPrompt);
      setOutputResult(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setAudioFile(e.target.files[0]);
    }
  };

  const processAudio = async (mode: 'general' | 'egyptian' | 'analyze_music') => {
    if (!audioFile) return;
    setIsLoading(true); setError(null); setOutputResult(''); 
    setOutputType(mode === 'analyze_music' ? 'analysis' : 'transcription');
    setSpellCheckSuggestions(null);

    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(audioFile);
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result.split(',')[1]);
          }
        };
        reader.onerror = reject;
      });

      const audioPart = { data: base64Data, mimeType: audioFile.type };

      let sysPrompt = "";
      let promptText = "";

      if (mode === 'egyptian') {
        sysPrompt = `أنت خبير في تفريغ الصوتيات وتشكيلها بالعامية المصرية.
        مهمتك: استمع للملف الصوتي، واكتب الكلام الموجود فيه بدقة إملائية عالية، ثم ضع عليه التشكيل (الحركات) الكامل ليعكس النطق العامي المصري الحقيقي.
        **قواعد إجبارية:**
        1. ضع علامة السكون (ْ) على الحرف الأخير من كل كلمة بلا استثناء.
        2. اترك حرف الجيم (ج) كما هو.
        3. استبدل حرف القاف (ق) بحرف الهمزة (ء) أو الألف (أ).
        أخرج النص المفرغ والمشكل فقط.`;
        promptText = "قم بتفريغ هذا الصوت واكتبه بالعامية المصرية مع التشكيل الدقيق وتطبيق قواعد السكون والهمزة بدلاً من القاف.";
      } else if (mode === 'analyze_music') {
        sysPrompt = `أنت خبير موسيقي ومهندس برومبتات محترف لأدوات الذكاء الاصطناعي مثل Suno AI.
        مهمتك هي الاستماع للملف الصوتي المرفق والقيام بالتالي:
        1. تفريغ كلمات الأغنية أو المقطع الصوتي باحترافية والتعرف على اللغة.
        2. تحليل الموسيقى بدقة (النوع الموسيقي Genre، الآلات Instruments، الحالة المزاجية Vibe).
        3. كتابة برومبت قوي جداً باللغة الإنجليزية مخصص لموقع Suno AI لتوليد أغنية بنفس الروح والنمط الموسيقي.
        
        أخرج النتيجة بتنسيق واضح ومقسم إلى:
        - الكلمات المفرغة (مع ذكر اللغة)
        - التحليل الموسيقي
        - [Suno Prompt: اكتب البرومبت الإنجليزي هنا]`;
        promptText = "قم بتحليل هذا المقطع الصوتي، واكتب كلماته، واستخرج نوع الموسيقى واكتب برومبت Suno.";
      } else {
        sysPrompt = `أنت خبير في تفريغ الصوتيات بجميع اللغات واللهجات.
        مهمتك: استمع للملف الصوتي، تعرف على لغته أو لهجته، واكتب الكلام بدقة إملائية.
        ثم ضع التشكيل المناسب حسب لغة الأغنية أو المقطع الصوتي.
        أخرج النص المفرغ والمشكل فقط.`;
        promptText = "قم بتفريغ هذا الصوت واكتبه مع التشكيل المناسب للغته.";
      }

      const result = await callAI(promptText, sysPrompt, false, false, audioPart);
      setOutputResult(result);
    } catch (err: any) {
      setError(err.message || "حدث خطأ أثناء معالجة الصوت.");
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!outputResult) return;
    const textArea = document.createElement("textarea");
    textArea.value = outputResult;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      setCopyStatus(true);
      setTimeout(() => setCopyStatus(false), 2000);
    } catch (err) {}
    document.body.removeChild(textArea);
  };

  const saveInput = () => {
    localStorage.setItem('rika_saved_input', inputText);
  };

  const loadInput = () => {
    const saved = localStorage.getItem('rika_saved_input');
    if (saved) setInputText(saved);
  };

  const downloadOutput = () => {
    if (!outputResult) return;
    const blob = new Blob([outputResult], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rika_output_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadOutputDocx = async () => {
    if (!outputResult) return;
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: outputResult.split('\n').map(line => new Paragraph({
            children: [
              new TextRun({
                text: line,
                rightToLeft: true,
              })
            ],
          })),
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rika_output_${Date.now()}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const VirtualizedOutput = ({ text, type }: { text: string, type: string }) => {
    const parentRef = useRef<HTMLDivElement>(null);
    const lines = text.split('\n');

    const rowVirtualizer = useVirtualizer({
      count: lines.length,
      getScrollElement: () => parentRef.current,
      estimateSize: () => 40,
    });

    return (
      <div 
        ref={parentRef} 
        className="max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar"
        style={{ contain: 'strict' }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const line = lines[virtualRow.index];
            let content: React.ReactNode = line;
            
            if (type === 'song') {
              if (line.match(/^\[Style:.*\]|^\[Vocal Delivery:.*\]|^\[Pronunciation.*\]/i)) {
                content = <span className="block text-[#00ffcc] font-mono text-xs mt-1 mb-1 bg-[#00ffcc]/10 p-1.5 rounded-md w-fit" dir="ltr">{line}</span>;
              } else if (line.match(/^\[(.*?)\]$/)) {
                content = <span className="block text-indigo-400 font-black mt-6 mb-2 text-sm tracking-widest uppercase bg-indigo-900/30 w-fit px-2 py-1 rounded">{line}</span>;
              } else if (line.trim() === '') {
                content = <br />;
              } else {
                content = <span className="block mb-1 text-slate-100">{line}</span>;
              }
            } else if (type === 'music_prompt' || type === 'analysis') {
              if (line.match(/^\[(.*?)\]/)) {
                content = <span className="block text-amber-400 font-mono text-sm mt-2 mb-1 bg-amber-400/10 p-2 rounded-md border border-amber-400/20" dir="ltr">{line}</span>;
              } else if (line.trim() === '') {
                content = <br />;
              } else {
                content = <span className="block mb-1 text-slate-100">{line}</span>;
              }
            } else {
              if (line.trim() === '') content = <br />;
              else content = <span className="block mb-1 text-slate-100">{line}</span>;
            }

            return (
              <div
                key={virtualRow.index}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {content}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-slate-200 font-sans p-3 md:p-6" dir="rtl">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between bg-[#121217] p-5 rounded-3xl border border-slate-800 shadow-xl gap-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.4)] shrink-0">
                <img 
                  src="https://i.ibb.co/ZRDHCGHz/Untitled-1080-x-1080-px.jpg" 
                  alt="Hafiz Logo" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-end gap-2">
                  <h1 className="text-4xl md:text-6xl font-ruqaa neon-ar leading-none pb-2">
                    حَافِظ
                  </h1>
                  <span className="text-sm md:text-lg font-arabic text-sky-300/80 mb-3 font-light italic">
                    بِالْعَامِّيَّة
                  </span>
                  <img 
                    src="https://i.ibb.co/ZRDHCGHz/Untitled-1080-x-1080-px.jpg" 
                    alt="icon" 
                    className="w-8 h-8 rounded-lg md:hidden mb-2"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="h-0.5 w-16 bg-gradient-to-l from-sky-500 to-transparent rounded-full hidden md:block shadow-[0_0_8px_rgba(56,189,248,0.8)] mb-2"></div>
              </div>
            </div>
            <p className="text-sm md:text-base text-slate-300 font-bold tracking-wide leading-relaxed border-t border-slate-800/50 pt-3">
              المتخصص الأول في التشكيل والنطق المصري الاحترافي
            </p>
          </div>
          
          <div className="flex flex-wrap justify-center bg-[#09090b] rounded-xl p-1 border border-slate-800 w-full md:w-auto mt-2 md:mt-0 gap-1">
             {[
               { id: 'rap_egy', label: 'راب/تراب' },
               { id: 'pop_egy', label: 'بوب' },
               { id: 'shaabi', label: 'مهرجانات' },
               { id: 'khaliji', label: 'خليجي' },
               { id: 'romantic', label: 'رومانسي' }
             ].map(g => (
               <button 
                  key={g.id} 
                  onClick={() => setGenre(g.id)}
                  className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition-all duration-300 ${
                    genre === g.id 
                    ? 'bg-slate-800 text-indigo-400 shadow-md' 
                    : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                 {g.label}
               </button>
             ))}
          </div>
        </header>

        {/* Word Inspector Card */}
        <div className="bg-[#1a1a24] rounded-2xl p-4 border border-indigo-900/50 shadow-lg">
          <div className="flex flex-col md:flex-row gap-3 items-center">
            <div className="flex items-center gap-2 text-indigo-300 w-full md:w-auto font-bold text-sm">
              <Search size={18} />
              <span>مفتش التشكيل:</span>
            </div>
            <div className="flex w-full gap-2 relative">
              <input 
                type="text"
                value={searchWord}
                onChange={(e) => setSearchWord(e.target.value)}
                placeholder="اكتب كلمة واحدة هنا لجلب كل احتمالات تشكيلها ونطقها..."
                className="flex-1 bg-[#09090b] border border-slate-700 rounded-xl px-4 py-2 text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-white"
              />
              <button 
                onClick={handleWordSearch}
                disabled={isSearchingWord || !searchWord.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {isSearchingWord ? <RefreshCw size={16} className="animate-spin" /> : <BookOpen size={16} />}
                هات التشكيلات
              </button>
            </div>
          </div>
          
          {wordSuggestions && Array.isArray(wordSuggestions) && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-2">
              {wordSuggestions.map((item: any, index: number) => (
                <div key={index} className="flex justify-between items-center p-3 bg-[#09090b] rounded-xl border border-slate-800 hover:border-indigo-500/50 transition-colors">
                  <div>
                    <span className="text-xl font-bold text-indigo-400 font-arabic">{highlightDiacritics(item.word)}</span>
                    <p className="text-xs text-slate-400 mt-1">{item.meaning}</p>
                  </div>
                  <button 
                    onClick={() => speakText(item.word)} 
                    className="p-2.5 bg-indigo-900/30 text-indigo-300 rounded-xl hover:bg-indigo-600 hover:text-white transition-colors flex-shrink-0"
                    title="استمع للنطق"
                  >
                    <Volume2 size={20} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rhyme and Poetry Tools Card */}
        <div className="bg-[#1a1a24] rounded-2xl p-4 border border-purple-900/50 shadow-lg">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Rhyme Search */}
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2 text-purple-300 font-bold text-sm">
                <Search size={18} />
                <span>البحث عن قوافي:</span>
              </div>
              <div className="flex w-full gap-2 relative">
                <input 
                  type="text"
                  value={rhymeSearchWord}
                  onChange={(e) => setRhymeSearchWord(e.target.value)}
                  placeholder="اكتب كلمة للبحث عن قوافي لها..."
                  className="flex-1 bg-[#09090b] border border-slate-700 rounded-xl px-4 py-2 text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 text-white"
                />
                <button 
                  onClick={handleRhymeSearch}
                  disabled={isSearchingRhyme || !rhymeSearchWord.trim()}
                  className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {isSearchingRhyme ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  بحث
                </button>
              </div>
              {rhymeResults && (
                <div className="mt-2 p-3 bg-[#09090b] rounded-xl border border-slate-800 flex flex-wrap gap-2">
                  {rhymeResults.map((word, i) => (
                    <span key={i} className="px-2 py-1 bg-purple-900/30 text-purple-300 rounded-lg text-sm">{word}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Line Replacement */}
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2 text-pink-300 font-bold text-sm">
                <RefreshCw size={18} />
                <span>استبدال شطر (تغيير القافية والوزن):</span>
              </div>
              <div className="flex w-full gap-2 relative">
                <input 
                  type="text"
                  value={lineToReplace}
                  onChange={(e) => setLineToReplace(e.target.value)}
                  placeholder="اكتب الشطر المراد استبداله..."
                  className="flex-1 bg-[#09090b] border border-slate-700 rounded-xl px-4 py-2 text-sm focus:ring-1 focus:ring-pink-500 focus:border-pink-500 text-white"
                />
                <button 
                  onClick={handleLineReplacement}
                  disabled={isReplacingLine || !lineToReplace.trim()}
                  className="bg-pink-600 hover:bg-pink-500 text-white px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50 transition-colors flex items-center gap-2 shrink-0"
                >
                  {isReplacingLine ? <RefreshCw size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  استبدل
                </button>
              </div>
              {replacementLine && (
                <div className="mt-2 p-3 bg-[#09090b] rounded-xl border border-slate-800">
                  <span className="text-pink-400 font-bold">{replacementLine}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Input Area */}
        <div className="bg-[#121217] rounded-3xl p-5 md:p-6 border border-slate-800 shadow-xl">
          
          {/* Audio Upload Section */}
          <div className="mb-6 p-4 bg-[#09090b] border border-slate-800 rounded-2xl">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors"
                >
                  <Upload size={18} /> {audioFile ? 'تغيير الملف الصوتي' : 'رفع ملف صوتي (أغنية/مقطع)'}
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleAudioUpload} 
                  accept="audio/*" 
                  className="hidden" 
                />
                {audioFile && (
                  <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                    <Check size={14} /> {audioFile.name}
                  </span>
                )}
              </div>
              
              {audioFile && (
                <div className="flex flex-wrap gap-2 w-full md:w-auto mt-3 md:mt-0">
                  <button 
                    onClick={() => processAudio('general')}
                    disabled={isLoading}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/30 px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
                  >
                    <FileAudio size={18} /> تفريغ (عام)
                  </button>
                  <button 
                    onClick={() => processAudio('egyptian')}
                    disabled={isLoading}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 shadow-lg shadow-indigo-500/20"
                  >
                    <FileAudio size={18} /> تفريغ (مصري)
                  </button>
                  <button 
                    onClick={() => processAudio('analyze_music')}
                    disabled={isLoading}
                    className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 shadow-lg shadow-amber-500/20"
                  >
                    <Music size={18} /> تحليل وبرومبت Suno
                  </button>
                </div>
              )}
            </div>
            {audioFile && (
              <div className="mt-4 w-full">
                <audio controls src={URL.createObjectURL(audioFile)} className="w-full h-10 rounded-lg" />
              </div>
            )}
          </div>

          <div className="flex justify-between items-center mb-3">
            <label className="text-sm font-bold text-slate-400 flex items-center gap-2">
               النص الأساسي (تحدث أو اكتب):
            </label>
            <div className="flex gap-2">
              <button onClick={loadInput} className="text-slate-600 hover:text-indigo-400 transition-colors p-1" title="استرجاع المحفوظ">
                <FolderOpen size={18} />
              </button>
              <button onClick={saveInput} className="text-slate-600 hover:text-emerald-400 transition-colors p-1" title="حفظ النص">
                <Save size={18} />
              </button>
              <button onClick={() => setInputText('')} className="text-slate-600 hover:text-red-400 transition-colors p-1" title="مسح">
                <Trash2 size={18} />
              </button>
            </div>
          </div>

          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="اكتب هنا فكرتك، وسيتم تحويلها وترتيبها لأغنية احترافية بمجرد الضغط على تأليف..."
            className="w-full h-32 bg-[#09090b] border border-slate-800 rounded-2xl p-4 text-lg text-slate-200 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 resize-none font-arabic placeholder:text-slate-700"
          />

          {/* Example Prompts */}
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-xs text-slate-500 py-1 font-bold">أمثلة:</span>
            {[
              { label: 'أغنية: كفاح القاهرة', text: 'قصة شاب بيكافح في زحمة القاهرة وعنده طموح كبير' },
              { label: 'تشكيل: نص عامي', text: 'انا رحت الشغل الصبح بدري وكان الجو برد جدا ومفيش مواصلات' },
              { label: 'تصحيح: أخطاء إملائية', text: 'امبارح روحت السنما وشفت فلم حلو اوي بس الكرسي كان مش مريح' },
              { label: 'برومبت: مهرجان شعبي', text: 'عايز برومبت لمهرجان شعبي مصري قوي فيه طبلة وكهربا' }
            ].map((ex, i) => (
              <button 
                key={i} 
                onClick={() => setInputText(ex.text)}
                className="text-xs bg-slate-800/50 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-full transition-colors border border-slate-700/50"
              >
                {ex.label}
              </button>
            ))}
          </div>

          {/* Advanced Settings Toggle */}
          <div className="mt-4">
            <button 
              onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
              className="text-sm font-bold text-slate-400 hover:text-indigo-400 flex items-center gap-2 transition-colors"
            >
              <Settings size={16} /> إعدادات النطق المتقدمة {showAdvancedSettings ? '(إخفاء)' : '(إظهار)'}
            </button>
            
            {showAdvancedSettings && (
              <div className="mt-3 p-4 bg-[#09090b] border border-slate-700 rounded-xl animate-in fade-in slide-in-from-top-2">
                <label className="block text-xs font-bold text-slate-500 mb-2">
                  قواعد نطق مخصصة (مثال: انطق القاف كهمزة دائماً، لا تنطق حرف الثاء بل تاء...):
                </label>
                <textarea
                  value={customPronunciationRules}
                  onChange={(e) => setCustomPronunciationRules(e.target.value)}
                  placeholder="اكتب قواعدك المخصصة هنا..."
                  className="w-full h-20 bg-[#121217] border border-slate-800 rounded-lg p-3 text-sm text-slate-300 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 resize-none font-arabic"
                />
              </div>
            )}
          </div>

          {/* Action Buttons Grid */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-4">
            <button 
              onClick={toggleListening}
              className={`col-span-1 py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all border ${
                isListening 
                ? 'bg-red-500/20 border-red-500/50 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)] animate-pulse' 
                : 'bg-[#09090b] border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {isListening ? <MicOff size={20} /> : <Mic size={20} />}
              <span className="md:hidden">{isListening ? 'جاري التسجيل...' : 'تحدث بالمايك'}</span>
            </button>

            <button 
              onClick={handleTashkeelOnly}
              disabled={isLoading || !inputText.trim()}
              className="col-span-1 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-lg shadow-indigo-500/20"
            >
              <Feather size={18} /> تشكيل ونطق
            </button>

            <button 
              onClick={handleSpellCheckAndSpeak}
              disabled={isLoading || !inputText.trim()}
              className="col-span-1 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-lg shadow-emerald-500/20"
            >
              <Volume2 size={18} /> تصحيح ونطق
            </button>

            <button 
              onClick={handleGenerateMusicPrompt}
              disabled={isLoading || !inputText.trim()}
              className="col-span-1 py-3.5 bg-amber-600 hover:bg-amber-500 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-lg shadow-amber-500/20"
            >
              <Headphones size={18} /> برومبت Suno
            </button>

            <button 
              onClick={handleGenerateSong}
              disabled={isLoading || !inputText.trim()}
              className="col-span-1 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25 disabled:opacity-50 transition-all"
            >
              <Music size={18} /> تأليف أغنية
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-4 bg-red-900/30 border border-red-500/30 text-red-400 rounded-2xl flex items-center gap-3 animate-in fade-in zoom-in duration-300">
            <AlertCircle size={20} className="shrink-0" />
            <span className="text-sm font-bold">{error}</span>
          </div>
        )}

        {/* Output Area */}
        {(outputResult || isLoading) && (
          <div className="bg-[#121217] rounded-3xl border border-slate-800 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 duration-500">
            
            <div className="bg-[#09090b] p-4 md:px-6 border-b border-slate-800 flex items-center justify-between sticky top-0 z-20">
              <div className="flex items-center gap-2">
                <PlaySquare size={20} className="text-indigo-400" />
                <span className="font-bold text-white">النتيجة النهائية</span>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={speakSelectedText}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition-all"
                  title="انطق النص المحدد"
                >
                  <Volume2 size={18} /> انطق المحدد
                </button>
                {(outputType === 'spellcheck' || outputType === 'tashkeel') && !isLoading && (
                  <button 
                    onClick={() => speakText(outputResult)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-all"
                    title="أعد النطق"
                  >
                    <Volume2 size={18} /> إعد النطق
                  </button>
                )}
                <button 
                  onClick={copyToClipboard}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all duration-300 ${
                    copyStatus 
                    ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' 
                    : 'bg-slate-800 hover:bg-slate-700 text-white'
                  }`}
                >
                  {copyStatus ? <><Check size={18} /> <span className="hidden md:inline">تم النسخ!</span></> : <><Copy size={18} /> <span className="hidden md:inline">نسخ</span></>}
                </button>
                <button 
                  onClick={downloadOutput}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-800 hover:bg-slate-700 text-white transition-all duration-300"
                  title="تحميل كملف نصي (TXT)"
                >
                  <Download size={18} /> <span className="hidden md:inline">TXT</span>
                </button>
                <button 
                  onClick={downloadOutputDocx}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-600/30 transition-all duration-300"
                  title="تحميل كملف وورد (DOCX)"
                >
                  <Download size={18} /> <span className="hidden md:inline">DOCX</span>
                </button>
                <button 
                  onClick={() => setOutputResult('')}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all duration-300"
                  title="إغلاق النتيجة"
                >
                  <X size={18} /> <span className="hidden md:inline">إغلاق</span>
                </button>
              </div>
            </div>
            
            <div className="p-6 md:p-8 bg-gradient-to-b from-[#121217] to-[#0a0a0f]">
              {isLoading ? (
                <div className="space-y-6">
                  <div className="w-40 h-5 bg-slate-800/50 rounded animate-pulse mb-8"></div>
                  <div className="space-y-3">
                    <div className="h-4 bg-slate-800/50 rounded w-3/4 animate-pulse"></div>
                    <div className="h-4 bg-slate-800/50 rounded w-full animate-pulse"></div>
                  </div>
                </div>
              ) : (
                <div className="text-[1.3rem] md:text-[1.5rem] leading-[2.2] text-right font-arabic">
                  <VirtualizedOutput text={outputResult} type={outputType} />
                </div>
              )}
            </div>
            
            {spellCheckSuggestions && spellCheckSuggestions.length > 0 && (
              <div className="p-6 border-t border-slate-800 bg-[#09090b]">
                <h3 className="text-lg font-bold text-emerald-400 mb-4 flex items-center gap-2">
                  <Sparkles size={20} /> اقتراحات التحسين وإعادة الصياغة:
                </h3>
                <ul className="space-y-3">
                  {spellCheckSuggestions.map((suggestion, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-slate-300 bg-[#121217] p-3 rounded-xl border border-slate-800">
                      <span className="text-emerald-500 font-bold mt-1">•</span>
                      <span className="leading-relaxed">{suggestion}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {outputType === 'song' && (
              <div className="p-4 bg-indigo-950/20 border-t border-indigo-900/30 flex items-start gap-3 text-indigo-300/80">
                <Info size={18} className="shrink-0 mt-0.5" />
                <p className="text-xs md:text-sm font-medium leading-relaxed">
                  <strong className="text-indigo-300">ملاحظة:</strong> الأكواد الخضراء في البداية هي أوامر برمجية لضبط النطق. انسخها مع الأغنية في برامج التوليد الصوتي لتحصل على أداء مصري دقيق.
                </p>
              </div>
            )}
          </div>
        )}

      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Aref+Ruqaa:wght@400;700&family=Pacifico&family=Noto+Sans+Arabic:wght@400;700;900&display=swap');
        
        .font-arabic { font-family: 'Noto Sans Arabic', sans-serif; }
        .font-ruqaa { font-family: 'Aref Ruqaa', serif; }
        .font-pacifico { font-family: 'Pacifico', cursive; }
        
        .neon-ar {
          color: #fff;
          text-shadow: 
            0 0 7px #fff,
            0 0 10px #fff,
            0 0 21px #00d4ff,
            0 0 42px #00d4ff,
            0 0 82px #00d4ff,
            0 0 92px #00d4ff,
            0 0 102px #00d4ff;
        }
        
        .neon-en {
          color: #fff;
          text-shadow: 
            0 0 5px #fff, 
            0 0 10px #fff, 
            0 0 20px #00ffff, 
            0 0 40px #00ffff, 
            0 0 80px #00ffff;
        }

        body { font-family: 'Noto Sans Arabic', sans-serif; background-color: #09090b; }
        ::selection { background: #bc13fe; color: white; }
        textarea:focus, input:focus { outline: none; }
      `}} />
    </div>
  );
};

export default App;
