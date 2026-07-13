```react
import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square, Repeat, ArrowRight, Music, Video, Image as ImageIcon, List, MonitorPlay, Loader2, Globe } from 'lucide-react';

// --- DICTIONARY ---
const DICT = {
  vi: {
    restoring: 'Đang khôi phục kịch bản âm thanh...',
    screenOn: 'Màn hình: LUÔN SÁNG',
    fadeSettings: 'Cài đặt Fade',
    cancel: 'Hủy',
    save: 'LƯU',
    seekTime: 'Dò Thời Gian',
    done: 'HOÀN TẤT',
    addAudio: '🎵 THÊM BÀI HÁT',
    fadeSetup: '⚙️ CHỈNH FADE',
    empty: 'TRỐNG'
  },
  en: {
    restoring: 'Restoring audio session...',
    screenOn: 'Screen: ALWAYS ON',
    fadeSettings: 'Fade Settings',
    cancel: 'Cancel',
    save: 'SAVE',
    seekTime: 'Seek Time',
    done: 'DONE',
    addAudio: '🎵 ADD AUDIO',
    fadeSetup: '⚙️ FADE SETUP',
    empty: 'EMPTY'
  }
};

// --- FORMATTER ---
const formatTime = (timeInSeconds) => {
  if (isNaN(timeInSeconds)) return '00:00:00';
  const h = Math.floor(timeInSeconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((timeInSeconds % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(timeInSeconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
};

// --- DATABASE HELPER (INDEXED DB) ---
const DB_NAME = 'TanMixPro_AudioDB';
const STORE_NAME = 'audio_files';

const initDB = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = (e) => {
    e.target.result.createObjectStore(STORE_NAME);
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const saveAudioToDB = async (id, file) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(file, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const loadAudioFromDB = async (id) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

// --- MOCK DATA INITIALIZER ---
const generateInitialChannels = () => Array.from({ length: 64 }, (_, i) => ({
  id: i + 1,
  name: i === 0 ? 'Applause' : i === 1 ? 'Child' : i === 2 ? 'Dog' : i === 3 ? 'Drum Roll' : i === 4 ? 'Glass Break' : `Audio ${i + 1}`,
  volume: 100,
  isPlaying: false,
  isPaused: false,
  audioUrl: null,
  loop: false,
  fadeIn: 0,
  fadeOut: 0,
  color: 'red',
  originalDuration: '00:00:00',
  hasAudioData: false,
}));

const TABS = [
  { id: 'audio1', label: 'Audio 1-16', start: 0, end: 16, icon: Music },
  { id: 'audio2', label: 'Audio 17-32', start: 16, end: 32, icon: Music },
  { id: 'audio3', label: 'Audio 33-48', start: 32, end: 48, icon: Music },
  { id: 'audio4', label: 'Audio 49-64', start: 48, end: 64, icon: Music },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('audio1');
  const [channels, setChannels] = useState([]);
  const [masterVolume, setMasterVolume] = useState(100);
  const [isAppReady, setIsAppReady] = useState(false);
  const [lang, setLang] = useState('vi');

  const wakeLockRef = useRef(null);

  // --- WAKE LOCK ---
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        }
      } catch (err) {
        console.error(`Lỗi Wake Lock: ${err.name}, ${err.message}`);
      }
    };
    requestWakeLock();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    };
  }, []);

  // --- AUTO LOAD SESSION ---
  useEffect(() => {
    const restoreSession = async () => {
      const savedSettings = localStorage.getItem('TanMixPro_Settings');
      let loadedChannels = generateInitialChannels();
      
      if (savedSettings) {
        const parsedSettings = JSON.parse(savedSettings);
        loadedChannels = loadedChannels.map(ch => {
          const saved = parsedSettings.find(s => s.id === ch.id);
          if (saved) return { ...ch, ...saved, isPlaying: false, isPaused: false };
          return ch;
        });
      }

      const fullyLoadedChannels = await Promise.all(loadedChannels.map(async (ch) => {
        if (ch.hasAudioData) {
          try {
            const blob = await loadAudioFromDB(ch.id);
            if (blob) return { ...ch, audioUrl: URL.createObjectURL(blob) };
          } catch (error) {
            console.error(`Failed to load audio for AUDIO ${ch.id}`, error);
          }
        }
        return ch;
      }));

      setChannels(fullyLoadedChannels);
      const savedMasterVol = localStorage.getItem('TanMixPro_MasterVol');
      if (savedMasterVol) setMasterVolume(Number(savedMasterVol));
      setIsAppReady(true);
    };

    restoreSession();
  }, []);

  const saveSessionSettings = (updatedChannels) => {
    const settingsToSave = updatedChannels.map(ch => ({
      id: ch.id, name: ch.name, volume: ch.volume, loop: ch.loop, fadeIn: ch.fadeIn, fadeOut: ch.fadeOut, color: ch.color, originalDuration: ch.originalDuration, hasAudioData: !!ch.audioUrl,
    }));
    localStorage.setItem('TanMixPro_Settings', JSON.stringify(settingsToSave));
  };

  const handleMasterVolumeChange = (vol) => {
    setMasterVolume(vol);
    localStorage.setItem('TanMixPro_MasterVol', vol);
  };

  const setChannelState = (id, stateStr) => {
    setChannels(prev => prev.map(ch => {
      if (ch.id === id) {
        if (stateStr === 'PLAYING') return { ...ch, isPlaying: true, isPaused: false };
        if (stateStr === 'PAUSED') return { ...ch, isPlaying: false, isPaused: true };
        if (stateStr === 'STOPPED') return { ...ch, isPlaying: false, isPaused: false };
      }
      return ch;
    }));
  };

  const updateVolume = (id, newVolume) => {
    setChannels(prev => {
      const next = prev.map(ch => ch.id === id ? { ...ch, volume: parseInt(newVolume) } : ch);
      saveSessionSettings(next); return next;
    });
  };

  const updateChannelSettings = (id, settings) => {
    setChannels(prev => {
      const next = prev.map(ch => ch.id === id ? { ...ch, ...settings } : ch);
      saveSessionSettings(next); return next;
    });
  };
  
  const toggleLoop = (id) => {
    setChannels(prev => {
      const next = prev.map(ch => ch.id === id ? { ...ch, loop: !ch.loop } : ch);
      saveSessionSettings(next); return next;
    });
  };

  const handleAudioLoad = async (id, file) => {
    const url = URL.createObjectURL(file);
    setChannels(prev => {
      const next = prev.map(ch => {
        if (ch.id === id) {
          if (ch.audioUrl) URL.revokeObjectURL(ch.audioUrl);
          return {
            ...ch, audioUrl: url, name: file.name.replace(/\.[^/.]+$/, "").substring(0, 15) + (file.name.length > 15 ? '...' : ''), isPlaying: false, isPaused: false, hasAudioData: true
          };
        }
        return ch;
      });
      saveSessionSettings(next); return next;
    });
    await saveAudioToDB(id, file);
  };

  if (!isAppReady) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center">
        <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mb-4" />
        <h2 className="text-xl font-bold tracking-wider">TẤN Mix-Pro</h2>
        <p className="text-zinc-500 text-sm mt-2">{DICT[lang].restoring}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-300 font-sans select-none flex flex-col h-screen overflow-hidden">
      
      {/* HEADER / TABS */}
      <div className="bg-[#0a0a0a] flex items-center px-2 pt-2 overflow-x-auto border-b border-[#222] hide-scrollbar flex-shrink-0 shadow-md z-10">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center px-5 py-2.5 min-w-[100px] rounded-t-md transition-all ${isActive ? 'bg-[#2a2a2a] text-white border-t-2 border-emerald-500 shadow-[0_-5px_15px_rgba(16,185,129,0.05)]' : 'bg-[#0a0a0a] hover:bg-[#1a1a1a] text-zinc-500 border-t-2 border-transparent'}`}
            >
              <Icon size={16} className={`mb-1 ${isActive ? 'text-emerald-400' : ''}`} />
              <span className="text-[10px] font-bold tracking-wider whitespace-nowrap">{tab.label}</span>
            </button>
          );
        })}
        
        <div className="flex-grow"></div>
        
        {/* NÚT CHUYỂN ĐỔI NGÔN NGỮ */}
        <button 
          onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')}
          className="bg-[#111] text-zinc-400 font-bold text-[10px] px-3 py-1.5 rounded hover:bg-[#222] hover:text-white active:scale-95 transition-all mr-6 border border-[#333] flex items-center gap-1.5 shadow-md"
          title="Change Language"
        >
          <Globe size={14} />
          {lang === 'vi' ? 'ENGLISH' : 'TIẾNG VIỆT'}
        </button>

        <button className="bg-gradient-to-b from-amber-300 to-amber-500 text-black font-extrabold text-xs px-6 py-2 rounded shadow-[0_0_15px_rgba(251,191,36,0.2)] hover:shadow-[0_0_20px_rgba(251,191,36,0.4)] active:scale-95 transition-all mb-1 mr-2 whitespace-nowrap border border-amber-200">
          TẤN Mix-Pro
        </button>
      </div>

      {/* MAIN WORKSPACE - Nền True Black (#050505) */}
      <div className="flex flex-1 overflow-hidden p-2.5 gap-2.5 bg-[#050505]">
        <div className="flex-1 overflow-y-auto hide-scrollbar pr-1 relative">
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2.5 pb-20">
            {channels.map((channel, index) => {
              const currentTab = TABS.find(t => t.id === activeTab);
              const isVisible = index >= currentTab.start && index < currentTab.end;
              return (
                <ChannelPad 
                  key={channel.id} 
                  channel={channel} 
                  isVisible={isVisible}
                  masterVolume={masterVolume}
                  onSetState={(stateStr) => setChannelState(channel.id, stateStr)}
                  onVolumeChange={(v) => updateVolume(channel.id, v)}
                  onUpdateSettings={(settings) => updateChannelSettings(channel.id, settings)}
                  onAudioLoad={handleAudioLoad}
                  onToggleLoop={() => toggleLoop(channel.id)}
                  lang={lang}
                />
              );
            })}
          </div>
        </div>

        {/* MASTER SLIDER PANEL - Màu Titanium Gray sáng sủa nổi bật */}
        <div className="w-16 md:w-20 bg-[#2a2a2a] rounded-lg border border-[#444] p-2 flex flex-col items-center shadow-[0_10px_30px_rgba(0,0,0,0.8)] flex-shrink-0 relative">
          <div className="w-full bg-[#111] border border-[#2a2a2a] rounded py-1 mb-2 text-center shadow-inner">
             <span className="text-[10px] text-zinc-400 font-extrabold tracking-widest">MASTER</span>
          </div>
          
          <div className="flex-1 relative w-full flex justify-center items-center py-4 h-32 md:h-40">
             <input
              type="range"
              min="0"
              max="100"
              value={masterVolume}
              onChange={(e) => handleMasterVolumeChange(e.target.value)}
              className="volume-fader absolute w-28 md:w-32 h-2 outline-none cursor-pointer"
              style={{ transform: 'rotate(-90deg)' }}
            />
          </div>
          <div className="w-full bg-[#0a0a0a] border border-[#1a1a1a] rounded py-1 mt-2 text-center shadow-inner">
             <span className="text-[11px] font-mono font-bold text-emerald-400">{masterVolume}%</span>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        
        /* GIAO DIỆN BÀN MIXER (FADER) */
        .volume-fader {
          -webkit-appearance: none;
          appearance: none;
          background: #0a0a0a;
          border: 1px solid #1a1a1a;
          border-radius: 6px;
          box-shadow: inset 0 2px 5px rgba(0,0,0,1);
        }
        
        .volume-fader::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          height: 26px;
          width: 16px;
          background: linear-gradient(to bottom, #e4e4e7, #71717a, #e4e4e7);
          border: 1px solid #111;
          border-radius: 3px;
          cursor: pointer;
          box-shadow: 0px 3px 6px rgba(0,0,0,0.9), inset 0 1px 1px rgba(255,255,255,0.5);
        }
        
        .volume-fader::-moz-range-thumb {
          height: 26px;
          width: 16px;
          background: linear-gradient(to bottom, #e4e4e7, #71717a, #e4e4e7);
          border: 1px solid #111;
          border-radius: 3px;
          cursor: pointer;
          box-shadow: 0px 3px 6px rgba(0,0,0,0.9), inset 0 1px 1px rgba(255,255,255,0.5);
        }
      `}} />
    </div>
  );
}

// --- SUB COMPONENTS ---

function ChannelPad({ channel, isVisible, onSetState, onVolumeChange, onAudioLoad, masterVolume, onUpdateSettings, onToggleLoop, lang }) {
  const t = DICT[lang];
  const isPlaying = channel.isPlaying;
  const isPaused = channel.isPaused;
  const baseNumber = channel.id.toString().padStart(2, '0'); 

  const audioRef = useRef(null);
  const fileInputRef = useRef(null);
  const fadeIntervalRef = useRef(null);
  const isFadingOutRef = useRef(false);

  const volumeRef = useRef({ channel: channel.volume, master: masterVolume });

  const [currentTimeStr, setCurrentTimeStr] = useState('00:00:00');
  const [durationStr, setDurationStr] = useState(channel.originalDuration);
  
  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSeeker, setShowSeeker] = useState(false);
  const [tempFadeIn, setTempFadeIn] = useState(0);
  const [tempFadeOut, setTempFadeOut] = useState(0);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.pause();
    }
  }, []);

  useEffect(() => {
    volumeRef.current = { channel: channel.volume, master: masterVolume };
    if (audioRef.current && isPlaying && !fadeIntervalRef.current && !isFadingOutRef.current) {
      audioRef.current.volume = (channel.volume / 100) * (masterVolume / 100);
    }
  }, [channel.volume, masterVolume, isPlaying]);

  const playAction = () => {
    if (!audioRef.current || !channel.audioUrl) return;
    clearInterval(fadeIntervalRef.current);
    fadeIntervalRef.current = null;
    isFadingOutRef.current = false;
    audioRef.current.loop = channel.loop;

    if (channel.fadeIn > 0 && !isPaused) {
      audioRef.current.volume = 0;
      audioRef.current.play().then(() => {
        const duration = channel.fadeIn * 1000;
        const startTime = Date.now();
        fadeIntervalRef.current = setInterval(() => {
          const elapsed = Date.now() - startTime;
          const targetVol = (volumeRef.current.channel / 100) * (volumeRef.current.master / 100);
          if (elapsed >= duration) {
            audioRef.current.volume = targetVol;
            clearInterval(fadeIntervalRef.current);
            fadeIntervalRef.current = null;
          } else {
            audioRef.current.volume = (elapsed / duration) * targetVol;
          }
        }, 20); 
      }).catch(e => console.log(e));
    } else {
      audioRef.current.volume = (volumeRef.current.channel / 100) * (volumeRef.current.master / 100);
      audioRef.current.play().catch(e => console.log(e));
    }
    onSetState('PLAYING');
  };

  const stopAction = () => {
    if (!audioRef.current) return;
    if (isFadingOutRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
      isFadingOutRef.current = false;
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setCurrentTimeStr('00:00:00');
      setCurrentSec(0);
      onSetState('STOPPED');
      return;
    }
    if (channel.fadeOut > 0 && isPlaying) {
      isFadingOutRef.current = true;
      const startVol = audioRef.current.volume;
      const duration = channel.fadeOut * 1000;
      const startTime = Date.now();
      fadeIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        if (elapsed >= duration) {
          audioRef.current.volume = 0;
          clearInterval(fadeIntervalRef.current);
          fadeIntervalRef.current = null;
          isFadingOutRef.current = false;
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
          setCurrentTimeStr('00:00:00');
          setCurrentSec(0);
          onSetState('STOPPED');
        } else {
          audioRef.current.volume = startVol * (1 - (elapsed / duration));
        }
      }, 20);
    } else {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setCurrentTimeStr('00:00:00');
      setCurrentSec(0);
      onSetState('STOPPED');
    }
  };

  const pauseAction = () => {
    if (!audioRef.current) return;
    clearInterval(fadeIntervalRef.current);
    fadeIntervalRef.current = null;
    isFadingOutRef.current = false;
    audioRef.current.pause();
    onSetState('PAUSED');
  };

  const handleMainPadClick = () => {
    if (!channel.audioUrl) return;
    if (isPlaying) stopAction(); else playAction();
  };

  const handlePlayPauseClick = () => {
    if (isPlaying) pauseAction(); else playAction();
  };

  const handleAudioEnded = () => {
    onSetState('STOPPED');
    setCurrentTimeStr('00:00:00');
    setCurrentSec(0);
    if (audioRef.current) audioRef.current.currentTime = 0;
  };

  const openSettings = () => {
    setTempFadeIn(channel.fadeIn || 0);
    setTempFadeOut(channel.fadeOut || 0);
    setShowSettings(true);
    setIsMenuOpen(false);
  };

  const colorMap = {
    red: { bg: 'bg-[#dc2626]', text: 'text-white' },
    green: { bg: 'bg-[#059669]', text: 'text-white' },
    blue: { bg: 'bg-[#2563eb]', text: 'text-white' },
    yellow: { bg: 'bg-[#d97706]', text: 'text-white' }
  };

  const activeColor = channel.color || 'red'; 
  const theme = colorMap[activeColor];

  // Action Pad: Độ tương phản cao
  const padColor = !channel.audioUrl 
    ? 'bg-[#111] text-[#555] border border-[#333] border-dashed cursor-not-allowed shadow-inner' 
    : isPlaying 
      ? 'bg-[#00e676] text-black font-black shadow-[0_0_20px_rgba(0,230,118,0.4)] border border-[#00c853]'
      : isPaused 
        ? 'bg-[#ffea00] text-black font-black shadow-[0_0_15px_rgba(255,234,0,0.3)] border border-[#ffd600]' 
        : 'bg-[#990000] text-zinc-100 hover:bg-[#b30000] shadow-[inset_0_1px_4px_rgba(255,255,255,0.2),0_2px_4px_rgba(0,0,0,0.5)] border border-[#660000]';

  const cueBadgeClass = channel.audioUrl 
    ? `${theme.bg} ${theme.text} px-2 py-0.5 rounded shadow-sm border border-black/50` 
    : 'text-[#666]';

  const zIndexClass = (isMenuOpen || showSettings || showSeeker) ? 'z-[100] shadow-[0_0_20px_rgba(0,0,0,0.8)]' : 'z-0';

  return (
    // THAY ĐỔI LỚN TẠI ĐÂY: Dùng Titanium Gray (#2a2a2a) sáng sủa, tách biệt rõ ràng với True Black (#050505) của App
    <div className={`bg-[#27272a] rounded-lg border border-[#3f3f46] p-2 flex-col items-center hover:bg-[#303036] hover:border-[#52525b] transition-all relative group shadow-lg ${isVisible ? 'flex' : 'hidden'} ${zIndexClass}`}>
      
      {showSettings && (
        <div className="absolute inset-[-1px] bg-[#18181b] z-[120] flex flex-col items-center justify-center p-3 rounded-lg border border-[#3f3f46] shadow-[0_15px_40px_rgba(0,0,0,1)]">
          <h4 className="text-[11px] font-bold mb-3 text-white uppercase tracking-wider">{t.fadeSettings}</h4>
          <div className="w-full flex justify-between items-center mb-2 bg-[#27272a] p-1.5 rounded border border-[#3f3f46]">
             <span className="text-[10px] text-zinc-400 font-bold">IN (s):</span>
             <input type="number" min="0" step="1" value={tempFadeIn} onChange={e => setTempFadeIn(Number(e.target.value))} className="w-12 bg-black text-xs font-mono p-1 rounded text-center border border-[#18181b] outline-none text-white"/>
          </div>
          <div className="w-full flex justify-between items-center mb-4 bg-[#27272a] p-1.5 rounded border border-[#3f3f46]">
             <span className="text-[10px] text-zinc-400 font-bold">OUT (s):</span>
             <input type="number" min="0" step="1" value={tempFadeOut} onChange={e => setTempFadeOut(Number(e.target.value))} className="w-12 bg-black text-xs font-mono p-1 rounded text-center border border-[#18181b] outline-none text-white"/>
          </div>
          <div className="flex w-full gap-2">
             <button onClick={() => setShowSettings(false)} className="flex-1 bg-[#3f3f46] py-2 text-xs font-bold rounded hover:bg-[#52525b] text-zinc-300 transition-colors border border-[#52525b]">{t.cancel}</button>
             <button onClick={() => { onUpdateSettings({ fadeIn: tempFadeIn, fadeOut: tempFadeOut }); setShowSettings(false); }} className="flex-1 bg-emerald-600 text-white py-2 text-xs font-bold rounded hover:bg-emerald-500 transition-colors border border-emerald-700">{t.save}</button>
          </div>
        </div>
      )}

      {showSeeker && (
        <div className="absolute inset-[-1px] bg-[#18181b] z-[120] flex flex-col items-center justify-center p-3 rounded-lg border border-[#3f3f46] shadow-[0_15px_40px_rgba(0,0,0,1)]">
          <h4 className="text-[11px] font-bold mb-3 text-white uppercase tracking-wider">{t.seekTime}</h4>
          <div className="w-full flex flex-col items-center gap-2 mb-5">
            <span className="text-2xl font-mono font-bold text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]">{formatTime(currentSec)}</span>
            <input
              type="range"
              min="0"
              max={durationSec || 0}
              step="0.1"
              value={currentSec}
              onChange={(e) => {
                const newTime = parseFloat(e.target.value);
                if (audioRef.current) audioRef.current.currentTime = newTime;
                setCurrentSec(newTime);
                setCurrentTimeStr(formatTime(newTime));
              }}
              className="w-full h-2 bg-black border border-[#3f3f46] rounded-full appearance-none outline-none cursor-pointer accent-emerald-500"
            />
            <span className="text-[10px] text-[#888] font-mono font-bold mt-1">TOTAL: {durationStr}</span>
          </div>
          <button onClick={() => setShowSeeker(false)} className="w-full bg-[#3f3f46] py-2 text-xs font-bold rounded hover:bg-[#52525b] text-white transition-colors border border-[#52525b]">
            {t.done}
          </button>
        </div>
      )}

      {channel.audioUrl && (
        <audio
          ref={audioRef}
          src={channel.audioUrl}
          loop={channel.loop}
          onTimeUpdate={() => {
            if (audioRef.current) {
              setCurrentTimeStr(formatTime(audioRef.current.currentTime));
              setCurrentSec(audioRef.current.currentTime);
            }
          }}
          onLoadedMetadata={() => {
            if (audioRef.current) {
              const durSec = audioRef.current.duration;
              const durStr = formatTime(durSec);
              setDurationSec(durSec);
              setDurationStr(durStr);
              onUpdateSettings({ originalDuration: durStr });
            }
          }}
          onEnded={handleAudioEnded}
          className="hidden"
        />
      )}

      <input 
        type="file" 
        accept="audio/*" 
        ref={fileInputRef} 
        onChange={(e) => { if(e.target.files[0]) onAudioLoad(channel.id, e.target.files[0]); e.target.value = null; }} 
        className="hidden" 
      />

      {/* HEADER CỦA CUE */}
      <div className="w-full flex justify-between items-center mb-2 relative z-50">
        <Music size={12} className={channel.audioUrl ? "text-emerald-400 drop-shadow-[0_0_2px_rgba(52,211,153,0.8)]" : "text-[#777]"} />
        
        <span className={`text-[10px] font-black truncate mx-1 flex-1 text-center ${cueBadgeClass}`}>
          AUDIO {baseNumber}
        </span>
        
        <div>
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={`text-zinc-300 hover:text-white transition-colors border border-[#3f3f46] rounded px-1.5 pb-1 flex items-center justify-center ${isMenuOpen ? 'bg-[#3f3f46]' : 'bg-[#18181b] hover:bg-[#303036]'}`}
          >
            <span className="text-[10px] leading-none font-bold">...</span>
          </button>
          
          {isMenuOpen && (
            <>
              <div className="fixed inset-0 z-[60]" onClick={() => setIsMenuOpen(false)}></div>
              <div className="absolute right-[-4px] top-7 bg-[#18181b] border border-[#3f3f46] rounded shadow-[0_15px_40px_rgba(0,0,0,1)] z-[100] w-32 flex flex-col overflow-hidden">
                <button 
                  onClick={() => { setIsMenuOpen(false); fileInputRef.current.click(); }}
                  className="text-[10px] text-left px-3 py-3 hover:bg-[#27272a] text-zinc-100 transition-colors border-b border-[#27272a] font-bold tracking-wide"
                >
                  {t.addAudio}
                </button>
                <button 
                  onClick={openSettings}
                  className="text-[10px] text-left px-3 py-3 hover:bg-[#27272a] text-zinc-100 transition-colors border-b border-[#27272a] font-bold tracking-wide"
                >
                  {t.fadeSetup}
                </button>
                
                <div className="px-3 py-2.5 flex justify-between items-center bg-[#111]">
                   <button 
                     onClick={() => { onUpdateSettings({ color: 'red' }); setIsMenuOpen(false); }}
                     className={`w-4 h-4 rounded-full bg-[#dc2626] hover:scale-110 transition-transform ${activeColor === 'red' ? 'ring-2 ring-white ring-offset-2 ring-offset-[#111]' : 'opacity-70'}`}
                   />
                   <button 
                     onClick={() => { onUpdateSettings({ color: 'green' }); setIsMenuOpen(false); }}
                     className={`w-4 h-4 rounded-full bg-[#059669] hover:scale-110 transition-transform ${activeColor === 'green' ? 'ring-2 ring-white ring-offset-2 ring-offset-[#111]' : 'opacity-70'}`}
                   />
                   <button 
                     onClick={() => { onUpdateSettings({ color: 'blue' }); setIsMenuOpen(false); }}
                     className={`w-4 h-4 rounded-full bg-[#2563eb] hover:scale-110 transition-transform ${activeColor === 'blue' ? 'ring-2 ring-white ring-offset-2 ring-offset-[#111]' : 'opacity-70'}`}
                   />
                   <button 
                     onClick={() => { onUpdateSettings({ color: 'yellow' }); setIsMenuOpen(false); }}
                     className={`w-4 h-4 rounded-full bg-[#d97706] hover:scale-110 transition-transform ${activeColor === 'yellow' ? 'ring-2 ring-white ring-offset-2 ring-offset-[#111]' : 'opacity-70'}`}
                   />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* VOLUME SLIDER */}
      <div className="h-20 w-full flex justify-center items-center my-1 relative z-0">
         <input
          type="range"
          min="0"
          max="100"
          value={channel.volume}
          onChange={(e) => onVolumeChange(e.target.value)}
          className="volume-fader absolute w-[72px] h-2 outline-none cursor-pointer z-10"
          style={{ transform: 'rotate(-90deg)' }}
        />
      </div>
      
      {/* KHỐI HIỂN THỊ THÔNG TIN MÀN HÌNH LED (Dìm đen để lõm xuống) */}
      <div className="w-full bg-[#0a0a0a] border border-[#18181b] rounded flex flex-col items-center py-1 mb-2 mt-1 shadow-inner">
        <div className="flex justify-between w-full px-2 items-center mb-0.5">
          <span className="text-[9px] font-bold text-zinc-500">VOL</span>
          <span className="text-[10px] font-mono font-bold text-zinc-300">{channel.volume}%</span>
        </div>
        <span className={`text-[12px] font-mono font-bold tracking-wider ${channel.audioUrl ? 'text-emerald-400 drop-shadow-[0_0_3px_rgba(52,211,153,0.5)]' : 'text-[#444]'}`}>
          {channel.audioUrl ? currentTimeStr : '00:00:00'}
        </span>
        <span className="text-[9px] font-mono font-bold text-[#666]">{channel.audioUrl ? durationStr : '00:00:00'}</span>
      </div>

      {/* BIG ACTION PAD */}
      <button 
        onClick={channel.audioUrl ? handleMainPadClick : undefined}
        className={`w-full h-11 rounded font-bold transition-all active:scale-95 mb-2 flex items-center justify-center p-1.5 overflow-hidden relative z-0 ${padColor}`}
      >
        <span 
          className="text-[11px] leading-tight text-center break-words w-full tracking-wide uppercase" 
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
          title={channel.name}
        >
          {channel.audioUrl ? channel.name : t.empty}
        </span>
      </button>

      {/* TRANSPORT CONTROLS - (Dìm đen để giả lập nút cứng lõm xuống) */}
      <div className="flex w-full gap-1.5 mb-2 relative z-0">
        <button 
          onClick={handlePlayPauseClick}
          className={`flex-1 flex justify-center items-center py-2 rounded bg-[#18181b] hover:bg-[#111] transition-colors border border-[#3f3f46] shadow-inner ${isPlaying ? 'text-emerald-400 drop-shadow-[0_0_5px_rgba(52,211,153,0.5)]' : 'text-zinc-400'}`}
        >
          {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
        </button>
        <button 
          onClick={stopAction}
          className="flex-1 flex justify-center items-center py-2 rounded bg-[#18181b] hover:bg-[#111] transition-colors border border-[#3f3f46] shadow-inner text-zinc-400 hover:text-red-500"
        >
          <Square size={14} fill="currentColor" />
        </button>
      </div>

      {/* BOTTOM TRIGGERS */}
      <div className="flex w-full justify-between items-center px-1 mt-1">
        <div className="flex items-center gap-1 opacity-60">
           <div className="w-1.5 h-1.5 rounded-full bg-[#666]"></div>
           <div className="w-1.5 h-1.5 rounded-full bg-[#666]"></div>
        </div>
        <div className="flex gap-2 items-center">
          <Repeat 
            size={14} 
            onClick={() => onToggleLoop(channel.id)}
            className={`cursor-pointer transition-colors ${channel.loop ? 'text-emerald-400 drop-shadow-[0_0_5px_rgba(16,185,129,0.8)]' : 'text-[#777] hover:text-zinc-300'}`} 
            title="Lặp lại bài hát"
          />
          <ArrowRight 
            size={14} 
            onClick={() => channel.audioUrl && setShowSeeker(true)}
            className={`cursor-pointer transition-colors ${channel.audioUrl ? 'text-[#999] hover:text-white' : 'text-[#555] cursor-not-allowed'}`}
            title="Dò thời gian (Seek)"
          />
        </div>
      </div>
      
    </div>
  );
}


```
