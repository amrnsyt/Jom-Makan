import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Camera, ChefHat, MapPin, Plus, Minus, X, Check, Clock, Flame,
  UtensilsCrossed, Sparkles, ScanLine, Trash2, ChevronRight, ChevronLeft,
  Timer as TimerIcon, PackageOpen, Percent, Star, ChevronDown, CookingPot,
  Soup, Salad, Beef, Fish, Drumstick, Play, Pause, RotateCcw,
  Search, Loader2, AlertCircle, Upload
} from 'lucide-react';
import { getApiKey, analyzePantryImage, generateRecipes, findNearbyHalalRestaurants } from './lib/gemini';

/* ------------------------------------------------------------------ */
/* CONSTANTS & SEED DATA                                              */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'jommakan_state_v1';
const FATIGUE_DAYS = 4;
const DINING_COOLDOWN_DAYS = 14;

const RECIPE_ICONS = { rendang: Beef, ayam: Drumstick, ikan: Fish, nasi: Soup, western: Salad };

const SEED_PANTRY = [
  { id: 'p1', name: 'Ayam (Chicken)', qty: 1000, unit: 'g' },
  { id: 'p2', name: 'Bawang Merah (Shallots)', qty: 8, unit: 'pcs' },
  { id: 'p3', name: 'Santan (Coconut Milk)', qty: 400, unit: 'ml' },
  { id: 'p4', name: 'Daging (Beef)', qty: 600, unit: 'g' },
  { id: 'p5', name: 'Beras (Rice)', qty: 2000, unit: 'g' },
  { id: 'p6', name: 'Cili Kering (Dried Chilies)', qty: 20, unit: 'pcs' },
  { id: 'p7', name: 'Ikan Kembung (Mackerel)', qty: 500, unit: 'g' },
  { id: 'p8', name: 'Bawang Putih (Garlic)', qty: 10, unit: 'pcs' },
  { id: 'p9', name: 'Serai (Lemongrass)', qty: 6, unit: 'pcs' },
  { id: 'p10', name: 'Asam Jawa (Tamarind)', qty: 100, unit: 'g' },
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

function daysAgo(dateStr) {
  const then = new Date(dateStr).getTime();
  const now = Date.now();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

function normalize(str) {
  return str.toLowerCase().trim();
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

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      resolve(String(result).split(',')[1] || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function friendlyGeminiError(err) {
  if (err?.message === 'MISSING_API_KEY') {
    return 'Gemini API key belum ditetapkan di pelayan. Sila hubungi pentadbir aplikasi.';
  }
  if (err?.message === 'GEMINI_TIMEOUT') {
    return 'Gemini mengambil masa terlalu lama untuk bertindak balas. Sila cuba lagi.';
  }
  if (err?.message === 'GEMINI_NETWORK_ERROR') {
    return 'Tiada sambungan ke Gemini. Semak internet anda dan cuba lagi.';
  }
  return 'Gagal berhubung dengan Gemini. Sila cuba lagi.';
}

/* ------------------------------------------------------------------ */
/* REUSABLE UI PRIMITIVES                                              */
/* ------------------------------------------------------------------ */

function TapButton({ children, onClick, className = '', disabled, ...rest }) {
  const [ripples, setRipples] = useState([]);

  const addRipple = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.8;
    const x = (e.clientX ?? rect.left + rect.width / 2) - rect.left - size / 2;
    const y = (e.clientY ?? rect.top + rect.height / 2) - rect.top - size / 2;
    const id = Date.now() + Math.random();
    setRipples((prev) => [...prev, { id, x, y, size }]);
    setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== id)), 600);
  };

  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={(e) => {
        if (disabled) return;
        addRipple(e);
        haptic();
        onClick?.(e);
      }}
      disabled={disabled}
      className={`relative overflow-hidden select-none active:outline-none ${disabled ? 'opacity-40' : ''} ${className}`}
      {...rest}
    >
      {children}
      {ripples.map((r) => (
        <span
          key={r.id}
          className="md-ripple absolute rounded-full bg-white/50 pointer-events-none"
          style={{ left: r.x, top: r.y, width: r.size, height: r.size }}
        />
      ))}
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
/* SCANNER DASHBOARD                                                    */
/* ------------------------------------------------------------------ */

function ScannerDashboard({ onIngredientsExtracted }) {
  const [scanning, setScanning] = useState(false);
  const [extracted, setExtracted] = useState(null);
  const [error, setError] = useState('');
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const triggerScan = (ref) => {
    if (!getApiKey()) {
      setError('Gemini API key belum ditetapkan di pelayan. Sila hubungi pentadbir aplikasi.');
      return;
    }
    setError('');
    ref.current?.click();
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    haptic(20);
    setScanning(true);
    setExtracted(null);
    setError('');

    try {
      const base64 = await fileToBase64(file);
      const items = await analyzePantryImage(base64, file.type || 'image/jpeg');
      if (!items.length) {
        setError('Tiada bahan dikesan dalam imej. Cuba lagi dengan imej yang lebih jelas.');
      } else {
        setExtracted(items.map((i, idx) => ({ ...i, id: `scan-${Date.now()}-${idx}` })));
        haptic(16);
      }
    } catch (err) {
      setError(friendlyGeminiError(err));
    } finally {
      setScanning(false);
    }
  };

  const updateField = (id, field, value) => {
    setExtracted((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
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
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="hidden"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        className="hidden"
      />

      <div className="relative w-full rounded-3xl overflow-hidden bg-charcoal shadow-glass">
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
            className="absolute left-0 right-0 h-1.5 bg-kaya shadow-glow z-10"
            animate={{ y: ['0%', '3000%'] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
          />
        )}
        <div className="relative z-10 px-5 pt-6 pb-5 flex flex-col items-center text-white">
          <motion.div
            animate={scanning ? { scale: [1, 1.15, 1] } : { y: [0, -4, 0] }}
            transition={{ duration: scanning ? 1 : 2.4, repeat: Infinity, ease: 'easeInOut' }}
            className="w-14 h-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center"
          >
            {scanning ? <ScanLine size={24} className="text-kaya" /> : <PackageOpen size={24} />}
          </motion.div>
          <div className="text-center mt-3">
            <p className="font-display font-bold text-sm">
              {scanning ? 'Gemini sedang menganalisis...' : 'Imbas Bahan Dapur Anda'}
            </p>
            <p className="text-[11px] text-white/60 mt-0.5">
              {scanning ? 'Mengenal pasti bahan, kuantiti & saiz' : 'Ambil gambar atau muat naik imej bahan dapur'}
            </p>
          </div>

          <div className="w-full flex gap-2.5 mt-4">
            <TapButton
              onClick={() => triggerScan(cameraInputRef)}
              disabled={scanning}
              className="flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-2xl bg-white/10 border border-white/15"
            >
              <Camera size={20} />
              <span className="text-[11px] font-display font-bold">Ambil Gambar</span>
            </TapButton>
            <TapButton
              onClick={() => triggerScan(fileInputRef)}
              disabled={scanning}
              className="flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-2xl bg-white/10 border border-white/15"
            >
              <Upload size={20} />
              <span className="text-[11px] font-display font-bold">Muat Naik Fail</span>
            </TapButton>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 text-xs text-sambal font-semibold px-1">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <AnimatePresence>
        {extracted && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 glass rounded-3xl p-4 shadow-glass overflow-hidden"
          >
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={16} className="text-sambal" />
              <p className="font-display font-bold text-sm text-charcoal">Bahan Dikesan</p>
            </div>
            <p className="text-[11px] text-charcoal/50 mb-3">Sunting nama, kuantiti & unit jika perlu.</p>
            <div className="space-y-2">
              {extracted.map((item) => (
                <div key={item.id} className="bg-white/70 rounded-2xl px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => updateField(item.id, 'name', e.target.value)}
                      className="flex-1 min-w-0 text-sm font-semibold text-charcoal bg-transparent outline-none border-b border-transparent focus:border-charcoal/20"
                    />
                    <TapButton
                      onClick={() => removeItem(item.id)}
                      className="w-7 h-7 rounded-full bg-sambal/10 flex items-center justify-center shrink-0"
                    >
                      <X size={13} className="text-sambal" />
                    </TapButton>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <TapButton
                      onClick={() => updateQty(item.id, item.unit === 'pcs' ? -1 : -50)}
                      className="w-7 h-7 rounded-full bg-charcoal/10 flex items-center justify-center shrink-0"
                    >
                      <Minus size={13} className="text-charcoal" />
                    </TapButton>
                    <input
                      type="number"
                      value={item.qty}
                      onChange={(e) => updateField(item.id, 'qty', Math.max(0, Number(e.target.value) || 0))}
                      className="w-16 text-xs font-bold text-center text-charcoal bg-charcoal/5 rounded-lg py-1.5 outline-none"
                    />
                    <TapButton
                      onClick={() => updateQty(item.id, item.unit === 'pcs' ? 1 : 50)}
                      className="w-7 h-7 rounded-full bg-charcoal/10 flex items-center justify-center shrink-0"
                    >
                      <Plus size={13} className="text-charcoal" />
                    </TapButton>
                    <select
                      value={item.unit}
                      onChange={(e) => updateField(item.id, 'unit', e.target.value)}
                      className="text-xs font-bold text-charcoal bg-charcoal/5 rounded-lg py-1.5 px-2 outline-none ml-auto"
                    >
                      <option value="g">g</option>
                      <option value="ml">ml</option>
                      <option value="pcs">pcs</option>
                    </select>
                  </div>
                </div>
              ))}
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
          {shown.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
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

function RecipeCard({ recipe, pantry, cookedInfo, onOpen, onDelete }) {
  const match = scoreRecipe(recipe, pantry);
  const matchPct = Math.round(match * 100);
  const Icon = RECIPE_ICONS[recipe.kind] || CookingPot;
  const isFatigued = cookedInfo && cookedInfo.days < FATIGUE_DAYS;

  return (
    <motion.div
      layout
      className={`relative rounded-3xl overflow-hidden shadow-glass mb-4 ${isFatigued ? 'grayscale opacity-60' : ''}`}
    >
      <TapButton onClick={() => onOpen(recipe)} className="w-full text-left block">
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
      <TapButton
        onClick={(e) => {
          e.stopPropagation();
          onDelete(recipe.id);
        }}
        className="absolute top-3 left-3 w-8 h-8 rounded-full bg-black/25 flex items-center justify-center z-20"
      >
        <Trash2 size={14} className="text-white" />
      </TapButton>
    </motion.div>
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

function MakanApa({ pantry, setPantry, cookedHistory, setCookedHistory, recipes, setRecipes }) {
  const [activeRecipe, setActiveRecipe] = useState(null);
  const [tutorialRecipe, setTutorialRecipe] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');

  const addIngredients = useCallback((items) => {
    let nextPantry = pantry;
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
      nextPantry = next;
      return next;
    });

    setGenerating(true);
    setGenError('');
    generateRecipes(nextPantry)
      .then((newRecipes) => setRecipes(newRecipes))
      .catch((err) => setGenError(friendlyGeminiError(err)))
      .finally(() => setGenerating(false));
  }, [pantry, setPantry, setRecipes]);

  const removePantryItem = (id) => setPantry((prev) => prev.filter((p) => p.id !== id));

  const removeRecipe = (id) => {
    setRecipes((prev) => prev.filter((r) => r.id !== id));
    setActiveRecipe((cur) => (cur?.id === id ? null : cur));
    setTutorialRecipe((cur) => (cur?.id === id ? null : cur));
  };

  const cookedInfoFor = (recipeId) => {
    const entry = cookedHistory.find((h) => h.recipeId === recipeId);
    if (!entry) return null;
    return { days: daysAgo(entry.date) };
  };

  const sortedRecipes = useMemo(() => {
    return [...recipes].sort((a, b) => {
      const aInfo = cookedInfoFor(a.id);
      const bInfo = cookedInfoFor(b.id);
      const aFatigued = aInfo && aInfo.days < FATIGUE_DAYS;
      const bFatigued = bInfo && bInfo.days < FATIGUE_DAYS;
      if (aFatigued !== bFatigued) return aFatigued ? 1 : -1;
      return scoreRecipe(b, pantry) - scoreRecipe(a, pantry);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pantry, cookedHistory, recipes]);

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

      <div className="flex items-center gap-2 mb-4">
        <Flame size={16} className="text-sambal" />
        <p className="font-display font-bold text-sm text-charcoal">Cadangan Resepi</p>
        {generating && <Loader2 size={14} className="text-sambal animate-spin ml-1" />}
      </div>

      {genError && (
        <div className="mb-4 flex items-center gap-2 text-xs text-sambal font-semibold">
          <AlertCircle size={14} /> {genError}
        </div>
      )}

      {!generating && recipes.length === 0 && !genError && (
        <p className="text-xs text-charcoal/50 mb-4">Belum ada resepi. Imbas bahan dapur di atas untuk dapatkan cadangan.</p>
      )}

      {sortedRecipes.map((recipe) => (
        <RecipeCard
          key={recipe.id}
          recipe={recipe}
          pantry={pantry}
          cookedInfo={cookedInfoFor(recipe.id)}
          onOpen={setActiveRecipe}
          onDelete={removeRecipe}
        />
      ))}

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
                    <div key={i} className="flex items-center justify-between bg-white/70 rounded-xl px-3 py-2">
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

function RestaurantSkeleton() {
  return (
    <div className="rounded-[28px] bg-white shadow-md mb-4 overflow-hidden border border-charcoal/5">
      <div className="h-20 md-shimmer" />
      <div className="p-4 space-y-2.5">
        <div className="h-3 w-2/3 rounded-full md-shimmer" />
        <div className="h-3 w-1/3 rounded-full md-shimmer" />
        <div className="h-12 rounded-2xl md-shimmer mt-1" />
      </div>
    </div>
  );
}

function RestaurantCard({ restaurant, onMarkEaten, onDelete, cooldownDays }) {
  const stars = Math.round(restaurant.rating || 0);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[28px] bg-white shadow-md mb-4 overflow-hidden border border-charcoal/5"
    >
      <div className={`relative h-20 bg-gradient-to-br ${restaurant.gradient} flex items-center px-4`}>
        <UtensilsCrossed size={72} className="absolute -right-3 -bottom-4 text-white/10" strokeWidth={1.2} />
        <div className="relative z-10 w-11 h-11 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
          <UtensilsCrossed size={20} className="text-white" />
        </div>
        <div className="relative z-10 ml-3 flex-1 min-w-0">
          <p className="font-display font-bold text-white truncate">{restaurant.name}</p>
          <div className="flex items-center gap-0.5 mt-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} size={10} className={i < stars ? 'text-kaya fill-kaya' : 'text-white/25'} />
            ))}
            <span className="text-[10px] text-white/70 ml-1 font-semibold">{restaurant.rating}</span>
          </div>
        </div>
        <TapButton
          onClick={() => onDelete(restaurant.id)}
          className="relative z-10 w-8 h-8 rounded-full bg-black/20 flex items-center justify-center shrink-0"
        >
          <Trash2 size={14} className="text-white" />
        </TapButton>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          {restaurant.cuisine && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-charcoal/60 bg-charcoal/5 rounded-full px-2.5 py-1">
              <Soup size={11} /> {restaurant.cuisine}
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-charcoal/60 bg-charcoal/5 rounded-full px-2.5 py-1">
            <MapPin size={11} /> {restaurant.distance}
          </span>
          {restaurant.dateAvailability && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-pandan bg-pandan/10 rounded-full px-2.5 py-1">
              <Clock size={11} /> {restaurant.dateAvailability}
            </span>
          )}
        </div>

        <div className="flex items-start gap-2 bg-sambal/[0.08] rounded-2xl px-3 py-2.5">
          <Percent size={14} className="text-sambal shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-display font-bold text-sambal">{restaurant.discountLabel}</p>
            {restaurant.promo && <p className="text-xs text-charcoal/70 mt-0.5">{restaurant.promo}</p>}
          </div>
        </div>

        {cooldownDays != null ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-charcoal/50">
            <Clock size={12} /> Melawat {cooldownDays} hari lalu
          </div>
        ) : (
          <TapButton
            onClick={() => onMarkEaten(restaurant.id)}
            className="w-full mt-3 py-2.5 rounded-xl bg-charcoal text-white font-display font-bold text-xs flex items-center justify-center gap-2 shadow-sm"
          >
            <Check size={14} /> Tandakan Makan Di Sini Hari Ini
          </TapButton>
        )}
      </div>
    </motion.div>
  );
}

const SORT_OPTIONS = [
  { key: 'nearest', label: 'Terdekat' },
  { key: 'rating', label: 'Rating Tertinggi' },
];

function MakanMana({ diningHistory, setDiningHistory, restaurants, setRestaurants, searching, searchError, onSearch }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sortBy, setSortBy] = useState('nearest');

  const markEaten = (id) => {
    setDiningHistory((prev) => [
      ...prev.filter((h) => h.restaurantId !== id),
      { restaurantId: id, date: new Date().toISOString() },
    ]);
    haptic(24);
  };

  const removeRestaurant = (id) => {
    setRestaurants((prev) => prev.filter((r) => r.id !== id));
  };

  const cooldownDaysFor = (id) => {
    const entry = diningHistory.find((h) => h.restaurantId === id);
    if (!entry) return null;
    const d = daysAgo(entry.date);
    return d < DINING_COOLDOWN_DAYS ? d : null;
  };

  const parseDistance = (d) => parseFloat(String(d || '').replace(/[^\d.]/g, '')) || 999;

  const sortList = (list) => {
    const copy = [...list];
    if (sortBy === 'rating') copy.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    else copy.sort((a, b) => parseDistance(a.distance) - parseDistance(b.distance));
    return copy;
  };

  const active = sortList(restaurants.filter((r) => cooldownDaysFor(r.id) == null));
  const onCooldown = restaurants.filter((r) => cooldownDaysFor(r.id) != null);
  const hasResults = restaurants.length > 0;

  return (
    <div className="px-5 pt-4 pb-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-sambal" />
          <p className="font-display font-bold text-sm text-charcoal">Promo Berhampiran</p>
        </div>
        {hasResults && !searching && (
          <TapButton
            onClick={onSearch}
            className="flex items-center gap-1 text-[11px] font-display font-bold text-charcoal/50 bg-charcoal/5 rounded-full px-3 py-1.5"
          >
            <RotateCcw size={11} /> Cari Semula
          </TapButton>
        )}
      </div>

      {searching && (
        <div className="mb-4">
          <div className="flex items-center gap-2 text-xs text-charcoal/50 font-semibold mb-3">
            <Loader2 size={14} className="animate-spin text-sambal" /> Gemini sedang mencari promosi berhampiran...
          </div>
          <RestaurantSkeleton />
          <RestaurantSkeleton />
        </div>
      )}

      {searchError && (
        <div className="mb-4 flex items-center gap-2 text-xs text-sambal font-semibold bg-sambal/[0.08] rounded-2xl px-3.5 py-3">
          <AlertCircle size={16} className="shrink-0" /> {searchError}
        </div>
      )}

      {!searching && !hasResults && !searchError && (
        <div className="rounded-[28px] bg-gradient-to-br from-charcoal to-pandan/70 p-6 text-center overflow-hidden relative">
          <MapPin size={120} className="absolute -right-6 -bottom-8 text-white/5" strokeWidth={1} />
          <div className="relative z-10">
            <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center mx-auto mb-4">
              <Percent size={26} className="text-kaya" />
            </div>
            <p className="font-display font-bold text-lg text-white">Cari Promosi Hari Ini</p>
            <p className="text-xs text-white/60 mt-1.5 leading-relaxed max-w-[240px] mx-auto">
              Gemini akan imbas gerai & restoran halal berhampiran anda untuk diskaun & promosi yang aktif hari ini.
            </p>
            <TapButton
              onClick={onSearch}
              className="mt-5 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-sambal to-kaya text-white text-sm font-display font-bold shadow-lg shadow-sambal/30"
            >
              <Search size={15} /> Cari Sekarang
            </TapButton>
          </div>
        </div>
      )}

      {!searching && hasResults && (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] text-charcoal/45 font-semibold">
              {active.length} promosi ditemui berhampiran
            </p>
            <div className="flex items-center gap-1.5">
              {SORT_OPTIONS.map((opt) => (
                <TapButton
                  key={opt.key}
                  onClick={() => setSortBy(opt.key)}
                  className={`text-[11px] font-display font-bold rounded-full px-3 py-1.5 ${
                    sortBy === opt.key ? 'bg-charcoal text-white' : 'bg-charcoal/5 text-charcoal/50'
                  }`}
                >
                  {opt.label}
                </TapButton>
              ))}
            </div>
          </div>

          {active.length === 0 && (
            <p className="text-xs text-charcoal/50 mb-4">Semua pilihan dalam cooldown. Semak drawer di bawah.</p>
          )}

          {active.map((r) => (
            <RestaurantCard key={r.id} restaurant={r} onMarkEaten={markEaten} onDelete={removeRestaurant} cooldownDays={null} />
          ))}
        </>
      )}

      {onCooldown.length > 0 && (
        <div className="mt-2">
          <TapButton
            onClick={() => setDrawerOpen((o) => !o)}
            className="w-full flex items-center justify-between bg-white shadow-sm border border-charcoal/5 rounded-2xl px-4 py-3.5"
          >
            <span className="flex items-center gap-2 text-xs font-display font-bold text-charcoal">
              <Clock size={14} className="text-charcoal/40" />
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
                      <RestaurantCard restaurant={r} onMarkEaten={markEaten} onDelete={removeRestaurant} cooldownDays={cooldownDaysFor(r.id)} />
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
/* ROOT APP                                                             */
/* ------------------------------------------------------------------ */

export default function App() {
  const [active, setActive] = useState('apa');
  const [pantry, setPantry] = useState(SEED_PANTRY);
  const [recipes, setRecipes] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [cookedHistory, setCookedHistory] = useState([]);
  const [diningHistory, setDiningHistory] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [notFoundOpen, setNotFoundOpen] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    const saved = loadState();
    if (saved) {
      setPantry(saved.pantry ?? SEED_PANTRY);
      setRecipes(saved.recipes ?? []);
      setRestaurants(saved.restaurants ?? []);
      setCookedHistory(saved.cookedHistory ?? []);
      setDiningHistory(saved.diningHistory ?? []);
    }
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    saveState({ pantry, recipes, restaurants, cookedHistory, diningHistory });
  }, [pantry, recipes, restaurants, cookedHistory, diningHistory]);

  const searchNearby = () => {
    if (!getApiKey()) {
      setSearchError('Gemini API key belum ditetapkan di pelayan. Sila hubungi pentadbir aplikasi.');
      return;
    }
    if (!navigator.geolocation) {
      setSearchError('Peranti tidak menyokong geolokasi.');
      return;
    }

    setSearching(true);
    setSearchError('');
    setNotFoundOpen(false);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        findNearbyHalalRestaurants(pos.coords.latitude, pos.coords.longitude)
          .then((results) => {
            if (!results.length) {
              setSearchError('Tiada promosi/diskaun makan halal ditemui berhampiran hari ini.');
              setNotFoundOpen(true);
            } else {
              setRestaurants(results);
              haptic(20);
            }
          })
          .catch((err) => {
            console.error('[JomMakan] findNearbyHalalRestaurants failed:', err);
            setSearchError(friendlyGeminiError(err));
          })
          .finally(() => setSearching(false));
      },
      (err) => {
        setSearchError(
          err?.code === 1
            ? 'Kebenaran lokasi ditolak. Sila benarkan akses lokasi di tetapan pelayar.'
            : 'Tidak dapat mengesan lokasi anda. Sila pastikan GPS dihidupkan.'
        );
        setSearching(false);
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
    );
  };

  return (
    <div className="min-h-screen bg-coconut safe-top">
      <div className="max-w-md mx-auto">
        <header className="px-5 pt-6 pb-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-display font-extrabold text-2xl text-charcoal leading-tight">JomMakan</p>
              <p className="text-xs text-charcoal/50 font-medium">Apa & Mana</p>
            </div>
            {active === 'mana' && (
              <TapButton
                onClick={searchNearby}
                disabled={searching}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-gradient-to-r from-sambal to-kaya text-white text-xs font-display font-bold shadow-lg shadow-sambal/30 shrink-0"
              >
                {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                Cari
              </TapButton>
            )}
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
                  recipes={recipes}
                  setRecipes={setRecipes}
                />
              ) : (
                <MakanMana
                  diningHistory={diningHistory}
                  setDiningHistory={setDiningHistory}
                  restaurants={restaurants}
                  setRestaurants={setRestaurants}
                  searching={searching}
                  searchError={searchError}
                  onSearch={searchNearby}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <BottomNav active={active} setActive={setActive} />

      <AnimatePresence>
        {notFoundOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-charcoal/60 flex items-end"
            onClick={() => setNotFoundOpen(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 260 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md mx-auto bg-coconut rounded-t-[32px] p-6 safe-bottom"
            >
              <div className="w-10 h-1.5 bg-charcoal/20 rounded-full mx-auto mb-5" />
              <div className="w-14 h-14 rounded-2xl bg-sambal/10 flex items-center justify-center mx-auto mb-4">
                <Search size={24} className="text-sambal" />
              </div>
              <p className="font-display font-bold text-xl text-charcoal text-center">Tiada Promosi Ditemui</p>
              <p className="text-xs text-charcoal/50 text-center mt-1">
                Gemini tidak menjumpai sebarang promosi/diskaun makan halal berhampiran anda hari ini.
              </p>
              <div className="mt-5 bg-white/70 rounded-2xl p-4">
                <p className="text-xs font-display font-bold text-charcoal mb-2.5">Kemungkinan sebab:</p>
                <ul className="text-xs text-charcoal/60 space-y-1.5 list-disc pl-4">
                  <li>Tiada gerai/restoran berhampiran mempunyai tawaran istimewa aktif buat masa ini.</li>
                  <li>Lokasi GPS peranti anda mungkin tidak tepat atau kurang jelas.</li>
                  <li>Maklumat promosi terkini mungkin belum diindeks oleh carian Google.</li>
                  <li>Kawasan anda mungkin mempunyai liputan gerai halal yang terhad.</li>
                </ul>
              </div>
              <TapButton
                onClick={() => setNotFoundOpen(false)}
                className="w-full mt-5 py-3 rounded-2xl bg-gradient-to-r from-sambal to-kaya text-white font-display font-bold text-sm flex items-center justify-center gap-2"
              >
                <Check size={16} /> OK, Faham
              </TapButton>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
