import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Trash2, Settings, Search, Sparkles, Plus, Camera, 
  RotateCcw, Compass, ChefHat, MessageSquare, MapPin, 
  AlertCircle, Check, HelpCircle, Eye, RefreshCw
} from 'lucide-react';
import { GoogleGenerativeAI } from '@google/generative-ai';

// API Key configuration targeting Vite/Vercel environment variables first, then your fallback key
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";

// Global constant verification
const isAiConfigured = !!GEMINI_API_KEY && !GEMINI_API_KEY.includes("YOUR_API_KEY");

// Mock Local Malaysian Recipes database
const LOCAL_RECIPES = [
  {
    id: "ayam-masak-merah",
    name: "Ayam Masak Merah",
    cuisine: "Malay",
    requiredIngredients: ["ayam", "bawang", "cili"],
    steps: [
      "Goreng ayam setengah masak yang telah dilumur kunyit dan garam.",
      "Tumis bawang besar, bawang putih, dan cili giling sehingga pecah minyak.",
      "Masukkan sedikit sos cili, sos tomato, dan gula.",
      "Masukkan ayam yang telah digoreng tadi bersama hirisan bawang besar hiasan. Gaul mesra."
    ],
    time: "25 min"
  },
  {
    id: "daging-rendang",
    name: "Rendang Daging Klasik",
    cuisine: "Malay",
    requiredIngredients: ["daging", "santan", "bawang", "serai"],
    steps: [
      "Kisar halus bawang, serai, halia, dan cili giling.",
      "Masukkan daging, bahan kisar, dan santan ke dalam kuali.",
      "Masak dengan api sederhana sehingga daging empuk dan kuah mula pekat.",
      "Masukkan kerisik, daun kunyit hiasan, dan garam secukup rasa. Kacau sehingga kering."
    ],
    time: "60 min"
  },
  {
    id: "nasi-lemak",
    name: "Nasi Lemak Pandan",
    cuisine: "Malay",
    requiredIngredients: ["beras", "santan", "ikan bilis", "timun"],
    steps: [
      "Basuh beras dan tanak bersama santan, air, daun pandan, halia, dan cubitan garam.",
      "Goreng ikan bilis dan kacang tanah sehingga garing.",
      "Sediakan sambal tumis tumis kegemaran anda.",
      "Hidangkan nasi lemak panas bersama timun hiasan, telur rebus, dan sambal."
    ],
    time: "30 min"
  },
  {
    id: "ikan-singgang",
    name: "Ikan Singgang Kelantan",
    cuisine: "Malay",
    requiredIngredients: ["ikan", "bawang", "halia", "asam keping"],
    steps: [
      "Hiris bawang merah, bawang putih, halia, dan lengkuas.",
      "Didihkan air di dalam periuk bersama bahan hiris dan asam keping.",
      "Masukkan ikan segar (seperti kembung atau selar) dan cili padi ketuk.",
      "Perasakan dengan garam secukup rasa dan biarkan mereneh selama 10 minit."
    ],
    time: "15 min"
  },
  {
    id: "chicken-chop",
    name: "Crispy Oriental Chicken Chop",
    cuisine: "Western",
    requiredIngredients: ["ayam", "kentang", "tepung"],
    steps: [
      "Salut kepingan paha ayam dengan garam, lada sulah, dan tepung serbaguna.",
      "Goreng ayam deep-fry sehingga keemasan dan rangup.",
      "Goreng kentang potong sebagai hidangan sampingan.",
      "Sediakan sos blackpepper panas dan tuangkan di atas chicken chop garing."
    ],
    time: "20 min"
  }
];

// Mock Nearby Restaurants with promos
const LOCAL_RESTAURANTS = [
  { id: "pelita", name: "Nasi Kandar Pelita", type: "Mamak", promo: "RM5 Off Nasi Kandar Ayam Madu", distance: "1.2 km", rating: "4.5" },
  { id: "kak-nab", name: "Warung Kak Nab Nasi Kerabu", type: "Malay Kelantan", promo: "Free Teh O Ais with Nasi Kerabu", distance: "600 m", rating: "4.8" },
  { id: "abang-burn", name: "Burger Bakar Abang Burn", type: "Western / Street Burger", promo: "Buy 1 Free 1 Double Cheese", distance: "2.1 km", rating: "4.3" },
  { id: "kak-lah", name: "Nasi Lemak Kukus Kak Lah", type: "Malay Breakfast", promo: "10% Discount for Family Combo", distance: "1.5 km", rating: "4.7" },
  { id: "al-faye", name: "Restoran Al-Faye", type: "Mamak", promo: "RM1 Roti Canai during Tea Time", distance: "800 m", rating: "4.2" }
];

export default function App() {
  // Navigation & UI States
  const [activeTab, setActiveTab] = useState('apa'); // 'apa' or 'mana'
  const [showSettings, setShowSettings] = useState(false);
  const [isChatbotEnabled, setIsChatbotEnabled] = useState(() => {
    return JSON.parse(localStorage.getItem('isChatbotEnabled')) || false;
  });

  // App Memory / Local DB state (Starts empty by default!)
  const [pantry, setPantry] = useState(() => {
    return JSON.parse(localStorage.getItem('pantry')) || [];
  });
  const [cookedHistory, setCookedHistory] = useState(() => {
    return JSON.parse(localStorage.getItem('cookedHistory')) || [];
  });
  const [diningHistory, setDiningHistory] = useState(() => {
    return JSON.parse(localStorage.getItem('diningHistory')) || [];
  });

  // Makan Apa / Makan Mana UI helpers
  const [newIngredient, setNewIngredient] = useState('');
  const [newQty, setNewQty] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [cookingProgress, setCookingProgress] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  // Ambient Intelligent Content states
  const [aiInsight, setAiInsight] = useState('');
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [substitutes, setSubstitutes] = useState({});
  const [boredomBuster, setBoredomBuster] = useState('');

  // Backup Chatbot Assistant states
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { sender: 'bot', text: 'Jom! Ada apa-apa yang saya boleh bantu berkaitan menu makan hari ini?' }
  ]);
  const [userInput, setUserInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);

  // Auto-Persist States in Local Storage
  useEffect(() => {
    localStorage.setItem('pantry', JSON.stringify(pantry));
    localStorage.setItem('cookedHistory', JSON.stringify(cookedHistory));
    localStorage.setItem('diningHistory', JSON.stringify(diningHistory));
    localStorage.setItem('isChatbotEnabled', JSON.stringify(isChatbotEnabled));
  }, [pantry, cookedHistory, diningHistory, isChatbotEnabled]);

  // Ambient AI: Generate dynamic Chef Insights based on active pantry items
  useEffect(() => {
    if (pantry.length === 0) {
      setAiInsight('');
      return;
    }
    
    const fetchChefInsight = async () => {
      if (!isAiConfigured) return;
      setLoadingInsight(true);
      try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const itemsList = pantry.map(i => `${i.qty} ${i.name}`).join(', ');
        
        const response = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: `Based on these ingredients in my pantry: [${itemsList}]. Generate a single, short, witty, encouraging one-sentence cooking insight in localized Malaysian conversational style (using 'lah', 'jom', 'gempak', etc.). Suggest what to prioritize or watch out for.` }] }]
        });
        setAiInsight(response.response.text());
      } catch (err) {
        console.error("Failed to generate custom chef insight:", err);
        setAiInsight("Banyak bahan best ni. Jom mula memasak dengan apa yang ada!");
      } finally {
        setLoadingInsight(false);
      }
    };

    const timer = setTimeout(() => {
      fetchChefInsight();
    }, 1000); // Debounce API requests on typing edits

    return () => clearTimeout(timer);
  }, [pantry]);

  // Ambient AI: Generate dynamic Boredom Buster headline based on dining history
  useEffect(() => {
    const fetchBoredomBuster = async () => {
      if (!isAiConfigured || activeTab !== 'mana') return;
      try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const historyText = diningHistory.map(h => `${h.name} on ${h.date}`).join(', ');

        const response = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: `My dining history is: [${historyText || "No recent history"}]. Recommend which local food segment or nearby stall segment to target today to break the pattern. Respond in one brief, catchy Malay-english headline.` }] }]
        });
        setBoredomBuster(response.response.text());
      } catch (err) {
        setBoredomBuster("Masakan panas menanti! Teroka restoran menarik hari ini.");
      }
    };

    fetchBoredomBuster();
  }, [diningHistory, activeTab]);

  // Action Handlers
  const handleAddIngredient = (name, qty) => {
    if (!name) return;
    const cleanName = name.toLowerCase().trim();
    const cleanQty = qty || 'Secukupnya';
    
    setPantry(prev => {
      const exists = prev.findIndex(item => item.name.toLowerCase() === cleanName);
      if (exists !== -1) {
        const updated = [...prev];
        updated[exists].qty = cleanQty;
        return updated;
      }
      return [...prev, { id: Date.now().toString(), name: name.trim(), qty: cleanQty }];
    });
    setNewIngredient('');
    setNewQty('');
  };

  const handleDeleteIngredient = (id) => {
    setPantry(prev => prev.filter(item => item.id !== id));
  };

  const handleDeleteCookedHistory = (id) => {
    setCookedHistory(prev => prev.filter(h => h.id !== id));
  };

  const handleDeleteDiningHistory = (id) => {
    setDiningHistory(prev => prev.filter(h => h.id !== id));
  };

  const handleClearAllData = () => {
    setPantry([]);
    setCookedHistory([]);
    setDiningHistory([]);
    localStorage.removeItem('pantry');
    localStorage.removeItem('cookedHistory');
    localStorage.removeItem('diningHistory');
    setShowSettings(false);
  };

  // Simulated / Gemini Image Upload Scanner
  const handleImageScan = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    
    if (!isAiConfigured) {
      // Offline Simulation fallback if no key
      setTimeout(() => {
        handleAddIngredient("Ayam", "500g");
        handleAddIngredient("Bawang", "3 biji");
        handleAddIngredient("Cili", "4 tangkai");
        setIsScanning(false);
      }, 2000);
      return;
    }

    try {
      // Helper function to convert file to generative part
      const fileToGenerativePart = (file) => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve({
            inlineData: {
              data: reader.result.split(',')[1],
              mimeType: file.type
            },
          });
          reader.readAsDataURL(file);
        });
      };

      const imagePart = await fileToGenerativePart(file);
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const prompt = `You are the JomMakan AI Chef. Analyze this image of raw kitchen ingredients. Identify all individual items, estimate their quantities, and return the data STRICTLY as a valid JSON array of objects structured exactly like this: [{"name": "Ayam", "qty": "500g"}, {"name": "Bawang Merah", "qty": "3 pcs"}]. Do not include markdown formatting like \`\`\`json or plain text wrappers. Just return the raw JSON string.`;

      const result = await model.generateContent([prompt, imagePart]);
      const text = result.response.text().trim();
      
      // Clean up potential markdown formatting output by the LLM
      const cleanJson = text.replace(/```json|```/g, "").trim();
      const items = JSON.parse(cleanJson);
      
      if (Array.isArray(items)) {
        items.forEach(item => {
          handleAddIngredient(item.name, item.qty);
        });
      }
    } catch (err) {
      console.error("AI scanning error:", err);
      // Fallback grace
      handleAddIngredient("Bawang", "2 biji");
    } finally {
      setIsScanning(false);
    }
  };

  // Recipe Substitutions: Silent helper using Gemini API
  const handleLoadRecipeDetail = async (recipe) => {
    setSelectedRecipe(recipe);
    if (!isAiConfigured) return;

    // Check which ingredients are missing
    const missing = recipe.requiredIngredients.filter(
      req => !pantry.some(p => p.name.toLowerCase().includes(req.toLowerCase()))
    );

    if (missing.length === 0) return;

    try {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const response = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: `The user wants to make ${recipe.name} but lacks [${missing.join(', ')}]. Provide brief local culinary replacements or alternative ingredients they can use, in conversational Malay/English under 40 words.` }] }]
      });
      setSubstitutes(prev => ({ ...prev, [recipe.id]: response.response.text() }));
    } catch (err) {
      console.error("Could not fetch substitution recommendations:", err);
    }
  };

  // Finish cooking workflow
  const handleFinishCooking = () => {
    if (!selectedRecipe) return;
    
    // Add to Cooked History
    const newCooked = {
      id: Date.now().toString(),
      recipeId: selectedRecipe.id,
      name: selectedRecipe.name,
      date: new Date().toLocaleDateString('ms-MY', { day: 'numeric', month: 'short' }),
      timestamp: Date.now()
    };
    setCookedHistory(prev => [newCooked, ...prev]);

    // Pantry Math: Deduct matched ingredients from pantry balance
    setPantry(prev => {
      return prev.filter(item => {
        // Keep ingredients that do not match the recipe requirements
        const isUsed = selectedRecipe.requiredIngredients.some(req => 
          item.name.toLowerCase().includes(req.toLowerCase())
        );
        return !isUsed;
      });
    });

    setCookingProgress(false);
    setSelectedRecipe(null);
    setCurrentStep(0);
  };

  // Dining out logic: mark restaurant as visited
  const handleMarkAsVisited = (restaurant) => {
    const newVisit = {
      id: Date.now().toString(),
      restaurantId: restaurant.id,
      name: restaurant.name,
      date: new Date().toLocaleDateString('ms-MY', { day: 'numeric', month: 'short' }),
      timestamp: Date.now()
    };
    setDiningHistory(prev => [newVisit, ...prev]);
  };

  // Backup Chatbot Logic
  const handleSendMessage = async () => {
    if (!userInput.trim()) return;

    const userMsg = { sender: 'user', text: userInput };
    setChatMessages(prev => [...prev, userMsg]);
    setUserInput('');
    setIsAiTyping(true);

    if (!isAiConfigured) {
      setTimeout(() => {
        setChatMessages(prev => [...prev, { sender: 'bot', text: 'Maaf, saya sedang berjalan dalam mod demo. Sila tetapkan VITE_GEMINI_API_KEY untuk berbual secara live!' }]);
        setIsAiTyping(false);
      }, 1000);
      return;
    }

    try {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const contextPrompt = `
        You are JomMakan AI Assistant, a warm, clever Malaysian dining helper. 
        Current Pantry: ${JSON.stringify(pantry)}
        Cooking History: ${JSON.stringify(cookedHistory)}
        Dining out History: ${JSON.stringify(diningHistory)}
        
        Answer this user prompt with direct contextual understanding. Speak with friendly Malaysian slang (lah, jom, kempunan). Keep answers relatively short and helpful:
        "${userMsg.text}"
      `;

      const result = await model.generateContent(contextPrompt);
      setChatMessages(prev => [...prev, { sender: 'bot', text: result.response.text() }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { sender: 'bot', text: 'Alamak, pautan terputus sebentar. Boleh cuba taip sekali lagi?' }]);
    } finally {
      setIsAiTyping(false);
    }
  };

  // Filtering Algorithms

  // 1. Fatigue filtering for matching menus: Recipes cooked within last 3 days move down, desaturated.
  const getCategorizedRecipes = () => {
    const isMatched = (recipe) => {
      // Matches recipe if we have at least one ingredient corresponding to required
      return recipe.requiredIngredients.some(req => 
        pantry.some(p => p.name.toLowerCase().includes(req.toLowerCase()))
      );
    };

    const matched = LOCAL_RECIPES.filter(isMatched);

    // Dynamic fatigue checking: 3 days cooldown (3 * 24 * 60 * 60 * 1000 ms)
    const threeDaysLimit = 3 * 24 * 60 * 60 * 1000;
    
    const fresh = [];
    const fatigued = [];

    matched.forEach(recipe => {
      const lastCooked = cookedHistory.find(h => h.recipeId === recipe.id);
      if (lastCooked && (Date.now() - lastCooked.timestamp < threeDaysLimit)) {
        const daysAgo = Math.round((Date.now() - lastCooked.timestamp) / (24 * 60 * 60 * 1000)) || 1;
        fatigued.push({ ...recipe, daysAgo });
      } else {
        fresh.push(recipe);
      }
    });

    return { fresh, fatigued };
  };

  const { fresh: matchingRecipes, fatigued: fatiguedRecipes } = getCategorizedRecipes();

  // 2. Makan Mana Cooldown Prevention Filter: 14 days cooldown on visits (14 * 24 * 60 * 60 * 1000)
  const getDiningFeeds = () => {
    const filteredBySearch = LOCAL_RESTAURANTS.filter(r => 
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      r.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.promo.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const fourteenDaysLimit = 14 * 24 * 60 * 60 * 1000;
    const activeFeeds = [];
    const cooldownFeeds = [];

    filteredBySearch.forEach(rest => {
      const lastVisited = diningHistory.find(h => h.restaurantId === rest.id);
      if (lastVisited && (Date.now() - lastVisited.timestamp < fourteenDaysLimit)) {
        cooldownFeeds.push(rest);
      } else {
        activeFeeds.push(rest);
      }
    });

    return { activeFeeds, cooldownFeeds };
  };

  const { activeFeeds, cooldownFeeds } = getDiningFeeds();

  return (
    <div class="min-h-screen bg-[#1D3557] text-[#F8F9FA] flex flex-col font-sans select-none overflow-x-hidden">
      
      {/* Dynamic Environment Warning bar */}
      {!isAiConfigured && (
        <div class="bg-amber-500 text-[#1D3557] py-1.5 px-4 text-xs font-semibold flex items-center justify-between shadow-md">
          <div class="flex items-center space-x-2">
            <AlertCircle class="w-4 h-4 shrink-0" />
            <span>AI belum dikonfigurasi. Menggunakan mod simulasi tanpa rangkaian API.</span>
          </div>
        </div>
      )}

      {/* Main App Layout Header */}
      <header class="sticky top-0 z-30 bg-[#1D3557]/80 backdrop-blur-md px-6 py-4 flex items-center justify-between border-b border-[#F8F9FA]/10">
        <div class="flex items-center space-x-2">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#E63946] to-[#E9C46A] flex items-center justify-center shadow-lg">
            <ChefHat class="w-5 h-5 text-[#1D3557]" />
          </div>
          <div>
            <h1 class="text-lg font-bold tracking-tight bg-gradient-to-r from-white to-[#F8F9FA]/80 bg-clip-text">JomMakan</h1>
            <p class="text-[10px] text-[#2A9D8F] font-semibold tracking-wider uppercase">Apa & Mana</p>
          </div>
        </div>

        {/* Action Controls - No duplicate bins here! */}
        <div class="flex items-center space-x-3">
          <button 
            onClick={() => setShowSettings(true)}
            class="p-2 rounded-xl bg-[#F8F9FA]/5 hover:bg-[#F8F9FA]/10 border border-[#F8F9FA]/10 active:scale-95 transition-all text-slate-300 hover:text-white"
          >
            <Settings class="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Primary View Container */}
      <main class="flex-1 max-w-md w-full mx-auto px-5 py-6 pb-28 space-y-6">
        
        {/* Sleek Switch Control */}
        <div class="relative bg-[#F8F9FA]/5 p-1 rounded-2xl flex border border-[#F8F9FA]/10">
          <button 
            onClick={() => { setActiveTab('apa'); setSelectedRecipe(null); }}
            class={`flex-1 py-3 text-sm font-bold rounded-xl flex items-center justify-center space-x-2 transition-all relative z-10 ${activeTab === 'apa' ? 'text-[#1D3557]' : 'text-[#F8F9FA]/70'}`}
          >
            <ChefHat class="w-4 h-4" />
            <span>Makan Apa?</span>
          </button>
          <button 
            onClick={() => { setActiveTab('mana'); setSelectedRecipe(null); }}
            class={`flex-1 py-3 text-sm font-bold rounded-xl flex items-center justify-center space-x-2 transition-all relative z-10 ${activeTab === 'mana' ? 'text-[#1D3557]' : 'text-[#F8F9FA]/70'}`}
          >
            <Compass class="w-4 h-4" />
            <span>Makan Mana?</span>
          </button>
          <motion.div 
            layoutId="activeTabBackground"
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            class="absolute top-1 bottom-1 left-1 rounded-xl bg-gradient-to-r from-[#E9C46A] to-white shadow-md"
            style={{ 
              width: 'calc(50% - 4px)',
              left: activeTab === 'apa' ? '4px' : '50%'
            }}
          />
        </div>

        {/* Tab 1: Makan Apa (Cooking Dashboard) */}
        {activeTab === 'apa' && (
          <div class="space-y-6">
            {/* Input & Scanner Component */}
            <div class="bg-[#F8F9FA]/5 border border-[#F8F9FA]/10 p-5 rounded-3xl space-y-4">
              <div class="flex items-center justify-between">
                <h3 class="text-sm font-bold tracking-wide uppercase text-[#E9C46A]">Masak Sendiri</h3>
                <label class="cursor-pointer bg-[#2A9D8F] hover:bg-[#2A9D8F]/90 active:scale-95 text-[#1D3557] px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 shadow-md">
                  <Camera class="w-4 h-4" />
                  <span>Scan Bahan</span>
                  <input type="file" accept="image/*" onChange={handleImageScan} class="hidden" />
                </label>
              </div>

              {/* Laser scanning visualization */}
              {isScanning && (
                <div class="relative bg-slate-900 rounded-2xl h-36 overflow-hidden flex flex-col items-center justify-center border border-emerald-500/30">
                  <motion.div 
                    animate={{ y: [0, 144, 0] }}
                    transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                    class="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#2A9D8F] to-transparent shadow-[0_0_12px_#2A9D8F]"
                  />
                  <RefreshCw class="w-8 h-8 text-[#2A9D8F] animate-spin mb-2" />
                  <p class="text-xs text-emerald-400 font-medium tracking-widest animate-pulse">MEMBACA BAHAN GAMBAR...</p>
                </div>
              )}

              {/* Inline input */}
              <div class="flex space-x-2">
                <input 
                  type="text" 
                  value={newIngredient}
                  onChange={(e) => setNewIngredient(e.target.value)}
                  placeholder="e.g. Ayam, Bawang"
                  class="flex-1 bg-black/20 border border-[#F8F9FA]/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#E9C46A] placeholder-[#F8F9FA]/30"
                />
                <input 
                  type="text" 
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                  placeholder="e.g. 500g, 3 pcs"
                  class="w-24 bg-black/20 border border-[#F8F9FA]/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#E9C46A] placeholder-[#F8F9FA]/30"
                />
                <button 
                  onClick={() => handleAddIngredient(newIngredient, newQty)}
                  class="p-3 bg-[#E9C46A] text-[#1D3557] rounded-xl font-bold hover:scale-105 active:scale-95 transition-all shadow-md"
                >
                  <Plus class="w-5 h-5" />
                </button>
              </div>

              {/* Active Pantry List */}
              {pantry.length > 0 ? (
                <div class="space-y-3">
                  <p class="text-xs font-bold text-[#F8F9FA]/50 uppercase tracking-wider">Bahan Tersedia ({pantry.length})</p>
                  <div class="flex flex-wrap gap-2">
                    <AnimatePresence>
                      {pantry.map(item => (
                        <motion.div 
                          key={item.id}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          class="bg-gradient-to-r from-[#2A9D8F]/10 to-[#2A9D8F]/20 border border-[#2A9D8F]/30 pl-3 pr-1.5 py-1.5 rounded-xl flex items-center space-x-2 text-sm text-[#2A9D8F] font-semibold"
                        >
                          <span>{item.name} <span class="text-xs text-[#F8F9FA]/60 font-normal">({item.qty})</span></span>
                          <button 
                            onClick={() => handleDeleteIngredient(item.id)}
                            class="p-1 hover:bg-[#E63946]/10 rounded-lg text-[#E63946] transition-all"
                          >
                            <X class="w-4 h-4" />
                          </button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              ) : (
                /* Premium Empty State */
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  class="py-8 flex flex-col items-center text-center space-y-3 bg-black/10 rounded-2xl p-4"
                >
                  <div class="relative w-16 h-16 rounded-full bg-gradient-to-tr from-[#E63946]/10 to-[#E9C46A]/10 border border-[#E9C46A]/20 flex items-center justify-center">
                    <ChefHat class="w-8 h-8 text-[#E9C46A] animate-pulse" />
                  </div>
                  <div>
                    <h4 class="text-sm font-bold text-white">Peti Ais Anda Kosong</h4>
                    <p class="text-xs text-[#F8F9FA]/50 max-w-xs mx-auto mt-1">Masukkan senarai bahan manual di atas atau scan bahan masakan terus dari kamera telefon.</p>
                  </div>
                </motion.div>
              )}

              {/* Ambient AI Insight Block */}
              {loadingInsight && (
                <div class="bg-black/10 rounded-2xl p-4 space-y-2 animate-pulse border border-[#E9C46A]/10">
                  <div class="h-3 w-1/3 bg-slate-700 rounded" />
                  <div class="h-3 w-5/6 bg-slate-700 rounded" />
                </div>
              )}
              {!loadingInsight && aiInsight && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  class="bg-gradient-to-br from-[#E9C46A]/10 to-[#E63946]/5 border border-[#E9C46A]/20 p-4 rounded-2xl flex items-start space-x-3"
                >
                  <Sparkles class="w-5 h-5 text-[#E9C46A] shrink-0 mt-0.5" />
                  <div>
                    <h5 class="text-xs font-bold text-[#E9C46A]">Rasa Chef AI</h5>
                    <p class="text-xs text-[#F8F9FA]/80 mt-1 italic leading-relaxed">"{aiInsight}"</p>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Recipe Recommendation lists */}
            {pantry.length > 0 && (
              <div class="space-y-4">
                <h3 class="text-sm font-bold tracking-wide uppercase text-[#E63946]">Cadangan Menu Masakan</h3>
                
                {/* 1. Fresh/Match Recipes */}
                {matchingRecipes.length > 0 ? (
                  <div class="grid gap-3">
                    {matchingRecipes.map(recipe => (
                      <div 
                        key={recipe.id}
                        onClick={() => handleLoadRecipeDetail(recipe)}
                        class="bg-[#F8F9FA]/5 border border-[#F8F9FA]/10 hover:border-[#E9C46A]/30 p-4 rounded-2xl cursor-pointer hover:bg-[#F8F9FA]/10 transition-all flex justify-between items-center"
                      >
                        <div>
                          <span class="text-[10px] text-[#2A9D8F] font-bold uppercase tracking-wider">{recipe.cuisine}</span>
                          <h4 class="font-bold text-white mt-0.5">{recipe.name}</h4>
                          <div class="flex items-center space-x-2 mt-1.5">
                            <span class="text-xs text-[#F8F9FA]/50">{recipe.time}</span>
                            <span class="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-bold">
                              Sesuai Dimasak
                            </span>
                          </div>
                        </div>
                        <Plus class="w-5 h-5 text-[#E9C46A]" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p class="text-xs text-[#F8F9FA]/50 italic text-center py-4">Tiada menu padanan penuh. Cuba masukkan bahan lain seperti Ayam, Bawang atau Santan.</p>
                )}

                {/* 2. Fatigued Recipes (Greyed out) */}
                {fatiguedRecipes.length > 0 && (
                  <div class="space-y-3 pt-2">
                    <p class="text-xs font-bold text-[#F8F9FA]/50 uppercase tracking-wider">Baru Saja Dimasak (Pencegahan Bosan)</p>
                    <div class="grid gap-3 opacity-50 pointer-events-none">
                      {fatiguedRecipes.map(recipe => (
                        <div 
                          key={recipe.id}
                          class="bg-[#F8F9FA]/5 border border-dashed border-[#F8F9FA]/10 p-4 rounded-2xl flex justify-between items-center filter grayscale"
                        >
                          <div>
                            <span class="text-[10px] font-bold uppercase tracking-wider text-slate-400">{recipe.cuisine}</span>
                            <h4 class="font-bold text-white mt-0.5">{recipe.name}</h4>
                            <div class="mt-1.5 flex items-center space-x-2">
                              <span class="text-xs bg-[#E63946]/20 text-[#E63946] px-2 py-0.5 rounded-full font-bold">
                                Baru dimasak {recipe.daysAgo} hari lepas
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Cooked History Segment inside Apa */}
            {cookedHistory.length > 0 && (
              <div class="bg-black/10 border border-[#F8F9FA]/5 rounded-3xl p-5 space-y-3">
                <div class="flex items-center justify-between">
                  <h4 class="text-xs font-bold text-[#F8F9FA]/50 uppercase tracking-wider">Rekod Masakan</h4>
                  <span class="text-[10px] text-[#2A9D8F] font-bold">{cookedHistory.length} Kali</span>
                </div>
                <div class="divide-y divide-[#F8F9FA]/5 max-h-40 overflow-y-auto">
                  {cookedHistory.map(item => (
                    <div key={item.id} class="py-2.5 flex items-center justify-between text-sm">
                      <div>
                        <p class="font-semibold text-white">{item.name}</p>
                        <p class="text-[10px] text-[#F8F9FA]/40">Dimasak pada {item.date}</p>
                      </div>
                      <button 
                        onClick={() => handleDeleteCookedHistory(item.id)}
                        class="p-1.5 text-[#E63946]/70 hover:text-[#E63946] hover:bg-[#E63946]/10 rounded-lg transition-all"
                      >
                        <Trash2 class="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Makan Mana (Halal Discovery & Search) */}
        {activeTab === 'mana' && (
          <div class="space-y-6">
            
            {/* Search component */}
            <div class="relative bg-[#F8F9FA]/5 border border-[#F8F9FA]/10 p-4 rounded-2xl flex items-center space-x-3">
              <Search class="w-5 h-5 text-[#F8F9FA]/40 shrink-0" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari kedai makan, jenis makanan, promo..."
                class="bg-transparent flex-1 focus:outline-none text-sm text-white placeholder-[#F8F9FA]/30"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} class="p-1 hover:bg-[#F8F9FA]/10 rounded-lg text-slate-400">
                  <X class="w-4 h-4" />
                </button>
              )}
            </div>

            {/* AI Boredom Buster Headline Banner */}
            {boredomBuster && (
              <motion.div 
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                class="bg-gradient-to-r from-[#2A9D8F]/10 to-[#E9C46A]/10 border border-[#2A9D8F]/30 p-4 rounded-2xl flex items-center space-x-3"
              >
                <Sparkles class="w-5 h-5 text-[#2A9D8F] shrink-0" />
                <div>
                  <h5 class="text-[10px] font-bold text-[#2A9D8F] uppercase tracking-wider">Gaya Makan Pintar</h5>
                  <p class="text-xs text-slate-100 font-semibold mt-0.5">"{boredomBuster}"</p>
                </div>
              </motion.div>
            )}

            {/* Active Promotional Outlets */}
            <div class="space-y-4">
              <h3 class="text-sm font-bold tracking-wide uppercase text-[#E9C46A]">Kedai Halal Dengan Promosi</h3>
              
              {activeFeeds.length > 0 ? (
                <div class="grid gap-4">
                  {activeFeeds.map(rest => (
                    <div 
                      key={rest.id}
                      class="bg-[#F8F9FA]/5 border border-[#F8F9FA]/10 rounded-3xl p-5 space-y-4 relative overflow-hidden"
                    >
                      <div class="flex justify-between items-start">
                        <div>
                          <span class="text-[10px] bg-[#2A9D8F]/10 text-[#2A9D8F] border border-[#2A9D8F]/20 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">{rest.type}</span>
                          <h4 class="font-bold text-white text-base mt-2">{rest.name}</h4>
                          <div class="flex items-center space-x-3 text-xs text-[#F8F9FA]/60 mt-1">
                            <span class="flex items-center"><MapPin class="w-3.5 h-3.5 mr-1 text-[#E63946]" />{rest.distance}</span>
                            <span>★ {rest.rating}</span>
                          </div>
                        </div>
                      </div>

                      {/* Promo tag with glow */}
                      <div class="bg-gradient-to-r from-[#E63946]/10 to-transparent border-l-2 border-[#E63946] p-3 rounded-r-xl">
                        <p class="text-[11px] font-bold uppercase tracking-wide text-[#E63946]">Promosi Terkini</p>
                        <p class="text-sm font-semibold text-white mt-0.5">{rest.promo}</p>
                      </div>

                      <button 
                        onClick={() => handleMarkAsVisited(rest)}
                        class="w-full py-2.5 bg-gradient-to-r from-[#E9C46A] to-white hover:opacity-90 active:scale-[0.98] text-[#1D3557] font-bold text-xs rounded-xl transition-all flex items-center justify-center space-x-1 shadow-md"
                      >
                        <Check class="w-4 h-4" />
                        <span>Dah Makan Di Sini Hari Ini</span>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p class="text-xs text-[#F8F9FA]/50 italic text-center py-4">Tiada padanan kedai ditemui.</p>
              )}
            </div>

            {/* 14-Day Cooldown Drawer for Visited Spots */}
            {cooldownFeeds.length > 0 && (
              <div class="space-y-3 pt-2">
                <p class="text-xs font-bold text-[#F8F9FA]/50 uppercase tracking-wider">Dalam Tempoh Cooldown (Elak Bosan)</p>
                <div class="grid gap-3 opacity-40 filter grayscale select-none">
                  {cooldownFeeds.map(rest => (
                    <div 
                      key={rest.id}
                      class="bg-black/20 border border-dashed border-[#F8F9FA]/10 p-4 rounded-2xl flex justify-between items-center"
                    >
                      <div>
                        <h4 class="font-bold text-white">{rest.name}</h4>
                        <p class="text-xs text-slate-300">Cooldown diaktifkan sehingga 14 hari</p>
                      </div>
                      <MapPin class="w-5 h-5 text-slate-400" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Visited History list with inline deletion */}
            {diningHistory.length > 0 && (
              <div class="bg-black/10 border border-[#F8F9FA]/5 rounded-3xl p-5 space-y-3">
                <div class="flex items-center justify-between">
                  <h4 class="text-xs font-bold text-[#F8F9FA]/50 uppercase tracking-wider">Sejarah Kunjungan</h4>
                  <span class="text-[10px] text-[#2A9D8F] font-bold">{diningHistory.length} Kedai</span>
                </div>
                <div class="divide-y divide-[#F8F9FA]/5 max-h-40 overflow-y-auto">
                  {diningHistory.map(item => (
                    <div key={item.id} class="py-2.5 flex items-center justify-between text-sm">
                      <div>
                        <p class="font-semibold text-white">{item.name}</p>
                        <p class="text-[10px] text-[#F8F9FA]/40">Dikunjungi pada {item.date}</p>
                      </div>
                      <button 
                        onClick={() => handleDeleteDiningHistory(item.id)}
                        class="p-1.5 text-[#E63946]/70 hover:text-[#E63946] hover:bg-[#E63946]/10 rounded-lg transition-all"
                      >
                        <Trash2 class="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}

      </main>

      {/* Immersive step-by-step Tutorial Modal */}
      <AnimatePresence>
        {selectedRecipe && !cookingProgress && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            class="fixed inset-0 bg-black/60 z-50 flex items-end justify-center p-4 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              class="bg-[#1D3557] border border-[#F8F9FA]/10 w-full max-w-md rounded-t-[32px] p-6 space-y-5 shadow-2xl max-h-[85vh] overflow-y-auto"
            >
              <div class="flex justify-between items-start">
                <div>
                  <span class="text-[10px] bg-[#E9C46A]/20 text-[#E9C46A] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">{selectedRecipe.cuisine}</span>
                  <h3 class="text-xl font-bold text-white mt-2">{selectedRecipe.name}</h3>
                </div>
                <button 
                  onClick={() => setSelectedRecipe(null)}
                  class="p-1 bg-[#F8F9FA]/5 border border-[#F8F9FA]/10 rounded-xl"
                >
                  <X class="w-5 h-5" />
                </button>
              </div>

              {/* Missing materials / substitutions indicator */}
              {selectedRecipe.requiredIngredients.some(req => !pantry.some(p => p.name.toLowerCase().includes(req.toLowerCase()))) && (
                <div class="bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl space-y-2">
                  <p class="text-xs font-bold text-amber-400 flex items-center">
                    <AlertCircle class="w-4 h-4 mr-1.5 shrink-0" />
                    Bahan Tidak Cukup Untuk Sukatan Penuh
                  </p>
                  {substitutes[selectedRecipe.id] ? (
                    <p class="text-xs text-slate-100 italic">"{substitutes[selectedRecipe.id]}"</p>
                  ) : (
                    <div class="h-3 w-4/5 bg-slate-700/50 animate-pulse rounded" />
                  )}
                </div>
              )}

              {/* Recipe metadata */}
              <div class="bg-black/15 p-4 rounded-2xl space-y-3">
                <p class="text-xs font-bold text-[#E9C46A] uppercase tracking-wider">Bahan Digunakan:</p>
                <ul class="text-xs text-[#F8F9FA]/80 space-y-1">
                  {selectedRecipe.requiredIngredients.map(ing => (
                    <li key={ing} class="flex items-center space-x-2">
                      <span class="w-1.5 h-1.5 bg-[#2A9D8F] rounded-full" />
                      <span class="capitalize">{ing}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div class="flex space-x-3">
                <button 
                  onClick={() => setSelectedRecipe(null)}
                  class="flex-1 py-3 border border-[#F8F9FA]/10 text-[#F8F9FA]/80 font-bold text-xs rounded-xl hover:bg-[#F8F9FA]/5 transition-all"
                >
                  Batal
                </button>
                <button 
                  onClick={() => setCookingProgress(true)}
                  class="flex-1 py-3 bg-[#E9C46A] text-[#1D3557] font-bold text-xs rounded-xl shadow-md active:scale-95 transition-all"
                >
                  Mula Memasak
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actual step progress carousel */}
      <AnimatePresence>
        {cookingProgress && selectedRecipe && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            class="fixed inset-0 bg-[#1D3557] z-50 flex flex-col p-6 overflow-y-auto"
          >
            <div class="flex justify-between items-center pb-4 border-b border-[#F8F9FA]/10">
              <span class="text-xs font-bold text-[#E9C46A] uppercase tracking-wider">{selectedRecipe.name} (Langkah {currentStep + 1}/{selectedRecipe.steps.length})</span>
              <button 
                onClick={() => { setCookingProgress(false); setSelectedRecipe(null); setCurrentStep(0); }}
                class="p-2 bg-black/10 rounded-xl text-[#E63946]"
              >
                <X class="w-5 h-5" />
              </button>
            </div>

            {/* Giant step instruction card */}
            <div class="flex-1 flex flex-col justify-center items-center py-12 max-w-md mx-auto w-full">
              <motion.div 
                key={currentStep}
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                class="bg-black/10 border border-[#F8F9FA]/10 rounded-[32px] p-8 text-center space-y-6 shadow-xl w-full"
              >
                <div class="w-14 h-14 bg-[#2A9D8F]/15 text-[#2A9D8F] rounded-2xl flex items-center justify-center font-bold text-xl mx-auto">
                  {currentStep + 1}
                </div>
                <p class="text-base font-semibold leading-relaxed text-white">{selectedRecipe.steps[currentStep]}</p>
              </motion.div>
            </div>

            <div class="mt-auto space-y-3 max-w-md mx-auto w-full">
              <div class="flex space-x-3">
                <button 
                  onClick={() => setCurrentStep(prev => Math.max(0, prev - 1))}
                  disabled={currentStep === 0}
                  class="flex-1 py-3 border border-[#F8F9FA]/10 text-white font-bold text-xs rounded-xl disabled:opacity-30 disabled:pointer-events-none transition-all"
                >
                  Sebelumnya
                </button>
                {currentStep < selectedRecipe.steps.length - 1 ? (
                  <button 
                    onClick={() => setCurrentStep(prev => prev + 1)}
                    class="flex-1 py-3 bg-[#2A9D8F] text-[#1D3557] font-bold text-xs rounded-xl shadow-md transition-all"
                  >
                    Seterusnya
                  </button>
                ) : (
                  <button 
                    onClick={handleFinishCooking}
                    class="flex-1 py-3 bg-gradient-to-r from-[#E63946] to-[#E9C46A] text-[#1D3557] font-bold text-xs rounded-xl shadow-md transition-all"
                  >
                    Selesai & Kemaskini Peti
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gear settings sheet */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            class="fixed inset-0 bg-black/60 z-50 flex items-end justify-center p-4 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              class="bg-[#1D3557] border border-[#F8F9FA]/10 w-full max-w-md rounded-t-[32px] p-6 space-y-6 shadow-2xl"
            >
              <div class="flex justify-between items-center">
                <h3 class="text-lg font-bold text-white flex items-center"><Settings class="w-5 h-5 mr-2 text-[#E9C46A]" />Tetapan JomMakan</h3>
                <button onClick={() => setShowSettings(false)} class="p-1 bg-[#F8F9FA]/5 border border-[#F8F9FA]/10 rounded-xl">
                  <X class="w-5 h-5" />
                </button>
              </div>

              {/* iOS-Style Backup Chatbot Switch */}
              <div class="bg-black/10 p-4 rounded-2xl flex items-center justify-between border border-[#F8F9FA]/5">
                <div class="space-y-1">
                  <h4 class="text-sm font-bold text-white">Enable Backup AI Chatbot</h4>
                  <p class="text-[11px] text-[#F8F9FA]/40">Aktifkan bubble perbualan pembantu dapur</p>
                </div>
                <button 
                  onClick={() => setIsChatbotEnabled(!isChatbotEnabled)}
                  class={`w-12 h-6 rounded-full p-1 transition-colors duration-200 focus:outline-none ${isChatbotEnabled ? 'bg-[#2A9D8F]' : 'bg-slate-600'}`}
                >
                  <div class={`w-4 h-4 rounded-full bg-white transition-transform duration-200 transform ${isChatbotEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>

              {/* Destructive Clear All button moved here safely */}
              <div class="border-t border-[#F8F9FA]/10 pt-5 space-y-3">
                <h4 class="text-xs font-bold text-[#E63946] uppercase tracking-wider">Tindakan Bahaya</h4>
                <button 
                  onClick={() => {
                    if (window.confirm("Padam semua rekod bahan dan sejarah makan?")) {
                      handleClearAllData();
                    }
                  }}
                  class="w-full py-3 bg-[#E63946]/10 hover:bg-[#E63946]/20 text-[#E63946] border border-[#E63946]/20 font-bold text-xs rounded-xl transition-all flex items-center justify-center space-x-1.5"
                >
                  <Trash2 class="w-4 h-4" />
                  <span>Padam Keseluruhan Memori</span>
                </button>
              </div>

              <button 
                onClick={() => setShowSettings(false)}
                class="w-full py-3 bg-[#F8F9FA]/5 border border-[#F8F9FA]/10 text-white font-bold text-xs rounded-xl"
              >
                Tutup
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Conditional Floating Chatbot bubble inside tab layout */}
      {isChatbotEnabled && (
        <>
          <button 
            onClick={() => setIsChatOpen(true)}
            class="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-tr from-[#E63946] to-[#E9C46A] shadow-[0_4px_16px_rgba(230,57,70,0.4)] flex items-center justify-center text-[#1D3557] z-40 hover:scale-110 active:scale-95 transition-all border border-white/20"
          >
            <MessageSquare class="w-6 h-6 animate-pulse" />
          </button>

          {/* Assistant chatbot drawer panel */}
          <AnimatePresence>
            {isChatOpen && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                class="fixed inset-0 bg-black/60 z-50 flex items-end justify-center p-4 backdrop-blur-sm"
              >
                <motion.div 
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  class="bg-[#1D3557] border border-[#F8F9FA]/10 w-full max-w-md rounded-t-[32px] h-[75vh] flex flex-col overflow-hidden shadow-2xl"
                >
                  <div class="px-6 py-4 border-b border-[#F8F9FA]/10 flex justify-between items-center bg-[#1D3557]/60">
                    <div class="flex items-center space-x-2">
                      <Sparkles class="w-5 h-5 text-[#E9C46A]" />
                      <h3 class="font-bold text-white text-base">Pembantu JomMakan</h3>
                    </div>
                    <button onClick={() => setIsChatOpen(false)} class="p-1 bg-[#F8F9FA]/5 border border-[#F8F9FA]/10 rounded-xl">
                      <X class="w-5 h-5" />
                    </button>
                  </div>

                  {/* Messaging pane */}
                  <div class="flex-1 overflow-y-auto p-6 space-y-4">
                    {chatMessages.map((msg, i) => (
                      <div key={i} class={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div class={`max-w-[75%] px-4 py-2.5 rounded-2xl text-xs leading-relaxed ${msg.sender === 'user' ? 'bg-[#E9C46A] text-[#1D3557] rounded-tr-none font-semibold' : 'bg-white/5 border border-white/10 text-white rounded-tl-none'}`}>
                          {msg.text}
                        </div>
                      </div>
                    ))}
                    {isAiTyping && (
                      <div class="flex justify-start">
                        <div class="bg-white/5 border border-white/10 text-white rounded-2xl rounded-tl-none px-4 py-2.5">
                          <span class="flex space-x-1">
                            <span class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                            <span class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-75" />
                            <span class="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-150" />
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Typing input */}
                  <div class="p-4 bg-black/15 border-t border-[#F8F9FA]/10 flex space-x-2">
                    <input 
                      type="text" 
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                      placeholder="Tanya saya tentang resipi or kedai makan..."
                      class="flex-1 bg-black/20 border border-[#F8F9FA]/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#E9C46A]"
                    />
                    <button 
                      onClick={handleSendMessage}
                      class="px-4 bg-[#E9C46A] text-[#1D3557] font-bold text-xs rounded-xl hover:opacity-90 transition-all"
                    >
                      Hantar
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

    </div>
  );
}
