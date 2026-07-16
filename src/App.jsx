import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  Camera, ChefHat, MapPin, Plus, Minus, X, Check, Clock, Flame,
  UtensilsCrossed, Sparkles, ScanLine, ChevronRight, ChevronLeft,
  Timer as TimerIcon, PackageOpen, Percent, Star, ChevronDown, CookingPot,
  Soup, Salad, Beef, Fish, Drumstick, Play, Pause, RotateCcw, Trash2,
  Settings, Search, MessageCircle, Send, Lightbulb, AlertTriangle
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* GEMINI SETUP                                                        */
/* ------------------------------------------------------------------ */
/* NOTE: this key still ships inside the client bundle at build time (any
   Vite env var prefixed VITE_ gets inlined into the JS that browsers
   download), so it will be visible in devtools/network tab once deployed.
   Restrict the key in Google AI Studio (HTTP referrer + quota) regardless
   of where it's stored. Set VITE_GEMINI_API_KEY in Vercel → Project →
   Settings → Environment Variables. */
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

function requireGemini() {
  if (!genAI) throw new Error('Gemini API key not configured (VITE_GEMINI_API_KEY missing).');
  return genAI;
}
const visionModel = () => requireGemini().getGenerativeModel({ model: 'gemini-1.5-flash' });
const textModel = () => requireGemini().getGenerativeModel({ model: 'gemini-1.5-flash' });

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function parseQtyString(qtyStr) {
  if (typeof qtyStr === 'number') return { qty: qtyStr, unit: 'pcs' };
  const match = String(qtyStr).trim().match(/^([\d.]+)\s*([a-zA-Z%]*)$/);
  if (match) {
    return { qty: parseFloat(match[1]) || 1, unit: match[2] || 'pcs' };
  }
  return { qty: 1, unit: String(qtyStr) || 'pcs' };
}

async function scanImageWithGemini(base64Data, mimeType) {
  const prompt =
    'Analyze this photo of kitchen or pantry ingredients. Return ONLY a strict JSON array, no markdown fences, no prose, in this exact shape: [{"name":"Ayam","qty":"500g"}]. Use ingredient names as commonly used in Malaysia (Malay or English). Estimate quantity reasonably if unsure.';
  const result = await visionModel().generateContent([
    { inlineData: { data: base64Data, mimeType } },
    prompt,
  ]);
  const raw = result.response.text().replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(raw);
  return parsed.map((item, idx) => {
    const { qty, unit } = parseQtyString(item.qty);
    return { id: `scan-${Date.now()}-${idx}`, name: item.name, qty, unit };
  });
}

async function getChefInsight(pantryNames) {
  const prompt = `Bagi pantri berikut: ${pantryNames.join(', ')}. Tulis SATU ayat witty dan localized (Bahasa Malaysia santai) mengulas kombinasi bahan ini untuk pengguna app memasak. Tiada markdown, tiada tanda petik, terus ayat sahaja, maksimum 22 patah perkataan.`;
  const result = await textModel().generateContent(prompt);
  return result.response.text().trim();
}

async function getSubstitution(ingredientName) {
  const prompt = `Cadangkan SATU pengganti ringkas untuk bahan masakan Malaysia "${ingredientName}" jika ia tiada dalam pantri. Jawab dalam SATU ayat pendek Bahasa Malaysia santai, tiada markdown, tiada tanda petik.`;
  const result = await textModel().generateContent(prompt);
  return result.response.text().trim();
}

async function getBoredomBusterLine(activeCount, cooldownCount) {
  const prompt = `Pengguna ada ${activeCount} pilihan makan baru sekarang dan telah melawat ${cooldownCount} tempat dalam 14 hari lepas. Tulis SATU headline pendek (Bahasa Malaysia, santai, menarik) untuk galakkan mereka cuba sesuatu yang baru hari ini. Tiada markdown, tiada tanda petik, maksimum 16 patah perkataan.`;
  const result = await textModel().generateContent(prompt);
  return result.response.text().trim();
}

async function askChefBot(history, question) {
  const chat = textModel().startChat({
    history: history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
  });
  const prompt = `Anda ialah pembantu memasak & makan mesra bernama Chef JomMakan. Jawab ringkas, mesra, dalam Bahasa Malaysia santai (boleh campur sikit English). Soalan pengguna: ${question}`;
  const result = await chat.sendMessage(prompt);
  return result.response.text().trim();
}

/* ------------------------------------------------------------------ */
/* CONSTANTS & SEED DATA                                              */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'jommakan_state_v1';
const SETTINGS_KEY = 'jommakan_settings_v1';
const FATIGUE_DAYS = 4;
const DINING_COOLDOWN_DAYS = 14;

const RECIPE_ICONS = { rendang: Beef, ayam: Drumstick, ikan: Fish, nasi: Soup, western: Salad };

const RECIPES = [
  {
    id: 'r1',
    name: 'Ayam Masak Merah',
    kind: 'ayam',
    time: 45,
    difficulty: 'Sederhana',
    heroGradient: 'from-sambal to-kaya',
    ingredients: [
      { name: 'Ayam', qty: 500, unit: 'g' },
      { name: 'Bawang Merah', qty: 5, unit: 'pcs' },
      { name: 'Cili Kering', qty: 10, unit: 'pcs' },
      { name: 'Santan', qty: 200, unit: 'ml' },
    ],
    steps: [
      { title: 'Sediakan bahan', desc: 'Potong ayam kepada saiz sederhana. Kisar bawang merah dan cili kering menjadi pes halus.', duration: 0 },
      { title: 'Goreng ayam', desc: 'Goreng ayam sehingga kulit keperangan. Ketepikan.', duration: 300 },
      { title: 'Tumis pes', desc: 'Tumis pes cili dan bawang sehingga naik bau & pecah minyak.', duration: 240 },
      { title: 'Masukkan santan', desc: 'Tuang santan, kacau perlahan dan biarkan mendidih.', duration: 180 },
      { title: 'Simmer bersama ayam', desc: 'Masukkan ayam goreng, kacau sebati dan biarkan kuah pekat.', duration: 420 },
    ],
  },
  {
    id: 'r2',
    name: 'Daging Rendang',
    kind: 'rendang',
    time: 90,
    difficulty: 'Sukar',
    heroGradient: 'from-charcoal to-sambal',
    ingredients: [
      { name: 'Daging', qty: 600, unit: 'g' },
      { name: 'Santan', qty: 400, unit: 'ml' },
      { name: 'Serai', qty: 3, unit: 'pcs' },
      { name: 'Bawang Merah', qty: 6, unit: 'pcs' },
    ],
    steps: [
      { title: 'Sediakan rempah', desc: 'Kisar bawang merah, bawang putih, cili kering dan halia menjadi pes.', duration: 0 },
      { title: 'Tumis rempah', desc: 'Tumis pes bersama serai yang diketuk sehingga wangi.', duration: 300 },
      { title: 'Masukkan daging', desc: 'Masukkan daging, kacau sehingga sebati dengan rempah.', duration: 300 },
      { title: 'Tuang santan', desc: 'Masukkan santan, kacau rata dan biarkan mendidih perlahan.', duration: 300 },
      { title: 'Masak perlahan', desc: 'Kecilkan api, masak sehingga kuah pekat dan berminyak, kacau kerap.', duration: 2400 },
      { title: 'Masukkan kerisik', desc: 'Masukkan kerisik kelapa, kacau sehingga rendang kering & gelap.', duration: 600 },
    ],
  },
  {
    id: 'r3',
    name: 'Nasi Lemak',
    kind: 'nasi',
    time: 40,
    difficulty: 'Mudah',
    heroGradient: 'from-pandan to-kaya',
    ingredients: [
      { name: 'Beras', qty: 400, unit: 'g' },
      { name: 'Santan', qty: 200, unit: 'ml' },
      { name: 'Serai', qty: 1, unit: 'pcs' },
    ],
    steps: [
      { title: 'Basuh beras', desc: 'Basuh beras sehingga air jernih, toskan.', duration: 0 },
      { title: 'Masak dengan santan', desc: 'Masak beras bersama santan, serai dan sedikit garam dalam periuk nasi.', duration: 1200 },
      { title: 'Kukus & hidang', desc: 'Kacau nasi selepas masak, biarkan sebentar sebelum dihidang bersama sambal.', duration: 180 },
    ],
  },
  {
    id: 'r4',
    name: 'Ikan Singgang',
    kind: 'ikan',
    time: 35,
    difficulty: 'Mudah',
    heroGradient: 'from-pandan to-charcoal',
    ingredients: [
      { name: 'Ikan Kembung', qty: 400, unit: 'g' },
      { name: 'Asam Jawa', qty: 50, unit: 'g' },
      { name: 'Serai', qty: 2, unit: 'pcs' },
      { name: 'Bawang Merah', qty: 4, unit: 'pcs' },
    ],
    steps: [
      { title: 'Sediakan kuah asam', desc: 'Rebus air bersama asam jawa, serai dan bawang merah dihiris.', duration: 300 },
      { title: 'Masukkan ikan', desc: 'Masukkan ikan yang telah dibersihkan ke dalam kuah mendidih.', duration: 60 },
      { title: 'Masak sehingga masak', desc: 'Biarkan mendidih perlahan sehingga ikan masak sepenuhnya.', duration: 480 },
    ],
  },
  {
    id: 'r5',
    name: 'Creamy Garlic Chicken Pasta',
    kind: 'western',
    time: 30,
    difficulty: 'Mudah',
    heroGradient: 'from-kaya to-charcoal',
    ingredients: [
      { name: 'Ayam', qty: 300, unit: 'g' },
      { name: 'Bawang Putih', qty: 4, unit: 'pcs' },
      { name: 'Santan', qty: 150, unit: 'ml' },
    ],
    steps: [
      { title: 'Rebus pasta', desc: 'Rebus pasta pilihan anda sehingga al dente. Toskan.', duration: 600 },
      { title: 'Masak ayam', desc: 'Tumis bawang putih cincang, masukkan ayam dipotong dadu sehingga masak.', duration: 360 },
      { title: 'Sos krim', desc: 'Tuang santan, kacau menjadi sos, biarkan pekat sedikit.', duration: 240 },
      { title: 'Gabung & hidang', desc: 'Gaulkan pasta bersama sos, hidang panas-panas.', duration: 60 },
    ],
  },
];

const RESTAURANTS = [
  {
    id: 'd1',
    name: 'Restoran Nasi Kandar Pelita',
    cuisine: 'Nasi Kandar',
    promo: 'RM5 Off Nasi Kandar',
    discountLabel: '-RM5',
    rating: 4.5,
    distance: '0.8 km',
    gradient: 'from-sambal to-charcoal',
  },
  {
    id: 'd2',
    name: 'Warung Sedap Ayam Penyet',
    cuisine: 'Indonesian',
    promo: '20% off total bill',
    discountLabel: '-20%',
    rating: 4.3,
    distance: '1.2 km',
    gradient: 'from-kaya to-sambal',
  },
  {
    id: 'd3',
    name: 'Kedai Kopi Aik Yin',
    cuisine: 'Kopitiam',
    promo: 'Buy 1 Free 1 Kopi O',
    discountLabel: '1-FOR-1',
    rating: 4.6,
    distance: '0.5 km',
    gradient: 'from-charcoal to-pandan',
  },
  {
    id: 'd4',
    name: 'Restoran Sederhana Mamak',
    cuisine: 'Mamak',
    promo: 'RM3 Off Roti Canai Set',
    discountLabel: '-RM3',
    rating: 4.2,
    distance: '2.1 km',
    gradient: 'from-pandan to-kaya',
  },
  {
    id: 'd5',
    name: 'Nasi Ayam Hainan Kak Long',
    cuisine: 'Hainanese',
    promo: '15% off for orders above RM20',
    discountLabel: '-15%',
    rating: 4.7,
    distance: '1.6 km',
    gradient: 'from-sambal to-kaya',
  },
];

/* ------------------------------------------------------------------ */
/* HELPERS                                                             */
/* ------------------------------------------------------------------ */

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota errors */
  }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore quota errors */
  }
}

function daysAgo(dateStr) {
  const then = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

function normalize(str) {
  return String(str).toLowerCase().trim();
}

function findPantryMatch(pantry, ingredientName) {
  const target = normalize(ingredientName);
  return pantry.find((p) => normalize(p.name).includes(target.split(' ')[0]) || target.includes(normalize(p.name).split(' ')[0]));
}

function haptic(ms = 12) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/* ------------------------------------------------------------------ */
/* REUSABLE UI PRIMITIVES                                              */
/* ------------------------------------------------------------------ */

function TapButton({ children, onClick, className = '', disabled, ...rest }) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      onClick={(e) => {
        if (disabled) return;
        haptic();
        onClick?.(e);
      }}
      disabled={disabled}
      className={`select-none active:outline-none ${disabled ? 'opacity-40' : ''} ${className}`}
      {...rest}
    >
      {children}
    </motion.button>
  );
}

function Badge({ children, tone = 'kaya' }) {
  const tones = {
    kaya: 'bg-kaya/90 text-charcoal',
    sambal: 'bg-sambal text-white',
    pandan: 'bg-pandan text-white',
    charcoal: 'bg-charcoal text-white',
    grey: 'bg-charcoal/20 text-charcoal',
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  );
}

function Skeleton({ className = '' }) {
  return (
    <div className={`relative overflow-hidden bg-charcoal/10 rounded-lg ${className}`}>
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent"
        animate={{ x: ['-100%', '100%'] }}
        transition={{ duration: 1.3, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* HEADER: SETTINGS + CLEAR-ALL                                        */
/* ------------------------------------------------------------------ */

function BinConfirmModal({ open, onCancel, onConfirm }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-charcoal/60 flex items-center justify-center px-6"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 16 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            className="glass w-full max-w-xs rounded-3xl p-6 shadow-glass text-center"
          >
            <div className="w-12 h-12 rounded-2xl bg-sambal/15 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={22} className="text-sambal" />
            </div>
            <p className="font-display font-bold text-lg text-charcoal">Kosongkan Semua Data?</p>
            <p className="text-xs text-charcoal/60 mt-2 leading-relaxed">
              Ini akan padam Baki Pantri, Sejarah Masakan dan Sejarah Makan secara kekal.
            </p>
            <div className="flex gap-3 mt-5">
              <TapButton
                onClick={onCancel}
                className="flex-1 py-3 rounded-2xl bg-charcoal/10 text-charcoal font-display font-bold text-sm"
              >
                Batal
              </TapButton>
              <TapButton
                onClick={onConfirm}
                className="flex-1 py-3 rounded-2xl bg-sambal text-white font-display font-bold text-sm"
              >
                Kosongkan
              </TapButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SettingsPanel({ open, onClose, chatEnabled, setChatEnabled }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-charcoal/60 flex items-start justify-end"
          onClick={onClose}
        >
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xs h-full bg-coconut p-6 safe-top safe-bottom shadow-glass"
          >
            <div className="flex items-center justify-between mb-6">
              <p className="font-display font-bold text-xl text-charcoal">Tetapan</p>
              <TapButton onClick={onClose} className="w-9 h-9 rounded-full bg-charcoal/10 flex items-center justify-center">
                <X size={16} className="text-charcoal" />
              </TapButton>
            </div>

            <div className="glass rounded-3xl p-4 flex items-center justify-between shadow-glass">
              <div className="pr-3">
                <p className="text-sm font-display font-bold text-charcoal">Enable Backup AI Chatbot Assistant</p>
                <p className="text-[11px] text-charcoal/50 mt-1">
                  Papar bebuih chat AI terapung di penjuru bawah kanan.
                </p>
              </div>
              <TapButton
                onClick={() => setChatEnabled((v) => !v)}
                className={`w-12 h-7 rounded-full shrink-0 flex items-center px-1 transition-colors ${
                  chatEnabled ? 'bg-pandan justify-end' : 'bg-charcoal/20 justify-start'
                }`}
              >
                <motion.div layout className="w-5 h-5 rounded-full bg-white shadow" />
              </TapButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* BOTTOM NAVIGATION                                                    */
/* ------------------------------------------------------------------ */

function BottomNav({ active, setActive }) {
  const tabs = [
    { id: 'apa', label: 'Makan Apa?', icon: ChefHat },
    { id: 'mana', label: 'Makan Mana?', icon: MapPin },
  ];
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 px-5 pb-5 safe-bottom pointer-events-none">
      <div className="glass-dark pointer-events-auto max-w-md mx-auto rounded-[28px] shadow-glass flex items-center justify-around p-2">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.id;
          return (
            <TapButton
              key={t.id}
              onClick={() => setActive(t.id)}
              className={`relative flex-1 flex flex-col items-center gap-1 py-3 rounded-3xl transition-colors ${
                isActive ? 'text-white' : 'text-white/50'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute inset-0 bg-gradient-to-br from-sambal to-kaya rounded-3xl -z-10"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <Icon size={20} strokeWidth={2.4} />
              <span className="text-[11px] font-display font-bold">{t.label}</span>
            </TapButton>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SCANNER DASHBOARD (REAL GEMINI VISION)                               */
/* ------------------------------------------------------------------ */

function ScannerDashboard({ onIngredientsExtracted }) {
  const [scanning, setScanning] = useState(false);
  const [extracted, setExtracted] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    haptic(20);
    setScanning(true);
    setExtracted(null);
    setError(null);
    try {
      const base64 = await fileToBase64(file);
      const items = await scanImageWithGemini(base64, file.type || 'image/jpeg');
      setExtracted(items);
      haptic(16);
    } catch (err) {
      setError(
        err?.message?.includes('VITE_GEMINI_API_KEY')
          ? 'AI belum dikonfigurasi (VITE_GEMINI_API_KEY tiada di Vercel).'
          : 'Imbasan gagal. Cuba lagi atau tambah bahan secara manual.'
      );
    } finally {
      setScanning(false);
      e.target.value = '';
    }
  };

  const updateQty = (id, delta) => {
    setExtracted((prev) =>
      prev.map((item) => (item.id === id ? { ...item, qty: Math.max(0, item.qty + delta) } : item))
    );
  };

  const removeItem = (id) => {
    setExtracted((prev) => prev.filter((item) => item.id !== id));
  };

  const confirm = () => {
    if (!extracted?.length) return;
    onIngredientsExtracted(extracted);
    setExtracted(null);
  };

  return (
    <div className="mb-6">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />
      <TapButton
        onClick={() => inputRef.current?.click()}
        disabled={scanning}
        className="relative w-full h-44 rounded-3xl overflow-hidden bg-charcoal shadow-glass"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-charcoal via-charcoal to-pandan/40" />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, rgba(233,196,106,0.4), transparent 40%), radial-gradient(circle at 80% 80%, rgba(42,157,143,0.4), transparent 40%)',
          }}
        />
        {scanning && (
          <motion.div
            className="absolute left-0 right-0 h-1.5 bg-kaya shadow-glow"
            animate={{ y: ['0%', '1000%'] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
          />
        )}
        <div className="relative z-10 h-full flex flex-col items-center justify-center gap-3 text-white">
          <motion.div
            animate={scanning ? { scale: [1, 1.15, 1] } : { y: [0, -4, 0] }}
            transition={{ duration: scanning ? 1 : 2.4, repeat: Infinity, ease: 'easeInOut' }}
            className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center"
          >
            {scanning ? <ScanLine size={28} className="text-kaya" /> : <Camera size={28} />}
          </motion.div>
          <div className="text-center">
            <p className="font-display font-bold text-sm">
              {scanning ? 'AI sedang mengimbas bahan...' : 'Imbas Bahan Dapur Anda'}
            </p>
            <p className="text-[11px] text-white/60 mt-0.5">
              {scanning ? 'Mengenal pasti kuantiti dengan Gemini' : 'Ketik untuk snap atau muat naik foto'}
            </p>
          </div>
        </div>
      </TapButton>

      {error && (
        <p className="text-xs text-sambal font-semibold mt-3 px-1">{error}</p>
      )}

      <AnimatePresence>
        {extracted && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 glass rounded-3xl p-4 shadow-glass overflow-hidden"
          >
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={16} className="text-sambal" />
              <p className="font-display font-bold text-sm text-charcoal">Bahan Dikesan</p>
            </div>
            <div className="space-y-2">
              <AnimatePresence>
                {extracted.map((item) => (
                  <motion.div
                    layout
                    key={item.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20, transition: { duration: 0.18 } }}
                    className="flex items-center justify-between bg-white/70 rounded-2xl px-3 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-charcoal truncate">{item.name}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <TapButton
                        onClick={() => updateQty(item.id, item.unit === 'pcs' ? -1 : -50)}
                        className="w-7 h-7 rounded-full bg-charcoal/10 flex items-center justify-center"
                      >
                        <Minus size={13} className="text-charcoal" />
                      </TapButton>
                      <span className="text-xs font-bold w-14 text-center text-charcoal">
                        {item.qty}{item.unit}
                      </span>
                      <TapButton
                        onClick={() => updateQty(item.id, item.unit === 'pcs' ? 1 : 50)}
                        className="w-7 h-7 rounded-full bg-charcoal/10 flex items-center justify-center"
                      >
                        <Plus size={13} className="text-charcoal" />
                      </TapButton>
                      <TapButton
                        onClick={() => removeItem(item.id)}
                        className="w-7 h-7 rounded-full bg-sambal/10 flex items-center justify-center"
                      >
                        <X size={13} className="text-sambal" />
                      </TapButton>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            <TapButton
              onClick={confirm}
              className="w-full mt-4 py-3 rounded-2xl bg-gradient-to-r from-pandan to-charcoal text-white font-display font-bold text-sm flex items-center justify-center gap-2"
            >
              <Check size={16} /> Tambah ke Pantri
            </TapButton>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AMBIENT CHEF INSIGHT BANNER                                          */
/* ------------------------------------------------------------------ */

function ChefInsightBanner({ pantry }) {
  const [insight, setInsight] = useState('');
  const [loading, setLoading] = useState(false);
  const namesKey = useMemo(() => pantry.map((p) => normalize(p.name)).sort().join('|'), [pantry]);

  useEffect(() => {
    if (pantry.length === 0) {
      setInsight('');
      return;
    }
    let cancelled = false;
    setLoading(true);
    getChefInsight(pantry.map((p) => p.name))
      .then((text) => {
        if (!cancelled) setInsight(text);
      })
      .catch(() => {
        if (!cancelled) setInsight('');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey]);

  if (pantry.length === 0) return null;

  return (
    <div className="mb-6 rounded-3xl p-4 bg-gradient-to-r from-charcoal to-charcoal/90 shadow-glass flex items-start gap-3">
      <div className="w-8 h-8 rounded-xl bg-kaya/20 flex items-center justify-center shrink-0 mt-0.5">
        <Lightbulb size={15} className="text-kaya" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-display font-bold text-kaya uppercase tracking-wider mb-1">Chef Insight</p>
        {loading ? (
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ) : (
          <p className="text-xs text-white/90 leading-relaxed">{insight}</p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* PANTRY BALANCE                                                       */
/* ------------------------------------------------------------------ */

function PantryBalance({ pantry, onRemove }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? pantry : pantry.slice(0, 6);

  return (
    <div className="mb-6 glass rounded-3xl p-4 shadow-glass">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <PackageOpen size={16} className="text-pandan" />
          <p className="font-display font-bold text-sm text-charcoal">Baki Pantri</p>
        </div>
        <Badge tone="pandan">{pantry.length} item</Badge>
      </div>
      {pantry.length === 0 ? (
        <p className="text-xs text-charcoal/50 py-2">Pantri kosong. Imbas bahan untuk bermula.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <AnimatePresence>
            {shown.map((item) => (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7, transition: { duration: 0.18 } }}
                className="flex items-center gap-1.5 bg-white/70 rounded-full pl-3 pr-1.5 py-1.5"
              >
                <span className="text-xs font-semibold text-charcoal">
                  {item.name} · {item.qty}{item.unit}
                </span>
                <TapButton
                  onClick={() => onRemove(item.id)}
                  className="w-5 h-5 rounded-full bg-charcoal/10 flex items-center justify-center"
                >
                  <X size={10} className="text-charcoal" />
                </TapButton>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
      {pantry.length > 6 && (
        <TapButton
          onClick={() => setExpanded((e) => !e)}
          className="mt-3 text-xs font-bold text-sambal flex items-center gap-1"
        >
          {expanded ? 'Tunjuk kurang' : `Tunjuk semua (${pantry.length})`}
          <ChevronDown size={13} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </TapButton>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* EMPTY PANTRY STATE                                                   */
/* ------------------------------------------------------------------ */

function EmptyPantryState() {
  return (
    <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-charcoal via-charcoal to-pandan/30 p-8 text-center shadow-glass mb-2">
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(circle at 30% 20%, rgba(233,196,106,0.35), transparent 45%), radial-gradient(circle at 75% 75%, rgba(42,157,143,0.35), transparent 45%)',
        }}
      />
      <motion.div
        className="relative z-10 w-20 h-20 mx-auto rounded-3xl bg-white/10 border border-white/15 flex items-center justify-center shadow-glow"
        animate={{ y: [0, -6, 0], rotate: [0, -2, 2, 0] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <CookingPot size={34} className="text-kaya" />
      </motion.div>
      <p className="relative z-10 font-display font-bold text-white text-base mt-5">
        Pantri anda masih kosong
      </p>
      <p className="relative z-10 text-xs text-white/60 mt-2 leading-relaxed max-w-xs mx-auto">
        Snap gambar bahan-bahan dapur anda untuk mula memasak!
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* RECIPE MATCHING                                                      */
/* ------------------------------------------------------------------ */

function scoreRecipe(recipe, pantry) {
  let have = 0;
  recipe.ingredients.forEach((ing) => {
    const match = findPantryMatch(pantry, ing.name);
    if (match && match.qty >= ing.qty) have += 1;
    else if (match) have += 0.5;
  });
  return have / recipe.ingredients.length;
}

function RecipeCard({ recipe, pantry, cookedInfo, onOpen }) {
  const match = scoreRecipe(recipe, pantry);
  const matchPct = Math.round(match * 100);
  const Icon = RECIPE_ICONS[recipe.kind] || CookingPot;
  const isFatigued = cookedInfo && cookedInfo.days < FATIGUE_DAYS;

  return (
    <TapButton
      onClick={() => onOpen(recipe)}
      className={`w-full text-left rounded-3xl overflow-hidden shadow-glass mb-4 relative ${
        isFatigued ? 'grayscale opacity-60' : ''
      }`}
    >
      <div className={`h-28 bg-gradient-to-br ${recipe.heroGradient} relative flex items-end p-4`}>
        <Icon size={72} className="absolute -right-2 -top-2 text-white/15" strokeWidth={1.2} />
        <div className="relative z-10 flex items-center gap-2">
          <Badge tone="charcoal">{recipe.difficulty}</Badge>
          <Badge tone="kaya">
            <span className="flex items-center gap-1"><Clock size={11} /> {recipe.time} min</span>
          </Badge>
        </div>
        {isFatigued && (
          <div className="absolute top-3 right-3">
            <Badge tone="grey">Dimasak {cookedInfo.days}h lalu</Badge>
          </div>
        )}
      </div>
      <div className="bg-white p-4">
        <p className="font-display font-bold text-charcoal">{recipe.name}</p>
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-charcoal/10 overflow-hidden">
            <div
              className={`h-full rounded-full ${matchPct >= 80 ? 'bg-pandan' : matchPct >= 40 ? 'bg-kaya' : 'bg-sambal'}`}
              style={{ width: `${matchPct}%` }}
            />
          </div>
          <span className="text-[11px] font-bold text-charcoal/60 shrink-0">{matchPct}% padan</span>
        </div>
      </div>
    </TapButton>
  );
}

/* ------------------------------------------------------------------ */
/* SMART SUBSTITUTION BADGE                                             */
/* ------------------------------------------------------------------ */

function SubstitutionBadge({ ingredientName }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getSubstitution(ingredientName)
      .then((t) => {
        if (!cancelled) setText(t);
      })
      .catch(() => {
        if (!cancelled) setText('');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingredientName]);

  if (loading) {
    return <Skeleton className="h-6 w-full mt-1.5" />;
  }
  if (!text) return null;

  return (
    <div className="mt-1.5 bg-kaya/15 rounded-xl px-3 py-2 flex items-start gap-2">
      <span className="text-sm shrink-0">💡</span>
      <p className="text-[11px] text-charcoal/80 leading-relaxed">
        <span className="font-bold">AI Sub:</span> {text}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* TUTORIAL MODE (STEP CAROUSEL + TIMER)                                */
/* ------------------------------------------------------------------ */

function StepTimer({ duration }) {
  const [remaining, setRemaining] = useState(duration);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    setRemaining(duration);
    setRunning(false);
  }, [duration]);

  useEffect(() => {
    if (running && remaining > 0) {
      intervalRef.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) {
            clearInterval(intervalRef.current);
            setRunning(false);
            haptic(40);
            return 0;
          }
          return r - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [running]);

  if (!duration) return null;

  const pct = ((duration - remaining) / duration) * 100;

  return (
    <div className="glass rounded-3xl p-4 mt-4 flex items-center gap-4">
      <div className="relative w-16 h-16 shrink-0">
        <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90">
          <circle cx="32" cy="32" r="28" fill="none" stroke="#1D355720" strokeWidth="6" />
          <circle
            cx="32" cy="32" r="28" fill="none" stroke="#E63946" strokeWidth="6"
            strokeDasharray={2 * Math.PI * 28}
            strokeDashoffset={2 * Math.PI * 28 * (1 - pct / 100)}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <TimerIcon size={18} className="text-charcoal/50" />
        </div>
      </div>
      <div className="flex-1">
        <p className="font-display font-bold text-lg text-charcoal">{formatTime(remaining)}</p>
        <p className="text-[11px] text-charcoal/50">Pemasa langkah</p>
      </div>
      <div className="flex gap-2">
        <TapButton
          onClick={() => setRemaining(duration)}
          className="w-10 h-10 rounded-full bg-charcoal/10 flex items-center justify-center"
        >
          <RotateCcw size={16} className="text-charcoal" />
        </TapButton>
        <TapButton
          onClick={() => setRunning((r) => !r)}
          disabled={remaining === 0}
          className="w-10 h-10 rounded-full bg-sambal flex items-center justify-center"
        >
          {running ? <Pause size={16} className="text-white" /> : <Play size={16} className="text-white ml-0.5" />}
        </TapButton>
      </div>
    </div>
  );
}

function TutorialMode({ recipe, onClose, onFinish }) {
  const [stepIdx, setStepIdx] = useState(0);
  const step = recipe.steps[stepIdx];
  const isLast = stepIdx === recipe.steps.length - 1;

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 32, stiffness: 260 }}
      className="fixed inset-0 z-50 bg-coconut flex flex-col safe-top safe-bottom"
    >
      <div className={`h-40 bg-gradient-to-br ${recipe.heroGradient} relative shrink-0 flex flex-col justify-between p-5`}>
        <div className="flex items-center justify-between">
          <TapButton onClick={onClose} className="w-9 h-9 rounded-full bg-black/20 flex items-center justify-center">
            <X size={18} className="text-white" />
          </TapButton>
          <Badge tone="grey">{stepIdx + 1} / {recipe.steps.length}</Badge>
        </div>
        <p className="font-display font-bold text-xl text-white">{recipe.name}</p>
        <div className="flex gap-1.5">
          {recipe.steps.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= stepIdx ? 'bg-white' : 'bg-white/25'}`} />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={stepIdx}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.25 }}
          >
            <Badge tone="sambal">Langkah {stepIdx + 1}</Badge>
            <p className="font-display font-bold text-2xl text-charcoal mt-3">{step.title}</p>
            <p className="text-sm text-charcoal/70 mt-2 leading-relaxed">{step.desc}</p>
            <StepTimer key={stepIdx} duration={step.duration} />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="p-5 flex gap-3 shrink-0">
        <TapButton
          onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
          disabled={stepIdx === 0}
          className="w-14 h-14 rounded-2xl bg-charcoal/10 flex items-center justify-center"
        >
          <ChevronLeft size={22} className="text-charcoal" />
        </TapButton>
        <TapButton
          onClick={() => (isLast ? onFinish(recipe) : setStepIdx((i) => i + 1))}
          className="flex-1 h-14 rounded-2xl bg-gradient-to-r from-sambal to-kaya text-white font-display font-bold flex items-center justify-center gap-2"
        >
          {isLast ? (
            <>Selesai Memasak <Check size={18} /></>
          ) : (
            <>Langkah Seterusnya <ChevronRight size={18} /></>
          )}
        </TapButton>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* MODULE 1: MAKAN APA?                                                 */
/* ------------------------------------------------------------------ */

function MakanApa({ pantry, setPantry, cookedHistory, setCookedHistory }) {
  const [activeRecipe, setActiveRecipe] = useState(null);
  const [tutorialRecipe, setTutorialRecipe] = useState(null);

  const addIngredients = useCallback((items) => {
    setPantry((prev) => {
      const next = [...prev];
      items.forEach((item) => {
        const existing = next.find((p) => normalize(p.name) === normalize(item.name));
        if (existing) {
          existing.qty += item.qty;
        } else {
          next.push({ id: `pantry-${Date.now()}-${Math.random()}`, name: item.name, qty: item.qty, unit: item.unit });
        }
      });
      return next;
    });
  }, [setPantry]);

  const removePantryItem = (id) => setPantry((prev) => prev.filter((p) => p.id !== id));

  const cookedInfoFor = (recipeId) => {
    const entry = cookedHistory.find((h) => h.recipeId === recipeId);
    if (!entry) return null;
    return { days: daysAgo(entry.date) };
  };

  const sortedRecipes = useMemo(() => {
    return [...RECIPES].sort((a, b) => {
      const aInfo = cookedInfoFor(a.id);
      const bInfo = cookedInfoFor(b.id);
      const aFatigued = aInfo && aInfo.days < FATIGUE_DAYS;
      const bFatigued = bInfo && bInfo.days < FATIGUE_DAYS;
      if (aFatigued !== bFatigued) return aFatigued ? 1 : -1;
      return scoreRecipe(b, pantry) - scoreRecipe(a, pantry);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pantry, cookedHistory]);

  const finishCooking = (recipe) => {
    setPantry((prev) => {
      const next = [...prev];
      recipe.ingredients.forEach((ing) => {
        const match = next.find((p) => normalize(p.name).includes(normalize(ing.name).split(' ')[0]));
        if (match) match.qty = Math.max(0, match.qty - ing.qty);
      });
      return next;
    });
    setCookedHistory((prev) => [
      ...prev.filter((h) => h.recipeId !== recipe.id),
      { recipeId: recipe.id, date: new Date().toISOString() },
    ]);
    setTutorialRecipe(null);
    setActiveRecipe(null);
    haptic(30);
  };

  return (
    <div className="px-5 pt-4">
      <ScannerDashboard onIngredientsExtracted={addIngredients} />
      <PantryBalance pantry={pantry} onRemove={removePantryItem} />
      <ChefInsightBanner pantry={pantry} />

      {pantry.length === 0 ? (
        <EmptyPantryState />
      ) : (
        <>
          <div className="flex items-center gap-2 mb-4">
            <Flame size={16} className="text-sambal" />
            <p className="font-display font-bold text-sm text-charcoal">Cadangan Resepi</p>
          </div>

          {sortedRecipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              pantry={pantry}
              cookedInfo={cookedInfoFor(recipe.id)}
              onOpen={setActiveRecipe}
            />
          ))}
        </>
      )}

      <AnimatePresence>
        {activeRecipe && !tutorialRecipe && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-charcoal/60 flex items-end"
            onClick={() => setActiveRecipe(null)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 260 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-coconut rounded-t-[32px] p-6 safe-bottom max-h-[80vh] overflow-y-auto"
            >
              <div className="w-10 h-1.5 bg-charcoal/20 rounded-full mx-auto mb-5" />
              <p className="font-display font-bold text-2xl text-charcoal">{activeRecipe.name}</p>
              <div className="flex gap-2 mt-2">
                <Badge tone="sambal">{activeRecipe.difficulty}</Badge>
                <Badge tone="pandan"><span className="flex items-center gap-1"><Clock size={11} />{activeRecipe.time} min</span></Badge>
              </div>
              <p className="font-display font-bold text-sm text-charcoal mt-5 mb-2">Bahan Diperlukan</p>
              <div className="space-y-2">
                {activeRecipe.ingredients.map((ing, i) => {
                  const match = findPantryMatch(pantry, ing.name);
                  const enough = match && match.qty >= ing.qty;
                  return (
                    <div key={i} className="bg-white/70 rounded-xl px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-charcoal font-medium">{ing.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-charcoal/50">{ing.qty}{ing.unit}</span>
                          {enough ? (
                            <Check size={14} className="text-pandan" />
                          ) : (
                            <X size={14} className="text-sambal" />
                          )}
                        </div>
                      </div>
                      {!enough && <SubstitutionBadge ingredientName={ing.name} />}
                    </div>
                  );
                })}
              </div>
              <TapButton
                onClick={() => setTutorialRecipe(activeRecipe)}
                className="w-full mt-6 py-4 rounded-2xl bg-gradient-to-r from-sambal to-kaya text-white font-display font-bold flex items-center justify-center gap-2"
              >
                <ChefHat size={18} /> Mula Memasak
              </TapButton>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {tutorialRecipe && (
          <TutorialMode
            recipe={tutorialRecipe}
            onClose={() => setTutorialRecipe(null)}
            onFinish={finishCooking}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* MODULE 2: MAKAN MANA?                                                */
/* ------------------------------------------------------------------ */

function BoredomBusterHeadline({ activeCount, cooldownCount }) {
  const [line, setLine] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getBoredomBusterLine(activeCount, cooldownCount)
      .then((t) => {
        if (!cancelled) setLine(t);
      })
      .catch(() => {
        if (!cancelled) setLine('');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCount, cooldownCount]);

  return (
    <div className="mb-5 rounded-3xl p-4 bg-gradient-to-r from-sambal to-kaya shadow-glass">
      {loading ? (
        <div className="space-y-1.5">
          <Skeleton className="h-3.5 w-3/4 bg-white/30" />
          <Skeleton className="h-3.5 w-1/2 bg-white/30" />
        </div>
      ) : (
        <p className="font-display font-bold text-white text-sm leading-snug">{line}</p>
      )}
    </div>
  );
}

function RestaurantCard({ restaurant, onMarkEaten, cooldownDays }) {
  return (
    <motion.div layout className="rounded-3xl overflow-hidden shadow-glass mb-4">
      <div className={`h-24 bg-gradient-to-br ${restaurant.gradient} relative flex items-center justify-between p-4`}>
        <UtensilsCrossed size={64} className="absolute -right-2 -bottom-3 text-white/15" strokeWidth={1.2} />
        <div className="relative z-10">
          <Badge tone="kaya"><span className="flex items-center gap-1"><Percent size={11} />{restaurant.discountLabel}</span></Badge>
        </div>
        <div className="relative z-10 flex items-center gap-1 bg-black/20 rounded-full px-2 py-1">
          <Star size={11} className="text-kaya fill-kaya" />
          <span className="text-[11px] font-bold text-white">{restaurant.rating}</span>
        </div>
      </div>
      <div className="bg-white p-4">
        <p className="font-display font-bold text-charcoal">{restaurant.name}</p>
        <p className="text-xs text-charcoal/50 mt-0.5">{restaurant.cuisine} · {restaurant.distance}</p>
        <p className="text-sm text-sambal font-semibold mt-2">{restaurant.promo}</p>
        {cooldownDays != null ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-charcoal/50">
            <Clock size={12} /> Melawat {cooldownDays} hari lalu
          </div>
        ) : (
          <TapButton
            onClick={() => onMarkEaten(restaurant.id)}
            className="w-full mt-3 py-2.5 rounded-xl bg-charcoal/5 text-charcoal font-display font-bold text-xs flex items-center justify-center gap-2"
          >
            <Check size={14} /> Tandakan Makan Di Sini Hari Ini
          </TapButton>
        )}
      </div>
    </motion.div>
  );
}

function MakanMana({ diningHistory, setDiningHistory }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState('');

  const markEaten = (id) => {
    setDiningHistory((prev) => [
      ...prev.filter((h) => h.restaurantId !== id),
      { restaurantId: id, date: new Date().toISOString() },
    ]);
    haptic(24);
  };

  const cooldownDaysFor = (id) => {
    const entry = diningHistory.find((h) => h.restaurantId === id);
    if (!entry) return null;
    const d = daysAgo(entry.date);
    return d < DINING_COOLDOWN_DAYS ? d : null;
  };

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return RESTAURANTS;
    return RESTAURANTS.filter(
      (r) =>
        normalize(r.name).includes(q) ||
        normalize(r.cuisine).includes(q) ||
        normalize(r.promo).includes(q)
    );
  }, [query]);

  const active = filtered.filter((r) => cooldownDaysFor(r.id) == null);
  const onCooldown = filtered.filter((r) => cooldownDaysFor(r.id) != null);

  return (
    <div className="px-5 pt-4 pb-4">
      <BoredomBusterHeadline activeCount={active.length} cooldownCount={onCooldown.length} />

      <div className="relative mb-5">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-charcoal/40" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari nama, jenis makanan atau promosi..."
          className="w-full glass rounded-2xl pl-11 pr-4 py-3 text-sm text-charcoal placeholder:text-charcoal/40 outline-none focus:ring-2 focus:ring-sambal/40"
        />
        {query && (
          <TapButton
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-charcoal/10 flex items-center justify-center"
          >
            <X size={12} className="text-charcoal" />
          </TapButton>
        )}
      </div>

      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={16} className="text-sambal" />
        <p className="font-display font-bold text-sm text-charcoal">Promo Berhampiran</p>
      </div>

      {active.length === 0 && (
        <p className="text-xs text-charcoal/50 mb-4">Tiada hasil carian dalam senarai aktif.</p>
      )}

      {active.map((r) => (
        <RestaurantCard key={r.id} restaurant={r} onMarkEaten={markEaten} cooldownDays={null} />
      ))}

      {onCooldown.length > 0 && (
        <div className="mt-2">
          <TapButton
            onClick={() => setDrawerOpen((o) => !o)}
            className="w-full flex items-center justify-between glass rounded-2xl px-4 py-3"
          >
            <span className="text-xs font-display font-bold text-charcoal">
              Baru Dilawati (Cooldown) · {onCooldown.length}
            </span>
            <ChevronDown size={16} className={`text-charcoal transition-transform ${drawerOpen ? 'rotate-180' : ''}`} />
          </TapButton>
          <AnimatePresence>
            {drawerOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-4">
                  {onCooldown.map((r) => (
                    <div key={r.id} className="grayscale opacity-60">
                      <RestaurantCard restaurant={r} onMarkEaten={markEaten} cooldownDays={cooldownDaysFor(r.id)} />
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* BACKUP AI CHATBOT (OPT-IN, FLOATING)                                 */
/* ------------------------------------------------------------------ */

function ChatBubble() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const send = async () => {
    const question = input.trim();
    if (!question || loading) return;
    setInput('');
    const nextMessages = [...messages, { role: 'user', text: question }];
    setMessages(nextMessages);
    setLoading(true);
    try {
      const reply = await askChefBot(messages, question);
      setMessages((prev) => [...prev, { role: 'model', text: reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'model', text: 'Maaf, ada masalah sambungan. Cuba lagi sekejap.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="fixed bottom-28 right-5 z-40">
        <TapButton
          onClick={() => setOpen((o) => !o)}
          className="w-14 h-14 rounded-full bg-gradient-to-br from-sambal to-kaya shadow-glow flex items-center justify-center"
        >
          {open ? <X size={22} className="text-white" /> : <MessageCircle size={22} className="text-white" />}
        </TapButton>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed bottom-44 right-5 z-40 w-[85vw] max-w-sm h-[60vh] glass rounded-3xl shadow-glass flex flex-col overflow-hidden"
          >
            <div className="px-4 py-3 bg-charcoal/90 flex items-center gap-2 shrink-0">
              <ChefHat size={16} className="text-kaya" />
              <p className="text-white font-display font-bold text-sm">Chef JomMakan</p>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <p className="text-xs text-charcoal/50 text-center mt-6">
                  Tanya apa-apa pasal masakan atau tempat makan!
                </p>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[80%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                    m.role === 'user'
                      ? 'ml-auto bg-sambal text-white rounded-br-md'
                      : 'mr-auto bg-white/80 text-charcoal rounded-bl-md'
                  }`}
                >
                  {m.text}
                </div>
              ))}
              {loading && (
                <div className="mr-auto max-w-[60%]">
                  <Skeleton className="h-8 w-full rounded-2xl" />
                </div>
              )}
            </div>
            <div className="p-3 flex items-center gap-2 bg-white/50 shrink-0">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Taip soalan anda..."
                className="flex-1 bg-white rounded-full px-4 py-2.5 text-xs text-charcoal outline-none"
              />
              <TapButton
                onClick={send}
                disabled={loading || !input.trim()}
                className="w-9 h-9 rounded-full bg-sambal flex items-center justify-center shrink-0"
              >
                <Send size={14} className="text-white" />
              </TapButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* ROOT APP                                                             */
/* ------------------------------------------------------------------ */

export default function App() {
  const [active, setActive] = useState('apa');
  const [pantry, setPantry] = useState([]);
  const [cookedHistory, setCookedHistory] = useState([]);
  const [diningHistory, setDiningHistory] = useState([]);
  const [binConfirmOpen, setBinConfirmOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatEnabled, setChatEnabled] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    const saved = loadState();
    if (saved) {
      setPantry(saved.pantry ?? []);
      setCookedHistory(saved.cookedHistory ?? []);
      setDiningHistory(saved.diningHistory ?? []);
    }
    const settings = loadSettings();
    if (settings) {
      setChatEnabled(Boolean(settings.chatEnabled));
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    saveState({ pantry, cookedHistory, diningHistory });
  }, [pantry, cookedHistory, diningHistory]);

  useEffect(() => {
    if (!hydrated.current) return;
    saveSettings({ chatEnabled });
  }, [chatEnabled]);

  const clearAllData = () => {
    setPantry([]);
    setCookedHistory([]);
    setDiningHistory([]);
    setBinConfirmOpen(false);
    haptic(30);
  };

  return (
    <div className="min-h-screen bg-coconut safe-top">
      <header className="px-5 pt-6 pb-2 flex items-center justify-between">
        <div>
          <p className="font-display font-extrabold text-2xl text-charcoal leading-tight">JomMakan</p>
          <p className="text-xs text-charcoal/50 font-medium">Apa & Mana</p>
        </div>
        <div className="flex items-center gap-2">
          <TapButton
            onClick={() => setSettingsOpen(true)}
            className="w-10 h-10 rounded-2xl bg-charcoal/5 flex items-center justify-center"
          >
            <Settings size={17} className="text-charcoal/70" />
          </TapButton>
          <TapButton
            onClick={() => setBinConfirmOpen(true)}
            className="w-10 h-10 rounded-2xl bg-charcoal/5 flex items-center justify-center"
          >
            <Trash2 size={17} className="text-charcoal/70" />
          </TapButton>
          <motion.div
            className="w-11 h-11 rounded-2xl bg-gradient-to-br from-sambal to-kaya flex items-center justify-center shadow-glow animate-floatSlow"
          >
            <CookingPot size={20} className="text-white" />
          </motion.div>
        </div>
      </header>

      <main className="pb-32">
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, x: active === 'apa' ? -16 : 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: active === 'apa' ? 16 : -16 }}
            transition={{ duration: 0.22 }}
          >
            {active === 'apa' ? (
              <MakanApa
                pantry={pantry}
                setPantry={setPantry}
                cookedHistory={cookedHistory}
                setCookedHistory={setCookedHistory}
              />
            ) : (
              <MakanMana diningHistory={diningHistory} setDiningHistory={setDiningHistory} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <BottomNav active={active} setActive={setActive} />

      {chatEnabled && <ChatBubble />}

      <BinConfirmModal
        open={binConfirmOpen}
        onCancel={() => setBinConfirmOpen(false)}
        onConfirm={clearAllData}
      />
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        chatEnabled={chatEnabled}
        setChatEnabled={setChatEnabled}
      />
    </div>
  );
}
