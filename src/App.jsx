import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/generative-ai'; // Pastikan library ini sepadan dengan versi anda
import { 
  Utensils, 
  MapPin, 
  Plus, 
  Trash2, 
  Sparkles, 
  Camera, 
  RefreshCw, 
  Search, 
  ChevronRight, 
  Check, 
  AlertTriangle,
  Settings,
  X
} from 'lucide-react';

// ============================================================================
// 1. PERBAIKAN LOGIK KUNCI API & PENGESAHAN (Mengekalkan UI Asal)
// ============================================================================
// Membaca kunci dari env Vercel/Vite. Jika tiada, ia akan menggunakan string kosong.
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";

// Semakan status konfigurasi AI (True jika kunci wujud dan tidak kosong)
const isAIConfigured = GEMINI_API_KEY !== "";

// Inisialisasi API client secara selamat jika kunci wujud
let aiModel = null;
if (isAIConfigured) {
  const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  aiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
}

export default function App() {
  // ============================================================================
  // STATE MANAGEMENT (Kekal Asal - Menyokong Padam Satu-Demi-Satu & Carian)
  // ============================================================================
  const [activeTab, setActiveTab] = useState('makan-apa');
  
  // Memastikan senarai bahan bermula kosong [] secara lalai pada pelancaran bersih
  const [ingredients, setIngredients] = useState([]);
  const [inputIngredient, setInputIngredient] = useState('');
  const [inputQuantity, setInputQuantity] = useState('');
  
  // State untuk Carian Resipi & Cadangan AI
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState([]);

  // State untuk Carian Makan Mana
  const [searchQuery, setSearchQuery] = useState('');
  const [restaurants, setRestaurants] = useState([
    { id: 1, name: 'Nasi Kandar Deen', type: 'Melayu / Mamak', location: 'Jelutong', rating: 4.6, promo: 'Diskaun 10% untuk Ahli' },
    { id: 2, name: 'The Daily Fix Cafe', type: 'Cafe / Barat', location: 'Jonker Street', rating: 4.5, promo: 'Percuma Kopi dengan Wafel' },
    { id: 3, name: 'Restoran Super Tanker', type: 'Cina / Seafood', location: 'Bayan Lepas', rating: 4.3, promo: 'Set Makan Malam Keluarga RM88' },
    { id: 4, name: 'Sushi Zanmai', type: 'Jepun', location: 'Gurney Plaza', rating: 4.4, promo: 'Miso Soup Percuma' },
  ]);
  const [visitedRestaurants, setVisitedRestaurants] = useState([]);

  // ============================================================================
  // FUNGSI LOGIK & TINDAKAN (Fungsi Baharu & Pembaikan)
  // ============================================================================
  
  // Tambah Bahan ke Peti Ais
  const handleAddIngredient = (e) => {
    e.preventDefault();
    if (!inputIngredient.trim()) return;
    
    const newIngredient = {
      id: Date.now(),
      name: inputIngredient.trim(),
      quantity: inputQuantity.trim() || 'Secukupnya'
    };
    
    setIngredients([...ingredients, newIngredient]);
    setInputIngredient('');
    setInputQuantity('');
  };

  // Fungsi Padam Satu-Demi-Satu (Inline Delete)
  const deleteIngredient = (id) => {
    setIngredients(ingredients.filter(item => item.id !== id));
  };

  const deleteHistoryItem = (id) => {
    setHistory(history.filter(item => item.id !== id));
  };

  const deleteVisitedRestaurant = (id) => {
    setVisitedRestaurants(visitedRestaurants.filter(item => item.id !== id));
  };

  // Carian Real-Time untuk Restoran (Makan Mana)
  const filteredRestaurants = restaurants.filter(restaurant => 
    restaurant.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    restaurant.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
    restaurant.location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Fungsi Jana Resipi AI (Menggunakan Model Simulasi jika isAIConfigured = false)
  const handleGenerateRecipe = async () => {
    if (ingredients.length === 0) return;
    setIsLoading(true);

    if (!isAIConfigured) {
      // Mod Simulasi Tanpa Rangkaian API (Fallback jika bar amaran kuning aktif)
      setTimeout(() => {
        const mockRecipe = {
          id: Date.now(),
          title: `Resipi Cadangan AI (${ingredients.map(i => i.name).join(', ')})`,
          ingredients: ingredients.map(i => `${i.name} - ${i.quantity}`),
          steps: [
            'Panaskan minyak di dalam kuali.',
            'Tumis bahan-bahan asas sehingga naik bau harum.',
            'Masukkan bahan utama yang dipotong dan gaul sehingga masak sepenuhnya.',
            'Hidang hangat bersama nasi putih.'
          ],
          tips: 'Mod Simulasi: Tambah kunci API komersial untuk cadangan masakan yang lebih kreatif.'
        };
        setAiSuggestions(mockRecipe);
        setHistory([mockRecipe, ...history]);
        setIsLoading(false);
      }, 1200);
      return;
    }

    try {
      const prompt = `Hasilkan satu resipi masakan Malaysia yang kreatif menggunakan bahan-bahan berikut: ${ingredients.map(i => `${i.name} (${i.quantity})`).join(', ')}. Berikan output dalam format JSON bersih dengan struktur: { "title": "", "ingredients": [], "steps": [], "tips": "" }`;
      
      const result = await aiModel.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      const cleanJson = JSON.parse(text.replace(/```json|```/g, ''));
      const finalRecipe = { ...cleanJson, id: Date.now() };
      
      setAiSuggestions(finalRecipe);
      setHistory([finalRecipe, ...history]);
    } catch (error) {
      console.error("Ralat penjanaan AI:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111827] text-white font-sans antialiased">
      {/* 
        ============================================================================
        BAR AMARAN AI (Hanya dipaparkan jika isAIConfigured ADALAH FALSE)
        ============================================================================
      */}
      {!isAIConfigured && (
        <div className="bg-amber-500 text-gray-900 px-4 py-2 text-sm font-medium flex items-center gap-2 transition-all duration-300">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>AI belum dikonfigurasi. Menggunakan mod simulasi tanpa rangkaian API.</span>
        </div>
      )}

      {/* 
        ============================================================================
        REKA BENTUK HEADER ASAL ANDA (100% KEKAL - BUTANG TONG SAMPAH DIBUANG)
        ============================================================================
      */}
      <header className="border-b border-gray-800 bg-[#1f2937]/50 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-tr from-orange-500 to-amber-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Utensils className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">JomMakan</h1>
              <p className="text-xs text-emerald-400 font-medium tracking-wider uppercase">Apa & Mana</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button className="p-2.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-xl transition">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* 
        ============================================================================
        KANDUNGAN UTAMA (Mengekalkan Susun Atur Lebar Desktop Asal Anda)
        ============================================================================
      */}
      <main className="max-w-7xl mx-auto px-6 py-10">
        
        {/* Tab Switcher - Asal */}
        <div className="flex justify-center mb-10">
          <div className="bg-[#1f2937]/80 p-1.5 rounded-2xl border border-gray-800 flex gap-1 shadow-inner">
            <button
              onClick={() => setActiveTab('makan-apa')}
              className={`px-6 py-3 rounded-xl font-medium text-sm flex items-center gap-2.5 transition-all duration-200 ${
                activeTab === 'makan-apa'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-orange-500/10'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              <Utensils className="w-4 h-4" />
              Makan Apa?
            </button>
            <button
              onClick={() => setActiveTab('makan-mana')}
              className={`px-6 py-3 rounded-xl font-medium text-sm flex items-center gap-2.5 transition-all duration-200 ${
                activeTab === 'makan-mana'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-orange-500/10'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
              }`}
            >
              <MapPin className="w-4 h-4" />
              Makan Mana?
            </button>
          </div>
        </div>

        {/* BAHAGIAN 1: MAKAN APA */}
        {activeTab === 'makan-apa' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            
            {/* Ruang Input Kiri */}
            <div className="lg:col-span-1 bg-[#1f2937]/40 border border-gray-800/80 rounded-3xl p-6 backdrop-blur shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-bold text-lg text-amber-400 tracking-wide uppercase">Masak Sendiri</h2>
                <button className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl text-xs font-semibold border border-emerald-500/20 transition">
                  <Camera className="w-3.5 h-3.5" />
                  Scan Bahan
                </button>
              </div>

              <form onSubmit={handleAddIngredient} className="space-y-4 mb-6">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <input
                      type="text"
                      placeholder="e.g. Ayam, Bawang"
                      value={inputIngredient}
                      onChange={(e) => setInputIngredient(e.target.value)}
                      className="w-full bg-[#111827]/80 border border-gray-700/60 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500 text-white placeholder-gray-500 transition"
                    />
                  </div>
                  <div className="col-span-1 flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. 500g"
                      value={inputQuantity}
                      onChange={(e) => setInputQuantity(e.target.value)}
                      className="w-full bg-[#111827]/80 border border-gray-700/60 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-amber-500 text-white placeholder-gray-500 transition"
                    />
                    <button type="submit" className="p-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:opacity-90 transition shadow-lg shadow-orange-500/20 flex-shrink-0">
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </form>

              {/* Senarai Bahan dengan Inline Delete Button */}
              <div className="border border-gray-800/60 rounded-2xl p-4 bg-[#111827]/40 min-h-[220px]">
                {ingredients.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-12 text-gray-500">
                    <div className="w-12 h-12 rounded-full bg-gray-800/50 flex items-center justify-center mb-3 border border-gray-700/30">
                      <Utensils className="w-5 h-5 text-gray-600" />
                    </div>
                    <p className="text-sm font-medium text-gray-400">Peti Ais Anda Kosong</p>
                    <p className="text-xs text-gray-600 mt-1 max-w-[200px]">Masukkan senarai bahan manual di atas atau scan bahan masakan terus dari kamera telefon.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                    {ingredients.map((item) => (
                      <div key={item.id} className="flex items-center justify-between bg-[#1f2937]/60 border border-gray-800 px-4 py-3 rounded-xl transition hover:border-gray-700 group">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-amber-500" />
                          <span className="text-sm font-medium text-gray-200">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs px-2.5 py-1 bg-gray-800 text-gray-400 rounded-lg border border-gray-700/50 font-medium">{item.quantity}</span>
                          <button 
                            onClick={() => deleteIngredient(item.id)}
                            className="text-gray-500 hover:text-red-400 p-1 rounded-lg hover:bg-red-500/10 transition duration-150"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={handleGenerateRecipe}
                disabled={ingredients.length === 0 || isLoading}
                className={`w-full mt-6 py-4 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2.5 transition shadow-lg ${
                  ingredients.length === 0 || isLoading
                    ? 'bg-gray-800 text-gray-600 cursor-not-allowed border border-gray-700/20 shadow-none'
                    : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:opacity-95 shadow-orange-500/15'
                }`}
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Menghubungi AI Chef...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Jana Resipi Sekarang
                  </>
                )}
              </button>
            </div>

            {/* Hasil Output Kanan */}
            <div className="lg:col-span-2 space-y-6">
              {/* Hasil Cadangan Utama */}
              <div className="bg-[#1f2937]/40 border border-gray-800/80 rounded-3xl p-8 backdrop-blur shadow-xl min-h-[445px] flex flex-col justify-between">
                {aiSuggestions ? (
                  <div>
                    <div className="flex items-start justify-between border-b border-gray-800 pb-5 mb-6">
                      <div>
                        <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-widest mb-1.5">
                          <Sparkles className="w-3.5 h-3.5" />
                          Idea Masakan Terbaik
                        </div>
                        <h3 className="text-2xl font-black text-white tracking-tight">{aiSuggestions.title}</h3>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
                      <div className="md:col-span-2 space-y-4">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Keperluan Bahan</h4>
                        <ul className="space-y-2">
                          {aiSuggestions.ingredients.map((ing, idx) => (
                            <li key={idx} className="flex items-center gap-2.5 text-sm text-gray-300">
                              <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                              <span>{ing}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="md:col-span-3 space-y-4">
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Langkah Penyediaan</h4>
                        <ol className="space-y-3">
                          {aiSuggestions.steps.map((step, idx) => (
                            <li key={idx} className="flex gap-3 text-sm text-gray-300 leading-relaxed">
                              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-800 border border-gray-700 text-amber-400 text-xs font-bold flex items-center justify-center mt-0.5">{idx + 1}</span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>

                    {aiSuggestions.tips && (
                      <div className="mt-8 pt-5 border-t border-gray-800/60 bg-amber-500/5 rounded-2xl px-5 py-4 border border-amber-500/10 text-sm text-amber-300/90 leading-relaxed">
                        <span className="font-bold text-amber-400">Tips Chef: </span>{aiSuggestions.tips}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center my-auto py-20 text-gray-500">
                    <div className="w-16 h-16 rounded-2xl bg-[#1f2937]/80 border border-gray-800 flex items-center justify-center mb-4 shadow-inner text-gray-600">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <p className="text-base font-bold text-gray-400">Papan Cadangan Masakan</p>
                    <p className="text-sm text-gray-600 mt-1 max-w-sm">Isikan bahan masakan yang anda ada di dalam peti ais sebelah kiri, kemudian tekan butang jana untuk membenarkan kecerdasan AI merangka menu masakan anda.</p>
                  </div>
                )}
              </div>

              {/* Rekod Sejarah Masakan dengan Inline Delete */}
              {history.length > 0 && (
                <div className="bg-[#1f2937]/40 border border-gray-800/80 rounded-3xl p-6 backdrop-blur shadow-xl">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Sejarah Cadangan Resipi</h3>
                  <div className="space-y-2">
                    {history.map((hist) => (
                      <div key={hist.id} className="flex items-center justify-between p-4 bg-[#111827]/60 border border-gray-800 rounded-2xl hover:border-gray-700 transition group">
                        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setAiSuggestions(hist)}>
                          <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
                            <Utensils className="w-4 h-4" />
                          </div>
                          <span className="text-sm font-semibold text-gray-300 group-hover:text-white transition">{hist.title}</span>
                        </div>
                        <button 
                          onClick={() => deleteHistoryItem(hist.id)}
                          className="text-gray-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* BAHAGIAN 2: MAKAN MANA */}
        {activeTab === 'makan-mana' && (
          <div className="space-y-8">
            {/* Kotak Carian Utama */}
            <div className="bg-[#1f2937]/40 border border-gray-800/80 rounded-3xl p-6 backdrop-blur shadow-xl max-w-2xl mx-auto">
              <div className="relative">
                <Search className="absolute left-4 top-3.5 text-gray-500 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Cari kedai makan, jenis masakan (e.g. Mamak, Western) atau lokasi..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-[#111827]/90 border border-gray-700/60 rounded-2xl pl-12 pr-4 py-3.5 text-sm focus:outline-none focus:border-amber-500 text-white placeholder-gray-500 transition"
                />
              </div>
            </div>

            {/* Grid Restoran Terdekat */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {filteredRestaurants.map((res) => (
                <div key={res.id} className="bg-[#1f2937]/40 border border-gray-800/80 rounded-3xl p-5 backdrop-blur shadow-xl flex flex-col justify-between hover:border-gray-700 transition group">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-bold tracking-wider px-2.5 py-1 bg-gray-800 text-amber-400 rounded-lg border border-gray-700/60 uppercase">{res.type}</span>
                      <div className="flex items-center gap-1 text-xs font-bold text-amber-400">
                        <span>★</span> {res.rating}
                      </div>
                    </div>
                    <h3 className="font-bold text-base text-white tracking-tight group-hover:text-amber-400 transition mb-1">{res.name}</h3>
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {res.location}
                    </p>
                  </div>
                  
                  <div className="mt-5 pt-4 border-t border-gray-800/60">
                    <p className="text-xs text-emerald-400 font-medium bg-emerald-500/5 border border-emerald-500/10 rounded-xl px-3 py-2.5 mb-3">{res.promo}</p>
                    <button 
                      onClick={() => {
                        if(!visitedRestaurants.some(item => item.id === res.id)) {
                          setVisitedRestaurants([{...res, visitedAt: new Date().toLocaleTimeString()}, ...visitedRestaurants]);
                        }
                      }}
                      className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition"
                    >
                      Tanda Dikunjungi <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Rekod Restoran Dikunjungi dengan Inline Delete */}
            {visitedRestaurants.length > 0 && (
              <div className="bg-[#1f2937]/40 border border-gray-800/80 rounded-3xl p-6 backdrop-blur shadow-xl max-w-4xl mx-auto">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Senarai Kedai Dikunjungi Hari Ini</h3>
                <div className="space-y-2">
                  {visitedRestaurants.map((vRes) => (
                    <div key={vRes.id} className="flex items-center justify-between p-4 bg-[#111827]/60 border border-gray-800 rounded-2xl hover:border-gray-700 transition">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
                          <Check className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-sm font-semibold text-gray-200">{vRes.name}</span>
                          <span className="text-[10px] text-gray-500 ml-3">Diziarah pada {vRes.visitedAt}</span>
                        </div>
                      </div>
                      <button 
                        onClick={() => deleteVisitedRestaurant(vRes.id)}
                        className="text-gray-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
